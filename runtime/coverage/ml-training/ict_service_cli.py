"""Service adapter around frozen ICT V3.1. No fitting, database or note persistence."""
import contextlib
import hashlib
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'src'))
EXPECTED = 'df42a138824f57fec3339ecb973f643cebf8899d7eaba902d5adfb40d4a3b74b'


class ICTServiceRuntime:
    def __init__(self):
        from smart_note_training.history_semantic import FrozenEncoder
        from smart_note_training.ict_coverage_v31 import ICTPredictorV31
        if os.environ.get('COVERAGE_BUNDLE_DIR'):
            from coverage_runtime_bundle import load_bundle, contained
            root, manifest = load_bundle(os.environ['COVERAGE_BUNDLE_DIR'])
            model = contained(root, manifest['subjects']['ict']['model'])
            encoder = FrozenEncoder(contained(root, manifest['encoder']['manifest']))
            encoder.path = contained(root, manifest['encoder']['directory'])
        else:
            model = ROOT / 'outputs/ict-coverage-v3.1-2026-10-15/model.json'
            release = json.loads((model.parent / 'release.json').read_text(encoding='utf-8'))
            if release['modelSha256'] != EXPECTED:
                raise ValueError('Unexpected ICT release')
            for source, expected in release['sourceHashes'].items():
                if hashlib.sha256(Path(source).read_bytes()).hexdigest() != expected:
                    raise ValueError('Frozen ICT source changed')
            encoder = FrozenEncoder(ROOT / 'encoders/minilm-l6-v2/encoder-manifest.json')
        raw = model.read_bytes()
        if hashlib.sha256(raw).hexdigest() != EXPECTED:
            raise ValueError('Unexpected ICT model')
        artifact = json.loads(raw)
        encoder.prime([p['text'] for c in artifact['rubrics']['concepts'] for p in c['points']])
        self.encoder = encoder
        self.baseline = dict(encoder.cache)
        self.predictor = ICTPredictorV31(artifact, encoder)

    def predict(self, request):
        try:
            text = request.get('text')
            result = self.predictor.predict(text, request.get('conceptId'), request.get('language', ''), request.get('scopeConfirmed', False))
            for point in result['evidence']['points']:
                for start, end, quote in [('start', 'end', 'candidateEvidence'), ('semanticStart', 'semanticEnd', 'semanticCandidateEvidence')]:
                    if text[point[start]:point[end]] != point[quote]:
                        raise ValueError('Evidence alignment failure')
            for concern in result['evidence']['concerns']:
                if text[concern['start']:concern['end']] != concern['quote']:
                    raise ValueError('Concern alignment failure')
            result.update(modelSha256=EXPECTED, previewOnly=True)
            return result
        finally:
            self.encoder.cache = dict(self.baseline)


def main():
    with contextlib.redirect_stdout(sys.stderr):
        runtime = ICTServiceRuntime()
    if sys.argv[1:] != ['--worker']:
        raise ValueError('Use worker mode')
    print(json.dumps(dict(type='ready', modelSha256=EXPECTED)), flush=True)
    while True:
        line = sys.stdin.buffer.readline(100001)
        if not line:
            return
        if len(line) > 100000 or not line.endswith(b'\n'):
            raise ValueError('Input limit exceeded')
        envelope = json.loads(line.decode('utf-8'))
        result = None
        try:
            with contextlib.redirect_stdout(sys.stderr):
                result = runtime.predict(envelope['input'])
            reply = dict(id=envelope['id'], result=result)
        except Exception:
            reply = dict(id=envelope['id'], error='Local ICT inference failed')
        print(json.dumps(reply, ensure_ascii=True), flush=True)
        del line, envelope, result, reply


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps(dict(error='ICT runtime unavailable or integrity check failed.')), flush=True)
        sys.exit(1)
