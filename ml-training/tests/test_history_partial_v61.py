"""Known Partial/Missing regressions; these fixtures are not accuracy holdouts."""
import json
from pathlib import Path
import pytest
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.history_grounded_core import GroundedSignedKernelPredictor

ROOT=Path(__file__).resolve().parents[1]

@pytest.fixture(scope='module')
def model():
    artifact=json.loads((ROOT.parent/'runtime/coverage/models/history-coverage-v6.json').read_bytes())
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    encoder.cache_dir=None
    return GroundedSignedKernelPredictor(artifact,encoder)


@pytest.mark.parametrize('concept,text',[
    ('hist-g10-l01-c03','Some foreign writers visited Sri Lanka and described what they saw; other writers collected information from people who had been there.'),
    ('hist-g10-l01-c04','Historians analyse information from several sources critically and use the most credible evidence to reconstruct past events.'),
    ('hist-g10-l01-c03',"Travellers from abroad wrote about Sri Lanka's history and society. These accounts can help us understand the island's past."),
    ('hist-g10-l01-c04','A historian should analyse information from several accounts before selecting the most credible evidence about a past event.'),
    ('hist-g10-l01-c03','Writings left by overseas visitors tell historians about the customs of Sri Lanka in former times.'),
    ('hist-g10-l01-c04','To judge an account of an ancient event, historians weigh its claims against other records.'),
])
def test_meaningful_incomplete_source_explanations_are_partial(model,concept,text):
    p=model.predict(text,concept,'English',True)
    assert p['rawModelStatus']=='partial' and p['suggestedStatus']=='partial'
    assert p['reviewRequired'] and not p['scoresCalibrated'] and p['status'] is None
    for point in p['evidence']['points']:
        assert text[point['start']:point['end']]==point['candidateEvidence']
        assert text[point['semanticStart']:point['semanticEnd']]==point['semanticCandidateEvidence']


@pytest.mark.parametrize('concept,text',[
    ('hist-g10-l01-c03','Bring the book about foreign literary sources to history class tomorrow. Read the chapter and answer later.'),
    ('hist-g10-l01-c03','Foreign tourists booked hotels in Sri Lanka and enjoyed a holiday on the beach.'),
    ('hist-g10-l01-c03','No foreign writer ever recorded information about Sri Lankan history.'),
    ('hist-g10-l01-c04','Compare the prices of two exercise books before buying one for class.'),
    ('hist-g10-l01-c04','The police compared witness statements to investigate a road accident.'),
    ('hist-g10-l01-c04','Historians must never compare sources or check who produced them. All accounts should be accepted without critical analysis.'),
    ('hist-g10-l01-c03','Nobody from overseas ever left a written description of Sri Lanka in the past.'),
    ('hist-g10-l01-c03','Tomorrow we must read about travellers who wrote accounts of ancient Sri Lanka.'),
    ('hist-g10-l01-c04','The shopper weighed claims from different advertisements before buying a refrigerator.'),
])
def test_unrelated_reminders_and_denied_facts_do_not_become_partial(model,concept,text):
    assert model.predict(text,concept,'English',True)['suggestedStatus']=='missing'


def test_update_preserves_encoder_features_scaler_points_and_policy(model):
    old=json.loads((ROOT/'outputs/history-coverage-v6-grounded-2026-10-18-r2/model.json').read_bytes())
    new=model.artifact
    for key in old:
        if key not in ('heads','metadata'):assert new[key]==old[key]
    assert new['heads']!=old['heads']
    assert new['metadata']['independentAccuracyClaimAllowed'] is False
