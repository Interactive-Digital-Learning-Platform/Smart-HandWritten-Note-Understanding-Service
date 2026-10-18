"""Audit supplied AI review without treating compatibility field as human truth."""
import argparse
import json
from collections import Counter
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.english_coverage import CoveragePredictor,sha,write_json,LABELS
from smart_note_training.metrics import classification_metrics


def run(review,output):
    review=Path(review);out=Path(output);out.mkdir(parents=True,exist_ok=False)
    raw=review.read_bytes();(out/'submitted-original.json').write_bytes(raw)
    text=raw.decode('utf-8-sig');repairs=[]
    try:data=json.loads(text)
    except json.JSONDecodeError:
        broken='"reviewerName": "Anura,"examples": ['
        if text.count(broken)!=1:raise ValueError('Unknown malformed JSON; repair not safe')
        text=text.replace(broken,'"reviewerName": "Anura", "examples": [',1)
        data=json.loads(text);repairs.append('Inserted one missing closing quote after reviewerName; no labels/text changed.')
    base=ROOT/'outputs/history-coverage-v1-2026-10-14'
    packet=json.loads((base/'human-review-template.json').read_text(encoding='utf-8'))
    expected={e['id']:e for e in packet['examples']}
    entries=data['examples']
    if len(entries)!=len(expected) or {e['id'] for e in entries}!=set(expected):raise ValueError('Review ID/count mismatch')
    if len({e['id'] for e in entries})!=len(entries):raise ValueError('Duplicate review IDs')
    for e in entries:
        for field in ('text','conceptId','requirements','conceptName'):
            if e[field]!=expected[e['id']][field]:raise ValueError('Changed packet content: '+e['id']+'/'+field)
        if e['humanLabel'] not in LABELS:raise ValueError('Invalid or missing label')
    meta=data.get('annotationMetadata',{})
    if meta.get('reviewerType')!='AI' or meta.get('independentHumanValidation') is not False:raise ValueError('Unexpected provenance; requires inspection')
    uncertainty={r['id'] for r in meta.get('adjudicationRecommended',[])}
    normalized={'version':'history-ai-development-review-01','synthetic':True,'reviewerType':'AI','independentHumanValidation':False,'reviewedAt':data.get('reviewedAt'),
        'sourceSha256':sha(review),'syntaxRepairs':repairs,'originalSyntheticFlag':data.get('synthetic'),
        'examples':[{'id':e['id'],'conceptId':e['conceptId'],'text':e['text'],'reviewedLabel':e['humanLabel'],'comment':e.get('comment',''),
            'requiresAdjudication':e['id'] in uncertainty,'sourceUnit':'page','use':'development'} for e in entries]}
    write_json(out/'normalized-review.json',normalized)
    model=CoveragePredictor(json.loads((base/'model.json').read_text(encoding='utf-8')))
    decisions=[]
    for e in normalized['examples']:
        p=model.predict(e['text'],e['conceptId'],'English',True)
        decisions.append({**e,'predicted':p['suggestedStatus']})
    adjudicated=[e for e in decisions if not e['requiresAdjudication']]
    metric=lambda rows:classification_metrics([LABELS.index(e['reviewedLabel']) for e in rows],[LABELS.index(e['predicted']) for e in rows])
    report={'sourceSha256':sha(review),'syntaxRepairs':repairs,'examples':len(entries),'reviewerType':'AI','independentAccuracyClaimAllowed':False,'synthetic':True,
        'labelCounts':dict(Counter(e['reviewedLabel'] for e in decisions)),'allDevelopmentAgreement':metric(decisions),'excludingAdjudicationCases':metric(adjudicated),
        'requiresAdjudication':sorted(uncertainty),'falseCompleteIds':[e['id'] for e in decisions if e['predicted']=='present' and e['reviewedLabel']!='present'],
        'liveModelChanged':False}
    write_json(out/'audit.json',report);write_json(out/'v1-decisions.json',decisions)
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--review',required=True);p.add_argument('--output',required=True);a=p.parse_args();run(a.review,a.output)
