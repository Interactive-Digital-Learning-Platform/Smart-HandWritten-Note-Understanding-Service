"""Offline JSON stdin/stdout for the disabled ICT V1.1 candidate."""
import argparse
import contextlib
import hashlib
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'src'))


def load_runtime(model_file):
    from smart_note_training.history_semantic import FrozenEncoder
    from smart_note_training.ict_coverage_v11 import ICTPredictorV11
    from smart_note_training.english_coverage import sha
    model_file = Path(model_file)
    release = json.loads((model_file.parent / 'release.json').read_text(encoding='utf-8'))
    if sha(model_file) != release['modelSha256']:
        raise ValueError('ICT model integrity failure')
    for file, expected in release['sourceHashes'].items():
        if sha(file) != expected:
            raise ValueError('Frozen ICT source integrity failure')
    encoder = FrozenEncoder(ROOT / 'encoders/minilm-l6-v2/encoder-manifest.json')
    artifact = json.loads(model_file.read_text(encoding='utf-8'))
    public = [p['text'] for c in artifact['rubrics']['concepts'] for p in c['points']]
    encoder.prime(public)
    baseline_cache = dict(encoder.cache)
    if artifact['reviewPolicy'] == 'ict-review-policy-v3':
        from smart_note_training.ict_coverage_v3 import ICTPredictorV3
        predictor = ICTPredictorV3(artifact, encoder)
    else:
        predictor = ICTPredictorV11(artifact, encoder)
    return predictor, encoder, baseline_cache, release['modelSha256']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', default=str(ROOT / 'outputs/ict-coverage-v1.1-2026-10-15/model.json'))
    parser.add_argument('--worker', action='store_true')
    args = parser.parse_args()
    with contextlib.redirect_stdout(sys.stderr):
        predictor, encoder, baseline, model_sha = load_runtime(args.model)
    if args.worker:
        print(json.dumps(dict(type='ready', modelSha256=model_sha)), flush=True)
    while True:
        raw = sys.stdin.buffer.readline(100001) if args.worker else sys.stdin.buffer.read(100001)
        if not raw:
            return
        if len(raw) > 100000:
            raise ValueError('Input limit exceeded')
        request = json.loads(raw.decode('utf-8'))
        try:
            with contextlib.redirect_stdout(sys.stderr):
                result = predictor.predict(request.get('text'), request.get('conceptId'),
                    request.get('language', ''), request.get('scopeConfirmed', False))
            result['modelSha256'] = model_sha
            print(json.dumps(dict(result=result), ensure_ascii=True), flush=True)
        except (ValueError, KeyError):
            print(json.dumps(dict(error='Check English text, registered concept and confirmed scope.')), flush=True)
            if not args.worker:
                sys.exit(1)
        finally:
            encoder.cache = dict(baseline)
            del raw, request
            if 'result' in locals():
                del result
        if not args.worker:
            return


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps(dict(error='ICT candidate is unavailable or failed integrity checks.')))
        sys.exit(1)
