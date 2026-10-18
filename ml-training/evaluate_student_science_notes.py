"""Read-only comparison on the frozen supplied-note split; never fit or promote.

AI teacher agreement is deliberately kept separate from human-verified accuracy.
Uses the same prepared transcript text supplied to the production predictor.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

from train_student_note_batch import LABELS, ROOT, read_batch
from smart_note_training.english_coverage_v31 import CoveragePredictorV31
from smart_note_training.metrics import classification_metrics


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def metrics(rows, predictions):
    if not rows:
        return None
    expected = [r['teacherLabel'] for r in rows]
    raw = [p['rawModelStatus'] for p in predictions]
    shown = [p['suggestedStatus'] for p in predictions]
    accepted = sum(p is not None for p in shown)
    correct = sum(a == b for a, b in zip(expected, shown))
    visible_matrix = [[sum(a == label and b == outcome for a, b in zip(expected, shown))
                       for outcome in (*LABELS, None)] for label in LABELS]
    return {
        'raw': classification_metrics([LABELS.index(a) for a in expected],
                                      [LABELS.index(b) for b in raw]),
        'rawCorrect': sum(a == b for a, b in zip(expected, raw)),
        'visible': {
            'correct': correct, 'total': len(rows), 'accepted': accepted,
            'withheld': len(rows) - accepted,
            'correctSuggestionFractionOfAll': correct / len(rows),
            'acceptedOnlyAgreement': correct / accepted if accepted else None,
            'falseCompleteSuggestions': sum(b == 'present' and a != 'present'
                                            for a, b in zip(expected, shown)),
            'matrixRows': list(LABELS), 'matrixColumns': [*LABELS, 'needs_review'],
            'confusionMatrix': visible_matrix,
            'perClass': {label: {
                'support': expected.count(label),
                'shown': shown.count(label),
                'correct': sum(a == b == label for a, b in zip(expected, shown)),
                'precision': (sum(a == b == label for a, b in zip(expected, shown)) /
                              shown.count(label)) if label in shown else None,
                'recall': (sum(a == b == label for a, b in zip(expected, shown)) /
                           expected.count(label)) if label in expected else None,
            } for label in LABELS},
        },
    }


def describe(rows):
    return {'rows': len(rows), 'notebooks': len({r['noteGroupId'] for r in rows}),
            'sourceFamilies': sorted({r['sourceFamilyId'] for r in rows}),
            'concepts': sorted({r['conceptId'] for r in rows}),
            'classes': dict(Counter(r['teacherLabel'] for r in rows)),
            'variants': dict(Counter('whole' if r['variant'] == 'whole' else 'page' for r in rows))}


def percent(value):
    return 'n/a' if value is None else f'{100 * value:.1f}%'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    batch = ROOT / 'outputs/science-student-v2-final-batch-2026-10-18'
    _, rows, dataset_sha = read_batch(batch / 'dataset.json', batch / 'split-template.json')
    fitted = json.loads((ROOT / 'outputs/science-continued-strength10-2026-10-18/report.json').read_bytes())
    paths = {
        'previous': ROOT / 'outputs/english-coverage-v3.2-strength10-update-2026-10-18/previous-model.json',
        'updated': ROOT.parent / 'models/english-coverage-v3.1.json',
    }
    artifacts = {name: json.loads(path.read_bytes()) for name, path in paths.items()}
    hashes = {name: digest(path) for name, path in paths.items()}
    assert hashes == {
        'previous': 'bc1916bc34adaecd699426987cf4c78fcde84c88052d49b070991c92159a84ec',
        'updated': '4ca8524b08f4c500ee9140bf37dfce52eb5af2935a2c8fc66d35869c98b7af7c',
    }, 'Unexpected model revision; do not silently evaluate a different release'
    assert dataset_sha == fitted['datasetSha256'] == artifacts['updated']['metadata']['studentBatchSha256']
    checkpoint = json.loads((ROOT / 'outputs/science-continued-strength10-2026-10-18/candidate-model.json').read_bytes())
    assert all(artifacts['updated'][key] == checkpoint[key] for key in ('weights', 'intercept'))
    train = [r for r in rows if r['split'] == 'train']
    held = [r for r in rows if r['split'] == 'holdout']
    assert set(fitted['trainingRowsUsed']) == {r['recordId'] for r in train}
    assert len(train) == 75 and len(held) == 71
    assert all(not r['humanConfirmed'] and r['humanReviewed'] is False for r in rows)
    for key in ('recordId', 'noteGroupId', 'textSha256', 'sourceFamilyId', 'group'):
        assert not ({r[key] for r in train} & {r[key] for r in held}), f'Split leakage: {key}'
    if args.output.exists():
        raise ValueError('Use a fresh output directory to preserve the evaluation audit')
    args.output.mkdir(parents=True)
    models = {name: CoveragePredictorV31(artifact) for name, artifact in artifacts.items()}
    predictions = {name: {r['recordId']: model.predict(r['modelInputText'], r['conceptId'], 'English', True)
                          for r in rows} for name, model in models.items()}

    def score(subset):
        return {name: metrics(subset, [by_id[r['recordId']] for r in subset])
                for name, by_id in predictions.items()}

    report = {
        'schemaVersion': 'supplied-science-note-evaluation-v1',
        'evaluationMeaning': 'Agreement against unreviewed AI teacher labels on synthetic supplied transcripts.',
        'humanVerifiedAccuracyEstablished': False, 'ocrAccuracyEvaluated': False,
        'modelChangedDuringEvaluation': False,
        'datasetSha256': dataset_sha, 'modelSha256': hashes,
        'inputs': 'modelInputText from frozen dataset; same bounded Science preparation as service',
        'splitChecks': 'Exact fitted row IDs verified; no record, notebook, normalized text, source family or connected group overlap.',
        'training': {'description': describe(train), 'inSampleDiagnosticsOnly': score(train)},
        'heldout': {'description': describe(held), 'scores': score(held)},
        'heldoutByVariant': {variant: score([r for r in held if (r['variant'] == 'whole') == (variant == 'whole')])
                             for variant in ('whole', 'page')},
        'heldoutByConcept': {concept: {
            'name': next(r['conceptName'] for r in held if r['conceptId'] == concept),
            'description': describe([r for r in held if r['conceptId'] == concept]),
            'scores': score([r for r in held if r['conceptId'] == concept]),
        } for concept in sorted({r['conceptId'] for r in held})},
        'limitations': [
            'AI labels are not fresh teacher/human gold labels; label errors remain possible.',
            '100 source notebooks are simulated; only 24 map to supported model concepts.',
            '146 accepted labelled examples out of 211 proposals; rejected/unlabelled proposals are not scored.',
            'Individual pages and whole notes share notebooks; 71 rows are not 71 independent students.',
            'Holdout covers four source chapter families and four concepts, not the entire Science syllabus.',
            'Whole-note source profile labels are not concept-level truth labels.',
            'No image OCR or automatic concept selection is tested; correct concept is supplied.',
            'The existing 90 human-reviewed synthetic examples influenced model selection; they are regressions only.',
            'Do not tune on this holdout after inspecting results and still describe it as unseen.',
        ],
    }
    decisions = []
    for row in rows:
        decisions.append({**row, 'predictions': {name: by_id[row['recordId']] for name, by_id in predictions.items()}})
    held_decisions = [r for r in decisions if r['split'] == 'holdout']
    report['heldoutChanges'] = {
        'rawChanged': sum(r['predictions']['previous']['rawModelStatus'] != r['predictions']['updated']['rawModelStatus'] for r in held_decisions),
        'visibleChanged': sum(r['predictions']['previous']['suggestedStatus'] != r['predictions']['updated']['suggestedStatus'] for r in held_decisions),
        'rawFixed': sum(r['predictions']['previous']['rawModelStatus'] != r['teacherLabel'] == r['predictions']['updated']['rawModelStatus'] for r in held_decisions),
        'rawRegressed': sum(r['predictions']['previous']['rawModelStatus'] == r['teacherLabel'] != r['predictions']['updated']['rawModelStatus'] for r in held_decisions),
    }
    (args.output / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    (args.output / 'decisions.json').write_text(json.dumps(decisions, indent=2) + '\n', encoding='utf-8')
    lines = ['# Supplied Science notes: v3.2 evaluation', '',
             'This measures agreement with AI-proposed concept labels, not independently verified accuracy.', '',
             f"Held out: {len(held)} concept examples from {describe(held)['notebooks']} synthetic notebooks; "
             f"{describe(held)['variants']}. Training: {len(train)} other examples.", '',
             '| Measure | Previous v3.1 | Updated v3.2 |', '|---|---:|---:|']
    for title, fn in (
        ('Raw agreement', lambda m: f"{m['rawCorrect']}/71 ({percent(m['raw']['accuracy'])})"),
        ('Balanced recall', lambda m: percent(m['raw']['balancedAccuracy'])),
        ('Macro F1', lambda m: str(m['raw']['macroF1'])),
        ('Correct shown suggestion / all examples', lambda m: f"{m['visible']['correct']}/71 ({percent(m['visible']['correctSuggestionFractionOfAll'])})"),
        ('Needs review / withheld', lambda m: str(m['visible']['withheld'])),
        ('Agreement among shown suggestions', lambda m: f"{m['visible']['correct']}/{m['visible']['accepted']} ({percent(m['visible']['acceptedOnlyAgreement'])})"),
        ('False complete suggestions against AI labels', lambda m: str(m['visible']['falseCompleteSuggestions'])),
    ):
        lines.append(f"| {title} | {fn(report['heldout']['scores']['previous'])} | {fn(report['heldout']['scores']['updated'])} |")
    lines += ['', '## Updated model by AI reference label', '',
              '| Reference | Examples | Raw correct | Correct shown | Shown-label precision |', '|---|---:|---:|---:|---:|']
    new = report['heldout']['scores']['updated']
    for i, label in enumerate(LABELS):
        c = new['visible']['perClass'][label]
        raw_correct = new['raw']['confusionMatrix'][i][i]
        lines.append(f"| {'complete' if label == 'present' else label} | {c['support']} | "
                     f"{raw_correct}/{c['support']} ({percent(raw_correct / c['support'])}) | "
                     f"{c['correct']}/{c['support']} ({percent(c['recall'])}) | "
                     f"{c['correct']}/{c['shown']} ({percent(c['precision'])}) |")
    lines += ['', '## Updated student-visible confusion matrix', '',
              'Rows are AI reference labels; columns are model suggestions. Needs review is an abstention, not a fourth reference label.', '',
              '| AI label | Complete | Partial | Missing | Needs review |', '|---|---:|---:|---:|---:|']
    for label, values in zip(LABELS, new['visible']['confusionMatrix']):
        lines.append('| ' + ('complete' if label == 'present' else label) + ' | ' + ' | '.join(map(str, values)) + ' |')
    lines += ['', '## Whole notes versus pages', '',
              '| Variant | Raw agreement | Correct shown | Withheld |', '|---|---:|---:|---:|']
    for variant, scores in report['heldoutByVariant'].items():
        s = scores['updated']
        lines.append(f"| {variant} | {s['rawCorrect']}/{s['raw']['sampleCount']} ({percent(s['raw']['accuracy'])}) | "
                     f"{s['visible']['correct']}/{s['visible']['total']} | {s['visible']['withheld']} |")
    lines += ['', '## Concepts represented in held-out examples', '',
              '| Concept | Examples | Raw correct | Correct shown |', '|---|---:|---:|---:|']
    for concept in report['heldoutByConcept'].values():
        s = concept['scores']['updated']
        lines.append(f"| {concept['name']} | {s['raw']['sampleCount']} | {s['rawCorrect']} ({percent(s['raw']['accuracy'])}) | {s['visible']['correct']} |")
    changes = report['heldoutChanges']
    lines += ['', '## Change from previous model', '',
              f"The updated model changed {changes['rawChanged']} raw labels and {changes['visibleChanged']} shown labels "
              f"on these 71 examples. It fixed {changes['rawFixed']} and regressed {changes['rawRegressed']} "
              'relative to the AI reference. Training did not establish an improvement on this test.']
    lines += ['', '## Interpretation and limits', '', *['- ' + item for item in report['limitations']], '',
              'Per-example inputs, AI evidence and both full predictions are in decisions.json. Model and dataset hashes are in report.json. No training, promotion or application changes occurred.']
    (args.output / 'RESULTS.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps({'heldout': report['heldout'], 'changes': report['heldoutChanges'],
                      'byVariant': report['heldoutByVariant'], 'output': str(args.output)}, indent=2))


if __name__ == '__main__':
    main()
