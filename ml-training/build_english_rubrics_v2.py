"""Versioned evidence policy changes motivated by the first human review.

Patterns are finite lexical relation checks, not a semantic entailment engine.
Never edit the old rubric or the frozen human-review packet.
"""
import copy
import json
from pathlib import Path


def build(source):
    result=copy.deepcopy(source)
    result['version']='english-science-coverage-v2'
    result['provenance']='AI-authored revision after human-review-01 error analysis; old challenge is now development data. Not teacher-certified.'
    concepts={c['id']:c for c in result['concepts']}
    def point(cid,pid):return next(p for p in concepts[cid]['points'] if p['id']==pid)
    p=point('sci-g10-cbl-007','reagent')
    p['groups']=[['benedict'],['add','added','adding','mix','mixed','mixing','drops','combine','combined','treat','treated']]
    p=point('sci-g10-cbl-007','heat')
    p['groups']=[['heat','heating','heated','hot','boiling','warm'],['water bath','bath']]
    p['contextPatterns']=[r'\bbenedict\b',r'\breducing sugars?\b']
    p['rejectPatterns']=[r'\b(?:no|not|without|unnecessary|optional)\b.{0,24}\bheat',r'\bheating\b.{0,25}\b(?:optional|unnecessary|not needed)\b']
    p=point('sci-g10-cbl-007','result')
    p['contextPatterns']=[r'\bbenedict\b',r'\breducing sugars?\b',r'\bglucose\b']
    p=point('sci-g10-col-001','sexual')
    p['rejectPatterns']=[r'\b(?:without|no|not|never|absence of)\b.{0,25}\b(?:fusion|fuse|fertilis|fertiliz)',r'\bgametes?\b.{0,12}\b(?:do not|dont|never)\b.{0,12}\bfuse']
    p=point('sci-g10-col-001','asexual')
    p['groups']=[['asexual','budding','cutting','vegetative'],['one parent','single parent','no fusion','without fusion','without gamete fusion','without fertilisation','without fertilization','genetically alike','identical']]
    p=point('sci-g10-som-005','different-neutrons')
    p['supportPatterns']=[r'\b(?:different|unequal|extra|more|fewer)\s+(?:(?:numbers?|counts?)\s+of\s+)?neutrons?\b',r'\bneutron\s+(?:numbers?|counts?)\b.{0,35}\b(?:differ|different|unequal|change)',r'\bneutrons?\b.{0,12}\b(?:differ|vary)']
    p['rejectPatterns']=[r'\b(?:not|no|without)\s+(?:any\s+)?(?:different|extra|more|fewer)\s+neutrons?\b']
    p=point('sci-g10-cur-006','relationship')
    p['rejectPatterns']=[r'\b(?:inversely|not directly)\s+proportional\b']
    p['supportPatterns']=[r'\b(?:directly\s+)?proportional\b',r'\bv\s*/\s*i\b.{0,35}\b(?:constant|same|fixed)',r'\b(?:voltage|potential difference)\b.{0,25}\bdouble\w*\b.{0,25}\bcurrent\b',r'\bdouble\w*\s+(?:the\s+)?voltage\b.{0,30}\bdouble\w*\s+(?:the\s+)?current\b']
    p=point('sci-g11-hea-003','units')
    p['contextPatterns']=[r'\bspecific heat\b',r'\bq\s*=\s*mc\b',r'\bc\s*=']
    p=point('sci-g11-hea-003','difference')
    p['contextPatterns']=[r'\bspecific heat\b',r'\bq\s*=\s*mc\b',r'\btemperature\s+(?:change|difference|rise|drop)\b',r'\b(?:initial|final)\s+temperature\b']
    p=point('sci-g11-mix-009','setup')
    p['rejectPatterns']=[r'\b(?:not|never)\s+(?:be\s+)?above\b']
    p=point('sci-g11-mix-009','phases')
    p['groups']=[['paper'],['solvent'],['stationary','mobile']]
    p=point('sci-g11-pea-001','rate')
    p['rejectPatterns']=[r'\b(?:not|never)\b.{0,18}\b(?:per second|each second|every second|rate)\b']
    p=point('sci-g11-pea-001','units')
    p['text']='Power is measured in watts (W), which are joules per second.'
    concepts['sci-g11-pea-001']['points'].append({
        'id':'kilowatt-conversion','text':'Use 1 kW = 1000 W, or correctly demonstrate an equivalent conversion.',
        'groups':[['kw','kilowatt','kilowatts'],['w','watt','watts']],
        'numericCheck':'kilowatt_conversion'})
    concepts['sci-g10-som-005']['concernPatterns']=[r'\b(?:extra|more)\s+electrons?\b.{0,60}\bmass',r'\bmass\s+(?:number|difference)\b.{0,40}\b(?:because|due to|caused by)\b.{0,30}\belectrons?']
    concepts['sci-g10-cur-006']['concernPatterns']=[r'\b(?:more|higher|raising|increas\w*)\s+(?:the\s+)?voltage\b.{0,70}\b(?:less|smaller|fall\w*|decreas\w*)\b.{0,15}\bcurrent\b']
    concepts['sci-g11-mix-009']['concernPatterns']=[r'\b(?:submerge|submerging|immerse|immersing)\b.{0,25}\b(?:spot|sample)\b',r'\b(?:spot|sample)\b.{0,18}\b(?:below|underwater)\b']
    return result


if __name__=='__main__':
    root=Path(__file__).resolve().parent/'rubrics'
    output=root/'english-science-coverage-v2.json'
    if output.exists():raise FileExistsError(output)
    output.write_text(json.dumps(build(json.loads((root/'english-science-coverage-v1.json').read_text(encoding='utf-8'))),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
