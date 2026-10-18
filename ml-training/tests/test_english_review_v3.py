"""Test review plumbing using fixtures only; never predict the new review set."""
import hashlib
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from build_english_review_v3 import build, digest
from evaluate_english_review_v3 import score_review
from smart_note_training.english_coverage import load_rubrics, fit_classifier
from smart_note_training.english_coverage_v3 import CoverageFeaturesV3, export_v3
from train_english_coverage_v3 import policy_metrics


def write(path, value):
    path.write_text(json.dumps(value), encoding='utf-8')


@pytest.fixture
def fixture_review(tmp_path):
    cid = 'sci-g10-som-005'
    rows = [{'id': 'fixture-'+str(i), 'conceptId': cid, 'text': t, 'label': label}
            for i, (t, label) in enumerate([
                ('Atoms of one element have the same proton number but different neutron numbers and mass numbers.', 'present'),
                ('Isotopes have the same proton number.', 'partial'),
                ('Friction opposes sliding.', 'missing'),
                ('An ambiguous fixture excluded from scoring.', 'unclear')])]
    rubric_path = ROOT/'rubrics/english-science-coverage-v3.json'
    extractor = CoverageFeaturesV3(load_rubrics(rubric_path)).fit(rows[:3])
    scaler, classifier = fit_classifier(extractor.transform(rows[:3]), [0, 1, 2], [1, 1, 1], 10)
    model = tmp_path/'model.json'
    write(model, export_v3(extractor, scaler, classifier, {'experimentId': 'TEST FIXTURE ONLY'}))
    challenge = tmp_path/'challenge.json'
    write(challenge, {'examples': rows})
    output = tmp_path/'review'
    data = build(challenge, rubric_path, model, output)
    labels = {r['id']: r['label'] for r in rows}
    review = tmp_path/'submitted-fixture.json'
    write(review, {'schemaVersion': 1, 'packetVersion': data['version'], 'packetSha256': data['packetSha256'],
                   'completed': True, 'modelPredictionsShown': False, 'reviewer': 'TEST FIXTURE ONLY',
                   'answers': [{'id': e['id'], 'conceptId': cid, 'label': labels[e['id']],
                                'comment': 'Fixture ambiguity' if labels[e['id']]=='unclear' else ''} for e in data['examples']]})
    return model, output/'packet.json', review, tmp_path/'results'


def test_packet_is_blind_and_versioned_and_frozen(fixture_review):
    model, packet, _, _ = fixture_review
    p = json.loads(packet.read_text())
    assert p['version'] == 'english-coverage-human-review-v3'
    assert all(set(e)=={'id', 'conceptId', 'concept', 'text', 'requirements'} for e in p['examples'])
    identity = {k: v for k, v in p.items() if k!='packetSha256'}
    assert p['packetSha256']==hashlib.sha256(json.dumps(identity, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    manifest = json.loads(packet.with_name('frozen-evaluation.json').read_text())
    assert manifest['modelSha256']==digest(model) and manifest['packetFileSha256']==digest(packet)
    assert manifest['freshReviewScored'] is False
    assert len(manifest['inferenceSourceHashes'])>=5
    html = packet.with_name('index.html').read_text(encoding='utf-8')
    assert 'english-coverage-v3-human-review.json' in html and '__REVIEW_DATA__' not in html


def test_scores_fixture_only_and_excludes_unclear_without_refitting(fixture_review):
    model, packet, review, out = fixture_review
    before = digest(model)
    result = score_review(model, packet, review, out)
    assert result['reviewedCount']==4 and result['scoredCount']==3
    assert result['model']['accuracy']==1
    assert result['excludedUnclear']==[{'id': 'fixture-3', 'comment': 'Fixture ambiguity'}]
    assert not result['modelRefitted'] and not result['automaticDeployment']
    assert digest(model)==before
    assert (out/'submitted-human-review.json').read_bytes()==review.read_bytes()


def test_policy_reports_abstentions_in_denominator():
    full={'points':[{'pointId':'p','lexicalCoverage':1}], 'concerns':[]}
    incomplete={'points':[{'pointId':'p','lexicalCoverage':.5}], 'concerns':[]}
    result=policy_metrics([0,1,2],[0,0,2],[full,incomplete,incomplete])
    assert result['total']==3 and result['withheldCount']==1
    assert result['coverage']==2/3 and result['completeSuggestions']==1
    assert result['falseCompleteCount']==0 and result['completePrecision']==1
    assert result['acceptedOnlyMetrics']['sampleCount']==2
    assert policy_metrics([1],[0],[incomplete])['completePrecision'] is None


@pytest.mark.parametrize('kind', ['model', 'packet', 'source'])
def test_rejects_changed_frozen_inputs(fixture_review, kind):
    model, packet, review, out = fixture_review
    frozen_path = packet.with_name('frozen-evaluation.json')
    frozen = json.loads(frozen_path.read_text())
    if kind=='source':
        key = next(iter(frozen['inferenceSourceHashes']))
        frozen['inferenceSourceHashes'][key] = 'wrong'
    else:
        frozen['modelSha256' if kind=='model' else 'packetFileSha256'] = 'wrong'
    write(frozen_path, frozen)
    with pytest.raises(ValueError, match='frozen'):
        score_review(model, packet, review, out)
    assert not out.exists()
