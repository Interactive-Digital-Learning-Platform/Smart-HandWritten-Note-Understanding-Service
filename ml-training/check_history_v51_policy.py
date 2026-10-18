"""Compare parent and policy revision, counting every withheld prediction."""
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.english_coverage import sha,write_json
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.history_semantic_core import SemanticCorePredictor
from smart_note_training.history_semantic_review import ReviewedSemanticPredictor
from check_history_semantic import score


def run(output):
    out=Path(output);parent=ROOT/'outputs/history-coverage-v5-semantic-core-2026-10-15'
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    before=SemanticCorePredictor(json.loads((parent/'model.json').read_text(encoding='utf-8')),encoder)
    after=ReviewedSemanticPredictor(json.loads((out/'model.json').read_text(encoding='utf-8')),encoder)
    data=[json.loads(s) for s in (ROOT/'outputs/history-dataset-intake-2026-10-14/source/page-training-examples.jsonl').read_text(encoding='utf-8').splitlines() if s]
    sets={}
    for label in ['validation','test']:
        rows=[r for r in data if r['textVariant']=='corrected' and r['preassignedSplit']==label]
        if label=='validation':
            excluded={'hist-note-089-p001-hist-g11-l02-c04-corrected','hist-note-097-p001-hist-g11-l03-c01-corrected'}
            rows=[r for r in rows if r['recordId'] not in excluded]
        sets['exposedSynthetic'+label.title()]=[{'id':r['recordId'],'conceptId':r['concept']['id'],'text':r['noteTextSnapshot'],'expectedLabel':r['targetLabel']} for r in rows]
    review=json.loads((ROOT/'outputs/history-v32-submitted-review-2026-10-15-verified/submitted-original.json').read_text(encoding='utf-8'))
    sets['exposedHumanReview']=[{'id':e['id'],'conceptId':e['conceptId'],'text':e['text'],'expectedLabel':e['humanLabel']} for e in review['examples']]
    new=json.loads((parent/'new-topic-ai-checks.json').read_text(encoding='utf-8'))
    sets['priorV5NewTopicAI']= [{k:e[k] for k in ['id','conceptId','text','expectedLabel']} for e in new['examples']]
    reports={}
    for label,examples in sets.items():
        reports[label]=score({'v5':before,'v51':after},examples)
        write_json(out/(label+'.json'),reports[label])
    for report in reports.values():
        for e in report['examples']:
            a,b=e['predictions']['v5'],e['predictions']['v51']
            if a['rawModelStatus']!=b['rawModelStatus'] or a['scores']!=b['scores']:raise ValueError('Review policy changed learned predictions')
    summary={'sets':{label:r['summary'] for label,r in reports.items()},'modelSha256':sha(out/'model.json'),
        'weightsRefitted':False,'rawPredictionsUnchanged':True,'independentAccuracyClaimAllowed':False,'liveModelChanged':False}
    write_json(out/'evaluation.json',summary)
    print(json.dumps(summary,indent=2))


if __name__=='__main__':run(sys.argv[1])
