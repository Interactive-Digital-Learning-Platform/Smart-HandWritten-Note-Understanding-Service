"""Checks for evidence features and the assistant review's provenance boundaries."""
import json
from pathlib import Path
import sys
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.history_partial import requirement_clauses, numeric_support, qualified_statement, PartialHistoryFeatures, PartialHistoryPredictor, PARTIAL_FEATURES
from smart_note_training.history_semantic_core import SemanticCoreFeatures, CORE_FEATURES
from smart_note_training.history_semantic import FrozenEncoder


def test_meaningful_clause_split_retains_subject_context_and_does_not_make_tiny_queries():
    assert requirement_clauses('Early communities hunted for food and adapted to different environments.') == ['Early communities hunted for food','adapted to different environments']
    assert requirement_clauses('Sources include books and documents.') == ['Sources include books and documents.']


def test_numeric_support_checks_the_required_number_not_just_any_number_in_a_long_note():
    req=['Early habitation dates to about 125,000 years ago.','Communities survived through gathering.']
    assert numeric_support('A burial dates to 2400 BC. Several hundred thousand years ago.',req)==[0.,.5]
    assert numeric_support('Evidence dates to 125000 years ago.',req)==[1.,1.]


def test_qualifying_features_do_not_treat_additive_not_only_as_a_denial():
    assert not qualified_statement('Coal was not only useful for mines but also factories.')
    assert qualified_statement('The changes happened because of only one factor.')
    assert qualified_statement('Steam machinery was completely independent of fuel.')


def test_original_semantic_features_are_preserved_and_new_features_are_finite():
    base_path=ROOT/'outputs/history-coverage-v5.1-review-policy-2026-10-15/model.json'
    if not base_path.exists():pytest.skip('Local frozen History model required')
    base=json.loads(base_path.read_bytes())
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    encoder.cache_dir=None
    old=SemanticCoreFeatures.restore(base);old.encoder=encoder
    new=PartialHistoryFeatures.restore(base);new.encoder=encoder
    text='Sources are evidence about past human activity. Literary sources are books and written documents.'
    previous,_=old.one(text,'hist-g10-l01-c01',True)
    values,evidence=new.one(text,'hist-g10-l01-c01',True)
    assert len(values)==len(PARTIAL_FEATURES)
    assert np.isfinite(values).all()
    assert np.allclose(values[:len(CORE_FEATURES)],previous,rtol=0,atol=1e-12)
    for p in evidence['points']:
        for a,b,q in [('start','end','candidateEvidence'),('semanticStart','semanticEnd','semanticCandidateEvidence')]:
            assert text[p[a]:p[b]]==p[q]


def test_assistant_audit_preserves_source_text_and_never_claims_human_confirmation():
    path=ROOT/'outputs/history-student-ef-assistant-review-2026-10-18/adjudication.json'
    if not path.exists():pytest.skip('Locally recorded assistant review required')
    audit=json.loads(path.read_bytes())
    data=json.loads((ROOT/'outputs/history-student-ef-labels-2026-10-18-02/dataset.json').read_bytes())
    rows={r['recordId']:r for r in data['rows']}
    assert audit['humanReviewed'] is False and audit['independentEvaluation'] is False
    assert len(audit['rows'])==50 and len({r['recordId'] for r in audit['rows']})==50
    for r in audit['rows']:
        assert r['humanReviewed'] is False
        assert r['originalTeacherLabel']==rows[r['recordId']]['teacherLabel']
        for quote in r['evidence']:
            assert rows[r['recordId']]['text'][quote['start']:quote['end']]==quote['quote']


def test_partial_candidate_never_fits_a_reserved_notebook_and_rejects_broken_dimensions():
    folder=ROOT/'outputs/history-coverage-v5.2-partial-2026-10-18'
    if not (folder/'training-snapshot.json').exists():pytest.skip('Local candidate training required')
    snapshot=json.loads((folder/'training-snapshot.json').read_bytes())
    assert not {r['recordId'] for r in snapshot['rows']} & set(snapshot['reservedNotebookIds'])
    artifact=json.loads((folder/'model.json').read_bytes())
    artifact['weights'][0].pop()
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json')
    with pytest.raises((ValueError,TypeError)):
        PartialHistoryPredictor(artifact,encoder)
