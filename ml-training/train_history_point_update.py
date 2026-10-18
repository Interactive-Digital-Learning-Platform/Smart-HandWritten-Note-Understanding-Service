"""Fit the existing History checker's small head on individual required ideas.

All fifty adjudicated notebook rows remain excluded. Existing public criteria,
legacy training rows and the new training-only point proposals provide fitting
data. Overall Complete/Partial/Missing is derived from learned point coverage.
"""
import argparse
from collections import Counter
import copy
import json
from pathlib import Path
import re
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from train_student_note_batch import ROOT, BASE, read_batch, sha
from smart_note_training.english_coverage import LABELS, normalize
from smart_note_training.history_semantic import FrozenEncoder, semantic_spans
from smart_note_training.history_partial import requirement_clauses
from smart_note_training.history_point_coverage import PointCoverageFeatures, PointCoveragePredictor, POINT_FEATURES
from smart_note_training.metrics import classification_metrics


def run(args):
    out=Path(args.output).resolve()
    if out.exists():raise ValueError('Choose a fresh output')
    data,batch,dataset_hash=read_batch(args.dataset,args.splits)
    train=[r for r in batch if r['subject']=='history' and r['split']=='train']
    held=[r for r in batch if r['subject']=='history' and r['split']=='holdout']
    raw=BASE['history'].read_bytes();base=json.loads(raw)
    if data['modelHashes']['history']!=sha(raw):raise ValueError('Frozen model differs')
    concepts={c['id']:c for c in base['rubrics']['concepts']}
    examples=[]
    noise='Class reminders: bring a pencil tomorrow. The football club meets after lunch. Water freezes at zero degrees Celsius.'
    for c in concepts.values():
        for i,p in enumerate(c['points']):
            def add(name,text,target,weight=1.):
                examples.append({'recordId':f'public-point-{c["id"]}-{i}-{name}','text':text,'conceptId':c['id'],
                                 'point':i,'target':LABELS.index(target),'weight':weight,'source':'public_rubric_synthetic'})
            add('full',p['text'],'present');add('full-context',noise+'\n'+p['text']+'\n'+noise,'present')
            add('heading',c['name'],'missing');add('unrelated',noise,'missing')
            add('prompt','Explain '+p['text']+' This question is unanswered.','missing')
            add('denied','It is not true that '+p['text'][0].lower()+p['text'][1:],'missing')
            add('contradiction',p['text']+' It is not true that '+p['text'][0].lower()+p['text'][1:],'partial')
            parts=requirement_clauses(p['text'])
            if len(parts)>1:
                for j,part in enumerate(parts):
                    if len(part.split())>=6:
                        add(f'clause-{j}',part+'.','partial')
                        add(f'clause-context-{j}',noise+'\n'+part+'.\n'+noise,'partial')
            numbers=list(re.finditer(r'\b\d[\d,]*\b',p['text']))
            if numbers:
                m=numbers[0];wrong=str(int(m.group().replace(',',''))+17)
                add('wrong-number',p['text'][:m.start()]+wrong+p['text'][m.end():],'partial')
            if re.search(r'\bprotohistoric\b',p['text'],re.I):
                add('wrong-period',re.sub(r'\bprotohistoric\b','prehistoric',p['text'],flags=re.I),'missing')
            if re.search(r'\bprehistoric\b',p['text'],re.I):
                add('wrong-period',re.sub(r'\bprehistoric\b','protohistoric',p['text'],flags=re.I),'missing')
            # Other explicit facts in the same lesson are useful hard negatives
            # only when the content-word sets are sufficiently distinct.
            words=set(re.findall(r'\b[a-z]{4,}\b',normalize(p['text'])))
            for other in concepts.values():
                if other['lessonId']!=c['lessonId'] or other['id']==c['id']:continue
                other_text=other['points'][0]['text']
                other_words=set(re.findall(r'\b[a-z]{4,}\b',normalize(other_text)))
                if len(words&other_words)/max(1,len(words|other_words))<.1:
                    add('other-fact-'+other['id'],other_text,'missing',.5)
                    break
    # Grounded point annotations remain weak AI targets, never human labels.
    for row in train:
        for p in row['source']['teacherPointEvidence']:
            examples.append({'recordId':row['recordId']+'-point-'+str(p['index']),'text':row['modelInputText'],
                'conceptId':row['conceptId'],'point':p['index']-1,'target':{'full':0,'partial':1,'missing':2}[p['coverage']],
                'weight':.1,'source':'weak_AI_point_proposal','sourceRecordId':row['recordId']})
            if p['coverage']=='full' and p['quote'].strip():
                examples.append({'recordId':row['recordId']+'-quoted-point-'+str(p['index']),'text':p['quote'],
                    'conceptId':row['conceptId'],'point':p['index']-1,'target':0,'weight':.25,
                    'source':'grounded_AI_proposed_full_quote_not_human_review','sourceRecordId':row['recordId']})
    # Replay only unambiguous original concept labels; do not guess which points
    # were supported in the old concept-level Partial examples.
    legacy=ROOT/'outputs/history-dataset-intake-2026-10-14/source/page-training-examples.jsonl'
    for line in legacy.read_text(encoding='utf-8').splitlines():
        if not line.strip():continue
        r=json.loads(line)
        if r['textVariant']!='corrected' or r['preassignedSplit']!='train' or not r['trainingEligible'] or r['targetLabel']=='partial':continue
        for i,p in enumerate(concepts[r['concept']['id']]['points']):
            examples.append({'recordId':r['recordId']+'-point-'+str(i),'text':r['noteTextSnapshot'],'conceptId':r['concept']['id'],
                'point':i,'target':LABELS.index(r['targetLabel']),'weight':.75,'source':'legacy_training_replay_not_independent'})
    held_hashes={sha(' '.join(r['modelInputText'].lower().split()).encode()) for r in held}
    if any(sha(' '.join(r['text'].lower().split()).encode()) in held_hashes for r in examples):raise ValueError('Reserved text fitted')
    out.mkdir(parents=True)
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    extra=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-student-ef-baseline-2026-10-18/encoder-cache')
    encoder.cache.update(extra.cache);encoder.cache_dir=None
    features=PointCoverageFeatures(base['rubrics'],encoder)
    encoder.prime({q for r in examples for _,_,q in semantic_spans(r['text'])})
    memo={};matrix=[]
    for r in examples:
        key=(r['text'],r['conceptId'])
        if key not in memo:memo[key]=features.one(*key)[0]
        matrix.append(memo[key][r['point']])
    x=np.stack(matrix);w=np.asarray([r['weight'] for r in examples]);y=np.asarray([r['target'] for r in examples])
    scaler=StandardScaler().fit(x,sample_weight=w)
    classifier=LogisticRegression(C=1.,max_iter=2000,class_weight='balanced',random_state=42)
    classifier.fit(scaler.transform(x),y,sample_weight=w)
    if max(classifier.n_iter_)>=2000:raise ValueError('Head did not converge')
    candidate=copy.deepcopy(base)
    candidate.update({'schemaVersion':7,'features':POINT_FEATURES,'scalerMean':scaler.mean_.tolist(),'scalerScale':scaler.scale_.tolist(),
        'weights':classifier.coef_.tolist(),'intercept':classifier.intercept_.tolist(),
        'modelType':'history_frozen_encoder_learned_point_coverage'})
    candidate['metadata'].update({'experimentId':out.name,'enabledByDefault':False,'humanReviewed':False,
        'baseModelSha256':sha(raw),'studentBatchSha256':dataset_hash,'trainingMethod':'shared_linear_point_coverage_head',
        'encoderAndRubricsFrozen':True,'aggregateScores':'Normalized max-product point assignments; uncalibrated'})
    model_bytes=(json.dumps(candidate,indent=2)+'\n').encode();(out/'model.json').write_bytes(model_bytes)
    (out/'training-snapshot.json').write_text(json.dumps({'rows':examples,'reservedNotebookIds':[r['recordId'] for r in held]},indent=2)+'\n',encoding='utf-8')
    # Adjudication is loaded only after the candidate has been fitted and saved.
    audit=json.loads(Path(args.adjudication).read_bytes())
    if audit['datasetSha256']!=dataset_hash or audit['humanReviewed'] is not False:raise ValueError('Review provenance differs')
    truth={r['recordId']:r['assistantLabel'] for r in audit['rows']}
    if set(truth)!={r['recordId'] for r in held}:raise ValueError('Review cases differ')
    model=PointCoveragePredictor(candidate,encoder)
    decisions=[{'recordId':r['recordId'],'reviewedLabel':truth[r['recordId']],
        'prediction':model.predict(r['modelInputText'],r['conceptId'],'English',True)} for r in held]
    pack=json.loads((ROOT.parent/'packaging/coverage-verification.json').read_bytes())
    regression=[{'id':c['id'],'expected':c['prediction']['suggestedStatus'],
        'prediction':model.predict(c['input']['text'],c['input']['conceptId'],'English',True)} for c in pack['cases'] if c['subject']=='history']
    report={'candidateModelSha256':sha(model_bytes),'baseModelSha256':sha(raw),'trainingPointRows':len(examples),
        'pointClassCounts':dict(Counter(LABELS[r['target']] for r in examples)),'newNotebookTrainingRows':len(train),
        'evaluatedRows':len(held),'matches':sum(d['reviewedLabel']==d['prediction']['suggestedStatus'] for d in decisions),
        'rawMetrics':classification_metrics([LABELS.index(d['reviewedLabel']) for d in decisions],
                                           [LABELS.index(d['prediction']['rawModelStatus']) for d in decisions]),
        'falseComplete':sum(d['reviewedLabel']!='present' and d['prediction']['suggestedStatus']=='present' for d in decisions),
        'withheld':sum(d['prediction']['suggestedStatus'] is None for d in decisions),
        'regressionUnchanged':sum(c['expected']==c['prediction']['suggestedStatus'] for c in regression),'regressionCount':len(regression),
        'humanReviewed':False,'independentAccuracyClaimAllowed':False,'liveModelChanged':False,'deploymentApproved':False,
        'evaluationMeaning':'Exposed assistant-adjudicated synthetic development cases; not independent student accuracy.'}
    for name,value in [('report',report),('decisions',decisions),('regression',regression)]:
        (out/(name+'.json')).write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('dataset','splits','adjudication','output'):parser.add_argument('--'+name,required=True)
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):run(parser.parse_args())
