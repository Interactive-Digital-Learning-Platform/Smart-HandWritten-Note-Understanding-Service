import pytest
from smart_note_training.history_coverage_v31 import prompt_signals

@pytest.mark.parametrize('text',[
 'Which sources are literary? Which ones are archaeological? These questions remain unanswered.',
 'Explain the literary books and archaeological remains. I have not yet answered.',
 'Deepawamsa? Mahawamsa? Who wrote them? Revision checklist.',
 'What changed in 1833? Answer later.',
])
def test_unanswered_prompts(text):
    assert prompt_signals(text)[0]==1

@pytest.mark.parametrize('text',[
 'Which sources are literary? Books and documents are literary sources.',
 'What changed in 1833? The reforms reorganized colonial government and administrative divisions.',
 'Citizens should protect archaeological sources.',
 'Historical sources provide evidence about past human activity. Questions remain unanswered.',
])
def test_questions_and_notes_do_not_hide_answers(text):
    assert prompt_signals(text)[0]==0
    assert prompt_signals(text)[1]>0

def test_v31_policy_preserves_raw_model_output_and_exact_evidence():
    import json
    from pathlib import Path
    from smart_note_training.history_coverage_v31 import HistoryPredictorV31
    path=Path(__file__).resolve().parents[1]/'outputs/history-coverage-v3.1-2026-10-14/model.json'
    if not path.exists():pytest.skip('Requires trained local V3.1 candidate')
    model=HistoryPredictorV31(json.loads(path.read_text(encoding='utf-8')))
    prompt='Explain the earlier Deepawamsa chronicle from the fourth century. Describe Mahanama and the later writers of Mahawamsa. These tasks remain unanswered.'
    p=model.predict(prompt,'hist-g10-l01-c02','English',True)
    assert p['suggestedStatus'] in ('missing',None)
    assert any(e['kind']=='unanswered_prompts_only' for e in p['evidence']['concerns'])
    if p['rawModelStatus']!='missing':assert p['suggestionWithheld'] is True
    date='The Colebrooke-Cameron reforms of 1933 reorganized British colonial government. They established councils and reshaped administrative divisions.'
    result=model.predict(date,'hist-g11-l04-c01','English',True)
    assert any(e['kind']=='possible_requirement_date_mismatch' for e in result['evidence']['concerns'])
    assert result['suggestedStatus']!='present'
    for e in result['evidence']['points']+result['evidence']['concerns']:
        quote=e.get('candidateEvidence',e.get('quote'))
        assert date[e['start']:e['end']]==quote
