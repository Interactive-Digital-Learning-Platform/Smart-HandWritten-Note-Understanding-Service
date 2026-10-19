"""Continue fitting the existing Science linear head, preserving features and policy.

New image-reviewed AI labels are weak, correlated training data. Historical
review sets are regression gates, never a fresh independent accuracy estimate.
"""
import argparse
from collections import Counter
import copy
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'src'))
import numpy as np
from smart_note_training.english_coverage_v31 import CoveragePredictorV31
from smart_note_training.metrics import classification_metrics
from train_student_note_batch import anchored_fit, LABELS


def sha(raw): return hashlib.sha256(raw).hexdigest()
def read(p): return json.loads(Path(p).read_bytes())
def write(p, obj): Path(p).write_text(json.dumps(obj, indent=2)+'\n', encoding='utf-8')
def text_key(row): return (row['conceptId'], ' '.join(row['text'].lower().split()))


def score(model, rows):
    predictions = [model.predict(r['text'], r['conceptId'], 'English', True) for r in rows]
    actual = [r['label'] for r in rows]
    return {'rows': len(rows),
            'raw': classification_metrics([LABELS.index(v) for v in actual], [LABELS.index(p['rawModelStatus']) for p in predictions]),
            'visibleCorrect': sum(p['suggestedStatus']==y for p,y in zip(predictions,actual)),
            'falseComplete': sum(p['suggestedStatus']=='present' and y!='present' for p,y in zip(predictions,actual)),
            'withheld': sum(p['suggestedStatus'] is None for p in predictions)}, predictions


def train(notes, output):
    notes=Path(notes);out=Path(output)
    if out.exists(): raise ValueError('Output must be fresh')
    dataset=read(notes)
    if dataset['schemaVersion']!='science-reviewed-ocr-update-v1': raise ValueError('Unexpected dataset')
    for relative, expected in dataset['sourceHashes'].items():
        source=(ROOT.parent/relative).resolve()
        if not source.is_relative_to(ROOT.parent) or sha(source.read_bytes())!=expected: raise ValueError('Input provenance changed')
    base_raw=(ROOT.parent/'models/english-coverage-v3.1.json').read_bytes()
    if sha(base_raw)!=dataset['baseModelSha256']: raise ValueError('Base changed')
    artifact=json.loads(base_raw);base=CoveragePredictorV31(artifact)
    rehearsal_path=ROOT/'outputs/english-coverage-v2-2026-10-06/training-snapshot.json'
    rehearsal=[dict(id=r['recordId'],conceptId=r['conceptId'],text=r['text'],label=LABELS[r['target']],
                    notebook='rehearsal:'+r['group'],sourceFamily=r['group'],weight=r['weight'],labelSource='original_training_snapshot') for r in read(rehearsal_path)]
    new=dataset['rows']
    if len(new)!=8 or any(r['humanReviewed'] or r['labelSource']!='ai_assistant_visual_review' for r in new): raise ValueError('New label provenance invalid')
    if len({r['id'] for r in new})!=len(new): raise ValueError('Duplicate ID')
    train_rows=rehearsal+new
    regression_dir=ROOT/'outputs/science-v34-review-fix-2026-10-18'
    groups={}
    source_hashes={str(rehearsal_path.relative_to(ROOT.parent)):sha(rehearsal_path.read_bytes()),str(notes.relative_to(ROOT.parent)):sha(notes.read_bytes())}
    for name,key in [('human','humanLabel'),('authored','expectedLabel')]:
        p=regression_dir/f'{name}-v34-decisions.json';source_hashes[str(p.relative_to(ROOT.parent))]=sha(p.read_bytes())
        groups[name]=[dict(id=r.get('recordId',r.get('id')),text=r['text'],conceptId=r['conceptId'],label=r[key]) for r in read(p)]
    supplied=read(regression_dir/'supplied-v34-decisions.json')
    reviewed=read(regression_dir/'assistant-label-review.json')
    corrections={r['recordId']:r['assistantReviewedLabel'] for r in reviewed['rows']}
    for name in ['supplied-v34-decisions.json','assistant-label-review.json']:
        p=regression_dir/name;source_hashes[str(p.relative_to(ROOT.parent))]=sha(p.read_bytes())
    groups['previous_student_development']=[dict(id=r['recordId'],text=r['modelInputText'],conceptId=r['conceptId'],label=corrections.get(r['recordId'],r['teacherLabel'])) for r in supplied if r['split']=='holdout']
    train_keys={text_key(r) for r in train_rows}
    if any(text_key(r) in train_keys for rows in groups.values() for r in rows): raise ValueError('Training text overlaps regression set')
    # Normalize each notebook's correlated fragments to one contribution.
    # New AI-reviewed notebooks have one quarter the weight of a rehearsal group.
    counts=Counter(r['notebook'] for r in train_rows)
    weights=np.array([(1. if r in rehearsal else .25)*r.get('weight',1.)/counts[r['notebook']] for r in train_rows])
    weights*=len(weights)/weights.sum()
    x=base.extractor.transform(train_rows)
    x=(x-base.mean)/base.scale
    w,b=anchored_fit(x,np.array([LABELS.index(r['label']) for r in train_rows]),weights,base.weights,base.intercept,prior_strength=10.)
    candidate=copy.deepcopy(artifact);candidate['weights']=w.tolist();candidate['intercept']=b.tolist()
    candidate['metadata'].update(experimentId='english-coverage-v3.5-ocr-notes-2026-10-19',
        releaseType='continued_training_existing_science_head',weightsRefittedForThisRelease=True,
        previousReleaseModelSha256=sha(base_raw),reviewRequired=True,
        updateProvenance=dict(notesDatasetSha256=sha(notes.read_bytes()),newOcrExamples=8,newNotebooks=3,newSourceFamilies=2,
            newHumanReviewedLabels=0,labelSource='ai_assistant_visual_review',synthetic=True,unseenHoldoutAvailable=False,
            rehearsalRows=len(rehearsal),priorStrength=10.,independentAccuracyClaimAllowed=False))
    for key in artifact:
        if key not in ('weights','intercept','metadata') and candidate[key]!=artifact[key]: raise ValueError('Architecture or policy changed')
    updated=CoveragePredictorV31(candidate)
    groups['new_training_examples']=new
    comparisons={};decisions={};failures=[]
    for name,rows in groups.items():
        before,bp=score(base,rows);after,ap=score(updated,rows)
        comparisons[name]={'baseline':before,'candidate':after,'independentAccuracyEstimate':False,'usedForFit':name=='new_training_examples'}
        decisions[name]=[dict(id=r['id'],label=r['label'],baseline=a,candidate=b) for r,a,b in zip(rows,bp,ap)]
        if after['visibleCorrect']<before['visibleCorrect'] or after['raw']['macroF1']+1e-12<before['raw']['macroF1'] or after['falseComplete']>before['falseComplete']:
            failures.append(name+' regressed')
    if np.array_equal(w,base.weights) and np.array_equal(b,base.intercept): failures.append('Weights did not change')
    if sha((ROOT.parent/'models/english-coverage-v3.1.json').read_bytes())!=sha(base_raw): raise ValueError('Live base changed during training')
    out.mkdir(parents=True);(out/'baseline-model.json').write_bytes(base_raw)
    write(out/'candidate-model.json',candidate);write(out/'decisions.json',decisions)
    report=dict(modelVersion=candidate['metadata']['experimentId'],baselineSha256=sha(base_raw),candidateSha256=sha((out/'candidate-model.json').read_bytes()),
        datasetSha256=sha(notes.read_bytes()),sourceHashes=source_hashes,trainingRows=len(train_rows),newExamples=8,newNotebooks=3,newSourceFamilies=2,
        classCounts=dict(Counter(r['label'] for r in train_rows)),newClassCounts=dict(Counter(r['label'] for r in new)),
        architectureFeaturesScalerRubricsPolicyUnchanged=True,weightsChanged=True,maxAbsoluteWeightChange=float(np.max(np.abs(w-base.weights))),
        protocol=dict(priorStrength=10.,selection='Single prespecified conservative fit; no hyperparameter search',newNotebookWeight=.25,correlatedPagesShareWeight=True),
        comparisons=comparisons,failures=failures,regressionGatesPassed=not failures,newHumanLabels=0,unseenHoldoutAvailable=False,
        independentAccuracyEstablished=False,liveModelChanged=False)
    write(out/'training-report.json',report)
    print(json.dumps({k:report[k] for k in ['modelVersion','trainingRows','newExamples','classCounts','maxAbsoluteWeightChange','failures','regressionGatesPassed']}))
    print(json.dumps({k:{v:{'correct':m['visibleCorrect'],'rows':m['rows'],'falseComplete':m['falseComplete']} for v,m in pair.items() if v in ('baseline','candidate')} for k,pair in comparisons.items()}))
    if failures: raise SystemExit(1)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--notes',required=True,type=Path);parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args();train(args.notes.resolve(),args.output.resolve())
