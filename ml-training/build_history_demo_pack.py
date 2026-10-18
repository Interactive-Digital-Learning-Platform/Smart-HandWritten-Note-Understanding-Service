"""Create and evaluate explicitly synthetic demo notes; never fit a model."""
import contextlib
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'src'))
from history_preview_cli import load_artifact, EXPECTED, MODEL_DIR
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.history_semantic_review import ReviewedSemanticPredictor

CASES = [
    ('sources-complete', 'hist-g10-l01-c01', 'present',
     'Historical sources provide evidence about past human activity. Literary sources are written materials, including books and documents. Archaeological sources are physical remains, such as coins, old buildings and inscriptions.',
     'Explains evidence and both classes with examples.'),
    ('sources-partial', 'hist-g10-l01-c01', 'partial',
     'Literary sources include written books and documents that provide evidence about past human activity.',
     'The archaeological class is not explained.'),
    ('sources-missing', 'hist-g10-l01-c01', 'missing',
     'The port of Trincomalee was important for naval security around India.',
     'This explains a different History concept.'),
    ('british-complete', 'hist-g11-l02-c01', 'present',
     'Britain valued Sri Lanka because of its position on Indian Ocean sea routes. Trincomalee harbour was strategically important for naval security around India.',
     'Covers sea-route location and Trincomalee naval security.'),
    ('british-partial', 'hist-g11-l02-c01', 'partial',
     'Britain valued Sri Lanka because of its position on Indian Ocean sea routes.',
     'Does not explain Trincomalee and naval security around India.'),
    ('british-missing', 'hist-g11-l02-c01', 'missing',
     'Literary sources include books and written documents. Archaeological sources include coins and buildings.',
     'This describes historical sources, not British strategic interests.'),
    ('kandy-complete', 'hist-g11-l02-c04', 'present',
     'The Kandyan kingdom came under British rule in 1815. This ended the independent Kandyan monarchy and expanded British control over the whole island.',
     'Includes 1815, annexation, the end of monarchy and island-wide control.'),
    ('kandy-partial', 'hist-g11-l02-c04', 'partial',
     'The Kandyan kingdom came under British rule in 1815.',
     'Does not explain the end of independent monarchy and island-wide control.'),
    ('kandy-missing', 'hist-g11-l02-c04', 'missing',
     'Britain valued Sri Lanka for its location on Indian Ocean sea routes. Trincomalee was useful for naval security near India.',
     'Strategic interests do not explain the 1815 annexation and its consequences.'),
]


def run():
    out = ROOT.parent / 'public/history-preview'
    out.mkdir(parents=True, exist_ok=True)
    examples = [dict(id=i, conceptId=c, expectedLabel=y, text=t, rationale=r,
                     inputType='synthetic_typed') for i, c, y, t, r in CASES]
    # Explicitly defined OCR-like substitutions; no actual handwriting or OCR is involved.
    replacements = {
        'sources-complete': [('sources', 'sourccs'), ('documents', 'docurnents')],
        'british-complete': [('Trincomalee', 'Trincomalce'), ('Indian', 'lndian')],
        'kandy-complete': [('1815', '18l5'), ('British', 'Britlsh')],
    }
    for base in list(examples):
        if base['id'] not in replacements:
            continue
        text = base['text']
        for old, new in replacements[base['id']]:
            text = text.replace(old, new)
        examples.append({**base, 'id': base['id'] + '-ocr-noise', 'text': text,
                         'inputType': 'simulated_ocr_text', 'cleanExampleId': base['id'],
                         'rationale': 'Intended meaning matches the clean example. Simulated character substitutions can make the text ambiguous; the reviewer should restore them first.'})
    pack = dict(synthetic=True, independentHumanReview=False, usedForTraining=False,
                purpose='Demo and robustness checks, not an independent accuracy estimate.',
                expectedLabelAuthor='AI, based on the supplied proposed concept criteria',
                realHandwritingIncluded=False, examples=examples)
    (out / 'demo-pack.json').write_bytes((json.dumps(pack, indent=2, ensure_ascii=False) + '\n').encode('utf-8'))
    artifact = load_artifact()
    encoder = FrozenEncoder(ROOT / 'encoders/minilm-l6-v2/encoder-manifest.json',
                            ROOT / 'outputs/history-semantic-embedding-cache-v1')
    encoder.cache_dir = None
    predictor = ReviewedSemanticPredictor(artifact, encoder)
    results = []
    with contextlib.redirect_stdout(sys.stderr):
        for example in examples:
            prediction = predictor.predict(example['text'], example['conceptId'], 'English', True)
            results.append({**example, 'suggestedStatus': prediction['suggestedStatus'],
                            'rawModelStatus': prediction['rawModelStatus'],
                            'withheld': prediction['suggestionWithheld'],
                            'matchesAIExpectation': prediction['suggestedStatus'] == example['expectedLabel'],
                            'concernKinds': sorted({c['kind'] for c in prediction['evidence']['concerns']})})
    assert hashlib.sha256((MODEL_DIR / 'model.json').read_bytes()).hexdigest() == EXPECTED
    summaries = {}
    for kind in ['synthetic_typed', 'simulated_ocr_text']:
        rows = [r for r in results if r['inputType'] == kind]
        summaries[kind] = dict(total=len(rows), matchesAIExpectation=sum(r['matchesAIExpectation'] for r in rows),
                               withheld=sum(r['withheld'] for r in rows))
    report = {**{k: v for k, v in pack.items() if k != 'examples'}, 'modelSha256': EXPECTED,
              'summary': summaries, 'results': results}
    (out / 'demo-check-results.json').write_bytes((json.dumps(report, indent=2, ensure_ascii=False) + '\n').encode('utf-8'))
    print(json.dumps(summaries, indent=2))


if __name__ == '__main__':
    run()
