"""Score returned History V3.1 review without fitting or promoting any model."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.english_coverage import LABELS,sha,write_json
from smart_note_training.history_coverage_v31 import HistoryPredictorV31
from smart_note_training.metrics import classification_metrics

MODEL_SHA='d54f2fc02be34f911e6a4ac36ed0fc1c6fec9159b94698606326d12ca3f8f68e'


def validate_review(packet,submitted):
    if submitted.get('version')!=packet['version']:raise ValueError('Wrong review version')
    expected={e['id']:e for e in packet['examples']}
    entries=submitted.get('examples')
    if not isinstance(entries,list) or len(entries)!=len(expected):raise ValueError('Wrong review count')
    if len({e['id'] for e in entries})!=len(entries):raise ValueError('Duplicate review IDs')
    if {e['id'] for e in entries}!=set(expected):raise ValueError('Wrong review IDs')
    for e in entries:
        for k in ('conceptId','conceptName','requirements','text'):
            if e.get(k)!=expected[e['id']][k]:raise ValueError('Changed packet field: '+e['id']+'/'+k)
        if e.get('humanLabel') not in LABELS:raise ValueError('Missing or unknown label: '+e['id'])
        if not isinstance(e.get('comment',''),str):raise ValueError('Invalid comment')
    if not isinstance(submitted.get('reviewerName'),str) or not submitted['reviewerName'].strip():raise ValueError('Missing reviewer name')
    declared_type=str(submitted.get('reviewerType','')).strip().lower()
    types={'human':'human','human reviewer':'human','human_with_ai_assistance':'human_with_ai_assistance','ai':'AI'}
    if declared_type not in types:raise ValueError('Unknown reviewer type; inspect provenance')
    for field in ('synthetic','independentHumanReview','intendedLabelsAndModelOutputsHidden'):
        if type(submitted.get(field)) is not bool:raise ValueError('Expected boolean: '+field)
    if submitted['synthetic']!=packet['synthetic']:raise ValueError('Changed source provenance')
    if types[declared_type]!='human' and submitted['independentHumanReview']:raise ValueError('Contradictory reviewer provenance')
    return types[declared_type]


def run(review,output):
    review=Path(review);out=Path(output);out.mkdir(parents=True,exist_ok=False)
    (out/'submitted-original.json').write_bytes(review.read_bytes())
    base=ROOT/'outputs/history-coverage-v3.1-2026-10-14'
    packet=json.loads((base/'new-review-template.json').read_text(encoding='utf-8'))
    submitted=json.loads(review.read_text(encoding='utf-8-sig'))
    reviewer_type=validate_review(packet,submitted)
    model_path=base/'model.json';model_hash=sha(model_path)
    if model_hash!=MODEL_SHA:raise ValueError('Frozen candidate artifact changed')
    protocol=json.loads((base/'protocol.json').read_text(encoding='utf-8'))
    for name,digest in protocol['sourceHashes'].items():
        if sha(name)!=digest:raise ValueError('Frozen source changed: '+name)
    model=HistoryPredictorV31(json.loads(model_path.read_text(encoding='utf-8')))
    prior=json.loads((base/'new-ai-checks.json').read_text(encoding='utf-8'))
    prior_by_id={e['id']:e for e in prior['examples']}
    decisions=[];matrix=[[0]*4 for _ in LABELS]
    for e in submitted['examples']:
        prediction=model.predict(e['text'],e['conceptId'],'English',True)
        if prediction!=prior_by_id[e['id']]['prediction']:raise ValueError('Prediction differs from frozen scored packet: '+e['id'])
        for p in prediction['evidence']['points']+prediction['evidence']['concerns']:
            quote=p.get('candidateEvidence',p.get('quote'))
            if e['text'][p['start']:p['end']]!=quote:raise ValueError('Evidence offset mismatch')
        actual=e['humanLabel'];final=prediction['suggestedStatus']
        matrix[LABELS.index(actual)][LABELS.index(final) if final is not None else 3]+=1
        decisions.append({**e,'prediction':prediction,'matchesSubmittedLabel':actual==final,
            'differsFromPriorAIExpectation':actual!=prior_by_id[e['id']]['aiExpectedLabel']})
    actual=[LABELS.index(e['humanLabel']) for e in decisions]
    raw=[LABELS.index(e['prediction']['rawModelStatus']) for e in decisions]
    accepted=[e for e in decisions if e['prediction']['suggestedStatus'] is not None]
    complete=[e for e in decisions if e['prediction']['suggestedStatus']=='present']
    actual_complete=[e for e in decisions if e['humanLabel']=='present']
    matched=sum(e['matchesSubmittedLabel'] for e in decisions)
    false_complete=[e['id'] for e in complete if e['humanLabel']!='present']
    complete_precision=sum(e['humanLabel']=='present' for e in complete)/len(complete) if complete else None
    complete_recall=sum(e['prediction']['suggestedStatus']=='present' for e in actual_complete)/len(actual_complete) if actual_complete else None
    report={'evaluatedAt':datetime.now(timezone.utc).isoformat(),'sourceSha256':sha(review),'modelSha256':model_hash,
        'modelVersion':model.artifact['metadata']['experimentId'],'reviewerName':submitted['reviewerName'],
        'reviewerTypeDeclared':submitted['reviewerType'],'reviewerTypeNormalized':reviewer_type,
        'independentHumanReviewDeclared':submitted['independentHumanReview'],
        'reviewerIdentityOrIndependenceExternallyVerified':False,
        'intendedLabelsAndModelOutputsHiddenDeclared':submitted['intendedLabelsAndModelOutputsHidden'],
        'syntheticTexts':True,'realHandwritingEvaluated':False,'conceptsTested':len({e['conceptId'] for e in decisions}),
        'supportedConcepts':len(model.extractor.concepts),'examples':len(decisions),
        'labelCounts':dict(Counter(e['humanLabel'] for e in decisions)),
        'exactFinalMatches':matched,'totalIncludingWithheld':len(decisions),'overallFinalAgreement':matched/len(decisions),
        'withheldCount':len(decisions)-len(accepted),'coverage':len(accepted)/len(decisions),
        'rawModelMetrics':classification_metrics(actual,raw),
        'acceptedOnlyMetrics':classification_metrics([LABELS.index(e['humanLabel']) for e in accepted],[LABELS.index(e['prediction']['suggestedStatus']) for e in accepted]),
        'acceptedOnlyWarning':'Excludes abstentions; must not be reported as overall accuracy.',
        'finalConfusionMatrixRows':list(LABELS),'finalConfusionMatrixColumns':list(LABELS)+['withheld'],'finalConfusionMatrix':matrix,
        'completeSuggestions':len(complete),'correctCompleteSuggestions':len(complete)-len(false_complete),
        'completePrecisionObserved':complete_precision,'completeRecallObserved':complete_recall,'falseCompleteIds':false_complete,
        'disagreements':[{'id':e['id'],'reviewedLabel':e['humanLabel'],'rawModelStatus':e['prediction']['rawModelStatus'],
            'finalSuggestion':e['prediction']['suggestedStatus'],'comment':e.get('comment','')} for e in decisions if not e['matchesSubmittedLabel']],
        'changedFromAIExpectation':[e['id'] for e in decisions if e['differsFromPriorAIExpectation']],
        'readiness':{'reviewerDeclaredHuman':reviewer_type=='human','observedAgreementAtLeast90Percent':matched/len(decisions)>=.9,
            'completeRecallAtLeast80Percent':complete_recall is not None and complete_recall>=.8,
            'representativeCoverageEstablished':False,'decision':'Remain experimental; no automatic app activation.'},
        'modelRefitted':False,'modelOrInferenceSourcesChanged':False,'liveModelChanged':False}
    if sha(model_path)!=model_hash:raise ValueError('Model changed during scoring')
    write_json(out/'evaluation.json',report);write_json(out/'decisions.json',decisions)
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--review',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();run(a.review,a.output)
