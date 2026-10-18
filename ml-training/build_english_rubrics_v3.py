"""Draft relation patterns after two development reviews; not teacher-certified."""
import copy
import json
from pathlib import Path


def build(source):
    result = copy.deepcopy(source)
    result['version'] = 'english-science-coverage-v3'
    result['provenance'] = 'Draft finite relation checks developed using both human reviews. Neither review is an independent V3 test.'
    concepts = {c['id']: c for c in result['concepts']}
    def point(cid, pid):
        return next(p for p in concepts[cid]['points'] if p['id']==pid)

    # Only match carriers within a clause about the corresponding material.
    # A second sentence about the other material cannot supply a missing term.
    for pid, carrier, opposite, kind, impurity in [
        ('n-type', 'electrons?', 'holes?', 'n', 'pentavalent|donors?|phosphorus'),
        ('p-type', 'holes?', 'electrons?', 'p', 'trivalent|acceptors?|boron'),
    ]:
        p = point('sci-g11-ele-002', pid)
        p['spanScope'] = 'clause'
        target = rf'\b(?:{kind}\s+type|{impurity})\b'
        p['contextPatterns'] = [target]
        p['supportPatterns'] = [
            target+rf'.{{0,90}}\b{carrier}\b.{{0,35}}\b(?:majority|extra|free)\b',
            target+rf'.{{0,90}}\b(?:majority|extra|free)\b.{{0,30}}\b{carrier}\b',
            rf'\b{carrier}\b.{{0,25}}\bmajority\b.{{0,40}}'+target,
        ]
        p['rejectPatterns'] = [
            target+rf'.{{0,60}}\b{opposite}\b.{{0,25}}\bmajority\b',
            target+rf'.{{0,60}}\bmajority\b.{{0,25}}\b{opposite}\b',
            target+rf'.{{0,55}}\b(?:no|not|never)\b.{{0,30}}\b{carrier}\b',
        ]
        concepts['sci-g11-ele-002'].setdefault('concernPatterns', []).extend(p['rejectPatterns'][:2])

    p = point('sci-g11-mix-009', 'separation')
    p['supportPatterns'] = [
        r'\b(?:different|unequal|differing)\s+(?:degrees?\s+of\s+)?(?:attractions?|affinities|solubilit\w*)\b',
        r'\b(?:attraction|affinity|solubility)\b.{0,25}\b(?:differs?|varies|different)\b',
        r'\b(?:more|less|strongly|weakly)\s+attracted\b',
    ]
    p['rejectPatterns'] = [r'\b(?:same|equal|identical)\s+(?:attraction|affinity|solubility|speed)\b']
    concepts['sci-g11-mix-009']['concernPatterns'].extend(p['rejectPatterns'])

    # Directional relationships must be present, not just volume and pressure.
    cid = 'sci-g11-bph-004'
    p = point(cid, 'inspiration-movement')
    p['supportPatterns'] = [r'\bdiaphragm\b(?:(?!\bribs?\b).){0,35}\b(?:contracts?|flattens?|moves? down)\b']
    p['rejectPatterns'] = [r'\bdiaphragm\b.{0,20}\b(?:does not|doesnt|never)\b.{0,15}\bcontract']
    p = point(cid, 'expiration-movement')
    p['supportPatterns'] = [r'\b(?:diaphragm|muscles)\b.{0,35}\b(?:relax\w*|dome)\b']
    p = point(cid, 'inspiration-pressure')
    p['groups'] = [['volume','cavity'], ['larger','bigger','increases','increasing','expands'], ['lower','lowers','falls','drops','decreases','below']]
    p['supportAllPatterns'] = [
        [r'\b(?:volume|cavity)\b.{0,25}\b(?:increas\w*|expand\w*|larger|bigger)\b', r'\b(?:increas\w*|larger|bigger)\s+(?:chest\s+|thoracic\s+)?(?:volume|cavity)\b'],
        [r'\bpressure\b.{0,25}\b(?:lower\w*|fall\w*|drop\w*|decreas\w*|below)\b', r'\b(?:lower\w*|decreas\w*)\s+(?:the\s+)?pressure\b'],
    ]
    p = point(cid, 'expiration-pressure')
    p['groups'] = [['volume','cavity'], ['smaller','decreases','decreasing','reduces','reduced'], ['rises','raises','increases','above','higher']]
    p['supportAllPatterns'] = [
        [r'\b(?:volume|cavity)\b.{0,25}\b(?:decreas\w*|reduc\w*|smaller)\b', r'\b(?:decreas\w*|smaller|reduc\w*)\s+(?:chest\s+|thoracic\s+)?(?:volume|cavity)\b'],
        [r'\bpressure\b.{0,25}\b(?:ris\w*|increas\w*|higher|above)\b', r'\b(?:rais\w*|increas\w*)\s+(?:the\s+)?pressure\b'],
    ]
    # Opposite pressure/volume combinations are concerns even if a correct
    # sentence elsewhere happens to satisfy the checklist.
    concepts[cid]['concernPatterns'] = [
        r'\bvolume\s+(?:increases|expands)\b.{0,35}\bpressure\s+(?:rises|increases)\b',
        r'\bvolume\s+(?:decreases|reduces)\b.{0,35}\bpressure\s+(?:falls|decreases)\b',
    ]
    p = point('sci-g11-hea-003', 'exchange')
    p['groups'][1] += ['loss', 'losing']
    p['groups'][2] += ['gain', 'gaining']
    p['supportPatterns'] = [
        r'\b(?:heat|energy)\s+(?:lost|loss)\b.{0,60}(?:equals?|equal to|=).{0,60}\b(?:gain|gained)\b',
        r'\b(?:heat|energy)\s+(?:gain|gained)\b.{0,60}\b(?:equals?|equal to)\b.{0,60}\b(?:lost|loss)\b',
    ]
    p['rejectPatterns'] = [r'\b(?:not|never|doesnt|unequal)\b.{0,15}\b(?:equal|equals)\b']
    # Possessive normalisation is handled by the v3 extractor, not by adding
    # individual reviewed examples to a special-case lookup.
    return result


if __name__=='__main__':
    root = Path(__file__).resolve().parent/'rubrics'
    output = root/'english-science-coverage-v3.json'
    if output.exists():
        raise FileExistsError(output)
    source = json.loads((root/'english-science-coverage-v2.json').read_text(encoding='utf-8'))
    output.write_text(json.dumps(build(source), ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
