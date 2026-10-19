"""Activate a Notes-only History update after comparing frozen regressions."""
import argparse,hashlib,importlib.util,json,copy
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
OLD='445f2986afecc521597d5ff82e69191bfe782e38ab42a099d49d5d4d8477f629'
OLD_DIR='history-coverage-v6-grounded-2026-10-18-r2'
NEW_DIR='history-coverage-v6.1-partial-2026-10-19'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def read(p):return json.loads(p.read_bytes())
def encoded(v):return (json.dumps(v,indent=2)+'\n').encode()

def main():
    out=ROOT/'ml-training/outputs'/NEW_DIR;previous=ROOT/'ml-training/outputs'/OLD_DIR
    raw=(out/'model.json').read_bytes();new=sha(raw);artifact=json.loads(raw)
    train=read(out/'training-report.json');evaluation=read(out/'evaluation.json')
    old_eval=read(previous/'candidate-evaluation.json');checks=read(out/'partial-checks.json');related=read(out/'related-challenges.json')
    if any(r['modelSha256']!=new for r in [train,evaluation,checks,related]):raise ValueError('Evaluation/model hash mismatch')
    old_model=read(previous/'model.json')
    for key in old_model:
        if key not in ('heads','metadata') and old_model[key]!=artifact[key]:raise ValueError('Architecture, features or policy changed')
    gates={name:row['summary']['matches']>=old_eval['sets'][name]['summary']['matches'] and not row['summary']['falseComplete'] for name,row in evaluation['sets'].items()}
    targets=[r for r in checks['rows'] if r['source']=='prior_assistant_image_reference']
    gates['six_image_reference_checks']=len(targets)==6 and all(r['prediction']['suggestedStatus']==r['expected'] for r in targets)
    gates['related_checks_preserved']=related['matches']>=read(previous/'candidate-related-challenges.json')['matches']
    gates['no_new_probe_false_complete']=not checks['falseComplete']
    if not all(gates.values()):raise ValueError('Release gates failed: '+str(gates))
    replacements={};originals={}
    def update(relative,transform):
        file=ROOT/relative;originals[relative]=file.read_bytes();replacements[relative]=transform(originals[relative])
    def pin(raw):
        text=raw.decode()
        if text.count(OLD)!=1:raise ValueError('Expected one current History pin')
        return text.replace(OLD,new).encode()
    update('src/services/historyPreviewWorker.ts',pin)
    update('src/services/historyCoverageReviewService.ts',lambda r:r.decode().replace("model: 'History V6'","model: 'History V6.1'").encode())
    update('src/services/coverageRuntime.ts',lambda r:r.decode().replace(OLD_DIR,NEW_DIR).encode())
    update('ml-training/prepare_coverage_bundle.py',lambda r:r.decode().replace(OLD_DIR,NEW_DIR).encode())
    update('ml-training/history_preview_cli.py',lambda r:pin(r).decode().replace(OLD_DIR,NEW_DIR).encode())
    update('ml-training/coverage_runtime_bundle.py',pin)
    update('runtime/coverage/ml-training/coverage_runtime_bundle.py',pin)
    update('runtime/coverage/ml-training/history_preview_cli.py',lambda _:replacements['ml-training/history_preview_cli.py'])
    update('runtime/coverage/models/history-coverage-v6.json',lambda r:raw if sha(r)==OLD else (_ for _ in ()).throw(ValueError('Active History differs')))
    update('ml-training/refresh_history_release_verification.py',lambda r:r.decode().replace("pack['historyModelVersion']='History V6'","pack['historyModelVersion']='History V6.1'").encode())
    # Only sources used by local inference are pinned here. The bundle validator
    # has its own manifest pins and must not couple local History to Science pins.
    validator=read(ROOT/'runtime/coverage/manifest.json')
    sources=[name for name in validator['files'] if name.startswith('ml-training/src/smart_note_training/') and not name.split('/')[-1].startswith('ict_')]
    sources += ['ml-training/history_preview_cli.py']
    source_hashes={name:sha(replacements.get(name,(ROOT/name).read_bytes())) for name in sources}
    protocol=dict(modelSha256=new,sourceHashes=source_hashes,schemaVersion=12,
        regressionGates=gates,independentAccuracyClaimAllowed=False,humanReviewed=False,
        parametersSha256=sha(json.dumps({k:v for k,v in artifact.items() if k!='metadata'},sort_keys=True).encode()),
        encoderAndRubricsFrozen=True,parentModelSha256=OLD,trainingReportSha256=sha((out/'training-report.json').read_bytes()))
    update('runtime/coverage/manifest.json',lambda r:manifest_bytes(r,replacements,new,protocol))
    backup=out/'activation-backup'
    if backup.exists():raise ValueError('Activation already attempted')
    backup.mkdir()
    for name,data in originals.items():
        file=backup/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data)
    for name in sources:
        file=out/'source'/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(replacements.get(name,(ROOT/name).read_bytes()))
    (out/'protocol.json').write_bytes(encoded(protocol))
    (out/'release.json').write_bytes(encoded(dict(modelSha256=new,gates=gates,humanReviewed=False,independentAccuracyEstablished=False,
        newImageReviewedTrainingCases=3,authoredTrainingContrasts=14,sourceImageNotebooks=2,sourceImageFamilies=1,
        summaries={name:row['summary'] for name,row in evaluation['sets'].items()},partialChecks={k:v for k,v in checks.items() if k!='rows'})))
    try:
        for name,data in replacements.items():(ROOT/name).write_bytes(data)
        spec=importlib.util.spec_from_file_location('new_history_bundle',ROOT/'ml-training/coverage_runtime_bundle.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        module.load_bundle(ROOT/'runtime/coverage')
    except Exception:
        for name,data in originals.items():(ROOT/name).write_bytes(data)
        raise
    print(json.dumps(dict(historySha256=new,version=artifact['metadata']['experimentId'],gates=gates,changedFiles=list(replacements))))

def manifest_bytes(raw,replacements,new,protocol):
    manifest=json.loads(raw);unchanged=copy.deepcopy({s:manifest['subjects'][s] for s in ['science','ict']})
    manifest['subjects']['history']['sha256']=new
    for name,data in replacements.items():
        if name.startswith('runtime/coverage/'):manifest['files'][name.removeprefix('runtime/coverage/')]=sha(data)
    manifest['provenance']['historyProtocolSha256']=sha(encoded(protocol))
    assert unchanged=={s:manifest['subjects'][s] for s in unchanged}
    return encoded(manifest)

if __name__=='__main__':main()
