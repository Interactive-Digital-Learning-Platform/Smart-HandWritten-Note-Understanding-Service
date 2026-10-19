"""Practical behavior, model integrity and provenance of the History V6 release."""
import copy
import hashlib
import json
from pathlib import Path
import numpy as np
import pytest
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.history_grounded_core import GroundedSignedKernelPredictor,positive_assertion_features

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/'outputs/history-coverage-v6-grounded-2026-10-18-r2'


@pytest.fixture(scope='module')
def runtime():
    artifact=json.loads((RELEASE/'model.json').read_bytes())
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    encoder.cache_dir=None
    return GroundedSignedKernelPredictor(artifact,encoder),encoder


@pytest.mark.parametrize('text,concept',[
    ('Please bring your history textbook to class tomorrow. The books belong on the shelf.','hist-g10-l01-c01'),
    ('Cotton cloth was in great demand. Spinning machines and weaving increased textile output.','hist-g11-l01-c03'),
    ('The Kandyan kingdom never came under British rule in 1815. Its monarchy did not end and Britain never controlled the whole island.','hist-g11-l02-c04'),
])
def test_related_mentions_and_denied_facts_do_not_become_coverage(runtime,text,concept):
    model,_=runtime
    assert model.predict(text,concept,'English',True)['suggestedStatus']=='missing'


def test_actual_model_returns_all_three_classes_and_exact_unicode_quotes(runtime):
    model,_=runtime
    cases=[('present','📖 Historians use sources as evidence of past human life. Books and written documents are literary sources. Archaeological sources include physical remains such as coins, buildings and inscriptions.'),
        ('partial','📖 Archaeological remains such as coins and buildings supply evidence about past human activity.'),
        ('missing','📖 What are historical sources? Describe literary and archaeological sources. Answer later.')]
    for expected,text in cases:
        result=model.predict(text,'hist-g10-l01-c01','English',True)
        assert result['suggestedStatus']==expected
        assert result['reviewRequired'] and not result['scoresCalibrated'] and result['status'] is None
        for p in result['evidence']['points']:
            assert text[p['start']:p['end']]==p['candidateEvidence']
            assert text[p['semanticStart']:p['semanticEnd']]==p['semanticCandidateEvidence']
        for c in result['evidence']['concerns']:assert text[c['start']:c['end']]==c['quote']


def test_unclear_ocr_year_stays_reviewable(runtime):
    model,_=runtime
    text='📖 In l8l5 the Kandyan kingdom came under British rule. Its independent monarchy ended and Britain controlled the entire island.'
    result=model.predict(text,'hist-g11-l02-c04','English',True)
    assert result['suggestedStatus'] is None and result['suggestionWithheld']
    assert any(c['kind']=='possible_ocr_year_ambiguity' for c in result['evidence']['concerns'])


@pytest.mark.parametrize('text,concept,lang,confirmed',[
    ('','hist-g10-l01-c01','English',True),('text','unknown','English',True),
    ('text','hist-g10-l01-c01','English',False),('text','hist-g10-l01-c01','English','true'),
    ('සිංහල','hist-g10-l01-c01','English',True),('text','hist-g10-l01-c01',None,True),
])
def test_invalid_inputs_fail_before_inference(runtime,text,concept,lang,confirmed):
    with pytest.raises(ValueError):runtime[0].predict(text,concept,lang,confirmed)


def test_malformed_model_parameters_and_changed_rubrics_are_rejected(runtime):
    artifact=runtime[0].artifact
    class Encoder:
        manifest={'revision':artifact['encoder']['revision']}
    variants=[]
    bad=copy.deepcopy(artifact);bad['heads'][0]['supportVectors'][0].pop();variants.append(bad)
    bad=copy.deepcopy(artifact);bad['heads'][0]['gamma']=-1;variants.append(bad)
    bad=copy.deepcopy(artifact);bad['heads'][0]['dualCoefficients'][0]=float('nan');variants.append(bad)
    bad=copy.deepcopy(artifact);bad['rubrics']['concepts'][0]['name']='Changed rubric';variants.append(bad)
    for bad in variants:
        with pytest.raises(ValueError):GroundedSignedKernelPredictor(bad,Encoder())


def test_positive_assertions_are_not_erased_by_an_adjacent_denial(runtime):
    model,encoder=runtime
    concept=model.extractor.grounded.concepts['hist-g10-l01-c01']
    denied='It is not true that sources provide evidence of past human activity.'
    assert np.array_equal(positive_assertion_features(denied,concept,encoder),[0.,0.])
    mixed='Sources provide evidence of past human activity. It is not true that books are physical archaeological remains.'
    assert positive_assertion_features(mixed,concept,encoder).max()>0


def test_release_scores_are_not_reported_as_independent_student_accuracy():
    release=json.loads((RELEASE/'release.json').read_bytes())
    artifact=json.loads((RELEASE/'model.json').read_bytes())
    assert release['independentRealStudentAccuracy'] is False
    assert artifact['metadata']['assistantReviewFitted'] is True
    assert release['assistantReviewedTrainingCases']==50
    assert all(release['gates'].values()) and release['automaticHistoryEnabled'] is False
    protocol=json.loads((RELEASE/'protocol.json').read_bytes())
    assert hashlib.sha256((RELEASE/'model.json').read_bytes()).hexdigest()==protocol['modelSha256']
    for path,expected in protocol['sourceHashes'].items():
        # This tests the frozen V6 release, whose sources remain archived even
        # when the active Notes runtime advances to a later model version.
        assert hashlib.sha256((RELEASE/'source'/path).read_bytes()).hexdigest()==expected
    data=ROOT/'outputs/history-student-ef-labels-2026-10-18-02/dataset.json'
    assert hashlib.sha256(data.read_bytes()).hexdigest()=='5fe60e3fb4006ee8319a4276e6cf3f0ef29ea7e46801d283858badd30ea50dc1'
