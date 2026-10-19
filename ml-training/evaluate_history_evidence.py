"""Freeze predictions and compare known checks without fitting or relabelling them."""
import argparse
import hashlib
import json
from pathlib import Path
from collections import Counter
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.history_evidence import EvidencePredictor
from smart_note_training.history_point_core import PointCorePredictor
from smart_note_training.history_grounded_core import GroundedCorePredictor,GroundedKernelPredictor,GroundedSignedKernelPredictor
from check_history_fresh_cases import CASES

ROOT=Path(__file__).resolve().parent


def run(args):
    model_path=Path(args.model);out=Path(args.output)
    if out.exists():raise ValueError('Choose a fresh evaluation output')
    raw=model_path.read_bytes();artifact=json.loads(raw)
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    if (model_path.parent/'encoder-cache/metadata.json').exists():
        encoder.cache.update(FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',model_path.parent/'encoder-cache').cache)
    encoder.cache_dir=None
    model={9:EvidencePredictor,8:PointCorePredictor,10:GroundedCorePredictor,11:GroundedKernelPredictor,12:GroundedSignedKernelPredictor}[artifact['schemaVersion']](artifact,encoder)
    sets={}
    for name in ('exposedHumanReview','exposedSyntheticTest','exposedSyntheticValidation'):
        examples=json.loads((ROOT/'outputs/history-coverage-v5.1-review-policy-2026-10-15'/(name+'.json')).read_bytes())['examples']
        sets[name]=[dict(id=r['id'],conceptId=r['conceptId'],text=r['text'],expected=r['expectedLabel'],baseline=r['predictions']['v51']['suggestedStatus']) for r in examples]
    sets['previousFreshChecks']=[dict(id=name,conceptId=concept,text=text,expected=expected) for name,concept,expected,text in CASES]
    pack=json.loads((ROOT.parent/'packaging/coverage-verification.json').read_bytes())
    sets['presentation']=[dict(id=r['id'],conceptId=r['input']['conceptId'],text=r['input']['text'],expected=r['prediction']['suggestedStatus']) for r in pack['cases'] if r['subject']=='history']
    data=json.loads((ROOT/'outputs/history-student-ef-labels-2026-10-18-02/dataset.json').read_bytes())
    truth=json.loads((ROOT/'outputs/history-student-ef-assistant-review-2026-10-18-02/adjudication.json').read_bytes())
    rows={r['recordId']:r for r in data['rows']}
    sets['assistantReviewedDevelopment']=[dict(id=r['recordId'],conceptId=r['conceptId'],text=rows[r['recordId']]['modelInputText'],expected=r['assistantLabel']) for r in truth['rows']]
    result=dict(modelSha256=hashlib.sha256(raw).hexdigest(),humanReviewed=False,independentAccuracyClaimAllowed=False,sets={})
    for name,cases in sets.items():
        for c in cases:c['prediction']=model.predict(c['text'],c['conceptId'],'English',True)
        summary=dict(total=len(cases),matches=sum(c['expected']==c['prediction']['suggestedStatus'] for c in cases),
            confusion=dict(Counter(str(c['expected'])+'->'+str(c['prediction']['suggestedStatus']) for c in cases)),
            falseComplete=[c['id'] for c in cases if c['expected'] not in ('present',None) and c['prediction']['suggestedStatus']=='present'],
            withheld=sum(c['prediction']['suggestedStatus'] is None for c in cases))
        result['sets'][name]=dict(summary=summary,cases=cases)
        print(name,json.dumps(summary),flush=True)
    out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--model',required=True);p.add_argument('--output',required=True)
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):run(p.parse_args())
