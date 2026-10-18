"""Score new AI-authored examples after V3.1 freeze; create blind review data."""
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.history_coverage_v31 import HistoryPredictorV31
from smart_note_training.english_coverage import sha,write_json

CASES=[
 ('hist-g10-l01-c01','present','Sources reveal human life in the past. Literary sources include written books and documents. Coins, old buildings and inscriptions count as archaeological remains.'),
 ('hist-g10-l01-c01','partial','Archaeological remains such as coins and buildings supply evidence about past human activity.'),
 ('hist-g10-l01-c01','missing','List the literary books and documents. Describe the archaeological coins, buildings and inscriptions. Explain their evidence about past human activity. Revision tasks to answer later.'),
 ('hist-g10-l01-c02','present','The fourth-century Deepawamsa is the earlier chronicle. The Mahawamsa account was compiled by Mahanama and continued by later authors.'),
 ('hist-g10-l01-c02','partial','Deepawamsa, the earlier chronicle, dates to approximately the fourth century AD.'),
 ('hist-g10-l01-c02','missing','Mahanama and Mahawamsa: who was the author? Deepawamsa: was it earlier, and in which century? Answer later.'),
 ('hist-g11-l01-c01','present','Britain was the first to industrialize: the Industrial Revolution began in the later eighteenth century and expanded machine production. Resources, capital, colonial markets and political conditions supported that change.'),
 ('hist-g11-l01-c01','partial','Capital, colonial markets, resources and political conditions helped Britain industrialize first.'),
 ('hist-g11-l01-c01','missing','Describe Britain in the later eighteenth century. Explain the Industrial Revolution and increased machine production. List the roles of capital, colonial markets, resources and political conditions. These questions remain unanswered.'),
 ('hist-g11-l02-c01','present','Its Indian Ocean sea-route position made Sri Lanka valuable to Britain. Trincomalee harbour provided strategic importance for naval security in the region around India.'),
 ('hist-g11-l02-c01','partial','Trincomalee harbour mattered to Britain because of naval security around India.'),
 ('hist-g11-l02-c01','missing','What were the Indian Ocean sea routes? Why did Britain value Sri Lanka? What made Trincomalee harbour strategically important for naval security around India? I have not provided my answer.'),
 ('hist-g11-l04-c01','present','In 1833 the Colebrooke-Cameron reforms reorganized British colonial government and administration. Establishing councils and reshaping administrative divisions were part of the changes.'),
 ('hist-g11-l04-c01','partial','The reforms established councils and reshaped the island administrative divisions.'),
 ('hist-g11-l04-c01','missing','Explain the Colebrooke-Cameron reforms of 1833. Describe British colonial government and administration. Explain the councils and the island administrative divisions. Unanswered.'),
 ('hist-g10-l01-c01','partial','Past sources provide evidence. Coins and buildings are classified as literary sources; books and written documents are classified as archaeological sources.'),
 ('hist-g10-l01-c02','partial','Deepawamsa is the earlier chronicle of the fourth century. Mahanama never wrote Mahawamsa and no later writer continued the account.'),
 ('hist-g11-l04-c01','partial','The Colebrooke-Cameron reforms of 1733 reorganized British colonial government and administration. Councils were established and administrative divisions reshaped.')]


def run(output):
    out=Path(output);model=HistoryPredictorV31(json.loads((out/'model.json').read_text(encoding='utf-8')))
    examples=[]
    for i,(cid,label,text) in enumerate(CASES):
        prediction=model.predict(text,cid,'English',True)
        examples.append({'id':f'history-v31-fresh-{i+1:02d}','conceptId':cid,'text':text,'aiExpectedLabel':label,'prediction':prediction})
    report={'modelSha256':sha(out/'model.json'),'synthetic':True,'independentHumanReview':False,'usedForFittingOrSelectionOrPolicy':False,
        'labelsBasedOnSuppliedProposedCriteria':True,'matched':sum(e['prediction']['suggestedStatus']==e['aiExpectedLabel'] for e in examples),'total':len(examples),
        'withheld':sum(e['prediction']['suggestedStatus'] is None for e in examples),
        'falseCompleteIds':[e['id'] for e in examples if e['prediction']['suggestedStatus']=='present' and e['aiExpectedLabel']!='present'],'examples':examples}
    write_json(out/'new-ai-checks.json',report)
    concepts={c['id']:c for c in model.artifact['rubrics']['concepts']}
    packet={'version':'history-v31-new-review','synthetic':True,'reviewerName':'','reviewerType':'','independentHumanReview':False,
        'alreadyAIDiagnosticallyScored':True,'intendedLabelsAndModelOutputsHidden':True,
        'note':'Label according to the proposed criterion. Human labels on these new texts were not used for development. If later used to tune the model, they become development material.',
        'examples':[{'id':e['id'],'conceptId':e['conceptId'],'conceptName':concepts[e['conceptId']]['name'],'requirements':concepts[e['conceptId']]['sourceCriteria'],
            'text':e['text'],'humanLabel':None,'comment':''} for e in examples]}
    write_json(out/'new-review-template.json',packet)
    print(json.dumps({k:v for k,v in report.items() if k!='examples'},indent=2))

if __name__=='__main__':run(sys.argv[1])
