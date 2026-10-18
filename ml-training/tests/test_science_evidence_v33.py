"""Coverage boundaries, algebra variants, contradictory evidence and exact spans."""
import json
from pathlib import Path

import pytest

from smart_note_training.english_coverage_v31 import CoveragePredictorV31

ROOT=Path(__file__).resolve().parents[2]
MODEL=CoveragePredictorV31(json.loads((ROOT/'models/english-coverage-v3.1.json').read_bytes()))


def predict(text,concept='sci-g10-som-005'):
    result=MODEL.predict(text,concept,'English',True)
    for point in result['evidence']['points']:
        if point['candidateEvidence'] is not None:
            assert text[point['start']:point['end']]==point['candidateEvidence']
    for concern in result['evidence']['concerns']:
        assert text[concern['start']:concern['end']]==concern['quote']
    return result


@pytest.mark.parametrize('text',[
    'The mass of protons and neutrons is nearly equal.',
    'In a neutral atom the number of electrons equals the number of protons.',
    'The atomic number of an element is unique and stays unchanged during ion formation.',
    'Isotopes\n\nThe number of electrons is equal to the number of protons.',
    'Isotopes have different proton numbers but the same neutron number.',
    'Isotopes do not have the same proton number.',
    'Isotopes do not have different numbers of neutrons.',
])
def test_general_atomic_facts_and_incorrect_relations_are_missing(text):
    assert predict(text)['suggestedStatus']=='missing'


@pytest.mark.parametrize('element,masses,protons,neutrons',[
    ('carbon',(12,14),6,(6,8)),
    ('hydrogen',(1,2),1,(0,1)),
    ('boron',(10,11),5,(5,6)),
])
def test_explicit_particle_comparisons_count_without_keyword_different(element,masses,protons,neutrons):
    text=(f'{element}-{masses[0]} and {element}-{masses[1]} both have {protons} protons. '
          f'Their neutron numbers are {neutrons[0]} and {neutrons[1]} respectively.')
    assert predict(text)['suggestedStatus']=='present'


@pytest.mark.parametrize('text',[
    'Carbon-12 and carbon-14 both have 6 protons. Their neutron numbers are 8 and 6 respectively.',
    'Carbon-12 and carbon-14 both have 6 protons.\n\nTheir neutron numbers are 6 and 8 respectively.',
    'Carbon-12 and carbon-14 both have 6 protons.\n--- Page 2 ---\nTheir neutron numbers are 6 and 8 respectively.',
    'Carbon-12 and oxygen-14 both have 6 protons. Their neutron numbers are 6 and 8 respectively.',
])
def test_no_completion_from_wrong_particle_arithmetic_or_unconnected_context(text):
    assert predict(text)['suggestedStatus']!='present'


def test_conflicting_isotope_definition_does_not_show_complete():
    text=('Isotopes of an element have different proton numbers. '
          'They have the same atomic number but different mass numbers.\n\n'
          'Carbon-12 and carbon-14 both have 6 protons. Their neutron numbers are 6 and 8 respectively.')
    result=predict(text)
    assert result['suggestedStatus']!='present'
    assert result['evidence']['concerns']


@pytest.mark.parametrize('text',[
    'Resistance = V/I = 12/4 = 3 ohms.',
    'I = V / R.',
    'Voltage = current x resistance.',
    'Resistance equals voltage divided by current.',
])
def test_valid_formula_only_is_partial_not_missing(text):
    result=predict(text,'sci-g10-cur-006')
    assert result['suggestedStatus']=='partial'
    assert next(p for p in result['evidence']['points'] if p['pointId']=='equation')['lexicalCoverage']==1


@pytest.mark.parametrize('text',[
    'V = I / R.',
    'R = V / I^2.',
    'V = IR + 1.',
    'V = IR is incorrect.',
])
def test_invalid_equation_does_not_supply_formula_evidence(text):
    result=predict(text,'sci-g10-cur-006')
    assert next(p for p in result['evidence']['points'] if p['pointId']=='equation')['lexicalCoverage']==0


def test_correct_carrier_clauses_do_not_create_a_cross_clause_conflict():
    result=predict('N-type majority carriers are electrons; p-type majority carriers are holes.','sci-g11-ele-002')
    assert result['suggestedStatus']=='partial'
    assert not result['evidence']['concerns']


def test_reversed_carriers_remain_unsupported():
    result=predict('N-type majority carriers are holes; p-type majority carriers are electrons.','sci-g11-ele-002')
    assert result['suggestedStatus']=='missing'
    assert result['evidence']['concerns']
