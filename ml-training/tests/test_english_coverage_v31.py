import json
from pathlib import Path
import pytest
from smart_note_training.english_coverage_v31 import CoveragePredictorV31

ROOT=Path(__file__).resolve().parents[2]
MODEL=CoveragePredictorV31(json.loads((ROOT/'models/english-coverage-v3.1.json').read_text(encoding='utf-8')))
PREFIX='Benedict test for reducing sugars\nAdd Benedict solution to the food sample.\nHeat the mixture in a hot water bath.\n'
RESULT='A positive result changes blue to green, yellow,\norange or a brick-red precipitate.'

def predict(text):
    return MODEL.predict(text,'sci-g10-cbl-007','English',True)

def test_complete_procedure_keeps_original_quote_offsets():
    text=PREFIX+RESULT
    p=predict(text)
    assert p['suggestedStatus']=='present'
    for e in p['evidence']['points']:
        assert text[e['start']:e['end']]==e['candidateEvidence']

@pytest.mark.parametrize('separator',['\n','--- Page 2 ---\n','Biuret test:\n','Iodine test produces starch colours.\n','Another experiment:\n','The protein test follows.\n'])
def test_does_not_borrow_other_sections(separator):
    p=predict(PREFIX+separator+RESULT)
    assert p['suggestedStatus']!='present'
    assert 'result' in p['unsupportedRequiredPoints']

def test_heading_alone_cannot_lend_context():
    assert predict('Benedict\n'+RESULT)['suggestedStatus']!='present'

def test_partial_and_missing_remain_distinct():
    assert predict('Add Benedict solution to the food sample.')['suggestedStatus']=='partial'
    assert predict('Proteins consist of amino acids and repair tissues.')['suggestedStatus']=='missing'

def test_negated_result_is_not_promoted():
    assert predict(PREFIX+'There is no positive result and no brick-red precipitate.')['suggestedStatus']!='present'
