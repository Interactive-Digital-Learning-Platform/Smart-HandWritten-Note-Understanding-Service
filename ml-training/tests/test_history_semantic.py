import json
from pathlib import Path
import pytest
from smart_note_training.history_semantic import FrozenEncoder,SemanticHistoryPredictor,semantic_spans,genuine_negation

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'outputs/history-coverage-v4-semantic-2026-10-15'


@pytest.mark.parametrize('text,expected',[
 ('A king did not conduct administration alone: local officers helped.',False),
 ('Not only officers but also local leaders assisted the king.',False),
 ('Kings administered without help from local officers.',True),
 ('A king did not conduct administration alone, but officers never helped him.',True),
 ('Citizens should never preserve historical evidence.',True),
])
def test_negation_distinguishes_addition_and_assistance(text,expected):
    assert genuine_negation(text)==expected


def test_semantic_windows_preserve_all_words_and_exact_offsets():
    text=' '.join('word'+str(i) for i in range(180))+'.'
    spans=semantic_spans(text)
    assert all(text[a:b]==quote and len(quote.split())<=48 for a,b,quote in spans)
    assert all(any('word'+str(i) in quote.split() or 'word'+str(i)+'.' in quote.split() for _,_,quote in spans) for i in range(180))


def test_semantic_evidence_and_prompt_safeguard():
    manifest=ROOT/'encoders/minilm-l6-v2/encoder-manifest.json'
    if not (OUT/'model.json').exists() or not manifest.exists():pytest.skip('Requires trained local semantic candidate and encoder')
    encoder=FrozenEncoder(manifest,ROOT/'outputs/history-semantic-embedding-cache-v1')
    model=SemanticHistoryPredictor(json.loads((OUT/'model.json').read_text(encoding='utf-8')),encoder)
    text='Ancient urban life had major centres at Anuradhapura and Polonnaruwa. Cities grew with administration, surplus economic production and exchanges.'
    p=model.predict(text,'hist-g10-l07-c01','English',True)
    for e in p['evidence']['points']:
        assert text[e['start']:e['end']]==e['candidateEvidence']
        assert text[e['semanticStart']:e['semanticEnd']]==e['semanticCandidateEvidence']
        assert -1.00001<=e['semanticSimilarity']<=1.00001
    prompt='Explain Anuradhapura and Polonnaruwa as ancient urban centres. Describe administration, economic surplus and exchanges. These questions remain unanswered.'
    result=model.predict(prompt,'hist-g10-l07-c01','English',True)
    assert result['suggestedStatus'] in ('missing',None)
    assert all(e['semanticSimilarity']==0 for e in result['evidence']['points'])
