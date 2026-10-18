"""Prepare unscored synthetic texts for human review of frozen History V3.2."""
import argparse
import hashlib
import json
from pathlib import Path
import random
import re
import sys
ROOT=Path(__file__).resolve().parent

# No intended labels or model predictions are supplied to the reviewer.
EXAMPLES={
 'hist-g10-l03-c01':[
  'Before there was kingship across the island, wealthy chiefs controlled individual regions. In early inscriptions the title Parumaka identifies such local leaders.',
  'In the period before island-wide kingship, prosperous chieftains exercised authority over local regions.',
  'What was regional leadership before island-wide kingship? Who were the prosperous chiefs? Explain the title Parumaka in inscriptions. These revision questions still need answers.'
 ],
 'hist-g10-l04-c01':[
  'A king did not conduct administration alone: officers and local leaders helped carry it out. Ordinary villagers also made up the population, and their everyday activities are an important part of social history.',
  'Officers and local leaders helped kings conduct administration in different areas.',
  'The population included ordinary villagers whose activities form part of social history. Kings carried out administration without relying on officers or other local leaders.'
 ],
 'hist-g10-l05-c01':[
  'People in ancient communities watched nature and applied practical observations in daily work. Experience collected over time contributed to their engineering and other technical achievements.',
  'Ancient people learned through observing nature and using practical observations in everyday activities.',
  'Add Benedict solution to a food sample and warm it in a water bath. A coloured precipitate can indicate reducing sugars.'
 ],
 'hist-g10-l07-c01':[
  'Ancient urban life had major centres at Anuradhapura and Polonnaruwa. Cities grew with administration, surplus economic production and exchanges.',
  'Anuradhapura and Polonnaruwa were important centres of ancient urban life.',
  'Identify Anuradhapura and Polonnaruwa as ancient cities. Explain their administration, economic surplus and exchanges. I have not yet written the explanation.'
 ],
 'hist-g11-l02-c01':[
  'Sri Lanka was valuable to Britain for its location along Indian Ocean sea routes. The port of Trincomalee was strategically important for naval security near India.',
  'Trincomalee harbour gave Britain an important strategic position for naval security around India.',
  'Explain why Britain valued the island location on Indian Ocean sea routes. Describe the strategic port at Trincomalee and naval security around India. These tasks remain unanswered.'
 ],
 'hist-g11-l04-c01':[
  'British colonial government and administration were reorganised through the reforms of 1833. Councils were created and the administrative divisions were reshaped.',
  'The reforms of 1933 reorganised British colonial government and administration. They established councils and reshaped administrative divisions.',
  'Revision questions: what did the 1833 reforms change in colonial administration? How were councils and administrative divisions affected? Answer later.'
 ],
 'hist-g11-l05-c01':[
  'British economic policy promoted plantation agriculture for exports. Growing coffee, tea and rubber changed economic activity as well as the ways land was used.',
  'British policies encouraged plantations to grow agricultural products for export.',
  'Describe British export-oriented plantations. Explain coffee, tea and rubber and their effects on economic activity and land use. Unanswered revision tasks.'
 ],
 'hist-g11-l08-c01':[
  'Rivalries and alliances between European powers helped bring about the First World War. It began in Europe and spread as several major powers participated.',
  'Rivalry and alliances among European powers helped cause the First World War.',
  'The First World War began in Europe and spread through several major powers. Rivalries and alliances among European powers played no part in causing it.'
 ]}


def build(output):
    out=Path(output);out.mkdir(parents=True,exist_ok=False)
    candidate=ROOT/'outputs/history-coverage-v3.2-2026-10-15'
    model=json.loads((candidate/'model.json').read_text(encoding='utf-8'))
    concepts={c['id']:c for c in model['rubrics']['concepts']}
    curriculum=json.loads((ROOT/'outputs/history-dataset-intake-2026-10-14/source/curriculum.json').read_text(encoding='utf-8'))
    refs={c['id']:c.get('sourceReference') for lesson in curriculum['lessons'] for c in lesson['concepts']}
    examples=[]
    for cid,texts in EXAMPLES.items():
        for text in texts:
            examples.append({'conceptId':cid,'conceptName':concepts[cid]['name'],'grade':int(cid.split('-')[1][1:]),
                'requirements':concepts[cid]['sourceCriteria'],'sourceReference':refs[cid],'text':text,
                'humanLabel':None,'requiresAdjudication':False,'comment':''})
    random.Random(3215).shuffle(examples)
    for i,e in enumerate(examples):e['id']=f'history-v32-human-{i+1:02d}'
    # Screen exact note text against staged input and previous review/check outputs.
    known=set()
    for name in ['page-training-examples.jsonl','note-references.jsonl']:
        for line in (ROOT/'outputs/history-dataset-intake-2026-10-14/source'/name).read_text(encoding='utf-8').splitlines():
            if line.strip():known.add(json.loads(line)['noteTextSnapshot'].strip())
    for experiment in ROOT.joinpath('outputs').glob('history-*'):
        for name in ['diagnostic-challenges.json','new-diagnostic-checks.json','fresh-ai-diagnostics.json','new-ai-checks.json','new-paraphrase-checks.json','decisions.json']:
            path=experiment/name
            if not path.exists():continue
            content=json.loads(path.read_text(encoding='utf-8'))
            records=content if isinstance(content,list) else content.get('examples',[])
            known.update(r['text'].strip() for r in records if isinstance(r,dict) and isinstance(r.get('text'),str))
    if any(e['text'].strip() in known for e in examples):raise ValueError('A new text duplicates an existing example')
    if len({e['text'] for e in examples})!=len(examples):raise ValueError('Duplicate new texts')
    packet={'version':'history-v32-human-review-01','candidateVersion':model['metadata']['experimentId'],
        'candidateSha256':hashlib.sha256((candidate/'model.json').read_bytes()).hexdigest(),
        'synthetic':True,'modelPredictionsIncluded':False,'modelScoredBeforeHumanReview':False,
        'reviewerName':'','reviewerType':'','independentHumanReview':False,
        'note':'New synthetic prose based on proposed criteria. Independent human labels requested. Text novelty does not imply independent authorship or representative real-note sampling.',
        'examples':examples}
    encoded=json.dumps(packet,ensure_ascii=False,indent=2)+'\n'
    (out/'review-template.json').write_text(encoded,encoding='utf-8')
    payload=json.dumps(packet,ensure_ascii=False).replace('<','\\u003c')
    html=HTML.replace('PACKET_JSON',payload)
    (out/'review.html').write_text(html,encoding='utf-8')
    summary={'examples':len(examples),'concepts':len(EXAMPLES),'gradeCounts':{str(g):sum(e['grade']==g for e in examples) for g in (10,11)},
        'modelScored':False,'modelTrained':False,'exactTextDuplicateScreenPassed':True,
        'templateSha256':hashlib.sha256(encoded.encode()).hexdigest(),'candidateSha256':packet['candidateSha256'],
        'sourceScriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    (out/'preparation.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary,indent=2))


HTML='''<!doctype html><html lang="en"><meta charset="utf-8"><title>History V3.2 subject review</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:17px system-ui;color:#17243b;background:#f5f7fc;max-width:900px;margin:32px auto;padding:0 20px}article{background:white;border:1px solid #d8dfef;border-radius:12px;padding:22px;margin:24px 0}pre{font:inherit;white-space:pre-wrap;line-height:1.55}label{display:block;margin:15px 0}select,input,textarea,button{font:inherit;padding:10px;max-width:100%;box-sizing:border-box}textarea{width:100%;min-height:90px}button{border:0;border-radius:8px;background:#254cc5;color:white}header{border-bottom:1px solid #ccd5e6;padding-bottom:18px}#message{color:#8d2d0c}small{color:#52627b}</style>
<header><h1>History subject review</h1><p>24 new synthetic English texts across eight Grade 10–11 targets. This packet contains no model predictions or intended labels. Please assess the historical correctness of each text and the proposed criterion; the criteria have not been independently certified. This is a text review, not a handwriting test.</p>
<p><strong>Complete:</strong> correct coverage of all major requirements. <strong>Partial:</strong> meaningful coverage with an omission or substantial error. <strong>Missing:</strong> no substantive target explanation, including unanswered prompts. Choose <strong>Needs clarification</strong> when the criterion or label cannot be decided confidently, and explain why.</p>
<label>Reviewer name <input id="name" autocomplete="name"></label>
<label>Review performed by <select id="type"><option value="">Choose reviewer type</option><option value="human">Human</option><option value="human_with_ai_assistance">Human with AI assistance</option><option value="AI">AI</option></select></label>
<label><input id="independent" type="checkbox"> I personally assigned labels before seeing model predictions or asking AI to assign labels.</label><p id="progress" aria-live="polite"></p><small>Decisions remain in this tab until downloaded. Download before closing it.</small></header>
<main id="examples"></main><button id="download">Download reviewed JSON</button><p id="message" role="status"></p>
<script>const packet=PACKET_JSON;const chosen=new Set();
function progress(){document.getElementById('progress').textContent=chosen.size+' / '+packet.examples.length+' reviewed';}
document.getElementById('type').onchange=()=>{const c=document.getElementById('independent');c.disabled=document.getElementById('type').value!=='human';if(c.disabled)c.checked=false;};
packet.examples.forEach((e,i)=>{const a=document.createElement('article');const h=document.createElement('h2');h.textContent=(i+1)+'. Grade '+e.grade+' — '+e.conceptName;a.append(h);const req=document.createElement('p');req.textContent='Proposed required coverage: '+e.requirements;a.append(req);const t=document.createElement('pre');t.textContent=e.text;a.append(t);const l=document.createElement('label');l.textContent='Your decision ';const s=document.createElement('select');[['','Choose'],['present','Complete'],['partial','Partial'],['missing','Missing'],['clarify','Needs clarification']].forEach(([value,name])=>{const o=document.createElement('option');o.value=value;o.textContent=name;s.append(o)});s.onchange=()=>{e.requiresAdjudication=s.value==='clarify';e.humanLabel=e.requiresAdjudication?null:s.value||null;if(s.value)chosen.add(e.id);else chosen.delete(e.id);progress()};l.append(s);a.append(l);const c=document.createElement('textarea');c.setAttribute('aria-label','Comment for example '+(i+1));c.placeholder='Explain errors, omissions, or unclear criteria. Required for Needs clarification.';c.oninput=()=>e.comment=c.value;a.append(c);document.getElementById('examples').append(a);});progress();
document.getElementById('download').onclick=()=>{const message=document.getElementById('message');packet.reviewerName=document.getElementById('name').value.trim();packet.reviewerType=document.getElementById('type').value;packet.independentHumanReview=packet.reviewerType==='human'&&document.getElementById('independent').checked;if(!packet.reviewerName||!packet.reviewerType||chosen.size!==packet.examples.length){message.textContent='Enter reviewer details and choose a decision for all examples.';return}if(packet.examples.some(e=>e.requiresAdjudication&&!e.comment.trim())){message.textContent='Explain every Needs clarification decision before downloading.';return}packet.reviewedAt=new Date().toISOString();const url=URL.createObjectURL(new Blob([JSON.stringify(packet,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='history-v32-reviewed.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message.textContent='Downloaded history-v32-reviewed.json. Return this file for frozen-model evaluation.';};</script></html>'''


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',required=True);build(p.parse_args().output)
