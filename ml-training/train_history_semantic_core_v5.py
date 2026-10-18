"""History semantic-core V5: frozen MiniLM similarity features, CPU linear-head training."""
import json
import sys
import time
from pathlib import Path
from collections import Counter
from history_grade11_rubrics import revise_grade11
from evaluate_history_v31_review import validate_review
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
import numpy as np
from threadpoolctl import threadpool_limits
from smart_note_training.english_coverage import LABELS,fit_classifier,sha,write_json
from smart_note_training.history_semantic import FrozenEncoder,semantic_spans
from smart_note_training.history_semantic_core import SemanticCoreFeatures as HistoryFeatures,SemanticCorePredictor as HistoryPredictor,CORE_FEATURES as HISTORY_FEATURES
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
    previous_checks=ROOT/'outputs/history-coverage-v2-2026-10-14/new-diagnostic-checks.json'
    known=json.loads(previous_checks.read_text(encoding='utf-8'))['examples']
    for e in known:
        train.append({'recordId':e['id'],'text':e['text'],'conceptId':e['conceptId'],'target':LABELS.index(e['aiExpectedLabel']),'weight':4.})
    human_file=ROOT/'outputs/history-v31-submitted-review-2026-10-15/submitted-original.json'
    packet_file=ROOT/'outputs/history-coverage-v3.1-2026-10-14/new-review-template.json'
    human=json.loads(human_file.read_text(encoding='utf-8'))
    validate_review(json.loads(packet_file.read_text(encoding='utf-8')),human)
    if sha(human_file)!='7ffab3871e80693db4df5d501597bb6493e42a88526c5155452f77a0dfa920f4':raise ValueError('Submitted review changed')
    for e in human['examples']:
        if any(r['text']==e['text'] and r['conceptId']==e['conceptId'] for r in train):raise ValueError('Duplicate development text')
        train.append({'recordId':e['id'],'text':e['text'],'conceptId':e['conceptId'],'target':LABELS.index(e['humanLabel']),'weight':4.})
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
    revise_grade11(rubrics)
    # New synthetic prompt-only contrasts, generated from criteria, training only.
    prompt_rows=[]
    for concept in rubrics['concepts']:
        text=f"What is {concept['name']}? Explain the required components. These questions remain unanswered."
        prompt_rows.append({'recordId':'v3-prompt-'+concept['id'],'text':text,'conceptId':concept['id'],'target':2,'weight':1.})
    for concept in rubrics['concepts']:
        text=' '.join('Explain '+p['text'] for p in concept['points'])+' These revision tasks remain unanswered.'
        prompt_rows.append({'recordId':'v31-full-prompt-'+concept['id'],'text':text,'conceptId':concept['id'],'target':2,'weight':2.})
    train.extend(prompt_rows)
    write_json(out/'additional-development-snapshot.json',{'previousDiagnostics':known,'submittedHumanReviewNowDevelopment':human['examples'],'generatedPromptContrasts':prompt_rows,'synthetic':True,'independentHumanReview':False})
    rubrics['version']='english-history-draft-v4-semantic';rubrics['provenance']+=' Three pilot rubrics revised using AI development feedback; no independent human approval.'
    write_json(out/'rubrics.json',rubrics)
    protocol={'experimentId':out.name,'synthetic':True,'reviewerType':'AI','independentHumanReview':False,'enabledByDefault':False,
        'trainOriginalCount':721,'submittedHumanReviewDevelopmentCount':18,'humanReviewInterpretation':'Original 15/18 result preserved; these labels now used in training/development, not independent V3.2 evaluation.','trainReviewedDiagnosticCount':16,'priorAIDiagnosticCount':12,'generatedPromptCount':188,'diagnosticWeight':4.,'validationCount':len(val),
        'adjudicationExcluded':excluded,'validationReviewedLabelsUsedForDevelopment':True,
        'testInterpretation':'Previously exposed synthetic test reused only as regression; no fresh independent test available.',
        'sourceHashes':{str(p):sha(p) for p in [source,review_file,Path(__file__),ROOT/'src/smart_note_training/history_coverage_v31.py',ROOT/'src/smart_note_training/history_coverage.py',ROOT/'src/smart_note_training/english_coverage.py',previous_checks,human_file,packet_file,ROOT/'history_grade11_rubrics.py',ROOT/'evaluate_history_v31_review.py',ROOT/'src/smart_note_training/history_semantic.py',ROOT/'src/smart_note_training/history_semantic_core.py',ROOT/'encoders/minilm-l6-v2/encoder-manifest.json']},
        'selection':'Validation macro-F1, balanced accuracy, smaller C. C options .01, .1, 1, 10.',
        'completePolicy':'Withhold raw present for possible reversal, negation or requirement-date mismatch; withhold non-missing suggestions for prompt-only text. Abstentions are not relabelled or counted as correct.',
        'semanticFeatureExtractor':{'repo':'sentence-transformers/all-MiniLM-L6-v2','fineTuned':False,'device':'CPU','pooling':'attention-masked mean, L2 normalized','maxWordPieces':256,'windowWordLimit':48,'truncationAllowed':False},'v32ReviewLabelsFitted':False,'newV4DiagnosticsNotFitted':True,'architectureDecisionAfterV4Diagnostics':True,'liveModelChanged':False}
    write_json(out/'protocol.json',protocol);start=time.perf_counter()
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    texts=[p['text'] for c in rubrics['concepts'] for p in c['points']]
    for row in train+val+regression:
        texts.extend(quote for _,_,quote in semantic_spans(row['text']))
    print(json.dumps({'uniqueEmbeddingInputs':len(set(texts)),'trainCount':len(train),'valCount':len(val)}),flush=True)
    encoder.prime(texts)
    ex=HistoryFeatures(rubrics,encoder).fit(train);x=ex.transform(train);v=ex.transform(val)
    models={};scores={}
    for c in [.01,.1,1.,10.]:
        sc,cl=fit_classifier(x,[r['target'] for r in train],[r['weight'] for r in train],c)
        models[c]=(sc,cl);scores[str(c)]=classification_metrics([r['target'] for r in val],cl.predict(sc.transform(v)).tolist())
    c=max(models,key=lambda c:(scores[str(c)]['macroF1'],scores[str(c)]['balancedAccuracy'],-c));sc,cl=models[c]
    artifact={'schemaVersion':5,'modelType':'history_minilm_similarity_safety_logistic_regression','encoder':{'manifestPath':str(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json'),'revision':encoder.manifest['revision']},'features':HISTORY_FEATURES,'labels':list(LABELS),**ex.export(),
        'scalerMean':sc.mean_.tolist(),'scalerScale':sc.scale_.tolist(),'weights':cl.coef_.tolist(),'intercept':cl.intercept_.tolist(),
        'metadata':{'experimentId':out.name,'selectedC':c,'reviewRequired':True,'enabledByDefault':False,'synthetic':True,'protocolSha256':sha(out/'protocol.json')}}
    write_json(out/'model.json',artifact);model=HistoryPredictor(json.loads((out/'model.json').read_text(encoding='utf-8')),encoder)
    parity=float(np.abs(model.probabilities(x)-cl.predict_proba(sc.transform(x))).max())
    if parity>1e-10:raise ValueError('Portable mismatch')
    evaluated={};decisions=[]
    dev=[{'recordId':e['id'],'text':e['text'],'conceptId':e['conceptId'],'target':LABELS.index(e['reviewedLabel'])} for e in review if not e['requiresAdjudication']]
    for name,subset in [('validationDevelopment',val),('previousTestRegression',regression),('aiReviewDevelopment',dev),('submittedHumanReviewNowDevelopment',[{'recordId':e['id'],'text':e['text'],'conceptId':e['conceptId'],'target':LABELS.index(e['humanLabel'])} for e in human['examples']])]:
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
        'modelSha256':sha(out/'model.json'),'encoderRevision':encoder.manifest['revision'],'independentRealWorldAccuracyClaimAllowed':False,'deploymentApproved':False,'liveModelChanged':False}
    write_json(out/'evaluation.json',report);write_json(out/'decisions.json',decisions)
    print(json.dumps({k:v for k,v in report.items() if k!='validationSelection'},indent=2))


if __name__=='__main__':
    with threadpool_limits(limits=2):run(sys.argv[1])
