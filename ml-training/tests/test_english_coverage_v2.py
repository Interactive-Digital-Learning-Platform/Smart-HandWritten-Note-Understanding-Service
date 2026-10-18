from pathlib import Path
import json
import numpy as np
import pytest
from smart_note_training.english_coverage import load_rubrics,fit_classifier
from smart_note_training.english_coverage_v2 import CoverageFeaturesV2,CoveragePredictorV2,evidence_units,kilowatt_conversion,arithmetic_concerns,export_v2

ROOT=Path(__file__).resolve().parents[1]

@pytest.fixture
def extractor():
    rubric=load_rubrics(ROOT/'rubrics/english-science-coverage-v2.json')
    return CoverageFeaturesV2(rubric).fit([{'text':'Notes about science, current, sugar and heat.'}])

def points(extractor,text,cid):
    return {p['pointId']:p for p in extractor.one(text,cid,True)[1]['points']}

def test_negated_gamete_fusion_does_not_support_sexual_reproduction(extractor):
    p=points(extractor,'Asexual reproduction is from one parent without fusion of gametes. Offspring are genetically identical.','sci-g10-col-001')
    assert p['sexual']['lexicalCoverage']==0
    assert p['asexual']['lexicalCoverage']==1

def test_valid_contrast_keeps_affirmative_sexual_evidence(extractor):
    p=points(extractor,'Sexual reproduction uses fusion of male and female gametes. Asexual reproduction involves one parent without fusion of gametes.','sci-g10-col-001')
    assert p['sexual']['lexicalCoverage']==p['asexual']['lexicalCoverage']==1

def test_heading_cannot_borrow_procedure_from_nearby_test(extractor):
    p=points(extractor,'Benedict test:\nAdd iodine solution to the potato sample. A blue-black colour identifies starch.','sci-g10-cbl-007')
    assert p['reagent']['lexicalCoverage']<1
    assert all('Benedict' not in t for _,_,t in evidence_units('Benedict test:\nAdd iodine solution to the sample.'))

def test_heat_requires_heat_and_bath_not_just_benedict(extractor):
    p=points(extractor,'Add Benedict solution to glucose. A brick-red precipitate shows reducing sugar.','sci-g10-cbl-007')
    assert p['heat']['lexicalCoverage']==0

def test_chained_procedure_retains_context_and_exact_offsets(extractor):
    text='Mix Benedict reagent into the food solution. Heat the tube in a hot water bath. A brick-red precipitate indicates reducing sugar.'
    p=points(extractor,text,'sci-g10-cbl-007')
    assert all(v['lexicalCoverage']==1 for v in p.values())
    for v in p.values():assert text[v['start']:v['end']]==v['candidateEvidence']

def test_wrong_neutron_relation_cannot_be_completed_by_word_cooccurrence(extractor):
    text='The mass numbers are different because of extra electrons. Both nuclei have six neutrons.'
    assert points(extractor,text,'sci-g10-som-005')['different-neutrons']['lexicalCoverage']==0

@pytest.mark.parametrize('text',['Different numbers of neutrons give different isotope masses.','Isotopes have different neutron counts.','Their neutron numbers differ while their proton number stays the same.'])
def test_neutron_relation_variants(extractor,text):
    assert points(extractor,text,'sci-g10-som-005')['different-neutrons']['lexicalCoverage']>0

def test_latent_heat_units_do_not_establish_specific_heat_evidence(extractor):
    p=points(extractor,'Melting 2 kg requires Q=mL with L in joules per kilogram. This gives energy without a temperature increase.','sci-g11-hea-003')
    assert p['units']['lexicalCoverage']==0

@pytest.mark.parametrize('text',['1 kW = 1000 W','920 W = 0.92 kW','one kilowatt equals one thousand watts','0.75 kW equals 750 W'])
def test_correct_kw_conversions(text):assert kilowatt_conversion(text)

@pytest.mark.parametrize('text',['power in watts and kilowatts','1 kW = 100 W','1000 W = 1000 W','0 kW = 0 W'])
def test_kw_terms_and_wrong_conversions_are_not_evidence(text):assert not kilowatt_conversion(text)

def test_numeric_products_only_are_checked_without_execution():
    assert not arithmetic_concerns('0.4 x 500 x 20 = 4000')
    assert arithmetic_concerns('0.4 x 500 x 20 = 40000')
    assert not arithmetic_concerns('__import__("os").system("example")')

def test_v2_roundtrip_and_scope(extractor):
    rows=[{'conceptId':'sci-g10-som-005','text':t} for t in ('Same protons but different neutrons give different mass numbers.','The atoms have the same proton number.','Friction opposes sliding.')]
    x=extractor.transform(rows);sc,cl=fit_classifier(x,[0,1,2],[1,1,1],.1)
    model=CoveragePredictorV2(json.loads(json.dumps(export_v2(extractor,sc,cl,{'experimentId':'fixture'}))))
    np.testing.assert_allclose(model.probabilities(model.extractor.transform(rows)),cl.predict_proba(sc.transform(x)),atol=1e-12)
    assert model.predict(rows[0]['text'],rows[0]['conceptId'])['suggestedStatus'] is None
    assert model.predict(rows[0]['text'],rows[0]['conceptId'],scope_confirmed=True)['status'] is None
    with pytest.raises(ValueError,match='English'):model.predict('text',rows[0]['conceptId'],language='Sinhala')
