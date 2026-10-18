import copy
import hashlib
from pathlib import Path
import sys
import pytest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from audit_english_service_annotations import validate_rows,overlap_summary

@pytest.fixture
def row():
    text='Synthetic fixture text.'
    return {'noteId':'shared-note','sourceRecordId':'raw-page','concept':{'id':'fixture-concept'},'text':text,
        'textVariant':'raw_ocr','sourceTextSha256':hashlib.sha256(text.encode()).hexdigest(),
        'label':'partial','uiLabel':'Partial','reason':'Fixture only','reviewer':'AI FIXTURE',
        'previewReviewId':'fixture-save','synthetic':True,'simulatedOCR':True,'independentHumanCertified':False,
        'reviewIsModelBlind':False,'previewSaveObserved':True,'split':'train'}

def test_valid_ai_ledger_retains_nonblind_provenance(row):
    assert validate_rows([row],{'fixture-concept'})[0]['reviewIsModelBlind'] is False

@pytest.mark.parametrize('kind',['hash','label','display','duplicate','concept','missing-provenance'])
def test_invalid_ledger_rejected(row,kind):
    rows=[copy.deepcopy(row)]
    if kind=='hash':rows[0]['text']='changed'
    if kind=='label':rows[0]['label']='complete'
    if kind=='display':rows[0]['uiLabel']='Complete'
    if kind=='duplicate':rows.append(copy.deepcopy(row))
    if kind=='concept':rows[0]['concept']['id']='unknown'
    if kind=='missing-provenance':del rows[0]['reviewIsModelBlind']
    with pytest.raises(ValueError):validate_rows(rows,{'fixture-concept'})

def test_raw_corrected_variant_still_overlaps_training_note(row):
    training=[{'recordId':'corrected-page','noteGroupId':'shared-note','text':'A corrected version.'}]
    result=overlap_summary([row],training)
    assert result['sourceRecordIdOverlap']==0 and result['exactTextOverlap']==0
    assert result['sourceNoteIdOverlap']==1
