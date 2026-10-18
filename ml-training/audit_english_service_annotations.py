"""Audit an AI service-review ledger without treating it as a blind test or refitting."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.english_coverage import LABELS,sha,write_json
from smart_note_training.english_coverage_v3 import CoveragePredictorV3,apply_review_policy
from smart_note_training.metrics import classification_metrics
from train_english_coverage_v2 import v2_rule_predictions
from train_english_coverage_v3 import policy_metrics


def validate_rows(rows,concept_ids):
    if not rows:raise ValueError('annotation ledger is empty')
    seen=set()
    for line,row in enumerate(rows,1):
        if not isinstance(row,dict):raise ValueError(f'line {line}: expected an object')
        for field in ('noteId','sourceRecordId','text','reviewer','reason','previewReviewId'):
            if not isinstance(row.get(field),str) or not row[field].strip():raise ValueError(f'line {line}: missing {field}')
        if not isinstance(row.get('concept'),dict) or row['concept'].get('id') not in concept_ids:
            raise ValueError(f'line {line}: unsupported concept')
        if row.get('label') not in LABELS:raise ValueError(f'line {line}: invalid label')
        if row.get('uiLabel')!={'present':'Complete','partial':'Partial','missing':'Missing'}[row['label']]:
            raise ValueError(f'line {line}: inconsistent display label')
        if row.get('sourceTextSha256')!=hashlib.sha256(row['text'].encode('utf-8')).hexdigest():
            raise ValueError(f'line {line}: source text/hash mismatch')
        identity=(row['sourceRecordId'],row['concept']['id'],row.get('textVariant'))
        if identity in seen:raise ValueError(f'line {line}: duplicate source identity')
        seen.add(identity)
        for field in ('synthetic','simulatedOCR','independentHumanCertified','reviewIsModelBlind','previewSaveObserved'):
            if not isinstance(row.get(field),bool):raise ValueError(f'line {line}: explicit {field} boolean required')
        if row.get('split') not in ('train','validation','test'):raise ValueError(f'line {line}: invalid split')
    return rows


def overlap_summary(rows,training):
    ids={r['recordId'] for r in training};notes={r['noteGroupId'] for r in training};texts={r['text'] for r in training}
    return {'sourceRecordIdOverlap':sum(r['sourceRecordId'] in ids for r in rows),
            'sourceNoteIdOverlap':sum(r['noteId'] in notes for r in rows),
            'exactTextOverlap':sum(r['text'] in texts for r in rows),
            'noteOverlappingIds':[r['noteId'] for r in rows if r['noteId'] in notes],
            'interpretation':'Different raw/corrected record IDs do not make pages from the same note independent.'}


def run(source,model_path,training_path,freeze_path,output):
    out=Path(output)
    if out.exists():raise FileExistsError('output must be fresh')
    source=Path(source);model_path=Path(model_path);training_path=Path(training_path)
    frozen=json.loads(Path(freeze_path).read_text(encoding='utf-8'))
    if sha(model_path)!=frozen['modelSha256']:raise ValueError('frozen model hash mismatch')
    for path,digest in frozen['inferenceSourceHashes'].items():
        if sha(path)!=digest:raise ValueError('frozen implementation changed: '+path)
    input_hash=sha(source);training_hash=sha(training_path)
    model=CoveragePredictorV3(json.loads(model_path.read_text(encoding='utf-8')))
    rows=validate_rows([json.loads(line) for line in source.read_text(encoding='utf-8').splitlines() if line.strip()],set(model.extractor.concepts))
    training=json.loads(training_path.read_text(encoding='utf-8'))
    overlaps=overlap_summary(rows,training)
    actual=[];raw=[];rules=[];evidences=[];decisions=[]
    for row in rows:
        x,evidence=model.extractor.one(row['text'],row['concept']['id'],True)
        probabilities=model.probabilities(x);pred=int(probabilities.argmax())
        actual.append(LABELS.index(row['label']));raw.append(pred);rules+=v2_rule_predictions([x]);evidences.append(evidence)
        decisions.append({'noteId':row['noteId'],'sourceRecordId':row['sourceRecordId'],'conceptId':row['concept']['id'],
            'reviewLabel':row['label'],'rawModelStatus':LABELS[pred],**apply_review_policy(LABELS[pred],evidence),
            'scores':probabilities.tolist(),'reviewReason':row['reason'],'evidence':evidence})
    result={'evaluationType':'AI-labelled, model-visible synthetic OCR development agreement audit',
            'independentAccuracyClaimAllowed':False,'humanCertificationEstablished':False,
            'previewPersistenceEstablished':False,'previewSaveEvidence':'Ledger declarations only; reconstructed records are not native database exports.',
            'modelRefitted':False,'automaticDeployment':False,'modelSha256':sha(model_path),
            'annotationFileSha256':input_hash,'trainingSnapshotSha256':training_hash,'examples':len(rows),
            'labelCounts':dict(Counter(r['label'] for r in rows)),
            'provenanceCounts':{key:dict(Counter(str(r[key]) for r in rows)) for key in ('split','reviewer','synthetic','simulatedOCR','independentHumanCertified','reviewIsModelBlind','previewSaveObserved')},
            'trainingOverlap':overlaps,'rawLabelAgreement':classification_metrics(actual,raw),
            'ruleLabelAgreement':classification_metrics(actual,rules),'reviewPolicyAgreement':policy_metrics(actual,raw,evidences),
            'falseCompleteCountAgainstAILabels':sum(a!=0 and p==0 for a,p in zip(actual,raw)),
            'disagreementIds':[d['noteId'] for d in decisions if d['reviewLabel']!=d['rawModelStatus']]}
    if sha(source)!=input_hash or sha(training_path)!=training_hash:raise ValueError('input changed during audit')
    out.mkdir(parents=True)
    write_json(out/'audit.json',result);write_json(out/'decisions.json',decisions)
    (out/'submitted-annotations.jsonl').write_bytes(source.read_bytes())
    print(json.dumps(result,indent=2));return result


if __name__=='__main__':
    p=argparse.ArgumentParser()
    for key in ('annotations','model','training','freeze','output'):p.add_argument('--'+key,required=True)
    a=p.parse_args();run(a.annotations,a.model,a.training,a.freeze,a.output)
