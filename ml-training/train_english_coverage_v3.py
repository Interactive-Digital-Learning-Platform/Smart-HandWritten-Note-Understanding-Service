"""V3 uses the same 71 training rows as V2. Both human reviews are development."""
import argparse
import json
from pathlib import Path
import sys
import time
from collections import Counter

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
import numpy as np
from sklearn.model_selection import LeaveOneGroupOut
from threadpoolctl import threadpool_limits
from smart_note_training.english_coverage import LABELS,fit_classifier,load_rubrics,sha,write_json
from smart_note_training.english_coverage_v3 import CoverageFeaturesV3,CoveragePredictorV3,FEATURES_V3,export_v3,apply_review_policy
from smart_note_training.metrics import classification_metrics
from evaluate_english_review import validate_review
from train_english_coverage import check_separation,summary
from train_english_coverage_v2 import v2_rule_predictions


def policy_metrics(actual,raw,evidence):
    suggested=[apply_review_policy(LABELS[p],e)['suggestedStatus'] for p,e in zip(raw,evidence)]
    accepted=[i for i,s in enumerate(suggested) if s is not None]
    pred=[LABELS.index(suggested[i]) for i in accepted]
    complete=[i for i,s in enumerate(suggested) if s=='present']
    return {'total':len(actual),'withheldCount':len(actual)-len(accepted),
            'coverage':len(accepted)/len(actual),'completeSuggestions':len(complete),
            'falseCompleteCount':sum(actual[i]!=0 for i in complete),
            'completePrecision':sum(actual[i]==0 for i in complete)/len(complete) if complete else None,
            'acceptedOnlyMetrics':classification_metrics([actual[i] for i in accepted],pred) if accepted else None,
            'warning':'Accepted-only accuracy excludes abstentions and is not overall model accuracy.'}


def select(rows,rubrics):
    y=np.array([r['target'] for r in rows]);groups=np.array([r['group'] for r in rows])
    probs={c:np.full((len(rows),3),np.nan) for c in (.1,1.,10.)}
    rules=np.zeros(len(rows),dtype=int);majority=rules.copy();folds=[]
    for tr,va in LeaveOneGroupOut().split(np.zeros(len(rows)),y,groups):
        if set(y[tr])!={0,1,2}:raise ValueError('training fold lacks a class')
        ex=CoverageFeaturesV3(rubrics).fit([rows[i] for i in tr])
        x=ex.transform([rows[i] for i in tr]);v=ex.transform([rows[i] for i in va])
        for c in probs:
            sc,cl=fit_classifier(x,y[tr],[rows[i]['weight'] for i in tr],c)
            probs[c][va]=cl.predict_proba(sc.transform(v))
        rules[va]=v2_rule_predictions(v);majority[va]=Counter(y[tr]).most_common(1)[0][0]
        folds.append({'heldOutGroup':str(groups[va[0]]),'heldOutIds':[rows[i]['recordId'] for i in va]})
    if any(not np.isfinite(p).all() for p in probs.values()):raise ValueError('incomplete OOF probabilities')
    scores={str(c):classification_metrics(y.tolist(),p.argmax(axis=1).tolist()) for c,p in probs.items()}
    c=max(probs,key=lambda c:(scores[str(c)]['macroF1'],scores[str(c)]['balancedAccuracy'],-c))
    oof=[{'id':r['recordId'],'actual':LABELS[r['target']],'byC':{str(c):p[i].tolist() for c,p in probs.items()}} for i,r in enumerate(rows)]
    return c,scores,folds,oof,{'rules':classification_metrics(y.tolist(),rules.tolist()),'majority':classification_metrics(y.tolist(),majority.tolist())}


def run(output):
    out=Path(output).resolve()
    if out.exists():raise FileExistsError('output must be fresh')
    original=ROOT/'outputs/english-coverage-v2-2026-10-06'
    old_protocol=json.loads((original/'protocol.json').read_text(encoding='utf-8'))
    if any(sha(p)!=h for p,h in old_protocol['sourceHashes'].items()):raise ValueError('v2 source changed')
    snapshot=original/'training-snapshot.json';train=json.loads(snapshot.read_text(encoding='utf-8'))
    rubric_path=ROOT/'rubrics/english-science-coverage-v3.json';rubrics=load_rubrics(rubric_path)
    files=[snapshot,rubric_path,Path(__file__),ROOT/'src/smart_note_training/english_coverage_v3.py',
           ROOT/'src/smart_note_training/english_coverage.py',ROOT/'src/smart_note_training/metrics.py']
    development=[]
    for version,packet,review in [
        ('v1','reviews/english-coverage-review-2026-10-06/packet.json','outputs/english-coverage-v1-human-review-01/submitted-human-review.json'),
        ('v2','reviews/english-coverage-v2-review-2026-10-06/packet.json','outputs/english-coverage-v2-human-review-01/submitted-human-review.json'),
    ]:
        files.extend([ROOT/packet,ROOT/review])
        data=json.loads((ROOT/packet).read_text(encoding='utf-8'))
        labels=validate_review(data,json.loads((ROOT/review).read_text(encoding='utf-8')))
        for e in data['examples']:
            label=labels[e['id']]['label']
            if label=='unclear':continue
            development.append({'recordId':e['id'],'noteGroupId':e['id'],'group':version+'-'+e['conceptId'],
                'conceptId':e['conceptId'],'text':e['text'],'target':LABELS.index(label),'reviewVersion':version,'split':'validation'})
    check_separation(train,development)
    frozen={str(p.resolve()):sha(p) for p in files}
    protocol={'experimentId':out.name,'sourceHashes':frozen,'training':summary(train),'features':FEATURES_V3,
              'trainingDataUnchangedFromV2':True,'reviewExamplesUsedForFitting':False,'bothReviewsInformedFeatureDesign':True,
              'selection':'TRAIN grouped CV macro-F1, balanced accuracy, smaller C; development-only estimate',
              'CGrid':[.1,1.,10.],'policy':'Withhold raw complete if any required point lacks full lexical support or concerns exist. No relabelling.',
              'freshScreen':{'rawAccuracy':.8,'rawMacroF1':.75,'eachRawClassRecall':.7,'completeSuggestionPrecision':.9,
                             'suggestionCoverage':.8,'minimumCompleteSuggestions':5,'rawMustBeatRules':True},
              'enabledByDefault':False,'independentTestAvailable':False}
    out.mkdir(parents=True);write_json(out/'protocol.json',protocol)
    start=time.perf_counter();c,cv,folds,oof,baselines=select(train,rubrics)
    ex=CoverageFeaturesV3(rubrics).fit(train);x=ex.transform(train)
    sc,cl=fit_classifier(x,[r['target'] for r in train],[r['weight'] for r in train],c)
    write_json(out/'model.json',export_v3(ex,sc,cl,{'experimentId':out.name,'selectedC':c,'reviewRequired':True,'enabledByDefault':False,'protocolSha256':sha(out/'protocol.json')}))
    model=CoveragePredictorV3(json.loads((out/'model.json').read_text(encoding='utf-8')))
    error=float(np.abs(model.probabilities(x)-cl.predict_proba(sc.transform(x))).max())
    if error>1e-10:raise ValueError('portable reload mismatch')
    decisions=[];results={}
    for version in ('v1','v2'):
        rows=[r for r in development if r['reviewVersion']==version]
        actual=[r['target'] for r in rows];v=ex.transform(rows);p=model.probabilities(v);raw=p.argmax(axis=1).tolist()
        evidence=[ex.one(r['text'],r['conceptId'],True)[1] for r in rows]
        results[version]={'rawModel':classification_metrics(actual,raw),'rules':classification_metrics(actual,v2_rule_predictions(v)),
                          'reviewPolicy':policy_metrics(actual,raw,evidence),'independentAccuracyClaimAllowed':False}
        for r,pred,score,ev in zip(rows,raw,p,evidence):
            decisions.append({'id':r['recordId'],'reviewVersion':version,'actual':LABELS[r['target']],
                'rawModelStatus':LABELS[pred],**apply_review_policy(LABELS[pred],ev),'scores':score.tolist(),'evidence':ev})
    if any(sha(p)!=h for p,h in frozen.items()):raise ValueError('source changed during training')
    result={'selectedC':c,'groupedDevelopmentCV':cv,'baselines':baselines,'humanReviewsDevelopmentOnly':results,
            'portableReloadError':error,'fitAndEvaluationSeconds':round(time.perf_counter()-start,3),'artifactBytes':(out/'model.json').stat().st_size,
            'freshReviewScored':False,'enabledByDefault':False}
    for name,value in [('evaluation',result),('development-decisions',decisions),('cv-folds',folds),('oof-predictions',oof)]:write_json(out/(name+'.json'),value)
    print(json.dumps(result,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',required=True)
    with threadpool_limits(limits=2):run(p.parse_args().output)
