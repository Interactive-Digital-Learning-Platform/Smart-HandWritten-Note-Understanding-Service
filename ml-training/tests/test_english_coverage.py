import copy
import json
from pathlib import Path
import sys

import numpy as np
import pytest

from smart_note_training.english_coverage import (CoverageFeatures,CoveragePredictor,contains,export_model,
    fit_classifier,load_rubrics,normalize,windows)

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from train_english_coverage import check_separation


@pytest.fixture
def rubrics():
    return load_rubrics(ROOT/'rubrics/english-science-coverage-v1.json')


@pytest.fixture
def trained(rubrics):
    rows=[
        {'conceptId':'sci-g10-som-005','text':'Isotopes have the same atomic number and protons but different neutrons and mass numbers.'},
        {'conceptId':'sci-g10-som-005','text':'Isotopes are the same element and have the same atomic number.'},
        {'conceptId':'sci-g10-som-005','text':'Friction opposes the sliding motion of two surfaces.'},
    ]
    ex=CoverageFeatures(rubrics).fit(rows);x=ex.transform(rows)
    sc,cl=fit_classifier(x,[0,1,2],[1.,1.,1.],1.)
    artifact=export_model(ex,sc,cl,{'experimentId':'test-fixture'})
    return ex,sc,cl,artifact,rows


def test_export_reload_preserves_predictions_and_exact_evidence(trained):
    ex,sc,cl,artifact,rows=trained
    predictor=CoveragePredictor(json.loads(json.dumps(artifact)))
    text='--- Page 1 ---\nIsotopes have the same proton count.\n--- Page 2 ---\nThey have different neutrons and mass numbers.'
    fresh=[{'conceptId':rows[0]['conceptId'],'text':text}]
    np.testing.assert_allclose(predictor.probabilities(predictor.extractor.transform(fresh)),cl.predict_proba(sc.transform(ex.transform(fresh))),atol=1e-12)
    result=predictor.predict(text,rows[0]['conceptId'],scope_confirmed=True)
    assert result['reviewRequired'] and result['status'] is None
    assert result['scoresCalibrated'] is False
    for e in result['evidence']:
        assert text[e['start']:e['end']]==e['candidateEvidence']
        assert not e['semanticCorrectnessVerified']


def test_combines_complementary_pages_without_cross_page_chunks(trained):
    ex,*_=trained
    one='Isotopes have the same proton count and atomic number.'
    both=one+'\n--- Page 2 ---\nThey contain different neutrons and have different mass numbers.'
    x,_=ex.one(one,'sci-g10-som-005');y,_=ex.one(both,'sci-g10-som-005')
    assert y[4]>x[4]
    assert all('--- Page' not in t for _,_,t in windows(both))


def test_numeric_decimal_and_final_unpunctuated_line_survive():
    text='Current is 0.5 A and voltage is 12.0 V.\nV = IR\nFinal line without punctuation'
    chunks=windows(text)
    assert any('0.5 A' in t and '12.0 V' in t for _,_,t in chunks)
    assert any('Final line without punctuation' in t for _,_,t in chunks)


def test_word_boundaries_do_not_match_embedded_words():
    assert not contains(normalize('current travels inside wire'),'r')
    assert not contains(normalize('asexual reproduction'),'sexual')
    assert contains(normalize('The n-type material has electrons'),'n type')


def test_scope_and_language_checks_do_not_force_missing(trained):
    model=CoveragePredictor(trained[3])
    assert model.predict('This is a short upload.','sci-g10-som-005')['suggestedStatus'] is None
    with pytest.raises(ValueError,match='English'):model.predict('Some text','sci-g10-som-005',language='Sinhala',scope_confirmed=True)
    with pytest.raises(ValueError,match='unsupported'):model.predict('Some text','unsupported-concept',scope_confirmed=True)
    with pytest.raises(ValueError,match='nonempty'):model.predict('  ','sci-g10-som-005',scope_confirmed=True)


def test_holdout_words_and_labels_do_not_enter_fitted_vocabulary(rubrics):
    rows=[{'conceptId':'sci-g10-som-005','text':'Some atoms differ in mass.','targetLabel':'secretlabeltoken','reviewReason':'secretlabeltoken'}]
    ex=CoverageFeatures(rubrics).fit(rows)
    ex.one('validationonlyword secretlabeltoken','sci-g10-som-005')
    assert 'validationonlyword' not in ex.word.vocabulary_
    assert 'secretlabeltoken' not in ex.word.vocabulary_


@pytest.mark.parametrize('field,value',[('group','student1'),('noteGroupId','note1'),('text','original text')])
def test_rejects_student_note_and_exact_text_leakage(field,value):
    train=[{'split':'train','group':'student1','noteGroupId':'note1','text':'original text'}]
    validation=[{'split':'validation','group':'student2','noteGroupId':'note2','text':'new text',field:value}]
    with pytest.raises(ValueError,match='leakage'):check_separation(train,validation)


def test_rejects_test_rows_in_training_or_validation():
    row={'split':'test','group':'student1','noteGroupId':'note1','text':'test data'}
    with pytest.raises(ValueError,match='non-training'):check_separation([row],[])
    with pytest.raises(ValueError,match='validation only'):check_separation([], [row])


def test_rejects_nonfinite_or_wrong_dimension_artifact(trained):
    a=copy.deepcopy(trained[3]);a['weights'][0][0]=float('nan')
    with pytest.raises(ValueError,match='parameters'):CoveragePredictor(a)
    a=copy.deepcopy(trained[3]);a['scalerScale']=[1.]
    with pytest.raises(ValueError,match='dimensions'):CoveragePredictor(a)
