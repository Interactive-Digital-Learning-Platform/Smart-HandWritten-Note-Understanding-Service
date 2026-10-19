"""Train a bounded History point verifier without fitting the 50 reviewed notebooks."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from train_student_note_batch import ROOT,BASE,read_batch,sha
from smart_note_training.english_coverage import LABELS
from smart_note_training.history_semantic import FrozenEncoder,semantic_spans
from smart_note_training.history_evidence import EvidenceFeatures,EVIDENCE_FEATURES,EvidencePredictor,boosted_scores


def run(args):
    out=Path(args.output)
    if out.exists():raise ValueError('Choose fresh output')
    data,batch,digest=read_batch(args.dataset,args.splits)
    held=[r for r in batch if r['split']=='holdout' and r['subject']=='history']
    train=[r for r in batch if r['split']=='train' and r['subject']=='history']
    base=json.loads(BASE['history'].read_bytes())
    source=ROOT/'outputs/history-coverage-v5.3-point-support-2026-10-18-05/training-snapshot.json'
    examples=json.loads(source.read_bytes())['rows']
    for c in base['rubrics']['concepts']:
        for i,p in enumerate(c['points']):
            for j,text in enumerate([
                'Next lesson we will study '+c['name']+'. Remember to bring the history book tomorrow.',
                'Homework: read the chapter about '+c['name']+'. The classroom has twenty desks.',
                'Topics to read again: '+p['text']+' Answer later.',
            ]):
                examples.append(dict(recordId=f'public-reminder-{c["id"]}-{i}-{j}',text=text,conceptId=c['id'],point=i,target=2,weight=1.,source='public_rubric_reminder_contrast'))
    held_hashes={sha(' '.join(r['modelInputText'].lower().split()).encode()) for r in held}
    if any(sha(' '.join(r['text'].lower().split()).encode()) in held_hashes for r in examples):raise ValueError('Reserved text fitted')
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    extra=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-student-ef-baseline-2026-10-18/encoder-cache')
    encoder.cache.update(extra.cache)
    # A separate development cache never overwrites the frozen predecessor cache.
    encoder.cache_dir=out/'encoder-cache'
    features=EvidenceFeatures(base['rubrics'],encoder)
    encoder.prime({q for r in examples for _,_,q in semantic_spans(r['text'])})
    memo={};matrix=[]
    for r in examples:
        key=(r['text'],r['conceptId'])
        if key not in memo:memo[key]=features.one(*key)[0]
        matrix.append(memo[key][r['point']])
    x=np.stack(matrix);y=np.asarray([r['target'] for r in examples]);w=np.asarray([r['weight'] for r in examples])
    counts=np.bincount(y,weights=w,minlength=3);w*=w.sum()/(3*counts[y])
    classifier=GradientBoostingClassifier(n_estimators=100,max_depth=2,min_samples_leaf=6,learning_rate=.07,random_state=42)
    classifier.fit(x,y,sample_weight=w)
    trees=[]
    for stage in classifier.estimators_:
        trees.append([dict(left=t.tree_.children_left.tolist(),right=t.tree_.children_right.tolist(),feature=t.tree_.feature.tolist(),
            threshold=t.tree_.threshold.tolist(),value=t.tree_.value[:,0,0].tolist()) for t in stage])
    artifact=copy.deepcopy(base)
    artifact.update(schemaVersion=9,features=EVIDENCE_FEATURES,modelType='history_frozen_encoder_passage_grounded_boosted_head',
        head=dict(initialScores=np.log(classifier.init_.class_prior_).tolist(),learningRate=classifier.learning_rate,trees=trees))
    # Remove unused predecessor head parameters rather than imply they run.
    for key in ('scalerMean','scalerScale','weights','intercept'):artifact.pop(key,None)
    artifact['metadata'].update(experimentId=out.name,enabledByDefault=False,humanReviewed=False,encoderAndRubricsFrozen=True,
        studentBatchSha256=digest,trainingSnapshotSha256=sha(source.read_bytes()),reviewCasesFitted=False,
        trainingMethod='small_shared_passage_grounded_boosted_point_head',treeCount=300,maxTreeDepth=2)
    if not np.allclose(boosted_scores(x,artifact),classifier.predict_proba(x),atol=1e-12,rtol=0):raise ValueError('Portable inference disagrees with trained head')
    raw=(json.dumps(artifact,indent=2)+'\n').encode();out.mkdir(parents=True,exist_ok=True);(out/'model.json').write_bytes(raw)
    (out/'training-snapshot.json').write_text(json.dumps(dict(rows=examples,reservedNotebookIds=[r['recordId'] for r in held],humanReviewed=False),indent=2)+'\n',encoding='utf-8')
    audit=json.loads(Path(args.adjudication).read_bytes());truth={r['recordId']:r['assistantLabel'] for r in audit['rows']}
    if audit['datasetSha256']!=digest or set(truth)!={r['recordId'] for r in held}:raise ValueError('Audit mismatch')
    predictor=EvidencePredictor(artifact,encoder)
    decisions=[dict(recordId=r['recordId'],reviewedLabel=truth[r['recordId']],prediction=predictor.predict(r['modelInputText'],r['conceptId'],'English',True)) for r in held]
    report=dict(modelSha256=sha(raw),matches=sum(d['reviewedLabel']==d['prediction']['suggestedStatus'] for d in decisions),total=len(decisions),
        perClass={label:dict(support=sum(d['reviewedLabel']==label for d in decisions),matched=sum(d['reviewedLabel']==d['prediction']['suggestedStatus']==label for d in decisions)) for label in LABELS},
        falseComplete=sum(d['reviewedLabel']!='present' and d['prediction']['suggestedStatus']=='present' for d in decisions),
        withheld=sum(d['prediction']['suggestedStatus'] is None for d in decisions),runtimeChanged=False,independentAccuracyClaimAllowed=False,
        portableMaxError=float(np.max(np.abs(boosted_scores(x,artifact)-classifier.predict_proba(x)))))
    for name,value in [('report',report),('decisions',decisions)]:
        (out/(name+'.json')).write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('dataset','splits','adjudication','output'):p.add_argument('--'+name,required=True)
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):run(p.parse_args())
