import json
from pathlib import Path
import pytest
from smart_note_training.history_coverage_v31 import HistoryPredictorV31
from smart_note_training.english_coverage import sha

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'outputs/history-coverage-v3.2-2026-10-15'


@pytest.fixture(scope='module')
def model():
    if not (OUT/'model.json').exists():pytest.skip('Requires locally trained V3.2 candidate')
    return HistoryPredictorV31(json.loads((OUT/'model.json').read_text(encoding='utf-8')))


@pytest.mark.parametrize('concept,text',[
 ('hist-g11-l02-c01','Its Indian Ocean sea-route position made Sri Lanka valuable to Britain. Trincomalee harbour provided strategic importance for naval security in the region around India.'),
 ('hist-g11-l04-c01','In 1833 the Colebrooke-Cameron reforms reorganized British colonial government and administration. Establishing councils and reshaping administrative divisions were part of the changes.'),
])
def test_reviewed_complete_paraphrases_are_recognized(model,concept,text):
    p=model.predict(text,concept,'English',True)
    assert p['suggestedStatus']=='present'
    for e in p['evidence']['points']:
        assert text[e['start']:e['end']]==e['candidateEvidence']


@pytest.mark.parametrize('concept,text',[
 ('hist-g11-l02-c01','The British regarded Sri Lanka as important because of its location on Indian Ocean sea routes.'),
 ('hist-g11-l04-c01','The 1833 reforms reorganised British colonial government and administration.'),
])
def test_synonym_expansion_does_not_complete_single_facet_answers(model,concept,text):
    assert model.predict(text,concept,'English',True)['suggestedStatus']=='partial'


def test_keyword_dense_prompts_and_negation_do_not_become_complete(model):
    prompts='Explain the reforms of 1833 and reorganised colonial administration. Describe how councils were established and administrative divisions reshaped. I have not yet answered.'
    assert model.predict(prompts,'hist-g11-l04-c01','English',True)['suggestedStatus'] in ('missing',None)
    negative='Britain valued Sri Lanka for its position on Indian Ocean sea routes. Trincomalee harbour was not important for naval security around India.'
    assert model.predict(negative,'hist-g11-l02-c01','English',True)['suggestedStatus']!='present'


def test_wrong_date_retains_concern_and_does_not_become_complete(model):
    text='In 1933 the reforms reorganised British colonial administration. They created councils and revised administrative boundaries.'
    p=model.predict(text,'hist-g11-l04-c01','English',True)
    assert any(c['kind']=='possible_requirement_date_mismatch' for c in p['evidence']['concerns'])
    assert p['suggestedStatus']!='present'
    # Missing instead of Partial on this example is retained as a known failure
    # in new-paraphrase-checks.json; this safety check does not count it as correct.


def test_original_v31_model_and_review_are_preserved():
    assert sha(ROOT/'outputs/history-coverage-v3.1-2026-10-14/model.json')=='d54f2fc02be34f911e6a4ac36ed0fc1c6fec9159b94698606326d12ca3f8f68e'
    report=json.loads((ROOT/'outputs/history-v31-submitted-review-2026-10-15/evaluation.json').read_text(encoding='utf-8'))
    assert report['exactFinalMatches']==15 and report['totalIncludingWithheld']==18
    protocol=json.loads((OUT/'protocol.json').read_text(encoding='utf-8'))
    assert protocol['submittedHumanReviewDevelopmentCount']==18
    assert protocol['validationCount']==338
