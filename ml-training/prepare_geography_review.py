"""Prepare a blind, source-linked Geography development review; no fitting."""
import hashlib
import json
from pathlib import Path
import random

ROOT = Path(__file__).resolve().parent.parent
INTAKE = ROOT / 'ml-training/outputs/geography-review-source-intake-2026-10-15'
OUT = ROOT / 'ml-training/outputs/geography-coverage-source-review-01-2026-10-15'

# AI-authored proposals, not an official mark scheme. The English Grade 11
# textbook is the criterion source; the Sinhala guide is inventoried only.
CONCEPTS = [
 ('geo-g10-u01-earth-system', 'Earth subsystems and their interaction', 10, 1, [13,14], [28,29], [
  'Names the atmosphere, lithosphere, hydrosphere and biosphere as the four Earth subsystems.',
  'Explains one interaction between subsystems, such as water evaporating from the hydrosphere into the atmosphere.'
 ], [
  'The Earth system includes the atmosphere, lithosphere, hydrosphere and biosphere. These interact: evaporation transfers water from water bodies into the atmosphere.',
  'The Earth has four subsystems: atmosphere, lithosphere, hydrosphere and biosphere.',
  'The four Earth subsystems are the crust, mantle, outer core and inner core. They are four names for layers inside the planet.'
 ]),
 ('geo-g10-u01-lithosphere', 'Structure of the lithosphere', 10, 1, [14], [28,30], [
  'The lithosphere includes the Earth\'s crust and the rigid uppermost part of the mantle.',
  'Distinguishes continental crust and oceanic crust as the two types of crust.'
 ], [
  'The lithosphere is the crust together with the rigid uppermost mantle. The crust has continental and oceanic parts.',
  'The lithosphere consists of the Earth\'s crust and the rigid uppermost mantle.',
  'Lithosphere\nStructure of the lithosphere\nDiagram to be added later'
 ]),
 ('geo-g10-u01-troposphere', 'Main characteristics of the troposphere', 10, 1, [16], [28], [
  'The troposphere is the lowest atmospheric layer, next to the Earth\'s surface.',
  'Most weather, including cloud formation and precipitation, occurs in this layer.',
  'Temperature generally decreases as altitude increases within the troposphere.'
 ], [
  'The troposphere lies nearest the ground. Most clouds, rainfall and other weather occur here, and air temperature generally falls with increasing height.',
  'The troposphere is the atmospheric layer closest to the Earth\'s surface, where most weather occurs.',
  'The hydrosphere contains water in oceans, rivers and lakes.'
 ]),
 ('geo-g10-u01-water-cycle', 'Main transfers in the water cycle', 10, 1, [20], [29,30], [
  'Water enters the atmosphere as vapour through evaporation from surfaces and transpiration from plants.',
  'Water vapour condenses into droplets and water returns to the surface as precipitation.',
  'Returned water moves as surface runoff or infiltrates the ground, continuing circulation.'
 ], [
  'Water evaporates from water bodies and plants release vapour by transpiration. Vapour condenses into droplets, then precipitation returns water to land. It runs over the surface or infiltrates the soil, continuing the cycle.',
  'Evaporation from lakes and transpiration from plants supply water vapour to the atmosphere. Condensation forms droplets and rain returns water to the ground.',
  'Water cycle: water always travels from the atmosphere into the Sun and never returns to the Earth.'
 ]),
 ('geo-g10-u03-plantation', 'Defining features of plantation agriculture', 10, 3, [51], [38], [
  'Plantation agriculture grows crops commercially on large, organized estates.',
  'Production is mainly oriented towards export markets.'
 ], [
  'Plantation farming is organized crop production on large commercial estates, mainly supplying export markets. Tea is one plantation crop.',
  'Plantation agriculture grows crops commercially on large, organized estates.',
  'Subsistence farming grows food mainly for a household to consume on a small plot.'
 ]),
 ('geo-g11-u01-resources', 'Natural resources and their value', 11, 1, [11], [], [
  'Natural resources are things in the natural environment used to support human life or activities.',
  'Their usefulness or value depends on human needs and available technology, and can change over time.'
 ], [
  'Natural resources are materials and other features of nature that support human life and activities. Their value depends on people\'s needs and technology, so that value can change over time.',
  'Natural resources are things found in nature that people use to support life and economic activities.',
  'Computer factories manufacture natural resources from plastic. A resource has a fixed value that can never change with technology or people\'s needs.'
 ]),
 ('geo-g11-u01-rock-formation', 'Formation of the three main rock types', 11, 1, [13,14], [], [
  'Igneous rocks form when molten rock cools and solidifies.',
  'Sedimentary rocks can form when sediments are deposited and cemented together.',
  'Metamorphic rocks form when existing rocks are changed by heat and pressure.'
 ], [
  'Igneous rock forms as molten material cools and solidifies. Deposited sediments can become sedimentary rock by cementation. Heat and pressure change existing rock into metamorphic rock.',
  'Molten rock cools and solidifies to make igneous rocks. Sedimentary rocks form when deposited sediments become cemented together.',
  'Population density is the number of people per square kilometre.'
 ]),
 ('geo-g11-u03-density', 'Meaning and calculation of population density', 11, 3, [67], [], [
  'Population density means the number of people per unit of land area.',
  'It is calculated as total population divided by land area, commonly expressed as people per square kilometre.'
 ], [
  'Population density is how many people live in a unit of land area. Divide the population by land area in square kilometres to obtain people per square kilometre.',
  'Population density tells us how many people inhabit a unit area of land.',
  'Population density is the total number of births in a year. Calculate it by multiplying births by the total population.'
 ]),
 ('geo-g11-u07-landslide-causes', 'Natural and human causes of landslides', 11, 7, [114], [], [
  'Identifies a natural factor that increases landslide risk, such as prolonged heavy rain or steep slopes.',
  'Identifies a human activity that increases landslide risk, such as clearing slope vegetation, quarrying or obstructing natural drainage.'
 ], [
  'Long periods of heavy rainfall can increase landslide risk on steep slopes. Human activities such as clearing forests on slopes or cutting into hillsides can also increase the risk.',
  'Heavy, continuous rain and steep mountain slopes are factors that can contribute to landslides.',
  'Population distribution describes where people live. Densely populated areas have many residents.'
 ]),
 ('geo-g11-u07-landslide-prevention', 'Reducing landslide risk on slopes', 11, 7, [115], [], [
  'Protecting or restoring vegetation cover on slopes helps reduce landslide risk.',
  'Maintaining natural drainage and avoiding obstruction of waterways helps reduce landslide risk.'
 ], [
  'Protect vegetation on slopes and restore cleared cover. Keep natural drainage routes open so water is not obstructed; these measures help reduce landslide risk.',
  'Keep vegetation cover on sloping land instead of clearing the slopes.',
  'To reduce landslides, cut down every tree on a steep slope and block all natural drainage channels.'
 ]),
]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    manifest = json.loads((INTAKE/'manifest.json').read_text(encoding='utf-8'))
    for source in manifest['sources']:
        assert digest(Path(source['path'])) == source['sha256'], 'A source changed'
    pages = {(r['sourceId'],r['pdfPage']):r for r in map(json.loads,(INTAKE/'pages.jsonl').read_text(encoding='utf-8').splitlines())}
    concepts, examples = [], []
    for cid,name,grade,unit,book,guide,points,texts in CONCEPTS:
        refs=[]
        for role,numbers in [('textbook',book),('teacher-guide',guide)]:
            for number in numbers:
                sid=f'geo-g{grade}-{role}'
                page=pages[(sid,number)]
                assert page['text'].strip()
                assert hashlib.sha256(page['text'].encode('utf-8')).hexdigest()==page['textSha256']
                refs.append(dict(sourceId=sid,pdfPage=number,textSha256=page['textSha256']))
        concepts.append(dict(id=cid,name=name,grade=grade,unitNumber=unit,
            scopeNote='Assess only the required points below when this topic is in scope. Examples and diagrams are not required unless a point explicitly requests them.',
            guideAlignmentStatus='English guide learning outcomes checked' if grade==10 else 'Pending: supplied Grade 11 guide is Sinhala; criteria proposed from English textbook only',
            points=[dict(id=f'p{i+1}',text=p) for i,p in enumerate(points)],sourceReferences=refs,
            criterionReview=None,criterionComment='',liveCurriculumMapping=None))
        for i,text in enumerate(texts,1):
            examples.append(dict(id=f'{cid}-review-{i}',conceptId=cid,text=text,
                textSha256=hashlib.sha256(text.encode('utf-8')).hexdigest(),humanLabel=None,comment=''))
    # Shuffle within each concept too: displayed order must not reveal a label pattern.
    random.Random(20261015).shuffle(examples)
    packet=dict(version='geography-source-criteria-review-01',synthetic=True,realHandwritingIncluded=False,
        purpose='Development review of proposed criteria and examples, not independent accuracy',
        modelTrained=False,knowledgeBaseIngested=True,teacherGuidesIngested=False,
        sourceLimitations=['Grade 11 teacher guide is Sinhala with legacy font extraction; no verified English translation or detailed guide alignment is claimed.'],
        verifiedTextbooks=json.loads((ROOT/'ml-training/outputs/geography-ingestion-reingest-2026-10-15/verified-textbooks.json').read_text()),
        reviewerName='',concepts=concepts,examples=examples,
        sources=[dict(id=s['id'],url=Path(s['path']).as_uri()) for s in manifest['sources']],
        sourceHashes={s['id']:s['sha256'] for s in manifest['sources']})
    packet['packetSha256']=hashlib.sha256(json.dumps(packet,sort_keys=True,ensure_ascii=False).encode('utf-8')).hexdigest()
    OUT.mkdir(parents=True,exist_ok=True)
    data=(json.dumps(packet,indent=2)+'\n').encode('utf-8')
    if (OUT/'packet.json').exists() and (OUT/'packet.json').read_bytes()!=data:
        raise ValueError('Refusing to overwrite a different review packet')
    (OUT/'packet.json').write_bytes(data)
    (OUT/'rubrics-proposal.json').write_text(json.dumps(dict(subject='Geography',language='English',
        humanApproved=False,automaticUseEnabled=False,scope='10 theory concepts, 5 per grade; not the full syllabus',
        sourceLimitations=packet['sourceLimitations'],concepts=concepts),indent=2)+'\n',encoding='utf-8')
    template=(ROOT/'ml-training/review-geography-source-template.html').read_text(encoding='utf-8')
    (OUT/'review.html').write_text(template.replace('__PACKET__',json.dumps(packet).replace('<','\\u003c')),encoding='utf-8')
    (OUT/'freeze.json').write_text(json.dumps(dict(packetFileSha256=digest(OUT/'packet.json'),
        rubricsFileSha256=digest(OUT/'rubrics-proposal.json'),reviewHtmlSha256=digest(OUT/'review.html'),
        sourceIntakeManifestSha256=digest(INTAKE/'manifest.json'),reviewUse='development_only'),indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(concepts=len(concepts),examples=len(examples),review=str(OUT/'review.html'))))

if __name__=='__main__':
    main()
