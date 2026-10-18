import copy
import json
from pathlib import Path
import pytest
from smart_note_training.history_semantic_review import semantic_support_concerns,ReviewedSemanticPredictor
from smart_note_training.history_semantic import FrozenEncoder

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'outputs/history-coverage-v5.1-review-policy-2026-10-15'


def prediction(quote,requirement):
    return {'evidence':{'points':[{'pointId':'facet','requirement':requirement,'semanticCandidateEvidence':quote,'semanticStart':0,'semanticEnd':len(quote)}]}}


def test_heading_is_not_a_required_explanation():
    rubrics={'concepts':[{'name':'Buddhist revival and schooling'}]}
    concerns=semantic_support_concerns(prediction('Buddhist revival and schooling','Leaders organized revival activities.'),rubrics)
    assert concerns[0]['kind']=='semantic_candidate_is_heading'
    assert not semantic_support_concerns(prediction('Buddhist leaders organized religious and educational revival.','Leaders organized revival activities.'),rubrics)


@pytest.mark.parametrize('quote,required,flagged',[
 ('The British wanted influence over Kandy.','Kandy came under British rule in 1815.',True),
 ('Kandy came under British rule in 1815.','Kandy came under British rule in 1815.',False),
 ('Independence came in 1948.','The constitution of 1972 changed the framework.',True),
 ('Councils were established.','Councils were established.',False),
])
def test_required_dates_are_checked_in_the_actual_semantic_quote(quote,required,flagged):
    concerns=semantic_support_concerns(prediction(quote,required),{'concepts':[]})
    assert bool(concerns)==flagged
    assert all(c['quote']==quote and quote[c['start']:c['end']]==quote for c in concerns)


def test_four_audited_cases_are_withheld_without_relabelling_or_refitting():
    if not (OUT/'model.json').exists():pytest.skip('Requires locally prepared policy candidate')
    artifact=json.loads((OUT/'model.json').read_text(encoding='utf-8'))
    parent=json.loads((ROOT/'outputs/history-coverage-v5-semantic-core-2026-10-15/model.json').read_text(encoding='utf-8'))
    for key in ('features','weights','intercept','scalerMean','scalerScale','vectorizers','rubrics'):
        assert artifact[key]==parent[key]
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    model=ReviewedSemanticPredictor(artifact,encoder)
    rows=json.loads((OUT/'exposedSyntheticTest.json').read_text(encoding='utf-8'))['examples']
    bad=[e for e in rows if e['predictions']['v5']['suggestedStatus']=='present' and e['expectedLabel']!='present']
    assert len(bad)==4
    for e in bad:
        p=model.predict(e['text'],e['conceptId'],'English',True)
        assert p['rawModelStatus']=='present' and p['suggestedStatus'] is None
        assert p['completeSuggestionWithheld'] and p['suggestionWithheld']


def test_correct_complete_recall_unchanged_in_recorded_comparisons():
    if not (OUT/'evaluation.json').exists():pytest.skip('Requires locally evaluated policy candidate')
    report=json.loads((OUT/'evaluation.json').read_text(encoding='utf-8'))
    for scores in report['sets'].values():assert scores['v5']['completeRecall']==scores['v51']['completeRecall']
