"""First scoring of the unscored History V3.2 review; no training/promotion."""
import argparse
import hashlib
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

MODEL_SHA='51fd4d45c2294e373f4fb435fa5898b22e77842953cb0c823d4d05829ba44ae2'


def verify_template_bytes(data,recorded_hash):
    digest=hashlib.sha256(data).hexdigest()
    if digest==recorded_hash:return {'byteSha256':digest,'preparationHash':recorded_hash,'lineEndingNote':None}
    canonical=data.replace(b'\r\n',b'\n')
    if data==canonical.replace(b'\n',b'\r\n') and hashlib.sha256(canonical).hexdigest()==recorded_hash:
        return {'byteSha256':digest,'preparationHash':recorded_hash,'lineEndingNote':'Builder hashed LF UTF-8 text before Windows write_text converted line endings to CRLF. LF-normalized bytes match exactly; original file preserved.'}
    raise ValueError('Original review template changed beyond line endings')


def validate_review(packet,review):
    for key in ('version','candidateVersion','candidateSha256','synthetic','modelPredictionsIncluded','modelScoredBeforeHumanReview'):
        if review.get(key)!=packet[key] or type(review.get(key))!=type(packet[key]):raise ValueError('Changed packet metadata: '+key)
    expected={e['id']:e for e in packet['examples']};entries=review.get('examples')
    if not isinstance(entries,list) or len(entries)!=len(expected):raise ValueError('Wrong example count')
    if len({e.get('id') for e in entries})!=len(entries):raise ValueError('Duplicate review IDs')
    if {e.get('id') for e in entries}!=set(expected):raise ValueError('Wrong review IDs')
    for e in entries:
        for key in ('conceptId','conceptName','grade','requirements','sourceReference','text'):
            if e.get(key)!=expected[e['id']][key]:raise ValueError('Changed example content: '+e['id']+'/'+key)
        if type(e.get('requiresAdjudication')) is not bool:raise ValueError('Clarification status must be boolean')
        if not isinstance(e.get('comment'),str):raise ValueError('Comment must be text')
        if e['requiresAdjudication']:
            if e.get('humanLabel') is not None or not e['comment'].strip():raise ValueError('Clarification needs an explanation and unassigned label')
        elif e.get('humanLabel') not in LABELS:raise ValueError('Missing or invalid coverage label')
    if not isinstance(review.get('reviewerName'),str) or not review['reviewerName'].strip():raise ValueError('Missing reviewer name')
    if review.get('reviewerType') not in ('human','human_with_ai_assistance','AI'):raise ValueError('Unknown reviewer type')
    if type(review.get('independentHumanReview')) is not bool:raise ValueError('Review independence must be boolean')
    if review['independentHumanReview'] and review['reviewerType']!='human':raise ValueError('Contradictory review provenance')


def metrics(rows,raw=False):
    if not rows:return None
    return classification_metrics([LABELS.index(e['humanLabel']) for e in rows],
        [LABELS.index(e['prediction']['rawModelStatus'] if raw else e['prediction']['suggestedStatus']) for e in rows])


def run(review,output):
    review=Path(review);out=Path(output);out.mkdir(parents=True,exist_ok=False)
    (out/'submitted-original.json').write_bytes(review.read_bytes())
    packet_root=ROOT/'outputs/history-v32-unscored-review-2026-10-15'
    packet_path=packet_root/'review-template.json'
    prep=json.loads((packet_root/'preparation.json').read_text(encoding='utf-8'))
    template_integrity=verify_template_bytes(packet_path.read_bytes(),prep['templateSha256'])
    if sha(ROOT/'build_history_v32_review.py')!=prep['sourceScriptSha256']:raise ValueError('Original packet builder changed')
    packet=json.loads(packet_path.read_text(encoding='utf-8'));submitted=json.loads(review.read_text(encoding='utf-8-sig'))
    validate_review(packet,submitted)
    base=ROOT/'outputs/history-coverage-v3.2-2026-10-15';model_path=base/'model.json'
    if sha(model_path)!=MODEL_SHA or packet['candidateSha256']!=MODEL_SHA:raise ValueError('Frozen artifact mismatch')
    protocol=json.loads((base/'protocol.json').read_text(encoding='utf-8'))
    for path,digest in protocol['sourceHashes'].items():
        if sha(path)!=digest:raise ValueError('Frozen source mismatch: '+path)
    model=HistoryPredictorV31(json.loads(model_path.read_text(encoding='utf-8')))
    decisions=[]
    for e in submitted['examples']:
        p=model.predict(e['text'],e['conceptId'],'English',True)
        for quote in p['evidence']['points']+p['evidence']['concerns']:
            if e['text'][quote['start']:quote['end']]!=quote.get('candidateEvidence',quote.get('quote')):raise ValueError('Evidence offset mismatch')
        decisions.append({**e,'prediction':p,'matchesSubmittedLabel':None if e['requiresAdjudication'] else p['suggestedStatus']==e['humanLabel']})
    adjudicable=[e for e in decisions if not e['requiresAdjudication']]
    accepted=[e for e in adjudicable if e['prediction']['suggestedStatus'] is not None]
    complete=[e for e in accepted if e['prediction']['suggestedStatus']=='present']
    reviewed_complete=[e for e in adjudicable if e['humanLabel']=='present']
    matrix=[[0]*4 for _ in LABELS]
    for e in adjudicable:
        final=e['prediction']['suggestedStatus'];matrix[LABELS.index(e['humanLabel'])][LABELS.index(final) if final is not None else 3]+=1
    matched=sum(e['matchesSubmittedLabel'] for e in adjudicable)
    false_complete=[e['id'] for e in complete if e['humanLabel']!='present']
    report={'evaluatedAt':datetime.now(timezone.utc).isoformat(),'sourceSha256':sha(review),'templateIntegrity':template_integrity,'modelSha256':MODEL_SHA,
        'modelVersion':packet['candidateVersion'],'reviewerName':submitted['reviewerName'],'reviewerTypeDeclared':submitted['reviewerType'],
        'independentHumanReviewDeclared':submitted['independentHumanReview'],'reviewerIdentityOrIndependenceExternallyVerified':False,
        'syntheticTexts':True,'realHandwritingEvaluated':False,'modelScoredBeforeReturnedReview':False,
        'totalExamples':len(decisions),'adjudicableExamples':len(adjudicable),'unresolvedReviewCount':len(decisions)-len(adjudicable),
        'conceptsTested':len({e['conceptId'] for e in decisions}),'supportedConcepts':len(model.extractor.concepts),
        'gradeCounts':dict(Counter(e['grade'] for e in decisions)),'labelCounts':dict(Counter(e['humanLabel'] for e in adjudicable)),
        'exactFinalMatches':matched,'overallFinalAgreement':matched/len(adjudicable) if adjudicable else None,
        'withheldOnAdjudicableCount':len(adjudicable)-len(accepted),'acceptedOnlyMetrics':metrics(accepted),'rawModelMetrics':metrics(adjudicable,True),
        'acceptedOnlyWarning':'Excludes model abstentions; not overall accuracy. Unresolved reviewer labels are counted separately.',
        'finalConfusionRows':list(LABELS),'finalConfusionColumns':list(LABELS)+['withheld'],'finalConfusionMatrix':matrix,
        'completeSuggestions':len(complete),'correctCompleteSuggestions':len(complete)-len(false_complete),'falseCompleteIds':false_complete,
        'completePrecisionObserved':(len(complete)-len(false_complete))/len(complete) if complete else None,
        'completeRecallObserved':sum(e['prediction']['suggestedStatus']=='present' for e in reviewed_complete)/len(reviewed_complete) if reviewed_complete else None,
        'perGrade':{str(g):{'adjudicable':sum(e['grade']==g for e in adjudicable),'matched':sum(e['grade']==g and e['matchesSubmittedLabel'] for e in adjudicable)} for g in (10,11)},
        'disagreements':[{'id':e['id'],'conceptId':e['conceptId'],'reviewedLabel':e['humanLabel'],'rawModelStatus':e['prediction']['rawModelStatus'],
            'finalSuggestion':e['prediction']['suggestedStatus'],'comment':e['comment']} for e in adjudicable if not e['matchesSubmittedLabel']],
        'unresolvedReviewIds':[e['id'] for e in decisions if e['requiresAdjudication']],
        'modelRefitted':False,'modelOrInferenceSourcesChanged':False,'liveModelChanged':False,
        'readinessDecision':'Evaluate the observed errors and pending real-note/OCR and integration checks; do not auto-activate from this small packet.'}
    if sha(model_path)!=MODEL_SHA:raise ValueError('Model changed during scoring')
    write_json(out/'evaluation.json',report);write_json(out/'decisions.json',decisions)
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--review',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();run(a.review,a.output)
