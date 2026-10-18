"""Fit the existing concept classifier with point-support features; no reserved notes fitted."""
import argparse
import copy
import json
from pathlib import Path
import numpy as np
from sklearn.preprocessing import StandardScaler
from train_student_note_batch import ROOT, BASE, read_batch, sha, anchored_fit, training_weights
from train_history_partial_update import generated_training
from smart_note_training.english_coverage import LABELS
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.history_semantic_core import CORE_FEATURES
from smart_note_training.history_point_core import FEATURES, PointCoreFeatures, PointCorePredictor


def run(args):
    out = Path(args.output)
    if out.exists(): raise ValueError('Choose fresh output')
    data, batch, digest = read_batch(args.dataset,args.splits)
    base = json.loads(BASE['history'].read_bytes())
    base['pointModel'] = json.loads(Path(args.point_model).read_bytes())
    train = [r for r in batch if r['subject']=='history' and r['split']=='train']
    held = [r for r in batch if r['subject']=='history' and r['split']=='holdout']
    old = [json.loads(s) for s in (ROOT/'outputs/history-dataset-intake-2026-10-14/source/page-training-examples.jsonl').read_text(encoding='utf-8').splitlines() if s.strip()]
    rows = [{'recordId':r['recordId'],'text':r['noteTextSnapshot'],'conceptId':r['concept']['id'],
        'target':LABELS.index(r['targetLabel']),'weight':1.,'source':'legacy_train'} for r in old
        if r['textVariant']=='corrected' and r['preassignedSplit']=='train' and r['trainingEligible']]
    rows += [{'recordId':r['recordId'],'text':r['modelInputText'],'conceptId':r['conceptId'],
        'target':LABELS.index(r['targetLabel']),'weight':w,'source':'weak_AI_train'} for r,w in zip(train,training_weights(train))]
    concepts = {c['id']:c for c in base['rubrics']['concepts']}
    rows += generated_training(base['rubrics'],{concepts[r['conceptId']]['lessonId'] for r in train})
    audit=json.loads(Path(args.adjudication).read_bytes());truth={r['recordId']:r['assistantLabel'] for r in audit['rows']}
    if audit['datasetSha256']!=digest or set(truth)!={r['recordId'] for r in held} or audit['humanReviewed'] is not False:
        raise ValueError('Audit mismatch')
    if args.fit_assistant_review:
        rows += [{'recordId':r['recordId'],'text':r['modelInputText'],'conceptId':r['conceptId'],
            'target':LABELS.index(truth[r['recordId']]),'weight':3.,'source':'assistant_adjudicated_development_train_not_human'} for r in held]
    held_hashes = {sha(' '.join(r['modelInputText'].lower().split()).encode()) for r in held}
    if not args.fit_assistant_review and any(sha(' '.join(r['text'].lower().split()).encode()) in held_hashes for r in rows):raise ValueError('Reserved text fitted')
    encoder = FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    extra = FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-student-ef-baseline-2026-10-18/encoder-cache')
    encoder.cache.update(extra.cache); encoder.cache_dir=None
    extractor = PointCoreFeatures(base,encoder)
    x = np.stack([extractor.one(r['text'],r['conceptId'])[0] for r in rows])
    w = np.asarray([r['weight'] for r in rows]); n = len(CORE_FEATURES)
    extra_scaler = StandardScaler().fit(x[:,n:],sample_weight=w)
    mean = np.r_[base['scalerMean'],extra_scaler.mean_]; scale=np.r_[base['scalerScale'],extra_scaler.scale_]
    prior = np.pad(np.asarray(base['weights']),((0,0),(0,len(FEATURES)-n)))
    weights,bias = anchored_fit((x-mean)/scale,np.asarray([r['target'] for r in rows]),w,prior,np.asarray(base['intercept']),.1)
    model = copy.deepcopy(base)
    model.update(schemaVersion=8,features=FEATURES,scalerMean=mean.tolist(),scalerScale=scale.tolist(),weights=weights.tolist(),intercept=bias.tolist(),modelType='history_point_assisted_concept_head')
    model['metadata'].update(experimentId=out.name,enabledByDefault=False,humanReviewed=False,studentBatchSha256=digest,
        pointModelSha256=sha(Path(args.point_model).read_bytes()),encoderAndRubricsFrozen=True)
    out.mkdir(parents=True)
    raw=(json.dumps(model,indent=2)+'\n').encode();(out/'model.json').write_bytes(raw)
    (out/'training-snapshot.json').write_text(json.dumps({'rows':rows,'reservedNotebookIds':[] if args.fit_assistant_review else [r['recordId'] for r in held],
        'assistantReviewFitted':args.fit_assistant_review,'humanReviewed':False},indent=2)+'\n',encoding='utf-8')
    predictor=PointCorePredictor(model,encoder)
    decisions=[{'recordId':r['recordId'],'reviewedLabel':truth[r['recordId']], 'prediction':predictor.predict(r['modelInputText'],r['conceptId'],'English',True)} for r in held]
    pack=json.loads((ROOT.parent/'packaging/coverage-verification.json').read_bytes())
    regression=[{'id':r['id'],'expected':r['prediction']['suggestedStatus'],'prediction':predictor.predict(r['input']['text'],r['input']['conceptId'],'English',True)} for r in pack['cases'] if r['subject']=='history']
    report={'modelSha256':sha(raw),'matches':sum(d['reviewedLabel']==d['prediction']['suggestedStatus'] for d in decisions),'total':len(decisions),
        'partialMatches':sum(d['reviewedLabel']==d['prediction']['suggestedStatus']=='partial' for d in decisions),
        'falseComplete':sum(d['reviewedLabel']!='present' and d['prediction']['suggestedStatus']=='present' for d in decisions),
        'regressionMatches':sum(r['expected']==r['prediction']['suggestedStatus'] for r in regression),'regressionTotal':len(regression),
        'assistantReviewFitted':args.fit_assistant_review,'evaluationMeaning':'Training/development matches, not held-out accuracy' if args.fit_assistant_review else 'Exposed development review',
        'liveModelChanged':False,'independentAccuracyClaimAllowed':False}
    for name,value in [('decisions',decisions),('regression',regression),('report',report)]:
        (out/(name+'.json')).write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('dataset','splits','adjudication','point-model','output'):p.add_argument('--'+name,required=True)
    p.add_argument('--fit-assistant-review',action='store_true',help='Use the corrected AI review for fitting; report it as training, never holdout accuracy')
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):run(p.parse_args())
