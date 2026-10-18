"""Regression boundaries for the reviewed complete/partial evidence errors."""
import json
from pathlib import Path
import pytest
from smart_note_training.english_coverage_v31 import CoveragePredictorV31

ROOT=Path(__file__).resolve().parents[2]
MODEL=CoveragePredictorV31(json.loads((ROOT/'models/english-coverage-v3.1.json').read_bytes()))


def predict(text,concept):
    result=MODEL.predict(text,concept,'English',True)
    for point in result['evidence']['points']:
        if point['candidateEvidence'] is not None:
            assert text[point['start']:point['end']]==point['candidateEvidence']
    for item in result['evidence']['concerns']:assert text[item['start']:item['end']]==item['quote']
    return result


@pytest.mark.parametrize('result',[
    'A brick-red precipitate proves that reducing sugar is absent.',
    'A brick-red deposit means no reducing sugar was present.',
    'A brick-red precipitate indicates a negative result.',
    'Remaining blue means that reducing sugar is present.',
])
def test_wrong_benedict_result_is_partial_even_if_procedure_is_correct(result):
    text='Add Benedict reagent to the food sample and heat it in a water bath. '+result
    p=predict(text,'sci-g10-cbl-007')
    assert p['suggestedStatus']=='partial'
    assert p['evidence']['concerns']


def test_correct_result_does_not_erase_wrong_result_elsewhere():
    text=('Add Benedict reagent to the food sample and heat it in a water bath. '
          'A brick-red precipitate indicates reducing sugar.\n\n'
          'A brick-red precipitate proves that reducing sugar is absent.')
    assert predict(text,'sci-g10-cbl-007')['suggestedStatus']=='partial'


def test_benedict_application_uses_own_verb_and_portion():
    text=("Add iodine to one portion for starch. Use a fresh food portion with Benedict's solution and warm it in a water bath. "
          "A brick-red precipitate with Benedict's indicates reducing sugar.")
    p=predict(text,'sci-g10-cbl-007');assert p['suggestedStatus']=='present'
    evidence=next(e for e in p['evidence']['points'] if e['pointId']=='reagent')['candidateEvidence']
    assert 'iodine' not in evidence.lower()


def test_iodine_addition_cannot_supply_benedict_application():
    text='Add iodine to the sample. Benedict solution is labelled on a shelf.'
    p=predict(text,'sci-g10-cbl-007')
    assert next(e for e in p['evidence']['points'] if e['pointId']=='reagent')['lexicalCoverage']==0


def test_correct_iodine_statement_does_not_create_benedict_conflict():
    text=('Add Benedict solution to the food sample and heat it in a water bath. '
          'A brick-red precipitate indicates reducing sugar.\n\n'
          'A blue-black iodine result is positive for starch.')
    p=predict(text,'sci-g10-cbl-007');assert p['suggestedStatus']=='present'
    assert not p['evidence']['concerns']


@pytest.mark.parametrize('definition,expected',[
    ('Single displacement replaces one element in a compound with another element. Double displacement exchanges ions between two compounds.','present'),
    ('Single displacement means two compounds exchange ions, while double displacement means one element replaces another in a compound.','partial'),
    ('Single displacement means two compounds exchange ions; double displacement means one element replaces another in a compound.','partial'),
])
def test_displacement_labels_bind_their_own_definitions(definition,expected):
    text='Combination joins reactants into one product. Decomposition breaks one compound into simpler products. '+definition
    assert predict(text,'sci-g10-cim-002')['suggestedStatus']==expected


def test_displacement_heading_and_particle_words_are_not_a_relationship():
    p=predict('Single displacement: element, another element, compound.','sci-g10-cim-002')
    assert next(e for e in p['evidence']['points'] if e['pointId']=='single-displacement')['lexicalCoverage']==0


def test_isotope_contradiction_is_partial_with_visible_concern():
    text=('Isotopes of an element have different proton numbers.\n\n'
          'Carbon-12 and carbon-14 both have 6 protons. Their neutron numbers are 6 and 8 respectively.')
    p=predict(text,'sci-g10-som-005');assert p['suggestedStatus']=='partial'
    assert p['evidence']['concerns']


def test_correct_denial_of_misconception_is_not_a_conflict():
    text=('Isotopes do not have different proton numbers. Isotopes have the same proton number but different neutron numbers and mass numbers.')
    p=predict(text,'sci-g10-som-005');assert p['suggestedStatus']=='present'
    assert not p['evidence']['concerns']


def test_chromatography_relation_can_express_attraction_difference_in_reverse_order():
    text=('Place an ink spot on a baseline above the solvent. The paper is the stationary phase and the solvent is the mobile phase. '
          'The dyes separate because their attraction to paper and their movement with solvent differ, so they travel different distances.')
    assert predict(text,'sci-g11-mix-009')['suggestedStatus']=='present'


def test_power_conversion_table_is_explicit_evidence():
    text='Power is energy transferred per second. P = VI. Watts measure joules per second.\n\nKilowatt | Power | One thousand watts'
    p=predict(text,'sci-g11-pea-001')
    assert next(e for e in p['evidence']['points'] if e['pointId']=='kilowatt-conversion')['lexicalCoverage']==1
