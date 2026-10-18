"""New AI diagnostic expectations; not human-certified or used for fitting."""
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.history_coverage import HistoryPredictor
from smart_note_training.english_coverage import sha,write_json

CASES=[
 ('hist-g10-l01-c01','present','A source supplies evidence about earlier human life. Literary sources include books and documents. Archaeological sources include coins, buildings and inscriptions.'),
 ('hist-g10-l01-c01','partial','Literary sources are books and documents that provide evidence about the past.'),
 ('hist-g10-l01-c01','missing','What are literary and archaeological sources? Which examples belong to each? These questions remain unanswered.'),
 ('hist-g10-l01-c01','partial','Sources provide evidence about the past. Literary sources are coins and buildings. Archaeological sources are written documents and books.'),
 ('hist-g10-l01-c02','present','The earlier Deepawamsa chronicle belongs to the fourth century AD. Mahanama compiled Mahawamsa and later authors continued this historical account.'),
 ('hist-g10-l01-c02','partial','Mahanama wrote Mahawamsa and other authors later continued the chronicle.'),
 ('hist-g10-l01-c02','missing','Revision checklist: Deepawamsa? Mahawamsa? Who wrote them? I have not provided any answer.'),
 ('hist-g10-l01-c02','partial','The earlier Deepawamsa dates to the fourth century AD. Mahanama never compiled Mahawamsa and later authors did not continue it.'),
 ('hist-g10-l01-c09','present','Urbanisation can damage archaeological monuments. People have a responsibility to preserve these remains and protect historical evidence.'),
 ('hist-g10-l01-c09','partial','To preserve historical evidence, citizens should protect archaeological remains.'),
 ('hist-g10-l01-c09','missing','An old irrigation canal carried water from a reservoir to rice fields.'),
 ('hist-g10-l01-c09','partial','Vandalism destroys monuments. Citizens must never preserve archaeological remains or protect historical evidence.')]

def run(output):
    out=Path(output);m=HistoryPredictor(json.loads((out/'model.json').read_text(encoding='utf-8')))
    examples=[]
    for i,(cid,label,text) in enumerate(CASES):
        p=m.predict(text,cid,'English',True)
        examples.append({'id':f'history-v2-check-{i+1:02d}','conceptId':cid,'text':text,'aiExpectedLabel':label,'prediction':p})
    report={'synthetic':True,'independentHumanReview':False,'usedForFittingOrSelection':False,'labelsBasedOnProposedCriteria':True,
        'modelSha256':sha(out/'model.json'),'matched':sum(e['prediction']['suggestedStatus']==e['aiExpectedLabel'] for e in examples),'total':len(examples),
        'withheld':sum(e['prediction']['suggestedStatus'] is None for e in examples),
        'falseCompleteIds':[e['id'] for e in examples if e['prediction']['suggestedStatus']=='present' and e['aiExpectedLabel']!='present'],'examples':examples}
    write_json(out/'new-diagnostic-checks.json',report);print(json.dumps({k:v for k,v in report.items() if k!='examples'},indent=2))

if __name__=='__main__':run(sys.argv[1])
