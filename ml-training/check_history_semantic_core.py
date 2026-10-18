"""Compare frozen semantic candidate with V3.2; never fit evaluation labels."""
from collections import Counter
import json
from pathlib import Path
import sys
import time
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.history_semantic import FrozenEncoder,semantic_spans
from smart_note_training.history_semantic_core import SemanticCorePredictor
from smart_note_training.history_coverage_v31 import HistoryPredictorV31
from smart_note_training.english_coverage import sha,write_json,LABELS
from smart_note_training.metrics import classification_metrics


def score(models,examples):
    results=[]
    for e in examples:
        predictions={name:model.predict(e['text'],e['conceptId'],'English',True) for name,model in models.items()}
        for p in predictions.values():
            for v in p['evidence']['points']+p['evidence']['concerns']:
                if e['text'][v['start']:v['end']]!=v.get('candidateEvidence',v.get('quote')):raise ValueError('Evidence span mismatch')
                if 'semanticCandidateEvidence' in v and e['text'][v['semanticStart']:v['semanticEnd']]!=v['semanticCandidateEvidence']:raise ValueError('Semantic span mismatch')
        results.append({**e,'predictions':predictions})
    summary={}
    for name in models:
        accepted=[e for e in results if e['predictions'][name]['suggestedStatus'] is not None]
        full=[e for e in results if e['expectedLabel']=='present']
        summary[name]={'matches':sum(e['expectedLabel']==e['predictions'][name]['suggestedStatus'] for e in results),'total':len(results),
            'withheld':len(results)-len(accepted),'falseCompleteIds':[e['id'] for e in results if e['expectedLabel']!='present' and e['predictions'][name]['suggestedStatus']=='present'],
            'completeRecall':sum(e['predictions'][name]['suggestedStatus']=='present' for e in full)/len(full) if full else None,
            'rawModelMetrics':classification_metrics([LABELS.index(e['expectedLabel']) for e in results],[LABELS.index(e['predictions'][name]['rawModelStatus']) for e in results]),
            'failures':[e['id'] for e in results if e['expectedLabel']!=e['predictions'][name]['suggestedStatus']]}
    return {'summary':summary,'examples':results}


def run(output):
    out=Path(output);start=time.perf_counter()
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    new=SemanticCorePredictor(json.loads((out/'model.json').read_text(encoding='utf-8')),encoder)
    old=HistoryPredictorV31(json.loads((ROOT/'outputs/history-coverage-v3.2-2026-10-15/model.json').read_text(encoding='utf-8')))
    submitted=json.loads((ROOT/'outputs/history-v32-submitted-review-2026-10-15-verified/submitted-original.json').read_text(encoding='utf-8'))
    examples=[{'id':e['id'],'text':e['text'],'conceptId':e['conceptId'],'expectedLabel':e['humanLabel']} for e in submitted['examples'] if not e['requiresAdjudication']]
    encoder.prime([quote for e in examples for _,_,quote in semantic_spans(e['text'])])
    report=score({'v32':old,'semanticV5':new},examples)
    report.update({'modelSha256':sha(out/'model.json'),'modelLabelsFitted':False,'architectureDevelopedAfterSeeingErrors':True,
        'interpretation':'Previously exposed human-review development comparison; not independent V5 accuracy. The 24 labels were not fitted or used for C selection.',
        'elapsedSeconds':round(time.perf_counter()-start,2),'liveModelChanged':False})
    write_json(out/'v32-review-development-comparison.json',report)
    print(json.dumps({k:v for k,v in report.items() if k!='examples'},indent=2))


if __name__=='__main__':run(sys.argv[1])
