"""Install the regression-gated Science head into this Notes service only.

Keep inference integrity pins in sync; preserve every History/ICT artifact.
Build/restart of the Notes container is a separate operation.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
def sha(raw): return hashlib.sha256(raw).hexdigest()
def encoded(value): return (json.dumps(value,indent=2)+'\n').encode()


def activate(fit):
    fit=fit.resolve();report=json.loads((fit/'training-report.json').read_bytes())
    candidate=(fit/'candidate-model.json').read_bytes();baseline=(fit/'baseline-model.json').read_bytes()
    if not report['regressionGatesPassed'] or report['failures'] or sha(candidate)!=report['candidateSha256'] or sha(baseline)!=report['baselineSha256']:
        raise ValueError('Training gate or model integrity failed')
    old=json.loads(baseline);new=json.loads(candidate)
    for key in old:
        if key not in ('weights','intercept','metadata') and old[key]!=new[key]:raise ValueError('Unexpected feature or policy change')
    old_sha,new_sha=report['baselineSha256'],report['candidateSha256']
    paths=['models/english-coverage-v3.1.json','runtime/coverage/models/english-coverage-v3.1.json']
    if any(sha((ROOT/p).read_bytes())!=old_sha for p in paths):raise ValueError('Active baseline changed')
    originals={p:(ROOT/p).read_bytes() for p in paths}
    replacements={p:candidate for p in paths}
    pins=['src/services/englishCoverageService.ts','ml-training/coverage_runtime_bundle.py','runtime/coverage/ml-training/coverage_runtime_bundle.py']
    for p in pins:
        raw=(ROOT/p).read_bytes();text=raw.decode()
        if text.count(old_sha)!=1:raise ValueError('Unexpected Science integrity pin: '+p)
        text=text.replace(old_sha,new_sha)
        if p.endswith('.ts'):text=text.replace(old['metadata']['experimentId'],new['metadata']['experimentId'])
        originals[p]=raw;replacements[p]=text.encode()
    p='runtime/coverage/manifest.json';originals[p]=(ROOT/p).read_bytes();manifest=json.loads(originals[p])
    untouched={s:dict(manifest['subjects'][s]) for s in ('history','ict')}
    manifest['subjects']['science']['sha256']=new_sha
    for name,raw in replacements.items():
        relative=name.removeprefix('runtime/coverage/')
        if name.startswith('runtime/coverage/'):manifest['files'][relative]=sha(raw)
    manifest['provenance']['scienceUpdateReportSha256']=sha((fit/'training-report.json').read_bytes())
    assert all(manifest['subjects'][s]==untouched[s] for s in untouched)
    replacements[p]=encoded(manifest)
    backup=fit/'activation-backup'
    if backup.exists():raise ValueError('Activation already attempted')
    backup.mkdir()
    for p,raw in originals.items():
        saved=backup/p;saved.parent.mkdir(parents=True,exist_ok=True);saved.write_bytes(raw)
    for p,raw in replacements.items():(ROOT/p).write_bytes(raw)
    print(json.dumps(dict(scienceSha256=new_sha,version=new['metadata']['experimentId'],changedFiles=list(replacements),historyAndIctUnchanged=True,backup=str(backup))))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--fit',required=True,type=Path)
    activate(parser.parse_args().fit)
