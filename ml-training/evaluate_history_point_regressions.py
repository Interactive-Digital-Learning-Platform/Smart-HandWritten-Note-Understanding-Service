"""Check a frozen point-coverage candidate against exposed legacy development sets."""
import argparse
import hashlib
import json
from pathlib import Path
from collections import Counter
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.history_point_coverage import PointCoveragePredictor

ROOT = Path(__file__).resolve().parent


def run(model_path, output):
    output = Path(output)
    if output.exists():
        raise ValueError('Choose a fresh report output')
    raw = Path(model_path).read_bytes()
    encoder = FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json', ROOT/'outputs/history-semantic-embedding-cache-v1')
    encoder.cache_dir = None
    model = PointCoveragePredictor(json.loads(raw), encoder)
    result = {'modelSha256': hashlib.sha256(raw).hexdigest(), 'independentAccuracyClaimAllowed': False, 'sets': {}}
    for name in ('exposedHumanReview', 'exposedSyntheticTest', 'exposedSyntheticValidation'):
        data = json.loads((ROOT/'outputs/history-coverage-v5.1-review-policy-2026-10-15'/(name+'.json')).read_bytes())
        decisions = []
        for r in data['examples']:
            pred = model.predict(r['text'], r['conceptId'], 'English', True)
            decisions.append({'id': r['id'], 'expectedLabel': r['expectedLabel'], 'baseline': r['predictions']['v51'], 'prediction': pred})
        result['sets'][name] = {
            'total': len(decisions),
            'baselineMatches': sum(d['baseline']['suggestedStatus'] == d['expectedLabel'] for d in decisions),
            'candidateMatches': sum(d['prediction']['suggestedStatus'] == d['expectedLabel'] for d in decisions),
            'candidateWithheld': sum(d['prediction']['suggestedStatus'] is None for d in decisions),
            'falseComplete': [d['id'] for d in decisions if d['expectedLabel'] != 'present' and d['prediction']['suggestedStatus'] == 'present'],
            'confusion': dict(Counter(d['expectedLabel']+'->'+str(d['prediction']['suggestedStatus']) for d in decisions)),
            'decisions': decisions,
        }
        print(name, {k: v for k, v in result['sets'][name].items() if k != 'decisions'}, flush=True)
    output.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):
        run(args.model, args.output)
