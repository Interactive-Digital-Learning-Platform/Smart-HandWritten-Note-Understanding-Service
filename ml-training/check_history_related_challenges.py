"""Run fixed post-fit challenges; keep incorrect predictions visible."""
import argparse
import json
from pathlib import Path
from train_student_note_batch import ROOT,sha
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.history_grounded_core import GroundedKernelPredictor,GroundedSignedKernelPredictor
from smart_note_training.history_semantic_review import ReviewedSemanticPredictor


def run(args):
    out=Path(args.output)
    if out.exists():raise ValueError('Choose fresh output')
    raw=Path(args.model).read_bytes();cases_path=ROOT/'outputs/history-related-challenges-2026-10-18/cases.json'
    cases=json.loads(cases_path.read_bytes())['cases']
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    encoder.cache_dir=None
    artifact=json.loads(raw)
    model=(GroundedSignedKernelPredictor if artifact['schemaVersion']==12 else GroundedKernelPredictor)(artifact,encoder)
    old=ReviewedSemanticPredictor(json.loads((ROOT/'outputs/history-coverage-v5.1-review-policy-2026-10-15/model.json').read_bytes()),encoder)
    for c in cases:
        c['baseline']=old.predict(c['text'],c['conceptId'],'English',True)
        c['prediction']=model.predict(c['text'],c['conceptId'],'English',True)
    report=dict(modelSha256=sha(raw),casesSha256=sha(cases_path.read_bytes()),total=len(cases),
        baselineMatches=sum(c['baseline']['suggestedStatus']==c['expected'] for c in cases),
        matches=sum(c['prediction']['suggestedStatus']==c['expected'] for c in cases),
        failures=[dict(id=c['id'],expected=c['expected'],actual=c['prediction']['suggestedStatus']) for c in cases if c['expected']!=c['prediction']['suggestedStatus']],
        independentRealStudentAccuracy=False,cases=cases)
    out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='cases'},indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--model',required=True);p.add_argument('--output',required=True)
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):run(p.parse_args())
