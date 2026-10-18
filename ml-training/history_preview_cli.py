"""Bounded local preview entry point. Does not train or write shared caches."""
import contextlib
import hashlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'src'))
EXPECTED = '12ba94e87415adb0ceb851919a6e87bc5d36e8535f0539352b450bd104e368e8'
MODEL_DIR = ROOT / 'outputs/history-coverage-v5.1-review-policy-2026-10-15'


def load_artifact():
    if os.environ.get('COVERAGE_BUNDLE_DIR'):
        from coverage_runtime_bundle import load_bundle, contained
        root, manifest = load_bundle(os.environ['COVERAGE_BUNDLE_DIR'])
        return json.loads(contained(root, manifest['subjects']['history']['model']).read_text(encoding='utf-8'))
    raw = (MODEL_DIR / 'model.json').read_bytes()
    if hashlib.sha256(raw).hexdigest() != EXPECTED:
        raise ValueError('Candidate integrity check failed')
    protocol = json.loads((MODEL_DIR / 'protocol.json').read_text(encoding='utf-8'))
    if protocol['modelSha256'] != EXPECTED:
        raise ValueError('Protocol integrity check failed')
    for name, expected in protocol['sourceHashes'].items():
        path = Path(name)
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError('Frozen source integrity check failed')
    return json.loads(raw)


def validate_request(request, artifact):
    text, concept = request.get('text'), request.get('conceptId')
    if not isinstance(text, str) or not text.strip() or len(text) > 20000:
        raise ValueError('Enter 1–20,000 characters of English note text')
    if request.get('scopeConfirmed') is not True:
        raise ValueError('Confirm that the selected concept applies to this note')
    if concept not in {c['id'] for c in artifact['rubrics']['concepts']}:
        raise ValueError('Choose a registered History concept')
    return text, concept


class HistoryPreviewRuntime:
    def __init__(self, warm=False):
        self.artifact = load_artifact()
        from smart_note_training.history_semantic import FrozenEncoder
        from smart_note_training.history_semantic_review import ReviewedSemanticPredictor
        if os.environ.get('COVERAGE_BUNDLE_DIR'):
            from coverage_runtime_bundle import load_bundle, contained
            root, manifest = load_bundle(os.environ['COVERAGE_BUNDLE_DIR'])
            self.encoder = FrozenEncoder(contained(root, manifest['encoder']['manifest']))
            self.encoder.path = contained(root, manifest['encoder']['directory'])
            # Precompute only public concept requirements; no training-note cache ships.
            self.encoder.prime([p['text'] for c in self.artifact['rubrics']['concepts'] for p in c['points']])
        else:
            self.encoder = FrozenEncoder(ROOT / 'encoders/minilm-l6-v2/encoder-manifest.json',
                                         ROOT / 'outputs/history-semantic-embedding-cache-v1')
        self.encoder.cache_dir = None  # Never overwrite the training cache.
        self.base_cache = dict(self.encoder.cache)
        self.predictor = ReviewedSemanticPredictor(self.artifact, self.encoder)
        if warm:
            self.encoder.load()

    def predict(self, request):
        text, concept = validate_request(request, self.artifact)
        try:
            result = self.predictor.predict(text, concept, 'English', True)
            return align_result(result, text)
        finally:
            # Retain frozen public vectors, not submitted note vectors between requests.
            self.encoder.cache = dict(self.base_cache)


def predict(request):
    return HistoryPreviewRuntime().predict(request)


def align_result(result, text):
    # Check quotes using Python code-point offsets, including non-BMP input.
    for point in result['evidence']['points']:
        for prefix, field in [('', 'candidateEvidence'), ('semantic', 'semanticCandidateEvidence')]:
            start = point['semanticStart' if prefix else 'start']
            end = point['semanticEnd' if prefix else 'end']
            if text[start:end] != point[field]:
                raise ValueError('Evidence alignment check failed')
    for concern in result['evidence']['concerns']:
        if text[concern['start']:concern['end']] != concern['quote']:
            raise ValueError('Concern alignment check failed')
    result['previewOnly'] = True
    result['modelSha256'] = EXPECTED
    return result


def serve_worker():
    with contextlib.redirect_stdout(sys.stderr):
        runtime = HistoryPreviewRuntime(warm=True)
    print(json.dumps({'type': 'ready', 'modelSha256': EXPECTED}), flush=True)
    while True:
        line = sys.stdin.buffer.readline(100001)
        if not line:
            return
        if len(line) > 100000 or not line.endswith(b'\n'):
            raise ValueError('Worker input limit')
        envelope = json.loads(line.decode('utf-8'))
        request_id = envelope['id']
        result = None
        try:
            with contextlib.redirect_stdout(sys.stderr):
                result = runtime.predict(envelope['input'])
            reply = {'id': request_id, 'result': result}
        except Exception:
            reply = {'id': request_id, 'error': 'Local inference failed'}
        print(json.dumps(reply, ensure_ascii=False), flush=True)
        del envelope, line, result, reply


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--worker']:
            serve_worker()
            sys.exit(0)
        request = json.loads(sys.stdin.buffer.read(100000).decode('utf-8'))
        with contextlib.redirect_stdout(sys.stderr):
            result = predict(request)
        print(json.dumps(result, ensure_ascii=False))
    except Exception:
        # Keep private note text and local paths out of the transport error.
        print(json.dumps({'error': 'Local inference failed. Check the candidate files and English input.'}))
        sys.exit(1)
