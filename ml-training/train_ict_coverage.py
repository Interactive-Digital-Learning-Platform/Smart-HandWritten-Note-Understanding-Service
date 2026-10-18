"""Train a separate, disabled ICT pilot. Never replace Science or History."""
import argparse
from collections import Counter
import itertools
import json
from pathlib import Path
import shutil
import sys
import time

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'src'))
import numpy as np
from threadpoolctl import threadpool_limits
from smart_note_training.english_coverage import LABELS, fit_classifier, sha, write_json
from smart_note_training.history_semantic import FrozenEncoder, semantic_spans
from smart_note_training.ict_coverage import ICTFeatures, ICTPredictor, FEATURES, POLICY
from smart_note_training.metrics import classification_metrics
from ict_review_intake import load_review, PACKET, FREEZE
from ict_synthetic_material import GROUPS, generated


def summarize(rows, predictions):
    actual = [LABELS.index(r['label']) for r in rows]
    raw = [LABELS.index(p['rawModelStatus']) for p in predictions]
    accepted = [i for i,p in enumerate(predictions) if p['suggestedStatus'] is not None]
    complete = [i for i,p in enumerate(predictions) if p['suggestedStatus'] == 'present']
    return dict(raw=classification_metrics(actual, raw),
        finalCorrect=sum(p['suggestedStatus'] == r['label'] for r,p in zip(rows,predictions)), total=len(rows),
        withheld=len(rows)-len(accepted), accepted=len(accepted),
        completeSuggestions=len(complete), falseCompleteIds=[rows[i]['recordId'] for i in complete if actual[i] != 0],
        independentAccuracyClaimAllowed=False)


def run(review_file, output):
    start = time.perf_counter()
    review, audit = load_review(review_file)
    if any(c['criterionReview'] != 'approve' for c in review['concepts']):
        raise ValueError('Resolve requested criterion changes before fitting this pilot')
    out = Path(output)
    out.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(review_file, out / 'submitted-original.json')
    write_json(out / 'review-audit.json', audit)
    write_json(out / 'review-normalized.json', review)
    concepts = []
    for i, original in enumerate(review['concepts']):
        concept = {k: original[k] for k in ['id', 'name', 'grade', 'unitNumber', 'sourceReferences']}
        concept['points'] = [{**point, 'groups': GROUPS[i][j]} for j,point in enumerate(original['points'])]
        concept['scopeNote'] = 'Assess the explicitly selected criteria only; not an official marking scheme.'
        if concept['id'].endswith('secondary'):
            concept['scopeNote'] += ' Use this criterion only when an explanation AND an example are required.'
        concepts.append(concept)
    rubrics = dict(subject='ICT', language='English', concepts=concepts, humanApproved=False,
                   provenance='Source-backed AI-authored criteria with submitted AI-assisted provisional review')
    rows = generated(rubrics)
    train = [r for r in rows if r['split'] == 'train']
    val = [r for r in rows if r['split'] == 'validation']
    development = [dict(recordId=r['id'], conceptId=r['conceptId'], text=r['text'], label=r['reviewedLabel'])
                   for r in review['examples'] if r['reviewedLabel'] != 'uncertain']
    identities = lambda subset: {(r['conceptId'], r['text']) for r in subset}
    if identities(train) & identities(val) or identities(train) & identities(development):
        raise ValueError('Exact input overlap across fit and development/validation')
    if identities(val) & identities(development):
        raise ValueError('Exact validation/development overlap')
    write_json(out / 'rubrics.json', rubrics)
    write_json(out / 'generated-examples.json', dict(synthetic=True, independentStudents=False, examples=rows))
    sources = [Path(__file__), ROOT / 'ict_review_intake.py', ROOT / 'ict_synthetic_material.py',
               ROOT / 'src/smart_note_training/ict_coverage.py', ROOT / 'src/smart_note_training/english_coverage.py',
               ROOT / 'src/smart_note_training/history_coverage.py', ROOT / 'src/smart_note_training/history_coverage_v31.py',
               ROOT / 'src/smart_note_training/history_semantic.py', ROOT / 'src/smart_note_training/metrics.py',
               ROOT / 'encoders/minilm-l6-v2/encoder-manifest.json', PACKET, FREEZE]
    protocol = dict(experimentId=out.name, synthetic=True, independentHumanValidation=False,
        trainCount=len(train), validationCount=len(val), submittedDevelopmentCount=len(development),
        trainLabelCounts=dict(Counter(r['label'] for r in train)), validationLabelCounts=dict(Counter(r['label'] for r in val)),
        submittedLabelsFitted=False, submittedExamplesPreviouslyExposed=True,
        split='Paraphrase families 0-3 train; authored family 4 validation. This is NOT independent author or template isolation.',
        leakageLimit='Same source criteria and AI author across splits. Near-paraphrase and generative-template leakage remain.',
        selection='Fewest validation false-Complete predictions, then macro-F1, balanced accuracy, smaller C. C in .01,.1,1,10.',
        scope='10 concepts in Grade 10 units 2/5 and Grade 11 unit 3; explicit concept selection required',
        knowledgeBaseIngested=False, automaticUseEnabled=False, deploymentApproved=False,
        genuineHeldOutTestAvailable=False, realHandwritingAvailable=False,
        originalReviewSha256=sha(review_file), sourceHashes={str(p): sha(p) for p in sources},
        sourcePdfHashes=json.loads(PACKET.read_text(encoding='utf-8'))['sourceHashes'],
        generatedDataSha256=sha(out / 'generated-examples.json'), rubricsSha256=sha(out / 'rubrics.json'))
    write_json(out / 'protocol.json', protocol)
    encoder = FrozenEncoder(ROOT / 'encoders/minilm-l6-v2/encoder-manifest.json', out / 'embedding-cache')
    inputs = [p['text'] for c in concepts for p in c['points']]
    # Development inputs are encoded only after model selection below.
    for row in train + val:
        inputs.extend(quote for _,_,quote in semantic_spans(row['text']))
    print(json.dumps(dict(train=len(train), validation=len(val), uniqueEmbeddingInputs=len(set(inputs)))), flush=True)
    encoder.prime(inputs)
    extractor = ICTFeatures(rubrics, encoder).fit(train)
    x, v = extractor.transform(train), extractor.transform(val)
    counts = Counter(r['label'] for r in train)
    weights = [len(train)/(3*counts[r['label']]) for r in train]
    choices, scores = {}, {}
    for c in [.01, .1, 1., 10.]:
        scaler, classifier = fit_classifier(x, [LABELS.index(r['label']) for r in train], weights, c)
        prediction = classifier.predict(scaler.transform(v)).tolist()
        metric = classification_metrics([LABELS.index(r['label']) for r in val], prediction)
        metric['falseCompleteCount'] = sum(p == 0 and r['label'] != 'present' for p,r in zip(prediction,val))
        choices[c] = scaler, classifier
        scores[str(c)] = metric
    selected = max(choices, key=lambda c: (-scores[str(c)]['falseCompleteCount'], scores[str(c)]['macroF1'], scores[str(c)]['balancedAccuracy'], -c))
    scaler, classifier = choices[selected]
    artifact = dict(schemaVersion=1, modelType='ict_minilm_rubric_logistic_regression', features=FEATURES,
        labels=list(LABELS), **extractor.export(), scalerMean=scaler.mean_.tolist(), scalerScale=scaler.scale_.tolist(),
        weights=classifier.coef_.tolist(), intercept=classifier.intercept_.tolist(), reviewPolicy=POLICY,
        encoder=dict(repoId=encoder.manifest['repoId'], revision=encoder.manifest['revision'], fineTuned=False),
        metadata=dict(experimentId=out.name, selectedC=selected, reviewRequired=True, enabledByDefault=False,
            synthetic=True, independentHumanValidation=False, protocolSha256=sha(out / 'protocol.json')))
    write_json(out / 'model.json', artifact)
    model = ICTPredictor(json.loads((out / 'model.json').read_text(encoding='utf-8')), encoder)
    parity = float(np.abs(model.probabilities(x) - classifier.predict_proba(scaler.transform(x))).max())
    if parity > 1e-10:
        raise ValueError('Portable classifier reload mismatch')
    write_json(out / 'selection-frozen.json', dict(selectedC=selected, modelSha256=sha(out / 'model.json'),
        selection=scores, submittedLabelsUsedForSelection=False))
    decisions, results = [], {}
    for name, subset in [('syntheticValidation', val), ('submittedAiReviewedDevelopment', development)]:
        predictions = [model.predict(r['text'], r['conceptId'], 'English', True) for r in subset]
        results[name] = summarize(subset, predictions)
        for row,prediction in zip(subset,predictions):
            for point in prediction['evidence']['points']:
                for field,left,right in [('candidateEvidence','start','end'), ('semanticCandidateEvidence','semanticStart','semanticEnd')]:
                    if row['text'][point[left]:point[right]] != point[field]:
                        raise ValueError('Evidence offset mismatch')
            for concern in prediction['evidence']['concerns']:
                if row['text'][concern['start']:concern['end']] != concern['quote']:
                    raise ValueError('Concern offset mismatch')
            decisions.append(dict(set=name, **row, prediction=prediction))
    majority = max(counts, key=counts.get)
    report = dict(selectedC=selected, trainCount=len(train), validationCount=len(val),
        modelSha256=sha(out / 'model.json'), parameterCount=int(classifier.coef_.size + classifier.intercept_.size),
        encoderFineTuned=False, evaluation=results,
        syntheticValidationMajorityBaseline=classification_metrics([LABELS.index(r['label']) for r in val], [LABELS.index(majority)]*len(val)),
        portableReloadMaxError=parity, elapsedSeconds=round(time.perf_counter()-start,2),
        independentAccuracyClaimAllowed=False, deploymentApproved=False, liveModelsChanged=False,
        knowledgeBaseIngested=False, humanValidationStillRequired=True)
    write_json(out / 'evaluation.json', report)
    write_json(out / 'decisions.json', decisions)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--review', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    with threadpool_limits(limits=2):
        run(args.review, args.output)
