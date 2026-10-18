"""Reproduce the v3.3 evidence correction without fitting or replacing weights."""
import copy
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'ml-training/outputs/science-v33-evidence-fix-2026-10-18'


def main():
    raw=(OUT/'baseline-snapshot/models/english-coverage-v3.1.json').read_bytes()
    assert hashlib.sha256(raw).hexdigest()=='4ca8524b08f4c500ee9140bf37dfce52eb5af2935a2c8fc66d35869c98b7af7c'
    model=json.loads(raw)
    original=copy.deepcopy(model)
    for concept in model['rubrics']['concepts']:
        if concept['id']=='sci-g10-som-005':
            concept['concernPatterns'] += [
                r'\bisotopes?\b.{0,60}\b(?:different|unequal)\s+(?:(?:numbers?|counts?)\s+of\s+)?protons?\b',
                r'\bisotopes?\b.{0,60}\b(?:same|equal)\s+neutron\s+(?:numbers?|counts?)\b',
            ]
        for point in concept['points']:
            if concept['id']=='sci-g10-som-005':
                point['relationCheck']='isotope'
                if point['id']=='same-protons':
                    point['rejectPatterns']=[r'\b(?:not|never|no)\b.{0,12}\b(?:same|equal|identical)\b.{0,20}\b(?:protons?|atomic\s+number|element)\b']
            if concept['id']=='sci-g10-cur-006' and point['id']=='equation':
                point['numericCheck']='ohm_equation'
            if concept['id']=='sci-g11-ele-002' and point['id']=='doping':
                point['contextPatterns']=[r'\b(?:doping|impurit(?:y|ies))\b']
    model['metadata'].update({
        'experimentId':'english-coverage-v3.3-evidence-fix-2026-10-18',
        'releaseType':'evidence_extractor_correction_to_existing_science_model',
        'frozenFeaturesAndEncoder':False,
        'weightsRefittedForThisRelease':False,
        'previousReleaseModelSha256':hashlib.sha256(raw).hexdigest(),
        'evidenceSourceSha256':hashlib.sha256((ROOT/'ml-training/src/smart_note_training/english_coverage_v31.py').read_bytes()).hexdigest(),
        'evidenceCorrection':{
            'isotopes':'Require isotope context and an actual particle relationship; validate paired numeric neutron examples.',
            'ohm':'Recognize equivalent resistance/current/voltage equations in symbols and words.',
            'semiconductors':'Require doping context and keep carrier-conflict matching within clauses.',
            'originalSuppliedNoteTestNowDevelopmentData':True,
            'independentAccuracyEstablished':False,
        },
    })
    for key in ('weights','intercept','vectorizers','scalerMean','scalerScale','features','labels'):
        assert model[key]==original[key]
    (OUT/'candidate-model.json').write_text(json.dumps(model,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(hashlib.sha256((OUT/'candidate-model.json').read_bytes()).hexdigest())


if __name__=='__main__':main()
