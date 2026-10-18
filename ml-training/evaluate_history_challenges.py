"""AI-authored diagnostic examples, never human accuracy or training labels."""
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.english_coverage import CoveragePredictor,sha,write_json

CASES=[
 ('hist-g10-l01-c01','present','Remains from past human activity supply evidence. Books and written documents are literary sources; buildings, coins and inscriptions are archaeological physical remains.'),
 ('hist-g10-l01-c01','partial','Books and written documents are literary sources that tell us about the human past.'),
 ('hist-g10-l01-c01','missing','Historical sources: definition? List the two classes and give examples. I have not answered this question.'),
 ('hist-g10-l01-c01','partial','Books and documents give evidence about past human activity. Coins and old buildings are literary books, while written documents are archaeological physical remains.'),
 ('hist-g10-l01-c02','present','Deepawamsa is the earlier chronicle, dating to around the fourth century AD. Mahanama wrote the first part of Mahawamsa, and subsequent authors continued the account.'),
 ('hist-g10-l01-c02','partial','Deepawamsa is the earlier chronicle from about the fourth century AD.'),
 ('hist-g10-l01-c02','missing','Deepawamsa Mahawamsa Mahanama chronicle century history. These are just words copied from the heading.'),
 ('hist-g10-l01-c02','partial','Deepawamsa is the earlier fourth-century chronicle. Mahanama did not write Mahawamsa, and later writers never continued its historical account.'),
 ('hist-g10-l01-c09','present','Vandalism and urbanization can destroy monuments. Citizens should protect archaeological remains so that historical evidence is preserved.'),
 ('hist-g10-l01-c09','partial','Vandalism can damage and destroy historical monuments.'),
 ('hist-g10-l01-c09','missing','This page describes an irrigation tank and a canal that carried water to farming land.'),
 ('hist-g10-l01-c09','partial','Vandalism and urbanization destroy monuments. Citizens should never protect archaeological remains or preserve historical evidence.'),
 ('hist-g10-l02-c01','present','Early human habitation in Sri Lanka dates to about 125,000 years ago. Homo sapiens survived by hunting and gathering and adapted to different environments.'),
 ('hist-g10-l02-c01','partial','Early human habitation in Sri Lanka dates to about 125,000 years ago and includes Homo sapiens.'),
 ('hist-g10-l02-c01','missing','Prehistoric human settlement: when did people arrive? What did they eat? I still need to write my answer.'),
 ('hist-g10-l02-c01','partial','Early human habitation in Sri Lanka dates to about 125,000 years ago and includes Homo sapiens. Early inhabitants did not hunt or gather and never adapted to different environments.')]

def run(output):
    output=Path(output);model=CoveragePredictor(json.loads((output/'model.json').read_text(encoding='utf-8')))
    results=[]
    for i,(cid,expected,text) in enumerate(CASES):
        p=model.predict(text,cid,'English',True)
        results.append({'id':f'history-diagnostic-{i+1:02d}','conceptId':cid,'text':text,'aiExpectedLabel':expected,'predicted':p['suggestedStatus'],'prediction':p})
    report={'modelSha256':sha(output/'model.json'),'syntheticAIAuthored':True,'independentHumanReview':False,
        'labelsBasedOnSuppliedProposedCriteria':True,'labelsHistoricallyCertified':False,'usedForTraining':False,
        'matchedExpected':sum(r['aiExpectedLabel']==r['predicted'] for r in results),'total':len(results),
        'falseCompleteExamples':[r['id'] for r in results if r['predicted']=='present' and r['aiExpectedLabel']!='present'],
        'warning':'Diagnostic agreement with AI expectations, not independently validated accuracy. Any later tuning on these makes them development cases.',
        'examples':results}
    write_json(output/'diagnostic-challenges.json',report)
    print(json.dumps({k:v for k,v in report.items() if k!='examples'},indent=2))

if __name__=='__main__':run(sys.argv[1])
