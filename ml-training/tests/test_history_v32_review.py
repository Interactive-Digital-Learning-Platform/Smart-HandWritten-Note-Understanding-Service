import copy
import hashlib
from pathlib import Path
import sys
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from evaluate_history_v32_review import validate_review,verify_template_bytes


def sample():
    e={'id':'case-1','conceptId':'hist-1','conceptName':'Example','grade':10,'requirements':'A and B','sourceReference':{'page':1},'text':'Unchanged prose.','humanLabel':None,'requiresAdjudication':False,'comment':''}
    packet={'version':'review-1','candidateVersion':'candidate-1','candidateSha256':'trusted-hash','synthetic':True,'modelPredictionsIncluded':False,'modelScoredBeforeHumanReview':False,'examples':[e]}
    submitted=copy.deepcopy(packet);submitted.update({'reviewerName':'Reviewer','reviewerType':'human','independentHumanReview':True})
    submitted['examples'][0]['humanLabel']='partial'
    return packet,submitted


def test_valid_review_is_not_modified_or_converted_to_training():
    packet,review=sample();before=copy.deepcopy(review)
    validate_review(packet,review)
    assert review==before and packet['examples'][0]['humanLabel'] is None


@pytest.mark.parametrize('key,value',[('text','Changed text'),('requirements','Changed criterion'),('grade',11),('sourceReference',{'page':99}),('humanLabel','complete')])
def test_source_content_changes_and_bad_labels_are_rejected(key,value):
    packet,review=sample();review['examples'][0][key]=value
    with pytest.raises(ValueError):validate_review(packet,review)


def test_uncertain_labels_are_explicit_and_explained():
    packet,review=sample();review['examples'][0].update({'humanLabel':None,'requiresAdjudication':True,'comment':'Criterion needs clarification.'})
    validate_review(packet,review)
    review['examples'][0]['comment']=''
    with pytest.raises(ValueError):validate_review(packet,review)


def test_false_independence_or_changed_candidate_metadata_are_rejected():
    packet,review=sample();review['reviewerType']='AI'
    with pytest.raises(ValueError):validate_review(packet,review)
    packet,review=sample();review['candidateSha256']='different-hash'
    with pytest.raises(ValueError):validate_review(packet,review)


def test_integrity_allows_only_documented_line_ending_conversion():
    original=b'{\n  "key": "unchanged"\n}\n';digest=hashlib.sha256(original).hexdigest()
    assert verify_template_bytes(original,digest)['lineEndingNote'] is None
    assert verify_template_bytes(original.replace(b'\n',b'\r\n'),digest)['lineEndingNote']
    with pytest.raises(ValueError):verify_template_bytes(original.replace(b'unchanged',b'changed'),digest)
    with pytest.raises(ValueError):verify_template_bytes(original.replace(b'  ',b'    '),digest)
