"""Record the assistant's transcript/rubric audit separately from original AI labels.

This is an exposed development review, not human confirmation or independent
evaluation. Targets below were chosen by reading all 13 complete transcripts,
the exact model requirements and source error ledgers, without fitting on them.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATASET = ROOT / 'outputs/history-student-ef-labels-2026-10-18-02'
EXPECTED = '5fe60e3fb4006ee8319a4276e6cf3f0ef29ea7e46801d283858badd30ea50dc1'

# C = all required ideas supported without a relevant contradiction; P = some
# substantive support, but missing/contradictory required ideas; M = no substantive
# support for this concept in its required historical period (not just a heading).
REVIEW = {
    'L04-E': {4:'M',5:'M'},
    'L04-F': {1:'P',2:'P',4:'M',5:'M'},
    'L05-E': {1:'P',2:'M',3:'P',4:'C',5:'M'},
    'L05-F': {1:'P',2:'M',3:'P',5:'M'},
    'L06-E': {1:'P',3:'P',4:'M',5:'C'},
    'L06-F': {1:'P',2:'P',4:'M',5:'P'},
    'L20-F': {1:'C',2:'P',3:'P',4:'M',5:'P'},
    'L21-E': {1:'P',2:'P'},
    'L21-F': {1:'P',4:'P'},
    'L22-F': {1:'M',2:'M',3:'P',4:'M',5:'P'},
    'L28-E': {1:'P',2:'P',3:'M',4:'M',5:'P'},
    'L28-F': {1:'P',3:'P',4:'M',5:'P'},
    'L29-F': {1:'P',2:'P',3:'P',5:'M'},
}

# Exact source anchors, not invented replacement answers. The full paragraph
# containing each anchor is retained with exact offsets for subsequent inspection.
ANCHORS = {
 'L04-F:1':['Hunting , gathering and use of varied food resources supported life'],
 'L04-F:2':['Fa Hien - lena , Batadomba - lena , Belilena'],
 'L05-E:1':['people abandoned their hunting livelihood'],
 'L05-E:3':['stone tools used in the prehistoric era','hunting including the subsisting method of gathering food'],
 'L05-E:4':['building permanent settlements and starting agriculture','The megalithic burials constructed for the dead'],
 'L05-F:1':['people abandoned their hunting livelihood'],
 'L05-F:3':['technology of stone tools , hunting including'],
 'L06-E:1':['Those who made their early settlements in this country were Homo Sapiens'],
 'L06-E:3':['stone tools , used by the prehistoric people','adapting themselves to diverse environmental zones'],
 'L06-E:5':['A family was represented by the chief householder','Taking the commodities produced in the villages for trading'],
 'L06-F:1':['main livelihood was hunting and gathering food','adapting themselves to diverse environmental zones'],
 'L06-F:2':['This soil layer is known as Iranamadu Deposit'],
 'L06-F:5':['Every early historic settlement was a large city with the same occupations','A family was represented by the chief householder'],
 'L20-F:1':['Anuradhapura and later Polonnaruwa formed major centres','production surplus'],
 'L20-F:2':['one cause with no economic or political connections','struggle between the Pandyans'],
 'L20-F:3':['shift of centres toward the south - west'],
 'L20-F:5':['another process of urbanization','Operating several ruling centres'],
 'L21-E:1':['not as large as the Anuradhapura and Polonnaruwa ones'],
 'L21-E:2':['weak rulers came to power after the death of King Nissankamalla','decline in agriculture and trade'],
 'L21-F:1':['not as large as the Anuradhapura and Polonnaruwa ones'],
 'L21-F:4':['a group of provincial leaders rebelled against him','selected Yapahuwa , since it was a safer place',
             'Dambadeniya , Yapahuwa and Kurunegala were all one city with three names'],
 'L22-F:3':['affected to transfer the ancient kingdoms','During the ruling period of King Parakramabahu II in Dambadeniya'],
 'L22-F:5':['non existence of the capital at one place','international trade relations got more developed'],
 'L28-E:1':['only one advantage , its climate','Growing demand at home and in colonial markets'],
 'L28-E:2':['Richard Arkwright produced a more efficient , water powered spinning wheel'],
 'L28-E:5':['farmers who lost their land migrated to cities in search of jobs'],
 'L28-F:1':['only one advantage , its climate','political stability that was prevailing in Britain'],
 'L28-F:3':['Coal , iron and other resources supported machinery and energy needs'],
 'L28-F:5':['farmers who lost their land migrated to cities in search of jobs'],
 'L29-F:1':['industrial revolution in Britain was based on three industries','high demand that came from their own colonies'],
 'L29-F:2':['James Hargreaves produced a machine','Samuel Crompton who used the functioning principles'],
 'L29-F:3':['Steam engines made transport and factories completely independent of fuel supplies','smelting ore using coal'],
}

REASONS = {
 'L04-F:1':'Hunting/gathering survival is explained. The required age and Homo sapiens identification are absent; the exclusive dry-zone/cave assertion is also contradictory. Substantive partial support is not Missing.',
 'L04-F:2':'Named cave sites provide archaeological support, but Rathnapura gravel/animal remains and Iranamadu evidence are absent. Only part of the second requirement is supplied.',
 'L05-E:1':'The transition explicitly describes earlier hunting subsistence. It does not supply the required early-human date, Homo sapiens identification and environmental adaptation account.',
 'L05-E:3':'The text describes prehistoric stone tools and hunting/gathering during the transition. Regional/rainfall variation in prehistoric ways of life is not adequately explained.',
 'L05-F:1':'Earlier prehistoric hunting livelihood is substantive support for part of the survival requirement. The date and Homo sapiens identification are absent.',
 'L06-E:1':'Homo sapiens and adaptation across environmental zones are explicitly described; the exact required age and a hunting/gathering survival account are missing. A broad several-hundred-thousand-years statement cannot satisfy 125,000 years.',
 'L06-F:2':'The Iranamadu deposit and prehistoric stone tools are explained. Rathnapura gravel, animal remains and cave evidence are absent.',
 'L06-F:5':'Gahapathi and intermediate trading settlements are described, but the active assertion that every settlement was the same large city contradicts the settlement distinctions. Complete is unsafe.',
 'L20-F:3':'The move from dry-zone centres towards the southwest is explicit. Dambadeniya and Yapahuwa are not identified in this transcript. One supported requirement makes this Partial.',
 'L21-E:1':'The explicit size comparison identifies Anuradhapura and Polonnaruwa as earlier large cities. The explanation of ancient urban growth through administration, surplus and exchange is incomplete; discussion of later cities is not substituted for it.',
 'L21-E:2':'Weak rulership, irrigation neglect and economic decline are explained. Throne struggles and external pressures on Polonnaruwa are not fully supplied; later attacks on Buvanekabahu are a different episode.',
 'L21-F:1':'Anuradhapura/Polonnaruwa are explicitly contrasted with later smaller cities. The required account of their early urban growth is incomplete; the detailed second-urbanisation account is not the earlier phase.',
 'L21-F:4':'The defence and safer-site account is supplied, but the active claim that Dambadeniya, Yapahuwa and Kurunegala were one city contradicts the distinct-centre relocation required by the second point. This dependency conflict was retained as Partial on a second audit pass.',
 'L22-F:3':'The text explains transfers of royal centres and gives substance about Dambadeniya/Yapahuwa. It does not explain the earlier dry-zone decline and resulting move, so the whole concept is incomplete.',
 'L22-F:5':'Changing capitals, trade and new western ports are explained. The comparison with the earlier dry-zone urban pattern is incomplete. This is substantive partial coverage, not absence.',
 'L28-E:1':'The notebook includes genuine industrialisation causes but explicitly asserts that climate was the only advantage. Some required resources/political conditions are also absent. The contradiction prevents Complete.',
 'L28-E:5':'Land loss, migration into cities and industrial employment directly support social change. Faster/cheaper communication and postal needs are absent. The missing first requirement does not erase the second.',
 'L28-F:5':'Migration, urban labour and employment changes are explicit. The communication/postal-service requirement remains unsupported.',
 'L29-F:1':'Machine production in Britain and colonial demand are substantive support. The complete explanation of capital, resources and political conditions for Britain industrialising first is missing.',
 'L29-F:3':'Coal/metal production and steam/mine uses are explained, but an active claim that steam engines became completely independent of fuel contradicts the fuel role in the required point. Keep Partial.',
}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def run(output):
    output = Path(output).resolve()
    if output.exists():
        raise ValueError('Choose a fresh review output')
    raw = (DATASET / 'dataset.json').read_bytes()
    if sha(raw) != EXPECTED:
        raise ValueError('Original dataset changed')
    data = json.loads(raw)
    splits = json.loads((DATASET / 'split-template.json').read_bytes())
    held = {r['recordId'] for r in splits['rows'] if r['split'] == 'holdout'}
    rows = [r for r in data['rows'] if r['recordId'] in held]
    if len(rows) != sum(len(v) for v in REVIEW.values()):
        raise ValueError('Review must cover the complete reserved set')
    reviewed = []
    for row in rows:
        note = row['noteGroupId'].replace('synthetic-history-', '')
        point = int(row['conceptId'].rsplit('c', 1)[1])
        key = f'{note}:{point}'
        target = {'C':'present','P':'partial','M':'missing'}[REVIEW[note][point]]
        evidence = []
        for anchor in ANCHORS.get(key, []):
            start = row['text'].find(anchor)
            if start < 0:
                raise ValueError(f'Review evidence anchor absent: {key}')
            # Keep the original source paragraph, including punctuation/spacing.
            preceding = row['text'].rfind('\n\n', 0, start)
            a = preceding + 2 if preceding >= 0 else 0
            b = row['text'].find('\n\n', start + len(anchor))
            if b < 0: b = len(row['text'])
            evidence.append({'start':a,'end':b,'quote':row['text'][a:b]})
        if target != 'missing' and not evidence:
            raise ValueError('Substantive reviewed labels need source evidence')
        reason = REASONS.get(key, 'The required ideas are supported without a relevant contradiction.' if target == 'present' else
                             'Only part of the required concept is supplied; missing or conflicting details prevent Complete.' if target == 'partial' else
                             'No substantive passage establishes the required concept in its specified period. Related names, headings or another historical phase are insufficient.')
        reviewed.append({'recordId':row['recordId'],'conceptId':row['conceptId'],'noteGroupId':row['noteGroupId'],
                         'originalTeacherLabel':row['teacherLabel'],'assistantLabel':target,'reason':reason,'evidence':evidence,
                         'textSha256':sha(row['text'].encode('utf-8')),'humanReviewed':False})
    result = {'schemaVersion':'notes-assistant-adjudication-v1','adjudicationRevision':2,'datasetSha256':EXPECTED,
              'reviewerType':'AI assistant','humanReviewed':False,'independentEvaluation':False,
              'interpretation':'All fifty source/rubric cases were inspected. Labels are exposed development adjudication, not human confirmation. Originals remain unchanged and these cases must not be fitted.',
              'rows':reviewed}
    output.mkdir(parents=True)
    (output / 'adjudication.json').write_text(json.dumps(result, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
    print(json.dumps({'reviewed':len(reviewed),'changed':sum(r['originalTeacherLabel'] != r['assistantLabel'] for r in reviewed),
                      'before':dict(Counter(r['originalTeacherLabel'] for r in reviewed)),
                      'after':dict(Counter(r['assistantLabel'] for r in reviewed)), 'humanReviewed':False}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    run(parser.parse_args().output)
