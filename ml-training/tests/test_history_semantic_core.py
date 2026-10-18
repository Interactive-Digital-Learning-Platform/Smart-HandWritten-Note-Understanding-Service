import copy
import json
from pathlib import Path
from types import SimpleNamespace
import pytest
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.history_semantic_core import CORE_FEATURES,SemanticCorePredictor
from smart_note_training.english_coverage import sha

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'outputs/history-coverage-v5-semantic-core-2026-10-15'


@pytest.fixture(scope='module')
def model():
    manifest=ROOT/'encoders/minilm-l6-v2/encoder-manifest.json'
    if not (OUT/'model.json').exists() or not manifest.exists():pytest.skip('Requires trained semantic-core candidate')
    encoder=FrozenEncoder(manifest,ROOT/'outputs/history-semantic-embedding-cache-v1')
    return SemanticCorePredictor(json.loads((OUT/'model.json').read_text(encoding='utf-8')),encoder)


def test_head_excludes_exact_word_coverage_and_validates_encoder(model):
    assert len(CORE_FEATURES)==13
    assert not any('point_match' in name or 'word_similarity' in name or 'char_similarity' in name for name in CORE_FEATURES)
    with pytest.raises(ValueError):SemanticCorePredictor(model.artifact,SimpleNamespace(manifest={'revision':'wrong'}))
    artifact=copy.deepcopy(model.artifact);artifact['weights']=[[0]]
    with pytest.raises(ValueError):SemanticCorePredictor(artifact,model.extractor.encoder)


def test_all_eight_reviewed_complete_answers_now_recognized_without_label_fitting(model):
    data=json.loads((ROOT/'outputs/history-v32-submitted-review-2026-10-15-verified/submitted-original.json').read_text(encoding='utf-8'))
    complete=[e for e in data['examples'] if e['humanLabel']=='present']
    assert len(complete)==8
    for e in complete:
        p=model.predict(e['text'],e['conceptId'],'English',True)
        assert p['suggestedStatus']=='present'
        for v in p['evidence']['points']:
            assert e['text'][v['semanticStart']:v['semanticEnd']]==v['semanticCandidateEvidence']
    protocol=json.loads((OUT/'protocol.json').read_text(encoding='utf-8'))
    assert protocol['v32ReviewLabelsFitted'] is False


def test_incorrect_source_roles_are_flagged_and_not_complete(model):
    text='Past sources provide evidence. Coins and buildings are classified as literary sources; books and written documents are classified as archaeological sources.'
    p=model.predict(text,'hist-g10-l01-c01','English',True)
    assert p['suggestedStatus']!='present'
    assert any(e['kind']=='possible_source_category_reversal' for e in p['evidence']['concerns'])


def test_original_review_and_candidate_are_preserved():
    assert sha(ROOT/'outputs/history-coverage-v3.2-2026-10-15/model.json')=='51fd4d45c2294e373f4fb435fa5898b22e77842953cb0c823d4d05829ba44ae2'
    result=json.loads((ROOT/'outputs/history-v32-submitted-review-2026-10-15-verified/evaluation.json').read_text(encoding='utf-8'))
    assert result['exactFinalMatches']==19 and result['totalExamples']==24
