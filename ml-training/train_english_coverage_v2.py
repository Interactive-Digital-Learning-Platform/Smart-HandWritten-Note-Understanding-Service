"""Bounded v2 training. Original reviewed challenge is DEVELOPMENT ONLY.

Choose C using grouped TRAIN CV. Do not refit or select on old human challenge.
The features and new training examples were developed after seeing its errors.
"""
from collections import Counter
from pathlib import Path
import argparse
import json
import sys
import time

sys.path.insert(0,str(Path(__file__).resolve().parent/'src'))
import numpy as np
from sklearn.model_selection import LeaveOneGroupOut
from threadpoolctl import threadpool_limits
from smart_note_training.english_coverage import LABELS,fit_classifier,load_rubrics,sha,write_json
from smart_note_training.english_coverage_v2 import CoverageFeaturesV2,CoveragePredictorV2,FEATURES_V2,export_v2
from smart_note_training.metrics import classification_metrics
from train_english_coverage import select_english,summary,check_separation


def v2_rule_predictions(x):
    # A transparent, unfitted competitor using the same point evidence.
    return [0 if r[0]==1 and not r[15] and not r[16] else (2 if r[5]<.5 else 1) for r in x]


def select(rows,rubrics):
    y=np.array([r['target'] for r in rows]);weights=np.array([r['weight'] for r in rows]);groups=np.array([r['group'] for r in rows])
    probabilities={c:np.full((len(rows),3),np.nan) for c in (.1,1.,10.)}
    baselines=np.zeros(len(rows),dtype=int);rules=np.zeros(len(rows),dtype=int);folds=[]
    for tr,va in LeaveOneGroupOut().split(np.zeros(len(rows)),y,groups):
        if set(y[tr])!={0,1,2}:raise ValueError('grouped training fold lacks a class')
        ex=CoverageFeaturesV2(rubrics).fit([rows[i] for i in tr]);x=ex.transform([rows[i] for i in tr]);v=ex.transform([rows[i] for i in va])
        baselines[va]=Counter(y[tr]).most_common(1)[0][0];rules[va]=v2_rule_predictions(v)
        for c in probabilities:
            sc,cl=fit_classifier(x,y[tr],weights[tr],c);probabilities[c][va]=cl.predict_proba(sc.transform(v))
        folds.append({'heldOutGroup':str(groups[va[0]]),'heldOutIds':[rows[i]['recordId'] for i in va],'fitExamples':len(tr)})
    if any(not np.isfinite(p).all() for p in probabilities.values()):raise ValueError('incomplete OOF probabilities')
    scores={str(c):classification_metrics(y.tolist(),p.argmax(axis=1).tolist()) for c,p in probabilities.items()}
    c=max(probabilities,key=lambda c:(scores[str(c)]['macroF1'],scores[str(c)]['balancedAccuracy'],-c))
    predictions=[{'recordId':r['recordId'],'actual':LABELS[r['target']],'byC':{str(k):p[i].tolist() for k,p in probabilities.items()}} for i,r in enumerate(rows)]
    return c,scores,folds,predictions,{'foldTrainingMajority':classification_metrics(y.tolist(),baselines.tolist()),'rubricRules':classification_metrics(y.tolist(),rules.tolist())}


def run(a):
    out=Path(a.output).resolve()
    if out.exists():raise FileExistsError('output must be fresh')
    rubrics=load_rubrics(a.rubrics);ids={c['id'] for c in rubrics['concepts']}
    from smart_note_training.contrastive_release import load_preparation
    from smart_note_training.reviewed_release import verify_unchanged
    package,*_=load_preparation(a.preparation)
    train=select_english(package.pages.records,ids,'corrected')
    for r in train:r['weight']*=2
    original_count=len(train)
    source_groups={r.concept_id:r.evaluation_group_id for r in package.pages.records
                   if r.language=='English' and r.record_id.startswith('aug01') and r.concept_id in ids}
    contrasts=json.loads(Path(a.contrasts).read_text(encoding='utf-8'))
    for r in contrasts['examples']:
        if r['conceptId'] not in ids or r['label'] not in LABELS or not r['text'].strip():raise ValueError('invalid contrast')
        train.append({'recordId':r['id'],'noteGroupId':r['id'],'group':source_groups[r['conceptId']],
                      'split':'train','conceptId':r['conceptId'],'text':r['text'],'target':LABELS.index(r['label']),
                      'language':'English','variant':'AI_authored_contrast','weight':2. if r['label']=='partial' else 1.})
    if len({r['recordId'] for r in train})!=len(train) or len({r['text'] for r in train})!=len(train):raise ValueError('duplicate training input')
    packet=json.loads(Path(a.development_packet).read_text(encoding='utf-8'))
    review=json.loads(Path(a.development_review).read_text(encoding='utf-8'))
    from evaluate_english_review import validate_review
    labels=validate_review(packet,review)
    development=[{'recordId':e['id'],'noteGroupId':'development-'+e['id'],'group':'development-'+e['conceptId'],
                  'split':'validation','conceptId':e['conceptId'],'text':e['text'],'language':'English',
                  'target':LABELS.index(labels[e['id']]['label'])} for e in packet['examples'] if labels[e['id']]['label']!='unclear']
    check_separation(train,development)
    paths=[Path(__file__),Path(__file__).parent/'src/smart_note_training/english_coverage_v2.py',
           Path(__file__).parent/'src/smart_note_training/english_coverage.py',Path(a.rubrics),Path(a.contrasts),Path(a.development_packet),Path(a.development_review)]
    frozen={str(p.resolve()):sha(p) for p in paths}
    out.mkdir(parents=True)
    protocol={'experimentId':out.name,'sourceHashes':frozen,'sourceManifestSha256':sha(Path(a.preparation)/'manifest.json'),
              'language':'English','scope':sorted(ids),'features':FEATURES_V2,'model':'logistic_regression',
              'CGrid':[.1,1.,10.],'selection':'TRAIN leave-one-source-student-group-out macro-F1, balanced accuracy, smaller C',
              'augmentationGrouping':'Each new concept contrast is linked to its existing augmentation student; no independent-family claim.',
              'originalTrainingExamples':original_count,'newAIAuthorLabelledExamples':len(train)-original_count,
              'training':summary(train),'developmentReviewUsedForFitting':False,
              'developmentReviewInformedFeatureDesign':True,'developmentReviewIsIndependentTest':False,
              'testScored':False,'enabledByDefault':False,'synthetic':True,
              'freshReviewPlan':{'examples':30,'freezeBeforeHumanReview':True,'scoreOnlyAfterReview':True,
                  'screen':{'accuracyAtLeast':.8,'macroF1AtLeast':.75,'eachClassRecallAtLeast':.7,'completePrecisionAtLeast':.9,
                            'mustBeatRulesAccuracy':True,'automaticDeployment':False}}}
    write_json(out/'protocol.json',protocol);write_json(out/'rubrics.json',rubrics)
    start=time.perf_counter();c,cv,folds,oof,baselines=select(train,rubrics)
    ex=CoverageFeaturesV2(rubrics).fit(train);x=ex.transform(train);y=[r['target'] for r in train]
    sc,cl=fit_classifier(x,y,[r['weight'] for r in train],c)
    model=export_v2(ex,sc,cl,{'experimentId':out.name,'selectedC':c,'enabledByDefault':False,'reviewRequired':True,
                            'protocolSha256':sha(out/'protocol.json'),'sourceModel':'new classifier; v1 preserved'})
    write_json(out/'model.json',model);predictor=CoveragePredictorV2(json.loads((out/'model.json').read_text(encoding='utf-8')))
    error=float(np.abs(cl.predict_proba(sc.transform(x))-predictor.probabilities(predictor.extractor.transform(train))).max())
    if error>1e-10:raise ValueError('reloaded v2 probabilities differ')
    v=ex.transform(development);probabilities=cl.predict_proba(sc.transform(v))
    if not np.allclose(probabilities,predictor.probabilities(predictor.extractor.transform(development)),atol=1e-10,rtol=0):raise ValueError('development reload mismatch')
    actual=[r['target'] for r in development];pred=probabilities.argmax(axis=1).tolist()
    decisions=[]
    for r,p in zip(development,probabilities):
        _,evidence=ex.one(r['text'],r['conceptId'],True)
        decisions.append({'id':r['recordId'],'conceptId':r['conceptId'],'actual':LABELS[r['target']],
                          'predicted':LABELS[int(p.argmax())],'scores':p.tolist(),'evidence':evidence})
    verify_unchanged(package)
    if any(sha(p)!=h for p,h in frozen.items()):raise ValueError('input changed during training')
    result={'experimentId':out.name,'training':summary(train),'selectedC':c,'groupedDevelopmentCV':cv,
            'groupedCVBaselines':baselines,'trainingFit':classification_metrics(y,cl.predict(sc.transform(x)).tolist()),
            'oldHumanChallengeDevelopment':{'model':classification_metrics(actual,pred),
                'v2RubricRules':classification_metrics(actual,v2_rule_predictions(v)),
                'falseCompleteCount':sum(p==0 and t!=0 for p,t in zip(pred,actual)),
                'informedFeatureDesign':True,'independentAccuracyClaimAllowed':False},
            'fitAndEvaluationSeconds':round(time.perf_counter()-start,3),'portableReloadError':error,
            'artifactBytes':(out/'model.json').stat().st_size,'freshReviewScored':False,'enabledByDefault':False}
    write_json(out/'evaluation.json',result);write_json(out/'development-decisions.json',decisions)
    write_json(out/'training-snapshot.json',train);write_json(out/'cv-folds.json',folds);write_json(out/'oof-predictions.json',oof)
    print(json.dumps(result,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser()
    for name in ('preparation','rubrics','contrasts','development-packet','development-review','output'):p.add_argument('--'+name,required=True)
    with threadpool_limits(limits=2):run(p.parse_args())
