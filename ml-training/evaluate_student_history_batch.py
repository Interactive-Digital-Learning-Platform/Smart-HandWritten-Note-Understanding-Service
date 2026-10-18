"""Report baseline/candidate agreement with AI proposals on reserved source chapters.

AI agreement is a diagnostic, not human-reviewed accuracy or deployment approval.
This does not tune parameters, change labels, or alter the active model.
"""
import argparse
from collections import Counter
import json
from pathlib import Path

from train_student_note_batch import BASE, ROOT, read_batch, predictor, sha


def score_packet(args):
    """Unlabelled baseline audit; no reference answers or accuracy inferred."""
    raw = Path(args.packet).read_bytes()
    packet = json.loads(raw)
    model_raw = BASE['history'].read_bytes()
    if packet.get('schemaVersion') != 'synthetic-history-intake-v1' or packet['modelSha256'] != sha(model_raw):
        raise ValueError('Packet and frozen History model do not match')
    output = Path(args.output).resolve()
    if output.exists():
        raise ValueError('Choose a fresh output directory')
    output.mkdir(parents=True)
    from smart_note_training.history_semantic import FrozenEncoder, semantic_spans
    artifact = json.loads(model_raw)
    encoder = FrozenEncoder(ROOT / 'encoders/minilm-l6-v2/encoder-manifest.json', output / 'encoder-cache')
    chunks = {p['text'] for c in artifact['rubrics']['concepts'] for p in c['points']}
    chunks.update(quote for row in packet['examples'] for _, _, quote in semantic_spans(row['text']))
    encoder.prime(chunks)
    model = predictor('history', artifact, encoder)
    decisions = []
    for i, row in enumerate(packet['examples']):
        decisions.append({'recordId': row['recordId'], 'sourceFamilyId': row['sourceFamilyId'],
                          'textSha256': sha(row['text'].encode()),
                          'prediction': model.predict(row['text'], row['conceptId'], 'English', True)})
        if (i + 1) % 25 == 0:
            print(json.dumps({'baselineComplete': i + 1, 'total': len(packet['examples'])}), flush=True)
    (output / 'baseline-predictions.json').write_text(json.dumps(decisions, indent=2) + '\n', encoding='utf-8')
    report = {'packetSha256': sha(raw), 'modelSha256': sha(model_raw), 'examples': len(decisions),
              'suggestionCounts': dict(Counter(d['prediction']['suggestedStatus'] or 'withheld' for d in decisions)),
              'synthetic': True, 'accuracyMeasured': False, 'liveModelChanged': False}
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


def run(args):
    data, rows, dataset_hash = read_batch(args.dataset, args.splits)
    held = [r for r in rows if r['subject'] == 'history' and r['split'] == 'holdout']
    if not held:
        raise ValueError('No reserved evaluation examples')
    output = Path(args.output).resolve()
    if output.exists():
        raise ValueError('Choose a fresh output directory')
    base_raw, candidate_raw = BASE['history'].read_bytes(), Path(args.candidate).read_bytes()
    candidate_artifact = json.loads(candidate_raw)
    if (data['modelHashes']['history'] != sha(base_raw) or
            candidate_artifact['metadata']['studentBatchSha256'] != dataset_hash or
            candidate_artifact['metadata']['baseModelSha256'] != sha(base_raw)):
        raise ValueError('Models and dataset do not belong to the same experiment')
    output.mkdir(parents=True)
    from smart_note_training.history_semantic import FrozenEncoder, semantic_spans
    from smart_note_training.metrics import classification_metrics
    from smart_note_training.english_coverage import LABELS
    encoder = FrozenEncoder(ROOT / 'encoders/minilm-l6-v2/encoder-manifest.json', args.encoder_cache)
    encoder.cache_dir = None  # Reuse this batch's cache read-only, never the training cache.
    base_artifact = json.loads(base_raw)
    # Batch embedding public requirements and supplied synthetic text fragments only.
    chunks = {p['text'] for c in base_artifact['rubrics']['concepts'] for p in c['points']}
    chunks.update(quote for r in held for _, _, quote in semantic_spans(r['modelInputText']))
    encoder.prime(chunks)
    summary, all_predictions = {}, {}
    for name, artifact in [('baseline', base_artifact), ('candidate', candidate_artifact)]:
        model = predictor('history', artifact, encoder)
        predictions = []
        for i, row in enumerate(held):
            predictions.append(model.predict(row['modelInputText'], row['conceptId'], 'English', True))
            if (i + 1) % 25 == 0:
                print(json.dumps({'model': name, 'complete': i + 1, 'total': len(held)}), flush=True)
        matches = sum(r['targetLabel'] == p['suggestedStatus'] for r, p in zip(held, predictions))
        summary[name] = {
            'sampleCount': len(held), 'finalExactMatches': matches, 'finalTeacherAgreement': matches / len(held),
            'withheldSuggestions': sum(p['suggestedStatus'] is None for p in predictions),
            'falseCompleteSuggestions': sum(p['suggestedStatus'] == 'present' and r['targetLabel'] != 'present'
                                             for r, p in zip(held, predictions)),
            'rawTeacherAgreementMetrics': classification_metrics(
                [LABELS.index(r['targetLabel']) for r in held], [LABELS.index(p['rawModelStatus']) for p in predictions]),
            'perClassFinal': {label: {'examples': sum(r['targetLabel'] == label for r in held),
                'correct': sum(r['targetLabel'] == label and p['suggestedStatus'] == label for r, p in zip(held, predictions))}
                for label in LABELS},
        }
        all_predictions[name] = predictions
    report = {'datasetSha256': dataset_hash, 'baselineModelSha256': sha(base_raw), 'candidateModelSha256': sha(candidate_raw),
              'synthetic': True, 'humanReviewedRows': sum(r['humanConfirmed'] for r in held),
              'labelSource': 'AI proposals, not human-confirmed reference answers',
              'independentStudentAccuracyClaimAllowed': False, 'deploymentApproved': False,
              'evaluationMeaning': 'Diagnostic agreement on previously reserved synthetic source chapters. Withheld predictions count as non-matches. No parameter tuning or promotion is performed.',
              'reservedFamilies': sorted({r['sourceFamilyId'] for r in held}),
              'classCounts': dict(Counter(r['targetLabel'] for r in held)), **summary}
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    decisions = [{'recordId': r['recordId'], 'sourceFamilyId': r['sourceFamilyId'], 'teacherLabel': r['targetLabel'],
                  'baseline': all_predictions['baseline'][i], 'candidate': all_predictions['candidate'][i]}
                 for i, r in enumerate(held)]
    (output / 'decisions.json').write_text(json.dumps(decisions, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('dataset', 'splits', 'candidate', 'packet', 'encoder-cache'):
        parser.add_argument('--' + name)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if not args.packet and not all((args.dataset, args.splits, args.candidate)):
        parser.error('Provide --packet for baseline scoring, or --dataset --splits --candidate for comparison')
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):
        score_packet(args) if args.packet else run(args)
