"""Frozen V3.2 versus V3.1 on new AI diagnostic paraphrases/contrasts."""
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.history_coverage_v31 import HistoryPredictorV31
from smart_note_training.english_coverage import sha,write_json

CASES=[
 ('hist-g11-l02-c01','present','Because Sri Lanka lay on Indian Ocean sea routes, its location was valuable to Britain. Trincomalee port was strategic for navy defence around India.'),
 ('hist-g11-l02-c01','present','Britain considered the island position on Indian Ocean sea routes important. The strategic harbour at Trincomalee contributed to naval security near India.'),
 ('hist-g11-l02-c01','present','The location of Sri Lanka on Indian Ocean shipping lanes was of interest to the British. Trincomalee harbor was valuable for naval defense around India.'),
 ('hist-g11-l02-c01','partial','The British regarded Sri Lanka as important because of its location on Indian Ocean sea routes.'),
 ('hist-g11-l02-c01','partial','The port at Trincomalee had strategic importance for naval defence around India.'),
 ('hist-g11-l02-c01','missing','Why was the island location on Indian Ocean sea routes valuable to Britain? Explain Trincomalee harbour and naval security around India. Answer later.'),
 ('hist-g11-l02-c01','missing','Study prompts: Britain and Sri Lanka? Indian Ocean sea routes? Trincomalee port and naval defence around India? Unanswered.'),
 ('hist-g11-l02-c01','partial','Britain valued Sri Lanka for its position on Indian Ocean sea routes. Trincomalee harbour was not important for naval security around India.'),
 ('hist-g11-l04-c01','present','In 1833 the reforms restructured British government. Councils were created and administrative provinces changed.'),
 ('hist-g11-l04-c01','present','The reforms of 1833 reorganised colonial administration. They established councils and revised administrative boundaries.'),
 ('hist-g11-l04-c01','present','Colonial government was restructured by the 1833 reforms. Creating councils and reshaping administrative divisions were among their effects.'),
 ('hist-g11-l04-c01','partial','The 1833 reforms reorganised British colonial government and administration.'),
 ('hist-g11-l04-c01','partial','Councils were set up and administrative divisions changed under the reforms.'),
 ('hist-g11-l04-c01','missing','Explain the reforms of 1833 and reorganised colonial administration. Describe how councils were established and administrative divisions reshaped. I have not yet answered.'),
 ('hist-g11-l04-c01','missing','When were the Colebrooke-Cameron reforms? What happened to councils? How did administrative divisions change? These questions remain unanswered.'),
 ('hist-g11-l04-c01','partial','In 1933 the reforms reorganised British colonial administration. They created councils and revised administrative boundaries.'),
 ('hist-g10-l01-c01','present','Books and written documents are literary sources of evidence about human life in the past. Coins, buildings and inscriptions are archaeological physical remains.'),
 ('hist-g10-l01-c01','partial','Sources are evidence of past human activity. Books and documents are archaeological remains, while coins and buildings are literary sources.'),
 ('hist-g10-l01-c02','present','Deepawamsa was the earlier fourth-century chronicle. Mahanama wrote Mahawamsa and subsequent authors continued the historical narrative.'),
 ('hist-g10-l01-c02','partial','Deepawamsa is the earlier chronicle of the fourth century AD. Mahanama did not write Mahawamsa and later writers never continued its narrative.'),
 ('hist-g11-l01-c01','present','The Industrial Revolution started in Britain in the later eighteenth century with greater machine production. Capital, resources, colonial markets and political conditions helped it industrialize first.'),
 ('hist-g11-l01-c01','missing','Explain the later eighteenth century Industrial Revolution in Britain and machine production. List how capital, markets, resources and political conditions helped. Answer later.'),
 ('hist-g10-l01-c09','present','Vandalism and urbanization threaten monuments. Citizens should protect archaeological remains so historical evidence is preserved.'),
 ('hist-g10-l01-c09','partial','Vandalism destroys archaeological monuments. Citizens should not protect these remains or preserve historical evidence.')]


def run(output):
    out=Path(output)
    paths={'v31':ROOT/'outputs/history-coverage-v3.1-2026-10-14/model.json','v32':out/'model.json'}
    models={key:HistoryPredictorV31(json.loads(p.read_text(encoding='utf-8'))) for key,p in paths.items()}
    examples=[]
    for i,(cid,label,text) in enumerate(CASES):
        predictions={key:m.predict(text,cid,'English',True) for key,m in models.items()}
        for prediction in predictions.values():
            for e in prediction['evidence']['points']+prediction['evidence']['concerns']:
                if text[e['start']:e['end']]!=e.get('candidateEvidence',e.get('quote')):raise ValueError('Quote offset mismatch')
        examples.append({'id':f'history-v32-new-{i+1:02d}','conceptId':cid,'text':text,'aiExpectedLabel':label,'predictions':predictions})
    scores={}
    for key in models:
        scores[key]={'matched':sum(e['predictions'][key]['suggestedStatus']==e['aiExpectedLabel'] for e in examples),
            'total':len(examples),'withheld':sum(e['predictions'][key]['suggestedStatus'] is None for e in examples),
            'falseCompleteIds':[e['id'] for e in examples if e['predictions'][key]['suggestedStatus']=='present' and e['aiExpectedLabel']!='present'],
            'failures':[e['id'] for e in examples if e['predictions'][key]['suggestedStatus']!=e['aiExpectedLabel']]}
    report={'synthetic':True,'independentHumanReview':False,'usedForTrainingOrSelection':False,'expectationsBasedOnProposedCriteria':True,
        'modelHashes':{k:sha(p) for k,p in paths.items()},'sameExamplesComparison':scores,'examples':examples}
    write_json(out/'new-paraphrase-checks.json',report)
    print(json.dumps({k:v for k,v in report.items() if k!='examples'},indent=2))


if __name__=='__main__':run(sys.argv[1])
