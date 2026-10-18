import json
import re
from pathlib import Path
import numpy as np
import pytest
from smart_note_training.english_coverage import load_rubrics, fit_classifier
from smart_note_training.english_coverage_v3 import CoverageFeaturesV3, CoveragePredictorV3, apply_review_policy, export_v3

ROOT=Path(__file__).resolve().parents[1]

@pytest.fixture
def extractor():
    return CoverageFeaturesV3(load_rubrics(ROOT/'rubrics/english-science-coverage-v3.json')).fit([{'text':'Science notes about energy current atoms breathing sugar.'}])

def point(ex,text,cid,pid):
    return next(p for p in ex.one(text,cid,True)[1]['points'] if p['pointId']==pid)

def test_all_rubric_regexes_compile(extractor):
    for c in extractor.rubrics['concepts']:
        for obj in [c,*c['points']]:
            for key,value in obj.items():
                if key.endswith('Patterns'):
                    for group in value:
                        for pat in (group if isinstance(group,list) else [group]):re.compile(pat)

@pytest.mark.parametrize('text',["Add Benedict's reagent to the juice.", 'Add Benedict\u2019s reagent to the juice.'])
def test_possessive_reagent(extractor,text):
    p=point(extractor,text,'sci-g10-cbl-007','reagent')
    assert p['lexicalCoverage']==1 and text[p['start']:p['end']]==p['candidateEvidence']

def test_reversed_carriers_cannot_borrow_next_clause(extractor):
    text='Pentavalent donors produce n-type with holes as majority carriers. Trivalent acceptors produce p-type with electrons as majority carriers.'
    assert point(extractor,text,'sci-g11-ele-002','n-type')['lexicalCoverage']==0
    assert point(extractor,text,'sci-g11-ele-002','p-type')['lexicalCoverage']==0

def test_correct_carrier_relationships(extractor):
    text='Pentavalent donors create n-type with electrons as majority carriers. Trivalent acceptors create p-type with holes as majority carriers.'
    assert point(extractor,text,'sci-g11-ele-002','n-type')['lexicalCoverage']==1
    assert point(extractor,text,'sci-g11-ele-002','p-type')['lexicalCoverage']==1

@pytest.mark.parametrize('text',[
    'Components have the same attraction to paper and solvent, but their different colours produce bands.',
    'Dyes travel different distances in the solvent because they have identical attraction to the paper.',
])
def test_incorrect_chromatography_relationship(extractor,text):
    assert point(extractor,text,'sci-g11-mix-009','separation')['lexicalCoverage']==0

def test_correct_chromatography_relationship(extractor):
    text='The dye components travel different distances because of different attractions to the paper and solvent.'
    assert point(extractor,text,'sci-g11-mix-009','separation')['lexicalCoverage']==1

def test_expiration_does_not_support_inspiration(extractor):
    text='Expiration: the diaphragm relaxes and ribs move down and in. Chest volume decreases, pressure rises and air moves out.'
    assert point(extractor,text,'sci-g11-bph-004','inspiration-movement')['lexicalCoverage']==0
    assert point(extractor,text,'sci-g11-bph-004','inspiration-pressure')['lexicalCoverage']==0

@pytest.mark.parametrize('pid,text',[
    ('inspiration-pressure','Chest volume becomes larger, pressure falls and air enters the lungs.'),
    ('expiration-pressure','Smaller chest volume raises pressure, pushing air out.'),
])
def test_pressure_paraphrases(extractor,pid,text):
    assert point(extractor,text,'sci-g11-bph-004',pid)['lexicalCoverage']==1

def test_heat_exchange_paraphrase(extractor):
    text="In insulated mixing the hotter body's heat loss equals the colder body's heat gain."
    assert point(extractor,text,'sci-g11-hea-003','exchange')['lexicalCoverage']==1

def test_policy_abstains_without_changing_raw_label_or_inventing_partial():
    evidence={'points':[{'pointId':'required','lexicalCoverage':.5}], 'concerns':[]}
    assert apply_review_policy('present',evidence)['suggestedStatus'] is None
    assert apply_review_policy('partial',evidence)['suggestedStatus']=='partial'
    evidence['points'][0]['lexicalCoverage']=1
    assert apply_review_policy('present',evidence)['suggestedStatus']=='present'
    evidence['concerns']=[{'kind':'conflict'}]
    assert apply_review_policy('present',evidence)['suggestedStatus'] is None

def test_portable_v3_and_scope(extractor):
    cid='sci-g10-som-005'
    rows=[{'text':t,'conceptId':cid} for t in ['Same protons and different neutrons cause different mass numbers.','The atoms have the same proton number.','Friction slows a sliding block.']]
    x=extractor.transform(rows);sc,cl=fit_classifier(x,[0,1,2],[1,1,1],1)
    model=CoveragePredictorV3(json.loads(json.dumps(export_v3(extractor,sc,cl,{'experimentId':'test'}))))
    np.testing.assert_allclose(model.probabilities(x),cl.predict_proba(sc.transform(x)),atol=1e-12)
    assert model.predict(rows[0]['text'],cid)['suggestedStatus'] is None
    result=model.predict(rows[0]['text'],cid,scope_confirmed=True)
    assert result['status'] is None and result['reviewRequired'] and 'rawModelStatus' in result
