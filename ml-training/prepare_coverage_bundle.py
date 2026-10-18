"""Copy an explicit inference-only allowlist; never include datasets or credentials."""
import hashlib
import json
from pathlib import Path
import shutil
from coverage_runtime_bundle import SCIENCE_SHA, HISTORY_SHA, ICT_SHA, load_bundle

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'runtime/coverage'
HISTORY = ROOT / 'ml-training/outputs/history-coverage-v5.1-review-policy-2026-10-15'
ICT = ROOT / 'ml-training/outputs/ict-coverage-v3.1-2026-10-15'
MODULES = ['__init__', 'english_coverage', 'english_coverage_v3', 'english_coverage_v31',
           'history_coverage', 'history_coverage_v31', 'history_semantic', 'history_semantic_core', 'history_semantic_review',
           'ict_coverage', 'ict_coverage_v11', 'ict_coverage_v3', 'ict_coverage_v31']


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def build():
    release = json.loads((ICT / 'release.json').read_text(encoding='utf-8'))
    if release['modelSha256'] != ICT_SHA or sha(ICT / 'model.json') != ICT_SHA:
        raise ValueError('Frozen ICT model changed')
    for name, expected in release['sourceHashes'].items():
        if sha(name) != expected:
            raise ValueError('Frozen ICT provenance changed')
    protocol = json.loads((HISTORY / 'protocol.json').read_text(encoding='utf-8'))
    for name, expected in protocol['sourceHashes'].items():
        if sha(name) != expected:
            raise ValueError('Frozen History provenance changed')
    if sha(HISTORY / 'model.json') != HISTORY_SHA or sha(ROOT / 'models/english-coverage-v3.1.json') != SCIENCE_SHA:
        raise ValueError('Frozen model changed')
    source = ROOT / 'ml-training/encoders/minilm-l6-v2/encoder-manifest.json'
    encoder = json.loads(source.read_text(encoding='utf-8'))
    files = {}

    def copy(src, relative):
        target = OUT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, target)
        files[relative] = sha(target)

    copy(ROOT / 'models/english-coverage-v3.1.json', 'models/english-coverage-v3.1.json')
    copy(HISTORY / 'model.json', 'models/history-coverage-v5.1.json')
    copy(ICT / 'model.json', 'models/ict-coverage-v3.1.json')
    for name in MODULES:
        copy(ROOT / f'ml-training/src/smart_note_training/{name}.py', f'ml-training/src/smart_note_training/{name}.py')
    for name in ['english_coverage_v31_cli.py', 'english_coverage_v3_cli.py', 'history_preview_cli.py', 'ict_service_cli.py', 'coverage_runtime_bundle.py']:
        copy(ROOT / f'ml-training/{name}', f'ml-training/{name}')
    for name, expected in encoder['files'].items():
        if Path(name).name != name or sha(Path(encoder['localPath']) / name) != expected:
            raise ValueError('Encoder integrity failure')
        copy(Path(encoder['localPath']) / name, f'encoders/minilm-l6-v2/{name}')
    portable = {k: v for k, v in encoder.items() if k != 'localPath'}
    portable['localPath'] = 'encoders/minilm-l6-v2'
    encoder_path = OUT / 'encoders/encoder-manifest.json'
    encoder_path.write_bytes((json.dumps(portable, indent=2) + '\n').encode('utf-8'))
    files['encoders/encoder-manifest.json'] = sha(encoder_path)
    # Reject stale unexpected files rather than silently shipping them.
    extra = {p.relative_to(OUT).as_posix() for p in OUT.rglob('*') if p.is_file()} - files.keys() - {'manifest.json'}
    if extra:
        raise ValueError('Unexpected files in bundle; use a new clean runtime directory')
    manifest = dict(schemaVersion=1, subjects={
        'science': dict(model='models/english-coverage-v3.1.json', sha256=SCIENCE_SHA),
        'history': dict(model='models/history-coverage-v5.1.json', sha256=HISTORY_SHA),
        'ict': dict(model='models/ict-coverage-v3.1.json', sha256=ICT_SHA)},
        encoder=dict(manifest='encoders/encoder-manifest.json', directory='encoders/minilm-l6-v2', revision=encoder['revision']),
        provenance=dict(historyProtocolSha256=sha(HISTORY / 'protocol.json'), ictReleaseSha256=sha(ICT / 'release.json'), originalEncoderManifestSha256=sha(source)),
        trainingDataIncluded=False, files=files)
    (OUT / 'manifest.json').write_bytes((json.dumps(manifest, indent=2) + '\n').encode('utf-8'))
    load_bundle(OUT)
    print(json.dumps(dict(bundle=str(OUT), files=len(files), bytes=sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file()), subjects=list(manifest['subjects']))))


if __name__ == '__main__':
    build()
