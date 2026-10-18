import copy
import sys
from pathlib import Path
import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from evaluate_history_v31_review import validate_review


def sample():
    e={'id':'example-1','conceptId':'history-1','conceptName':'A concept','requirements':'Explain both parts.','text':'An unchanged note.','humanLabel':None,'comment':''}
    packet={'version':'review-1','synthetic':True,'examples':[e]}
    submitted=copy.deepcopy(packet)
    submitted.update({'reviewerName':'Reviewer','reviewerType':'Human Reviewer','independentHumanReview':True,'intendedLabelsAndModelOutputsHidden':True})
    submitted['examples'][0]['humanLabel']='partial'
    return packet,submitted


def test_declared_human_review_is_normalized_without_modifying_packet():
    packet,submitted=sample();original=copy.deepcopy(submitted)
    assert validate_review(packet,submitted)=='human'
    assert submitted==original
    assert packet['examples'][0]['humanLabel'] is None


@pytest.mark.parametrize('field,value',[
    ('text','Changed note'),('conceptId','wrong'),('requirements','Changed criterion'),('humanLabel','complete'),
])
def test_changed_examples_or_invalid_labels_are_rejected(field,value):
    packet,submitted=sample();submitted['examples'][0][field]=value
    with pytest.raises(ValueError):validate_review(packet,submitted)


def test_duplicate_ids_and_contradictory_provenance_are_rejected():
    packet,submitted=sample();submitted['examples'].append(copy.deepcopy(submitted['examples'][0]))
    with pytest.raises(ValueError):validate_review(packet,submitted)
    packet,submitted=sample();submitted['reviewerType']='AI'
    with pytest.raises(ValueError):validate_review(packet,submitted)
    packet,submitted=sample();submitted['independentHumanReview']='true'
    with pytest.raises(ValueError):validate_review(packet,submitted)
