import json
from pathlib import Path
import pytest
from smart_note_training.history_coverage import HistoryPredictor,source_role_conflicts

ROOT=Path(__file__).resolve().parents[1]
MODEL=ROOT/'outputs/history-coverage-v2-2026-10-14/model.json'

@pytest.fixture
def model():
    if not MODEL.exists():pytest.skip('Requires locally trained History V2 artifact')
    return HistoryPredictor(json.loads(MODEL.read_text(encoding='utf-8')))

def test_role_checks_are_scoped_to_the_source_classification_target():
    text='Coins and buildings are literary sources.'
    assert source_role_conflicts(text,'hist-g10-l01-c01')
    assert not source_role_conflicts(text,'hist-g10-l01-c06')
    assert not source_role_conflicts('Coins and buildings are not literary sources.','hist-g10-l01-c01')
    assert not source_role_conflicts('Literary sources are books. Archaeological sources include coins.','hist-g10-l01-c01')

def test_complete_policy_and_unicode_evidence(model):
    text='Revision 📚\nSources give evidence about the past. Books and documents are literary sources. Coins and buildings are archaeological remains.'
    p=model.predict(text,'hist-g10-l01-c01','English',True)
    assert p['reviewRequired'] is True
    for e in p['evidence']['points']+p['evidence']['concerns']:
        quote=e.get('candidateEvidence',e.get('quote'))
        assert text[e['start']:e['end']]==quote
    bad='Sources provide evidence about the past. Coins and buildings are literary sources. Books are archaeological remains.'
    result=model.predict(bad,'hist-g10-l01-c01','English',True)
    assert result['evidence']['concerns']
    assert result['suggestedStatus']!='present'
    if result['rawModelStatus']=='present':assert result['completeSuggestionWithheld'] is True and result['suggestedStatus'] is None

def test_scope_and_artifact_validation(model):
    with pytest.raises(ValueError):model.predict('History text','hist-g10-l01-c01','English',False)
    with pytest.raises(ValueError):model.predict('History text','hist-g10-l01-c01','Sinhala',True)
    corrupted=dict(model.artifact);corrupted['weights']=[[0]]
    with pytest.raises(ValueError):HistoryPredictor(corrupted)

def test_original_ai_review_cases_keep_training_and_validation_provenance():
    protocol=json.loads((MODEL.parent/'protocol.json').read_text(encoding='utf-8'))
    assert protocol['trainOriginalCount']==721
    assert protocol['trainReviewedDiagnosticCount']==16
    assert len(protocol['adjudicationExcluded'])==2
    assert protocol['validationCount']==338
    assert protocol['independentHumanReview'] is False
