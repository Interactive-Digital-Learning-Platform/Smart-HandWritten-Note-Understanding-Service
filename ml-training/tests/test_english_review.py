import copy
import json
from pathlib import Path
import sys

import pytest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from build_english_review import packet
from evaluate_english_review import validate_review


@pytest.fixture
def review_pair():
    p=packet(ROOT/'evaluation/english-coverage-challenge-v1.json',ROOT/'rubrics/english-science-coverage-v1.json')
    r={'schemaVersion':1,'packetVersion':p['version'],'packetSha256':p['packetSha256'],'reviewer':'TEST FIXTURE',
       'completed':True,'modelPredictionsShown':False,'answers':[
           {'id':e['id'],'conceptId':e['conceptId'],'label':'unclear','comment':'TEST ONLY'} for e in p['examples']]}
    return p,r


def test_blind_packet_has_no_expected_labels_predictions_or_case_hints(review_pair):
    p,_=review_pair
    assert len(p['examples'])==30
    for e in p['examples']:
        assert set(e)=={'id','conceptId','concept','text','requirements'}
    assert [e['id'] for e in p['examples']]!=sorted(e['id'] for e in p['examples'])


def test_accepts_unclear_with_reason_without_relabelling(review_pair):
    p,r=review_pair
    result=validate_review(p,r)
    assert len(result)==30 and all(a['label']=='unclear' for a in result.values())


@pytest.mark.parametrize('kind',['duplicate','missing','wrong-concept','no-reason','incomplete','predictions-shown','wrong-hash','changed-text'])
def test_rejects_invalid_or_nonblind_review(review_pair,kind):
    p,r=copy.deepcopy(review_pair)
    if kind=='duplicate':r['answers'][1]=r['answers'][0]
    elif kind=='missing':r['answers'].pop()
    elif kind=='wrong-concept':r['answers'][0]['conceptId']='wrong'
    elif kind=='no-reason':r['answers'][0]['comment']=' '
    elif kind=='incomplete':r['completed']=False
    elif kind=='predictions-shown':r['modelPredictionsShown']=True
    elif kind=='wrong-hash':r['packetSha256']='wrong'
    elif kind=='changed-text':p['examples'][0]['text']='changed'
    with pytest.raises(ValueError):validate_review(p,r)
