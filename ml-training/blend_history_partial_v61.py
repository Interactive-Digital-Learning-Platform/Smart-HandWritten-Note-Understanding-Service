"""Retain 25% of V6's kernel weights to limit drift from a reviewed update.

Both heads use the same RBF kernel and scaler. Concatenating weighted support
vectors is exactly one kernel classifier, with no inference-code change.
"""
import argparse,copy,json,hashlib,shutil,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.history_grounded_core import GroundedSignedKernelPredictor
def sha(raw):return hashlib.sha256(raw).hexdigest()
def read(p):return json.loads(p.read_bytes())
def write(p,v):p.write_bytes((json.dumps(v,indent=2)+'\n').encode())

def main(source,out):
    if out.exists():raise ValueError('Output must be fresh')
    base_raw=(source/'baseline-model.json').read_bytes();old=json.loads(base_raw);new=read(source/'model.json')
    candidate=copy.deepcopy(new)
    for key in old:
        if key not in ('heads','metadata') and old[key]!=new[key]:raise ValueError('Unexpected architecture change')
    for a,b in zip(old['heads'],candidate['heads']):
        if a['gamma']!=b['gamma']:raise ValueError('Different kernels cannot be combined this way')
        b['supportVectors']=a['supportVectors']+b['supportVectors']
        b['dualCoefficients']=[.25*x for x in a['dualCoefficients']]+[.75*x for x in b['dualCoefficients']]
        b['intercept']=.25*a['intercept']+.75*b['intercept']
    candidate['metadata'].update(baseHeadRetention=.25,supportVectorCounts=[len(h['supportVectors']) for h in candidate['heads']],
        refittedCandidateSha256=sha((source/'model.json').read_bytes()),updateMethod='RBF support-vector weight update with baseline retention',
        selectionUsesExposedRegressionData=True,independentAccuracyClaimAllowed=False)
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1');encoder.cache_dir=None
    model=GroundedSignedKernelPredictor(candidate,encoder)
    cases=read(source/'new-training-cases.json');previous=read(source/'new-decisions.json')
    decisions=[dict(id=r['id'],label=r['label'],baseline=p['baseline'],candidate=model.predict(r['text'],r['conceptId'],'English',True)) for r,p in zip(cases,previous)]
    out.mkdir(parents=True);(out/'baseline-model.json').write_bytes(base_raw);write(out/'model.json',candidate)
    write(out/'new-decisions.json',decisions)
    for name in ['new-training-cases.json','new-training-features.npy']:shutil.copyfile(source/name,out/name)
    report=read(source/'training-report.json');report.update(modelSha256=sha((out/'model.json').read_bytes()),baseHeadRetention=.25,
        parentFittedCandidateSha256=sha((source/'model.json').read_bytes()),blendSourceSha256=sha(Path(__file__).read_bytes()),
        trainMatchesAfter=sum(r['label']==r['candidate']['suggestedStatus'] for r in decisions),selectionUsesExposedRegressionData=True)
    write(out/'training-report.json',report);print(json.dumps(report))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=Path);p.add_argument('--output',required=True,type=Path)
    a=p.parse_args();main(a.source,a.output)
