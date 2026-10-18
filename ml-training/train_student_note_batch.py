"""Offline, prior-anchored updates to the existing Science/History linear heads.

No new LLM calls, encoder fine-tuning, runtime file writes or automatic promotion.
AI labels are weak training labels; only explicitly reviewed held-out labels score
the candidate. Existing rubric features and review policies are retained.
"""
import argparse
from collections import Counter
import copy
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'src'))
LABELS = ('present', 'partial', 'missing')
BASE = {
    'science': ROOT.parent / 'models/english-coverage-v3.1.json',
    'history': ROOT / 'outputs/history-coverage-v5.1-review-policy-2026-10-15/model.json',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_batch(dataset, reviews=None):
    raw = Path(dataset).read_bytes()
    data = json.loads(raw)
    manifest = json.loads(Path(dataset).with_name('manifest.json').read_text(encoding='utf-8'))
    if (data.get('schemaVersion') != 'notes-ai-training-v1' or
            manifest.get('datasetSha256') != sha(raw) or
            manifest.get('rowCount') != len(data.get('rows', [])) or
            manifest.get('modelHashes') != data.get('modelHashes')):
        raise ValueError('Dataset manifest mismatch')
    review = {}
    if reviews:
        doc = json.loads(Path(reviews).read_text(encoding='utf-8-sig'))
        if doc.get('schemaVersion') != 'notes-human-review-v1' or doc.get('datasetSha256') != sha(raw):
            raise ValueError('Reviews belong to a different dataset')
        for row in doc['rows']:
            if row['recordId'] in review or row.get('humanLabel') not in LABELS or row.get('split') not in ('train', 'holdout') or type(row.get('confirmed')) is not bool:
                raise ValueError('Invalid or duplicate review row')
            review[row['recordId']] = row
    ids = set()
    for row in data['rows']:
        if (not row.get('recordId') or row['recordId'] in ids or row.get('teacherLabel') not in LABELS or
                row.get('labelSource') != 'ai_teacher' or row.get('humanReviewed') is not False or
                row.get('subject') not in BASE or not row.get('noteGroupId') or
                not isinstance(row.get('text'), str) or not row['text'].strip() or
                not isinstance(row.get('modelInputText'), str) or not row['modelInputText'].strip() or
                not .7 <= row.get('teacherConfidence', -1) <= 1):
            raise ValueError('Invalid training row')
        ids.add(row['recordId'])
        normalized = ' '.join(row['text'].lower().split())
        if sha(normalized.encode()) != row.get('textSha256'):
            raise ValueError('Note text hash mismatch')
    if set(review) - ids:
        raise ValueError('Unknown record in review file')
    # Connected components keep note fragments and repeated complete texts together.
    parent = {}
    def find(key):
        parent.setdefault(key, key)
        if parent[key] != key:
            parent[key] = find(parent[key])
        return parent[key]
    for row in data['rows']:
        a, b = find('note:' + row['noteGroupId']), find('text:' + row['textSha256'])
        parent[a] = b
        if row.get('sourceFamilyId'):
            if not isinstance(row['sourceFamilyId'], str):
                raise ValueError('Invalid source family')
            parent[find('note:' + row['noteGroupId'])] = find('family:' + row['sourceFamilyId'])
    held = {find('note:' + row['noteGroupId']) for row in data['rows']
            if review.get(row['recordId'], {}).get('split') == 'holdout'}
    prepared = []
    for row in data['rows']:
        r = dict(row)
        checked = review.get(row['recordId'], {})
        r['group'] = find('note:' + row['noteGroupId'])
        r['split'] = 'holdout' if r['group'] in held else 'train'
        r['humanConfirmed'] = checked.get('confirmed') is True
        r['targetLabel'] = checked['humanLabel'] if r['humanConfirmed'] else r['teacherLabel']
        r['weight'] = 1. if r['humanConfirmed'] else .25
        prepared.append(r)
    return data, prepared, sha(raw)


def readiness(rows, subject):
    rows = [r for r in rows if r['subject'] == subject]
    train = [r for r in rows if r['split'] == 'train']
    held = [r for r in rows if r['split'] == 'holdout' and r['humanConfirmed']]
    counts = Counter(r['targetLabel'] for r in train)
    blockers = []
    if len(train) < 30:
        blockers.append('Need at least 30 training concept examples')
    if len({r['group'] for r in train}) < 5:
        blockers.append('Need at least five different training note groups')
    if any(counts[label] < 5 for label in LABELS):
        blockers.append('Need at least five training examples of each label')
    return train, held, {'trainingRows': len(train), 'trainingNoteGroups': len({r['group'] for r in train}),
                        'classCounts': dict(counts), 'humanReviewedTrainingRows': sum(r['humanConfirmed'] for r in train),
                        'aiLabelledTrainingRows': sum(not r['humanConfirmed'] for r in train),
                        'reviewedHoldoutRows': len(held), 'trainingBlockers': blockers}


def anchored_fit(x, targets, sample_weights, base_weights, base_bias, prior_strength=1.):
    import numpy as np
    from scipy.optimize import minimize
    from scipy.special import logsumexp, softmax
    if not np.isfinite(prior_strength) or prior_strength<=0:
        raise ValueError('Prior strength must be positive and finite')
    prior = np.concatenate([base_weights.ravel(), base_bias])
    n_features = x.shape[1]
    counts = np.bincount(targets, weights=sample_weights, minlength=3)
    if (counts == 0).any():
        raise ValueError('All three classes are required')
    balanced = np.minimum(sample_weights.sum() / (3 * counts), 5.)
    weights = sample_weights * balanced[targets]
    def objective(theta):
        w, b = theta[:3*n_features].reshape(3, n_features), theta[3*n_features:]
        logits = x @ w.T + b
        loss = ((logsumexp(logits, axis=1) - logits[np.arange(len(x)), targets]) * weights).sum() / len(x)
        delta = theta - prior
        penalty = .5 * prior_strength * (delta @ delta)
        residual = softmax(logits, axis=1)
        residual[np.arange(len(x)), targets] -= 1
        residual *= weights[:, None] / len(x)
        gradient = np.concatenate([(residual.T @ x).ravel(), residual.sum(axis=0)]) + prior_strength*delta
        return loss + penalty, gradient
    fitted = minimize(objective, prior, jac=True, method='L-BFGS-B', options={'maxiter': 500, 'ftol': 1e-10})
    if not fitted.success or not np.isfinite(fitted.x).all():
        raise ValueError('Candidate head did not converge')
    return fitted.x[:3*n_features].reshape(3, n_features), fitted.x[3*n_features:]


def training_weights(rows):
    """Synthetic page variants share their notebook's weight, rather than count as new authors."""
    from collections import defaultdict
    grouped=defaultdict(list)
    for i,r in enumerate(rows):grouped[r['noteGroupId']].append(i)
    weights=[r['weight'] for r in rows]
    for indexes in grouped.values():
        synthetic=[i for i in indexes if rows[i].get('synthetic') and rows[i].get('variant')]
        if not synthetic:continue
        whole=[i for i in synthetic if rows[i]['variant']=='whole']
        pages=[i for i in synthetic if rows[i]['variant']!='whole']
        scale=len(rows)/len(grouped)
        for i in whole:weights[i]*=scale*(.5 if pages else 1)/len(whole)
        for i in pages:weights[i]*=scale*(.5 if whole else 1)/len(pages)
    return weights


def predictor(subject, artifact, encoder=None):
    if subject == 'science':
        from smart_note_training.english_coverage_v31 import CoveragePredictorV31
        return CoveragePredictorV31(artifact)
    from smart_note_training.history_semantic_review import ReviewedSemanticPredictor
    return ReviewedSemanticPredictor(artifact, encoder)


def evaluate(model, rows):
    from smart_note_training.metrics import classification_metrics
    predictions = [model.predict(r['modelInputText'], r['conceptId'], 'English', True) for r in rows]
    raw = classification_metrics([LABELS.index(r['targetLabel']) for r in rows],
                                 [LABELS.index(p['rawModelStatus']) for p in predictions]) if rows else None
    return {'sampleCount':len(rows), 'rawModel': raw,
            'falseCompleteSuggestions': sum(p['suggestedStatus'] == 'present' and r['targetLabel'] != 'present'
                                            for r, p in zip(rows, predictions)) if rows else None,
            'withheldSuggestions': sum(p['suggestedStatus'] is None for p in predictions) if rows else None}, predictions


def run(args):
    import numpy as np
    data, rows, dataset_sha = read_batch(args.dataset, args.reviews)
    train, held, report = readiness(rows, args.subject)
    output = Path(args.output).resolve()
    if output.exists():
        raise ValueError('Output must be a fresh directory')
    output.mkdir(parents=True)
    report.update({'subject': args.subject, 'datasetSha256': dataset_sha,
                   'synthetic': data.get('synthetic') is True,
                   'liveModelChanged': False, 'deploymentApproved': False,
                   'independentStudentAccuracyClaimAllowed': False,
                   'evaluationMeaning': 'Agreement with human-reviewed model-rubric labels on withheld upload groups; author independence is not established.',
                   'confidenceMeaning': 'Teacher confidence is an uncalibrated filter, not an accuracy estimate.'})
    def save_report():
        (output/'report.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
        print(json.dumps(report, indent=2))
    if args.check_only or report['trainingBlockers']:
        report['candidateTrained'] = False
        save_report()
        return
    base_raw = BASE[args.subject].read_bytes()
    if sha(base_raw) != data['modelHashes'][args.subject]:
        raise ValueError('Frozen base differs from collection snapshot')
    artifact = json.loads(base_raw)
    concept_ids = {c['id'] for c in artifact['rubrics']['concepts']}
    if any(r['conceptId'] not in concept_ids for r in train+held):
        raise ValueError('Unsupported model concept')
    encoder = None
    if args.subject == 'history':
        from smart_note_training.history_semantic import FrozenEncoder
        encoder = FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json')
    base = predictor(args.subject, artifact, encoder)
    features = base.extractor.transform([{'text': r['modelInputText'], 'conceptId': r['conceptId']} for r in train])
    x = (features - base.mean) / base.scale
    if not np.isfinite(x).all():
        raise ValueError('Nonfinite features')
    w, b = anchored_fit(x, np.array([LABELS.index(r['targetLabel']) for r in train]),
                         np.array(training_weights(train)), base.weights, base.intercept, getattr(args,'prior_strength',1.))
    candidate = copy.deepcopy(artifact)
    candidate['weights'], candidate['intercept'] = w.tolist(), b.tolist()
    candidate['metadata'].update({'experimentId': output.name, 'enabledByDefault': False,
                                  'baseModelSha256': sha(base_raw), 'studentBatchSha256': dataset_sha,
                                  'trainingMethod': 'prior_anchored_linear_head_update', 'aiLabelWeight': .25,
                                  'humanLabelWeight': 1., 'syntheticPageWeighting':'Share notebook weight; half whole, half page variants when both exist',
                                  'priorStrength':getattr(args,'prior_strength',1.),
                                  'frozenFeaturesAndEncoder': True})
    model = predictor(args.subject, candidate, encoder)
    report['baselineHeldout'], _ = evaluate(base, held)
    report['candidateHeldout'], predictions = evaluate(model, held)
    # Preserve the already packaged demonstration cases; this is regression, not a benchmark.
    pack = json.loads((ROOT.parent/'packaging/coverage-verification.json').read_text(encoding='utf-8'))
    regression = []
    for case in pack['cases']:
        if case['subject'] != args.subject:
            continue
        request = case['input']
        text = request.get('noteText', request.get('text'))
        before = base.predict(text, request['conceptId'], 'English', True)
        after = model.predict(text, request['conceptId'], 'English', True)
        regression.append({'id': case['id'], 'unchanged': all(before[k] == after[k] for k in ('rawModelStatus', 'suggestedStatus'))})
    counts = Counter(r['targetLabel'] for r in held)
    gates = []
    if any(counts[label] < 5 for label in LABELS) or len({r['group'] for r in held}) < 3:
        gates.append('Need reviewed holdout with at least five examples per class from at least three note groups')
    if not held:
        gates.append('No human-reviewed held-out evaluation available')
    else:
        current, previous = report['candidateHeldout']['rawModel'], report['baselineHeldout']['rawModel']
        if current['macroF1'] < max(.75, previous['macroF1']):
            gates.append('Candidate macro-F1 must reach 0.75 and match or exceed baseline')
        if any(current['perClass'][label]['recall'] < .6 for label in LABELS):
            gates.append('Each class recall must reach 0.60')
        if report['candidateHeldout']['falseCompleteSuggestions']:
            gates.append('Candidate made false complete suggestions on reviewed holdout')
    if any(not r['unchanged'] for r in regression):
        gates.append('Existing presentation regression outputs changed')
    candidate_bytes = (json.dumps(candidate, indent=2)+'\n').encode('utf-8')
    report.update({'candidateTrained': True, 'baseModelSha256': sha(base_raw), 'candidateModelSha256': sha(candidate_bytes),
                   'regression': regression, 'promotionBlockers': gates, 'eligibleForDeploymentReview': not gates,
                   'trainingRowsUsed': [r['recordId'] for r in train], 'heldoutRowsScored': [r['recordId'] for r in held]})
    (output/'candidate-model.json').write_bytes(candidate_bytes)
    (output/'heldout-predictions.json').write_text(json.dumps([{'recordId':r['recordId'], 'label':r['targetLabel'], 'prediction':p} for r,p in zip(held,predictions)], indent=2)+'\n', encoding='utf-8')
    save_report()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', required=True)
    parser.add_argument('--reviews')
    parser.add_argument('--subject', choices=list(BASE), required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--check-only', action='store_true')
    parser.add_argument('--prior-strength', type=float, default=1.)
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):
        run(parser.parse_args())
