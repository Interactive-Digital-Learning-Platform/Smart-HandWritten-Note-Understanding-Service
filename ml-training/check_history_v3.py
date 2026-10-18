"""Fresh AI diagnostics, score frozen candidates without fitting or selection."""
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.history_coverage_v3 import HistoryPredictorV3
from smart_note_training.history_coverage import HistoryPredictor
from smart_note_training.english_coverage import sha,write_json

CASES=[
 ('hist-g10-l01-c01','present','How can we know about past people? Sources supply evidence. Literary sources are written books and documents; archaeological remains include buildings, coins and inscriptions.'),
 ('hist-g10-l01-c01','partial','Written books are literary sources and can provide evidence of earlier human activity.'),
 ('hist-g10-l01-c01','missing','Which sources are literary? Which remains are archaeological? Give books, documents, coins and buildings as examples. Answer later.'),
 ('hist-g10-l01-c02','present','Deepawamsa is the earlier chronicle of about the fourth century AD. Mahawamsa was compiled by Mahanama; later writers continued its account.'),
 ('hist-g10-l01-c02','partial','What did Mahanama write? Mahanama wrote Mahawamsa and later writers continued the chronicle.'),
 ('hist-g10-l01-c02','missing','Explain the earlier Deepawamsa and the fourth century AD. Describe how Mahanama wrote Mahawamsa and how later writers continued it. These tasks remain unanswered.'),
 ('hist-g10-l01-c09','present','Monuments can be damaged by urbanization and vandalism. People should protect archaeological sources, preserving remains as historical evidence.'),
 ('hist-g10-l01-c09','partial','Urbanisation and vandalism may destroy archaeological remains and old monuments.'),
 ('hist-g10-l01-c09','missing','Define vandalism and urbanization. Explain how citizens protect archaeological remains and preserve historical evidence. I have not yet answered.'),
 ('hist-g11-l01-c01','present','In Britain the Industrial Revolution began in the later eighteenth century, as machine production expanded. Capital, colonial markets, resources and political conditions helped Britain industrialize first.'),
 ('hist-g11-l01-c01','partial','The Industrial Revolution began in Britain in the later eighteenth century, using machines to increase production.'),
 ('hist-g11-l01-c01','missing','When did the Industrial Revolution begin in Britain? What did greater machine production mean? How did capital, markets and resources help? Answer later.'),
 ('hist-g11-l02-c01','present','Britain valued Sri Lanka because of its position on Indian Ocean sea routes. Trincomalee harbour had strategic importance for naval security around India.'),
 ('hist-g11-l02-c01','partial','Britain wanted the island because its position gave access to Indian Ocean sea routes.'),
 ('hist-g11-l02-c01','missing','Explain the island position on Indian Ocean sea routes. Describe why Trincomalee harbour mattered to naval security around India. Still need to write my answers.'),
 ('hist-g11-l04-c01','present','What changed in 1833? Colebrooke-Cameron reforms reorganized British colonial government and administration. Councils were established and the administrative divisions of the island were reshaped.'),
 ('hist-g11-l04-c01','partial','The Colebrooke-Cameron reforms of 1833 reorganized British colonial government and administration.'),
 ('hist-g11-l04-c01','missing','Describe the reforms of 1833 and British colonial government. Explain how councils and administrative divisions changed. Unanswered revision tasks.'),
 ('hist-g10-l01-c01','partial','Sources provide evidence of the past. Archaeological sources are books and written documents, while literary sources consist of coins and physical remains.'),
 ('hist-g10-l01-c02','partial','Deepawamsa is the earlier fourth-century chronicle. Mahanama did not compile Mahawamsa, and later authors never continued it.'),
 ('hist-g10-l01-c09','partial','Vandalism and urbanisation destroy monuments. Citizens should never protect archaeological sources or preserve historical evidence.'),
 ('hist-g11-l04-c01','partial','The Colebrooke-Cameron reforms of 1933 reorganized British colonial government. They established councils and reshaped administrative divisions.')]


def run(output):
    out=Path(output)
    model=HistoryPredictorV3(json.loads((out/'model.json').read_text(encoding='utf-8')))
    v2=HistoryPredictor(json.loads((ROOT/'outputs/history-coverage-v2-2026-10-14/model.json').read_text(encoding='utf-8')))
    result=[]
    for i,(cid,label,text) in enumerate(CASES):
        prediction=model.predict(text,cid,'English',True);before=v2.predict(text,cid,'English',True)
        result.append({'id':f'history-v3-diagnostic-{i+1:02d}','conceptId':cid,'text':text,'aiExpectedLabel':label,'prediction':prediction,'v2Suggestion':before['suggestedStatus']})
    report={'synthetic':True,'independentHumanReview':False,'labelsBasedOnSuppliedProposedCriteria':True,'usedForFittingOrSelection':False,
        'modelSha256':sha(out/'model.json'),'matched':sum(e['prediction']['suggestedStatus']==e['aiExpectedLabel'] for e in result),
        'v2MatchedOnSameExamples':sum(e['v2Suggestion']==e['aiExpectedLabel'] for e in result),'total':len(result),
        'withheld':sum(e['prediction']['suggestedStatus'] is None for e in result),
        'falseCompleteIds':[e['id'] for e in result if e['prediction']['suggestedStatus']=='present' and e['aiExpectedLabel']!='present'],
        'failures':[e['id'] for e in result if e['prediction']['suggestedStatus']!=e['aiExpectedLabel']],'examples':result}
    write_json(out/'fresh-ai-diagnostics.json',report)
    old=json.loads((ROOT/'outputs/history-coverage-v2-2026-10-14/new-diagnostic-checks.json').read_text(encoding='utf-8'))['examples']
    fitted_matches=sum(model.predict(e['text'],e['conceptId'],'English',True)['suggestedStatus']==e['aiExpectedLabel'] for e in old)
    print(json.dumps({**{k:v for k,v in report.items() if k!='examples'},'previous12DevelopmentMatches':fitted_matches},indent=2))

if __name__=='__main__':run(sys.argv[1])
