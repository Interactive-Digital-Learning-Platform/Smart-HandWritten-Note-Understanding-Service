"""Separate CPU History candidate; synthetic evaluation, no live promotion."""
import argparse
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
import numpy as np
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
from threadpoolctl import threadpool_limits
from smart_note_training.english_coverage import CoverageFeatures,CoveragePredictor,LABELS,fit_classifier,export_model,sha,write_json
from smart_note_training.metrics import classification_metrics

# Explicit draft decomposition of the retained pilot's prose criteria.
PILOT=[
 ['Sources provide evidence about past human activity. Literary sources are books and documents.','Archaeological sources are physical remains such as coins buildings and inscriptions.'],
 ['Deepawamsa is the earlier chronicle from about the fourth century AD.','Mahanama wrote Mahawamsa and later writers continued its historical account.'],
 ['Foreign writers recorded Sri Lankan history including Fa Hsien and Robert Knox.','Distinguish visitors from writers relying on information supplied by others.'],
 ['Check who wrote a source when why and how it was produced.','Compare accounts with other sources including inscriptions to corroborate events.'],
 ['Epigraphy is writing on stone or other materials including cave pillar copper plate inscriptions.','Inscriptions record historical events and social facts.'],
 ['Ancient coins include Kahapana and Thamba Massa.','Coins reveal commerce metal use and trade.'],
 ['Physical remains include ruins drawings sculptures and antiquities.','Remains reveal architecture water management clothing and beliefs.'],
 ['History develops critical logical thinking and learning from past experience.','History helps social identity respect and tolerance.'],
 ['Destruction includes vandalism and urbanization that damage monuments.','Protect and preserve archaeological sources as historical evidence.']]


def build_rubrics(curriculum):
    concepts=[]
    for lesson in curriculum['lessons']:
        for c in lesson['concepts']:
            facets=c.get('minimumEvidenceRequirements',{}).get('mustSubstantiateBothFacetsForPresent')
            if not facets:
                if lesson['lessonId']!='hist-g10-l01':raise ValueError('Missing facets: '+c['id'])
                facets=PILOT[int(c['id'][-2:])-1]
            points=[]
            for i,text in enumerate(facets):
                terms=list(dict.fromkeys(w for w in re.findall(r'[a-z0-9]+',text.lower()) if w not in ENGLISH_STOP_WORDS and len(w)>2 and w not in {'text','discusses','including'}))
                if not terms:raise ValueError('Empty requirement vocabulary')
                points.append({'id':f'facet-{i+1}','text':text,'groups':[[w] for w in terms]})
            concepts.append({'id':c['id'],'name':c['name'],'lessonId':lesson['lessonId'],'points':points,'sourceCriteria':c['minimumCoverageCriteria']})
    return {'version':'english-history-draft-v1','language':'English','provenance':'Automatically tokenized supplied proposed facet criteria; nine pilot decompositions drafted for this experiment; no independent teacher approval.','concepts':concepts}


def run(source,output):
    source=Path(source);out=Path(output);out.mkdir(parents=True,exist_ok=False)
    curriculum=json.loads((source/'curriculum.json').read_text(encoding='utf-8'))
    rows=[json.loads(s) for s in (source/'page-training-examples.jsonl').read_text(encoding='utf-8').splitlines() if s]
    corrected=[r for r in rows if r['textVariant']=='corrected']
    groups={}
    for r in rows:
        group=r['evaluationGroupId'];split=r['preassignedSplit']
        if group in groups and groups[group]!=split:raise ValueError('Group leakage')
        groups[group]=split
    def convert(r):
        return {'recordId':r['recordId'],'text':r['noteTextSnapshot'],'conceptId':r['concept']['id'],'target':LABELS.index(r['targetLabel']),'weight':1.,'group':r['evaluationGroupId']}
    train=[convert(r) for r in corrected if r['preassignedSplit']=='train' and r['trainingEligible']]
    val=[convert(r) for r in corrected if r['preassignedSplit']=='validation']
    test=[convert(r) for r in corrected if r['preassignedSplit']=='test']
    rubrics=build_rubrics(curriculum);write_json(out/'rubrics.json',rubrics)
    protocol={'experimentId':out.name,'subject':'History','language':'English','synthetic':True,'independentHumanReview':False,'realHandwritingEvaluated':False,
        'sourceHashes':{str(p):sha(p) for p in [source/'curriculum.json',source/'page-training-examples.jsonl',Path(__file__),ROOT/'src/smart_note_training/english_coverage.py']},
        'splitCounts':{'train':len(train),'validation':len(val),'test':len(test)},'splitGroups':{s:sorted({r['group'] for r in rows_}) for s,rows_ in [('train',train),('validation',val),('test',test)]},
        'pairHandling':'Use corrected view once per page-concept; unit weight, equivalent to total weight of both half-weight paired views. Raw OCR robustness assessed separately.',
        'selection':'C chosen by validation macro-F1, then balanced accuracy, then smaller C; no validation/test fitting.',
        'COptions':[.01,.1,1.,10.],'deploymentGate':{'macroF1':.8,'completePrecision':.9,'minimumClassRecall':.8,'mustBeatMajority':True,'independentHumanReviewRequired':True},'liveModelChanged':False}
    write_json(out/'protocol.json',protocol)
    start=time.perf_counter();ex=CoverageFeatures(rubrics).fit(train)
    x=ex.transform(train);v=ex.transform(val)
    candidates={};scores={}
    for c in protocol['COptions']:
        sc,cl=fit_classifier(x,[r['target'] for r in train],[r['weight'] for r in train],c)
        candidates[c]=(sc,cl);scores[str(c)]=classification_metrics([r['target'] for r in val],cl.predict(sc.transform(v)).tolist())
    selected=max(candidates,key=lambda c:(scores[str(c)]['macroF1'],scores[str(c)]['balancedAccuracy'],-c))
    sc,cl=candidates[selected]
    artifact=export_model(ex,sc,cl,{'experimentId':out.name,'selectedC':selected,'reviewRequired':True,'enabledByDefault':False,'synthetic':True,'protocolSha256':sha(out/'protocol.json')})
    write_json(out/'model.json',artifact);portable=CoveragePredictor(artifact)
    parity=float(np.abs(portable.probabilities(x)-cl.predict_proba(sc.transform(x))).max())
    if parity>1e-10:raise ValueError('Portable inference mismatch')
    majority=Counter(r['target'] for r in train).most_common(1)[0][0]
    evaluations={};decisions=[]
    for split,subset in [('validation',val),('test',test)]:
        f=v if split=='validation' else ex.transform(subset);pred=cl.predict(sc.transform(f)).tolist();actual=[r['target'] for r in subset]
        # Predeclared lexical baseline, not tuned on test.
        rule=[0 if a[0]>=.65 else 1 if a[2]>=.35 else 2 for a in f]
        evaluations[split]={'model':classification_metrics(actual,pred),'majority':classification_metrics(actual,[majority]*len(actual)),'lexicalRules':classification_metrics(actual,rule)}
        for r,p in zip(subset,pred):
            ev=portable.predict(r['text'],r['conceptId'],'English',True)
            if any(r['text'][e['start']:e['end']]!=e['candidateEvidence'] for e in ev['evidence']):raise ValueError('Evidence mismatch')
            decisions.append({'recordId':r['recordId'],'split':split,'conceptId':r['conceptId'],'actual':LABELS[r['target']],'prediction':ev})
    raw=[convert(r) for r in rows if r['textVariant']=='raw' and r['preassignedSplit']=='test']
    evaluations['simulatedRawTest']={'model':classification_metrics([r['target'] for r in raw],cl.predict(sc.transform(ex.transform(raw))).tolist()),'notIndependentOfCorrectedTest':True}
    t=evaluations['test']['model'];g=protocol['deploymentGate']
    gates={'macroF1':t['macroF1']>=g['macroF1'],'completePrecision':t['perClass']['present']['precision']>=g['completePrecision'],
        'minimumClassRecall':min(c['recall'] for c in t['perClass'].values())>=g['minimumClassRecall'],
        'beatsMajority':t['accuracy']>evaluations['test']['majority']['accuracy'],'independentHumanReview':False}
    result={'selectedC':selected,'validationSelection':scores,'evaluation':evaluations,'gateChecks':gates,'deploymentApproved':all(gates.values()),
        'elapsedSeconds':round(time.perf_counter()-start,2),'portableReloadError':parity,'artifactBytes':(out/'model.json').stat().st_size,
        'modelSha256':sha(out/'model.json'),'independentRealWorldAccuracyClaimAllowed':False,'liveModelChanged':False}
    write_json(out/'evaluation.json',result);write_json(out/'decisions.json',decisions)
    print(json.dumps(result,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    with threadpool_limits(limits=2):run(a.source,a.output)
