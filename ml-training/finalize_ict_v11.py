"""Freeze a review-policy correction, retaining the original trained head."""
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'src'))
from smart_note_training.english_coverage import sha, write_json
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.ict_coverage_v11 import ICTPredictorV11, POLICY_V11
from train_ict_coverage import summarize


def main():
    parent = ROOT / 'outputs/ict-coverage-v1-2026-10-15'
    out = ROOT / 'outputs/ict-coverage-v1.1-2026-10-15'
    protocol = json.loads((parent / 'protocol.json').read_text(encoding='utf-8'))
    for file, expected in protocol['sourceHashes'].items():
        if sha(file) != expected:
            raise ValueError('Frozen V1 source changed')
    original = json.loads((parent / 'model.json').read_text(encoding='utf-8'))
    confirmation = json.loads((parent / 'owner-confirmation.json').read_text(encoding='utf-8'))
    if confirmation['originalReviewSha256'] != protocol['originalReviewSha256'] or not confirmation['ownerHumanReviewConfirmed']:
        raise ValueError('Owner confirmation does not bind to the reviewed file')
    out.mkdir(parents=True, exist_ok=False)
    artifact = json.loads(json.dumps(original))
    artifact['reviewPolicy'] = POLICY_V11
    artifact['metadata'].update(experimentId=out.name, parentModelSha256=sha(parent / 'model.json'), weightsRefitted=False)
    for key in ['weights','intercept','scalerMean','scalerScale','rubrics','vectorizers','encoder','features']:
        if artifact[key] != original[key]:
            raise ValueError('Weights or features changed')
    write_json(out / 'model.json', artifact)
    encoder = FrozenEncoder(ROOT / 'encoders/minilm-l6-v2/encoder-manifest.json', parent / 'embedding-cache')
    encoder.cache_dir = None
    predictor = ICTPredictorV11(artifact, encoder)
    prior = json.loads((parent / 'decisions.json').read_text(encoding='utf-8'))
    decisions, evaluations = [], {}
    for before, after in [('syntheticValidation','syntheticValidationDevelopment'),
                          ('submittedAiReviewedDevelopment','ownerConfirmedDevelopment')]:
        rows = [{k:r[k] for k in ['recordId','conceptId','text','label']} for r in prior if r['set'] == before]
        predictions = [predictor.predict(r['text'], r['conceptId'], 'English', True) for r in rows]
        for row, prediction in zip(rows,predictions):
            previous = next(r['prediction'] for r in prior if r['recordId'] == row['recordId'])
            if prediction['scores'] != previous['scores'] or prediction['rawModelStatus'] != previous['rawModelStatus']:
                raise ValueError('Policy fix changed model output')
            decisions.append(dict(set=after, **row, prediction=prediction))
        evaluations[after] = summarize(rows, predictions)
    sources = {**protocol['sourceHashes'], str(Path(__file__)): sha(__file__),
               str(ROOT / 'src/smart_note_training/ict_coverage_v11.py'): sha(ROOT / 'src/smart_note_training/ict_coverage_v11.py')}
    release = dict(modelSha256=sha(out / 'model.json'), encoderRevision=artifact['encoder']['revision'],
        sourceHashes=sources, parentModelSha256=sha(parent / 'model.json'), weightsRefitted=False,
        ownerConfirmationFile=str(parent / 'owner-confirmation.json'), ownerConfirmationSha256=sha(parent / 'owner-confirmation.json'),
        correction='Suppress a ROM-loss warning when the actual quote explicitly says does not lose.',
        developmentBasedPolicyChange=True, independentAccuracyEvaluation=False, automaticUseEnabled=False,
        knowledgeBaseIngested=False, deploymentApproved=False)
    write_json(out / 'release.json', release)
    write_json(out / 'decisions.json', decisions)
    report = dict(modelSha256=release['modelSha256'], weightsRefitted=False, ownerHumanReviewConfirmed=True,
        reviewWasAiAssisted=True, evaluation=evaluations, independentAccuracyClaimAllowed=False,
        sourceIngestionStillBlocked=True, liveModelsChanged=False, deploymentApproved=False)
    write_json(out / 'evaluation.json', report)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
