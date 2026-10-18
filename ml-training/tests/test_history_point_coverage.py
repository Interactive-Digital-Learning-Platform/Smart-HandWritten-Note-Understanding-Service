"""Behavior and provenance checks for the Notes History partial-coverage update."""
import copy
import json
from pathlib import Path
import numpy as np
import pytest
from smart_note_training.history_point_coverage import aggregate_points, ocr_year_concerns, absolute_scope_concerns, period_support, required_names, PointCoveragePredictor

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('labels,expected', [([0,0],0),([0,2],1),([2,0],1),([2,2],2),([1,2],1)])
def test_point_aggregation_retains_partial_support(labels,expected):
    scores = np.full((len(labels),3),.01)
    for i,label in enumerate(labels):scores[i,label]=.98
    result=aggregate_points(scores)
    assert result.argmax()==expected
    assert np.isclose(result.sum(),1)


@pytest.mark.parametrize('scores', [[],[[0,0,0]],[[float('nan'),1,0]],[[1,-1,1]],[[1,0]]])
def test_invalid_point_scores_fail_closed(scores):
    with pytest.raises(ValueError):aggregate_points(scores)


def test_required_periods_and_names_are_distinguished():
    assert period_support('Pre-historic cave burials.', 'Protohistoric burials are megalithic.')==0
    assert period_support('Proto-historic megalithic burials.', 'Protohistoric burials are megalithic.')==1
    assert required_names('Changing political centres and commerce shaped new towns.')==[]
    assert required_names('Rathnapura preserves tools; Macadam improved roads.')==['rathnapura','macadam']


def test_ocr_year_ambiguity_is_not_silently_corrected_or_counted_as_missing():
    points=[{'pointId':'p','requirement':'The convention took place in 1815.'}]
    text='📖 Convention: l8l5.'
    concerns=ocr_year_concerns(text,points)
    assert len(concerns)==1
    c=concerns[0]
    assert text[c['start']:c['end']]==c['quote']=='l8l5'
    assert not ocr_year_concerns('Convention in 1815.',points)
    assert not ocr_year_concerns('Convention in l8l7.',points)
    assert not ocr_year_concerns('Convention in 1817.',points)


def test_relevant_sweeping_equivalence_needs_context_not_automatic_partial():
    points=[{'requirement':'Yapahuwa became a safer centre after difficulties at Dambadeniya.'}]
    text='Yapahuwa and Dambadeniya were all one city with different names.'
    c=absolute_scope_concerns(text,points)[0]
    assert text[c['start']:c['end']]==c['quote']
    assert not absolute_scope_concerns('Not all cities were the same.',points)
    assert not absolute_scope_concerns('Every football team wore the same uniform.',points)


def test_latest_review_is_assistant_only_and_original_labels_stay_frozen():
    import hashlib
    path=ROOT/'outputs/history-student-ef-assistant-review-2026-10-18-02/adjudication.json'
    if not path.exists():pytest.skip('Local review packet required')
    audit=json.loads(path.read_bytes())
    original=(ROOT/'outputs/history-student-ef-labels-2026-10-18-02/dataset.json').read_bytes()
    assert hashlib.sha256(original).hexdigest()==audit['datasetSha256']
    assert audit['adjudicationRevision']==2 and audit['humanReviewed'] is False
    assert len(audit['rows'])==50 and sum(r['assistantLabel']!=r['originalTeacherLabel'] for r in audit['rows'])==20


def test_point_artifact_rejects_nonfinite_and_wrong_dimensions():
    folder=ROOT/'outputs/history-coverage-v5.3-point-support-2026-10-18-05'
    if not (folder/'model.json').exists():pytest.skip('Local model required')
    artifact=json.loads((folder/'model.json').read_bytes())
    class Encoder:
        manifest={'revision':artifact['encoder']['revision']}
    bad=copy.deepcopy(artifact);bad['weights'][0][0]=float('nan')
    with pytest.raises(ValueError):PointCoveragePredictor(bad,Encoder())
    bad=copy.deepcopy(artifact);bad['weights'][0].pop()
    with pytest.raises(ValueError):PointCoveragePredictor(bad,Encoder())
    snapshot=json.loads((folder/'training-snapshot.json').read_bytes())
    assert not {r.get('sourceRecordId',r['recordId']) for r in snapshot['rows']} & set(snapshot['reservedNotebookIds'])
