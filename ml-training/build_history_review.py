"""Blind History review packet; no predicted/intended labels in reviewer file."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'outputs/history-coverage-v1-2026-10-14'


def run():
    rubric=json.loads((OUT/'rubrics.json').read_text(encoding='utf-8'))
    concepts={c['id']:c for c in rubric['concepts']}
    challenges=json.loads((OUT/'diagnostic-challenges.json').read_text(encoding='utf-8'))['examples']
    examples=[{'id':r['id'],'conceptId':r['conceptId'],'text':r['text']} for r in challenges]
    source=ROOT/'outputs/history-dataset-intake-2026-10-14/source/page-training-examples.jsonl'
    selected=[];seen=set()
    # Validation examples only; no additional opening of held-out test examples.
    for label,count in [('present',5),('partial',5),('missing',4)]:
        matching=[json.loads(s) for s in source.read_text(encoding='utf-8').splitlines() if s]
        matching=[r for r in matching if r['preassignedSplit']=='validation' and r['textVariant']=='corrected' and r['targetLabel']==label and r['grade']==11]
        for r in matching:
            if r['concept']['id'] in seen:continue
            seen.add(r['concept']['id']);selected.append(r);count-=1
            if count==0:break
        if count:raise ValueError('Not enough diverse validation cases')
    examples += [{'id':r['recordId'],'conceptId':r['concept']['id'],'text':r['noteTextSnapshot']} for r in selected]
    for r in examples:
        c=concepts[r['conceptId']];r.update({'conceptName':c['name'],'requirements':c['sourceCriteria'],'humanLabel':None,'comment':''})
    packet={'version':'history-coverage-review-01','synthetic':True,'modelPredictionsHidden':True,'includesPreviouslyScoredDevelopmentExamples':True,'meaning':{'present':'Correct and adequate coverage of all major required components.','partial':'Meaningful target-specific coverage, with a major omission or substantial unresolved error.','missing':'No meaningful target-specific explanation; a heading or unanswered question is insufficient.'},'reviewerName':'','examples':examples}
    (OUT/'human-review-template.json').write_text(json.dumps(packet,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    payload=json.dumps(packet,ensure_ascii=False).replace('<','\\u003c')
    html='''<!doctype html><html lang="en"><meta charset="utf-8"><title>History model review</title>
<style>body{font:17px system-ui;max-width:850px;margin:35px auto;padding:0 20px;background:#f7f8fc;color:#16223a}article{background:white;border:1px solid #d7ddec;border-radius:12px;padding:22px;margin:22px 0}pre{white-space:pre-wrap;font:inherit;line-height:1.5}select,textarea,input,button{font:inherit;padding:10px;max-width:100%;box-sizing:border-box}textarea{width:100%;min-height:85px}button{background:#244ac7;color:white;border:0;border-radius:8px}label{display:block;margin:14px 0}#progress{font-weight:bold}</style>
<h1>History concept coverage review</h1><p>These are synthetic English examples. Review the historical correctness and coverage of each target using its proposed criterion. Model outputs and intended labels are hidden. These previously scored examples become development review material; this packet is not a fresh independent accuracy test.</p>
<p><strong>Complete:</strong> correct coverage of all major requirements. <strong>Partial:</strong> meaningful coverage with an omission or substantial error. <strong>Missing:</strong> no meaningful explanation.</p>
<label>Your name <input id="reviewer" autocomplete="name"></label><p id="progress"></p><main id="cases"></main><button id="download">Download reviewed JSON</button><p id="message" role="status"></p>
<script>const packet=PAYLOAD;const root=document.getElementById('cases');
function progress(){document.getElementById('progress').textContent=packet.examples.filter(e=>e.humanLabel).length+' / '+packet.examples.length+' reviewed';}
packet.examples.forEach((e,i)=>{const a=document.createElement('article');const h=document.createElement('h2');h.textContent=(i+1)+'. '+e.conceptName;a.append(h);const req=document.createElement('p');req.textContent='Required coverage: '+e.requirements;a.append(req);const t=document.createElement('pre');t.textContent=e.text;a.append(t);const label=document.createElement('label');label.textContent='Your coverage decision ';const s=document.createElement('select');[['','Choose a label'],['present','Complete'],['partial','Partial'],['missing','Missing']].forEach(([v,n])=>{const o=document.createElement('option');o.value=v;o.textContent=n;s.append(o)});s.onchange=()=>{e.humanLabel=s.value||null;progress()};label.append(s);a.append(label);const c=document.createElement('textarea');c.placeholder='Explain errors, omissions, or a problem with the proposed criterion';c.oninput=()=>e.comment=c.value;a.append(c);root.append(a)});progress();
document.getElementById('download').onclick=()=>{packet.reviewerName=document.getElementById('reviewer').value.trim();const m=document.getElementById('message');if(!packet.reviewerName||packet.examples.some(e=>!e.humanLabel)){m.textContent='Enter your name and review all examples before downloading.';return}packet.reviewedAt=new Date().toISOString();const u=URL.createObjectURL(new Blob([JSON.stringify(packet,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='history-coverage-human-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);m.textContent='Downloaded. Keep the file and send it for analysis.'};</script></html>'''.replace('PAYLOAD',payload)
    (OUT/'human-review.html').write_text(html,encoding='utf-8')
    print('Prepared '+str(len(examples))+' examples; predictions and intended labels omitted.')


if __name__=='__main__':run()
