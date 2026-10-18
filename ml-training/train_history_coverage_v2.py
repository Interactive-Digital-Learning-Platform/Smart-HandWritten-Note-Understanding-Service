"""V2 development experiment from AI feedback, not independent evaluation."""
import json
import sys
import time
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
import numpy as np
from threadpoolctl import threadpool_limits
from smart_note_training.english_coverage import LABELS,fit_classifier,sha,write_json
from smart_note_training.history_coverage import HistoryFeatures,HistoryPredictor,HISTORY_FEATURES
from smart_note_training.metrics import classification_metrics


def run(output):
    out=Path(output);out.mkdir(parents=True,exist_ok=False)
    v1=ROOT/'outputs/history-coverage-v1-2026-10-14'
    source=ROOT/'outputs/history-dataset-intake-2026-10-14/source/page-training-examples.jsonl'
    review_file=ROOT/'outputs/history-ai-review-01-2026-10-14/normalized-review.json'
    rows=[json.loads(s) for s in source.read_text(encoding='utf-8').splitlines() if s]
    review=json.loads(review_file.read_text(encoding='utf-8'))['examples'];byid={e['id']:e for e in review}
    def convert(r):return {'recordId':r['recordId'],'text':r['noteTextSnapshot'],'conceptId':r['concept']['id'],'target':LABELS.index(r['targetLabel']),'weight':1.}
    train=[convert(r) for r in rows if r['textVariant']=='corrected' and r['preassignedSplit']=='train' and r['trainingEligible']]
    for e in review:
        if e['id'].startswith('history-diagnostic-') and not e['requiresAdjudication']:
            train.append({'recordId':e['id'],'text':e['text'],'conceptId':e['conceptId'],'target':LABELS.index(e['reviewedLabel']),'weight':4.})
    val=[];excluded=[]
    for r in rows:
        if r['textVariant']!='corrected' or r['preassignedSplit']!='validation':continue
        e=byid.get(r['recordId'])
        if e and e['requiresAdjudication']:excluded.append(r['recordId']);continue
        converted=convert(r)
        if e:converted['target']=LABELS.index(e['reviewedLabel'])
        val.append(converted)
    regression=[convert(r) for r in rows if r['textVariant']=='corrected' and r['preassignedSplit']=='test']
    rubrics=json.loads((v1/'rubrics.json').read_text(encoding='utf-8'))
    concepts={c['id']:c for c in rubrics['concepts']}
    def point(pid,text,groups):return {'id':pid,'text':text,'groups':groups}
    concepts['hist-g10-l01-c01']['points']=[
        point('evidence','Sources provide evidence of past human activity.',['sources source'.split(),['evidence','past','history','human']]),
        point('literary','Literary sources include books and written documents.',[['literary'],['books','book','documents','document']]),
        point('archaeological','Archaeological sources include physical remains such as coins buildings and inscriptions.',[['archaeological','archeological'],['physical','remains','coins','buildings','inscriptions']])]
    concepts['hist-g10-l01-c02']['points']=[
        point('deepawamsa','Deepawamsa is the earlier chronicle dating to the fourth century AD.',[['deepawamsa','dipavamsa'],['earlier','earliest','oldest','first'],['fourth','4th']]),
        point('mahavamsa','Mahanama wrote Mahawamsa and later writers continued the account.',[['mahanama'],['mahavamsa','mahawamsa'],['wrote','write','author','compiled'],['continued','continuation','continuous','subsequent','later']])]
    concepts['hist-g10-l01-c09']['points']=[
        point('damage','Vandalism and urbanization can destroy monuments and archaeological remains.',[['vandalism','urbanization','urbanisation','destruction','damage','destroy'],['monuments','remains','sources']]),
        point('protection','Citizens should protect archaeological remains to preserve historical evidence.',[['protect','protection','protecting','preserve','preservation'],['archaeological','historical','remains','evidence']])]
    rubrics['version']='english-history-draft-v2';rubrics['provenance']+=' Three pilot rubrics revised using AI development feedback; no independent human approval.'
    write_json(out/'rubrics.json',rubrics)
    protocol={'experimentId':out.name,'synthetic':True,'reviewerType':'AI','independentHumanReview':False,'enabledByDefault':False,
        'trainOriginalCount':721,'trainReviewedDiagnosticCount':len(train)-721,'diagnosticWeight':4.,'validationCount':len(val),
        'adjudicationExcluded':excluded,'validationReviewedLabelsUsedForDevelopment':True,
        'testInterpretation':'Previously exposed synthetic test reused only as regression; no fresh independent test available.',
        'sourceHashes':{str(p):sha(p) for p in [source,review_file,Path(__file__),ROOT/'src/smart_note_training/history_coverage.py',ROOT/'src/smart_note_training/english_coverage.py']},
        'selection':'Validation macro-F1, balanced accuracy, smaller C. C options .01, .1, 1, 10.',
        'completePolicy':'Withhold raw present when a possible source-role reversal or negated matched requirement is detected; do not relabel abstention as partial.',
        'liveModelChanged':False}
    write_json(out/'protocol.json',protocol);start=time.perf_counter()
    ex=HistoryFeatures(rubrics).fit(train);x=ex.transform(train);v=ex.transform(val)
    models={};scores={}
    for c in [.01,.1,1.,10.]:
        sc,cl=fit_classifier(x,[r['target'] for r in train],[r['weight'] for r in train],c)
        models[c]=(sc,cl);scores[str(c)]=classification_metrics([r['target'] for r in val],cl.predict(sc.transform(v)).tolist())
    c=max(models,key=lambda c:(scores[str(c)]['macroF1'],scores[str(c)]['balancedAccuracy'],-c));sc,cl=models[c]
    artifact={'schemaVersion':2,'modelType':'history_rubric_tfidf_logistic_regression','features':HISTORY_FEATURES,'labels':list(LABELS),**ex.export(),
        'scalerMean':sc.mean_.tolist(),'scalerScale':sc.scale_.tolist(),'weights':cl.coef_.tolist(),'intercept':cl.intercept_.tolist(),
        'metadata':{'experimentId':out.name,'selectedC':c,'reviewRequired':True,'enabledByDefault':False,'synthetic':True,'protocolSha256':sha(out/'protocol.json')}}
    write_json(out/'model.json',artifact);model=HistoryPredictor(json.loads((out/'model.json').read_text(encoding='utf-8')))
    parity=float(np.abs(model.probabilities(x)-cl.predict_proba(sc.transform(x))).max())
    if parity>1e-10:raise ValueError('Portable mismatch')
    evaluated={};decisions=[]
    dev=[{'recordId':e['id'],'text':e['text'],'conceptId':e['conceptId'],'target':LABELS.index(e['reviewedLabel'])} for e in review if not e['requiresAdjudication']]
    for name,subset in [('validationDevelopment',val),('previousTestRegression',regression),('aiReviewDevelopment',dev)]:
        predictions=[model.predict(r['text'],r['conceptId'],'English',True) for r in subset]
        actual=[r['target'] for r in subset];pred=[LABELS.index(p['rawModelStatus']) for p in predictions]
        accepted=[i for i,p in enumerate(predictions) if p['suggestedStatus'] is not None]
        complete=[i for i,p in enumerate(predictions) if p['suggestedStatus']=='present']
        evaluated[name]={'rawModel':classification_metrics(actual,pred),'withheld':len(subset)-len(accepted),'total':len(subset),
            'acceptedOnly':classification_metrics([actual[i] for i in accepted],[pred[i] for i in accepted]) if accepted else None,
            'completeSuggestions':len(complete),'falseCompleteSuggestions':sum(actual[i]!=0 for i in complete),
            'notIndependentAccuracy':True}
        for r,p in zip(subset,predictions):
            for e in p['evidence']['points']+p['evidence']['concerns']:
                quote=e.get('candidateEvidence',e.get('quote'))
                if r['text'][e['start']:e['end']]!=quote:raise ValueError('Offset mismatch')
            decisions.append({'id':r['recordId'],'set':name,'actual':LABELS[r['target']],'prediction':p})
    report={'selectedC':c,'validationSelection':scores,'evaluation':evaluated,'portableReloadError':parity,'elapsedSeconds':round(time.perf_counter()-start,2),
        'modelSha256':sha(out/'model.json'),'independentRealWorldAccuracyClaimAllowed':False,'deploymentApproved':False,'liveModelChanged':False}
    write_json(out/'evaluation.json',report);write_json(out/'decisions.json',decisions)
    print(json.dumps({k:v for k,v in report.items() if k!='validationSelection'},indent=2))


if __name__=='__main__':
    with threadpool_limits(limits=2):run(sys.argv[1])
