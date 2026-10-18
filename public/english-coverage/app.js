(()=>{
 const $=id=>document.getElementById(id),query=new URLSearchParams(location.search),preview=query.get('preview')==='1';
 const prefix=location.pathname.slice(0,location.pathname.indexOf('/english-coverage')).replace(/\/$/,'');
 let catalog=null,record=null,source=null,busy=false;
 const display=label=>({present:'Complete',partial:'Partial',missing:'Missing'}[label]||'Reviewer judgment needed');
 function message(text,error=false){$('message').textContent=text;$('message').className=error?'error':'';}
 function lock(value){busy=value;for(const id of ['expert','key','connect','concept','text','scope','suggest','save','source','load-note','history','refresh-history','open-review'])$(id).disabled=value;
  if(!catalog)for(const id of ['concept','suggest','source','load-note','history','refresh-history','open-review'])$(id).disabled=true;
  const saved=record?.state==='confirmed';if(saved)$('save').disabled=true;
  for(const c of document.querySelectorAll('input[name=label],#comment,#confirmed'))c.disabled=value||saved;
 }
 async function api(url,body){const headers={'Content-Type':'application/json'};if(!preview){headers['X-Expert-Id']=$('expert').value.trim();headers.Authorization='Bearer '+$('key').value.trim();}
  const response=await fetch(prefix+'/api/english-coverage'+url,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const result=await response.json();if(!response.ok||!result.success)throw Error(result.error||'Request failed');return result.data;}
 function invalidate(){record=null;$('result').hidden=true;message('');}
 function requirements(){const c=catalog?.concepts.find(c=>c.id===$('concept').value);$('requirements').replaceChildren(...(c?.points||[]).map(p=>{const li=document.createElement('li');li.textContent=p.text;return li;}));}
 function conceptOptions(ids){const cs=catalog.concepts.filter(c=>!ids||ids.includes(c.id));$('concept').replaceChildren(...cs.map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;return o;}));requirements();}
 async function history(){const rows=await api('/reviews');const first=document.createElement('option');first.value='';first.textContent=rows.length?'Choose a saved review':'No saved reviews';
  $('history').replaceChildren(first,...rows.map(r=>{const o=document.createElement('option');o.value=r.id;const name=catalog.concepts.find(c=>c.id===r.conceptId)?.name||r.conceptId;o.textContent=name+' · '+r.state+(r.humanLabel?' · '+display(r.humanLabel):'');return o;}));}
 async function notes(){const rows=await api('/notes');const first=document.createElement('option');first.value='';first.textContent='Paste text manually';$('source').replaceChildren(first,...rows.map(r=>{const o=document.createElement('option');o.value=r.taskId;o.textContent=r.title+' · '+r.noteGroupId;return o;}));}
 async function loadNote(id){source=await api('/notes/'+encodeURIComponent(id));invalidate();$('source').value=source.taskId;$('text').value=source.noteText;$('scope').checked=false;conceptOptions(source.conceptIds);$('source-info').textContent='Loaded '+source.title+'. Check the OCR text against the original note; edits are kept in this review snapshot.';}
 function render(){const p=record.prediction;$('suggestion').textContent=display(p.suggestedStatus);$('reason').textContent=p.completeSuggestionWithheld?'The complete suggestion was withheld because required evidence was incomplete or a conflict was flagged.':'This is a model suggestion. Check the explanation’s correctness as well as coverage.';
  $('evidence').replaceChildren(...p.evidence.points.map(p=>{const box=document.createElement('div');box.className='point';const title=document.createElement('strong');title.textContent=p.requirement;const tag=document.createElement('span');tag.className='badge';tag.textContent=p.lexicalCoverage===1?'Candidate evidence found — verify its meaning':'Evidence incomplete — check the note';const quote=document.createElement('blockquote');quote.textContent=p.candidateEvidence||'No matching passage found. This alone does not prove the idea is absent.';box.append(title,tag,quote);return box;}));
  $('concerns').replaceChildren(...p.evidence.concerns.map(c=>{const el=document.createElement('p');el.className='notice';el.textContent='Check possible conflict: '+c.quote;return el;}));
  document.querySelectorAll('input[name=label]').forEach(r=>r.checked=r.value===record.humanLabel);$('comment').value=record.comment||'';$('confirmed').checked=record.state==='confirmed';$('saved').textContent=record.state==='confirmed'?'Human judgment saved: '+display(record.humanLabel)+'. Review ID: '+record.id:'';$('download').hidden=record.state!=='confirmed';$('result').hidden=false;
 }
 async function connect(){lock(true);try{if(preview){const mode=await api('/preview-mode');$('mode').textContent=mode.persistent?'Local demo — use synthetic text. Saved reviews persist after restart in a separate demo collection.':'Local preview — synthetic assigned note and temporary reviews. Records disappear when this preview server stops.';}catalog=await api('/concepts');source=null;invalidate();conceptOptions();await Promise.all([notes(),history()]);
   if(query.get('taskId'))await loadNote(query.get('taskId'));message('Ready. Load an assigned note or paste English text.');
  }catch(e){message(e.message,true);}finally{lock(false);}}
 $('connect').onclick=connect;
 for(const id of ['text','scope'])$(id).addEventListener('input',invalidate);
 for(const id of ['expert','key'])$(id).addEventListener('input',()=>{invalidate();source=null;catalog=null;$('text').value='';$('source-info').textContent='Reconnect to load your assigned notes.';lock(false);});
 $('concept').onchange=()=>{invalidate();requirements();};
 $('source').onchange=()=>{invalidate();source=null;$('text').value='';$('scope').checked=false;conceptOptions();$('source-info').textContent=$('source').value?'Click Load assigned note to fetch its current OCR text.':'Paste text manually.';};
 $('load-note').onclick=async()=>{if(!$('source').value){message('Choose an assigned note first.',true);return;}lock(true);try{await loadNote($('source').value);message('OCR text loaded. Confirm scope before requesting a suggestion.');}catch(e){message(e.message,true);}finally{lock(false);}};
 $('refresh-history').onclick=async()=>{lock(true);try{await history();await notes();}catch(e){message(e.message,true);}finally{lock(false);}};
 $('open-review').onclick=async()=>{if(!$('history').value)return;lock(true);try{const restored=await api('/reviews/'+encodeURIComponent($('history').value));source=restored.source?await api('/notes/'+encodeURIComponent(restored.source.taskId)):null;if(source)source.noteTextSha256=restored.source.noteTextSha256;conceptOptions();$('concept').value=restored.input.conceptId;requirements();$('text').value=restored.input.noteText;$('scope').checked=true;record=restored;$('source').value=source?.taskId||'';$('source-info').textContent=source?'Original assigned-note snapshot. A changed source requires a new review.':'Saved manual-text snapshot.';render();message('Saved review loaded.');}catch(e){invalidate();message(e.message,true);}finally{lock(false);}};
 $('suggest').onclick=async()=>{if(busy)return;if(!$('scope').checked||!$('text').value.trim()){message('Provide note text and confirm the selected concept is in scope.',true);return;}
  invalidate();lock(true);message('Reading the note with the trained model…');try{
   const body={noteText:$('text').value,conceptId:$('concept').value,scopeConfirmed:true,language:'English'};
   if(source){body.sourceTaskId=source.taskId;body.sourceTextSha256=source.noteTextSha256;}
   record=await api('/reviews',body);render();await history();message('Suggestion ready. Review the evidence and select your own judgment.');
  }catch(e){message(e.message,true);}finally{lock(false);}};
 $('save').onclick=async()=>{if(!record||busy)return;const label=document.querySelector('input[name=label]:checked')?.value;if(!label||!$('confirmed').checked){message('Select your judgment and check the confirmation box.',true);return;}
  lock(true);try{record=await api('/reviews/'+encodeURIComponent(record.id)+'/confirm',{humanLabel:label,comment:$('comment').value,confirmed:true});render();await history();message('Review saved. Automatic note scores were not changed.');}catch(e){message(e.message,true);}finally{lock(false);}};
 $('download').onclick=()=>{if(record?.state!=='confirmed')return;const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='confirmed-coverage-review-'+record.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 if(preview){$('credentials').hidden=true;$('mode').textContent='Local preview — synthetic assigned note and temporary reviews. Records disappear when this preview server stops.';connect();}else lock(false);
})();
