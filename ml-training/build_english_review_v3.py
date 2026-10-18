"""Freeze the v3 candidate and create its new blind human-review packet."""
import argparse
import hashlib
import json
from pathlib import Path

from build_english_review import packet

ROOT = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def build(challenge, rubrics, model, output):
    root = Path(output)
    if root.exists():
        raise FileExistsError('review output must be fresh')
    data = packet(challenge, rubrics)
    data.pop('packetSha256')
    data['version'] = 'english-coverage-human-review-v3'
    data['packetSha256'] = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    template = (ROOT/'review-english-template.html').read_text(encoding='utf-8')
    template = template.replace('English concept coverage review', 'English concept coverage review — Round 3')
    template = template.replace('Human review · English Science', 'Human review · English Science · Round 3')
    template = template.replace('english-coverage-human-review.json', 'english-coverage-v3-human-review.json')
    template = template.replace('english-coverage-review-draft.json', 'english-coverage-v3-review-draft.json')
    template = template.replace('max="30"', 'max="'+str(len(data['examples']))+'"')
    sources = [
        'src/smart_note_training/english_coverage.py',
        'src/smart_note_training/english_coverage_v3.py',
        'src/smart_note_training/metrics.py',
        'src/smart_note_training/__init__.py',
        'train_english_coverage_v3.py', 'train_english_coverage_v2.py', 'evaluate_english_review.py',
        'evaluate_english_review_v3.py',
    ]
    frozen = {'modelSha256': digest(model), 'rubricsSha256': digest(rubrics),
              'challengeSha256': digest(challenge), 'freshReviewScored': False,
              'inferenceSourceHashes': {str((ROOT/p).resolve()): digest(ROOT/p) for p in sources}}
    root.mkdir(parents=True)
    (root/'index.html').write_text(template.replace('__REVIEW_DATA__', json.dumps(data, ensure_ascii=True).replace('</', '<\\/')), encoding='utf-8')
    (root/'packet.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    frozen['packetFileSha256'] = digest(root/'packet.json')
    (root/'frozen-evaluation.json').write_text(json.dumps(frozen, indent=2)+'\n', encoding='utf-8')
    print(root.resolve()/'index.html')
    return data


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for key in ('challenge', 'rubrics', 'model', 'output'):
        parser.add_argument('--'+key, required=True)
    args = parser.parse_args()
    build(args.challenge, args.rubrics, args.model, args.output)
