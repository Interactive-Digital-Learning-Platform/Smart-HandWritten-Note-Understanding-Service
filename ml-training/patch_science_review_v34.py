"""Reproduce the existing Science model's reviewed-evidence correction (no fit)."""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'ml-training/outputs/science-v34-review-fix-2026-10-18'


def main():
    raw=(OUT/'baseline-snapshot/models/english-coverage-v3.1.json').read_bytes()
    assert hashlib.sha256(raw).hexdigest()=='357e2a67f768bbda261aaf430887e3d1b875a4b91d639453f5fb79dc77e8923f'
    model=json.loads(raw)
    benedict_conflicts=[
        r'\b(?:brick\s+red|red)\s+(?:precipitate|deposit|ppt)\b.{0,50}\b(?:no\s+reducing\s+sugar|reducing\s+sugar\s+(?:is\s+|was\s+)?absent|absence\s+of\s+reducing\s+sugar)\b',
        r'\b(?:remaining|remains?|stays?|a)\s+blue\b(?!\s+black).{0,65}\b(?:positive|reducing\s+sugar\s+is\s+present)\b',
        r'\b(?:brick\s+red|red)\s+(?:precipitate|deposit|ppt)\b.{0,25}\b(?:means|shows|indicates|proves)\s+(?:a\s+)?negative\b',
    ]
    isotope_conflicts=[
        r'\bisotopes?(?:\s+of\s+(?:an?|the)\s+element)?\s+(?:have|contain)\s+(?:different|unequal)\s+(?:(?:numbers?|counts?)\s+of\s+)?protons?\b',
        r'\bisotopes?(?:\s+of\s+(?:an?|the)\s+element)?\s+(?:have|contain)\s+(?:the\s+)?(?:same|equal)\s+neutron\s+(?:numbers?|counts?)\b',
    ]
    for c in model['rubrics']['concepts']:
        if c['id']=='sci-g10-som-005':
            # Replace the earlier over-broad conflict regex, which could also
            # flag the correct denial "isotopes do not have different protons".
            c['concernPatterns']=c['concernPatterns'][:2]+isotope_conflicts
        if c['id']=='sci-g10-cbl-007':c['concernPatterns']=benedict_conflicts
        for p in c['points']:
            if c['id']=='sci-g10-som-005' and p['id']=='same-protons':
                p['conflictPatterns']=isotope_conflicts;p['conflictCoverageCap']=.5
            if c['id']=='sci-g10-cbl-007' and p['id']=='reagent':
                p['relationCheck']='benedict_reagent';p['spanScope']='clause'
            if c['id']=='sci-g10-cbl-007' and p['id']=='result':
                p['rejectPatterns']=benedict_conflicts
                p['conflictPatterns']=benedict_conflicts;p['conflictCoverageCap']=.5
            if c['id']=='sci-g10-cim-002':
                if p['id']=='combination':
                    p['groups'][0]+=['combining'];p['groups'][1]+=['new compound','a product','magnesium oxide']
                if p['id'] in ('single-displacement','double-displacement'):p['relationCheck']='displacement'
            if c['id']=='sci-g11-mix-009' and p['id']=='separation':
                p['supportPatterns']+=[r'\b(?:attraction|affinity|interactions?)\b.{0,90}\b(?:differs?|varies|different)\b',
                                       r'\bdifferences?\s+in\s+(?:the\s+)?(?:strength\s+of\s+)?(?:attractions?|interactions?)\b']
    previous=json.loads(raw)
    model['metadata'].update({
        'experimentId':'english-coverage-v3.4-review-fix-2026-10-18',
        'previousReleaseModelSha256':hashlib.sha256(raw).hexdigest(),
        'weightsRefittedForThisRelease':False,
        'releaseType':'existing_science_relation_and_conflict_evidence_correction',
        'evidenceSourceSha256':hashlib.sha256((ROOT/'ml-training/src/smart_note_training/english_coverage_v31.py').read_bytes()).hexdigest(),
        'assistantReviewHumanVerified':False,
        'independentAccuracyEstablished':False,
    })
    for key in ('weights','intercept','vectorizers','scalerMean','scalerScale','features','labels'):assert model[key]==previous[key]
    (OUT/'candidate-model.json').write_text(json.dumps(model,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(hashlib.sha256((OUT/'candidate-model.json').read_bytes()).hexdigest())


if __name__=='__main__':main()
