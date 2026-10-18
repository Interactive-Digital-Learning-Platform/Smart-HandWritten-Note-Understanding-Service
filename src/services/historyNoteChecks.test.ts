import test from 'node:test';
import assert from 'node:assert/strict';
import {HistoryNoteChecks,historySourceRevision,SavedHistoryCheck} from './historyNoteChecks';
import {HistoryCoverageReviewService} from './historyCoverageReviewService';
import {Note} from '../models/Note';

function fixture(){
  const note:any={_id:'fixture',userId:'owner',status:'analyzed',rawText:'Active English note.',analysis:{subject:'History',analyzedAt:new Date()},historyCoverageCheck:undefined};
  const store:any={load:async(_id:string,user:string)=>user===note.userId?note:null,
    claim:async(_id:string,_user:string,check:SavedHistoryCheck)=>{if(note.historyCoverageCheck?.state==='running'&&new Date(note.historyCoverageCheck.expiresAt).getTime()>Date.now())return false;note.historyCoverageCheck=structuredClone(check);return true;},
    finish:async(_id:string,_user:string,jobId:string,state:string,patch:any)=>{const old=note.historyCoverageCheck;if(!old||old.jobId!==jobId||old.state!=='running'||state==='ready'&&new Date(old.expiresAt).getTime()<=Date.now())return false;Object.assign(old,patch,{state});return true;}};
  return {note,store};
}
const input={text:'Reviewed English note.',conceptId:'hist-g11-l02-c01',scopeConfirmed:true,language:'English'};
test('an acknowledged check is persisted before completion, restores after navigation, and never changes scores',async()=>{
  const {note,store}=fixture();let resolve!:(result:any)=>void;
  const service=new HistoryCoverageReviewService(async()=>new Promise(done=>resolve=done));
  const jobs=new HistoryNoteChecks(service,store);const before=JSON.stringify(note.analysis);
  assert.equal((await jobs.start('fixture','owner',input)).state,'running');
  assert.equal((await new HistoryNoteChecks(service,store).get('fixture','owner')).state,'running');
  await assert.rejects(jobs.start('fixture','owner',input),/Another History/);
  resolve({suggestedStatus:'partial'});await jobs.completion;
  const restored=await new HistoryNoteChecks(service,store).get('fixture','owner');
  assert.equal(restored.state,'ready');assert.equal((restored as any).result.analyzedText,input.text);
  assert.equal(JSON.stringify(note.analysis),before);assert.equal(note.rawText,'Active English note.');service.dispose();
});
test('ownership and analyzed-state checks fail before inference',async()=>{
  const {note,store}=fixture();let called=0;
  const service=new HistoryCoverageReviewService(async()=>{called++;throw Error('must not infer');});const jobs=new HistoryNoteChecks(service,store);
  await assert.rejects(jobs.start('fixture','foreign',input),/Note not found/);await assert.rejects(jobs.get('fixture','foreign'),/Note not found/);
  note.status='processing';await assert.rejects(jobs.start('fixture','owner',input),/Finish analyzing/);assert.equal(called,0);service.dispose();
});
test('changed OCR, context or reanalysis invalidates saved results; a late result cannot be presented as current',async()=>{
  const {note,store}=fixture();let resolve!:(result:any)=>void;
  const service=new HistoryCoverageReviewService(async()=>new Promise(done=>resolve=done));const jobs=new HistoryNoteChecks(service,store);
  await jobs.start('fixture','owner',input);note.rawText='Changed note';resolve({});await jobs.completion;
  assert.equal((await jobs.get('fixture','owner')).state,'stale');assert.equal((await jobs.get('fixture','owner') as any).result,undefined);
  const hash=historySourceRevision(note);note.userLessonId='another';assert.notEqual(historySourceRevision(note),hash);service.dispose();
});
test('provider failure is retryable, interrupted jobs expire, and late results cannot replace the failed state',async()=>{
  const {note,store}=fixture();const service=new HistoryCoverageReviewService(async()=>{throw Error('private provider details');});const jobs=new HistoryNoteChecks(service,store);
  await jobs.start('fixture','owner',input);await jobs.completion;let saved=await jobs.get('fixture','owner');
  assert.equal(saved.state,'failed');assert.doesNotMatch(JSON.stringify(saved),/private provider/);
  note.historyCoverageCheck.state='running';note.historyCoverageCheck.expiresAt=new Date(0);
  saved=await new HistoryNoteChecks(service,store).get('fixture','owner');assert.equal(saved.state,'failed');
  assert.equal(await store.finish('fixture','owner',note.historyCoverageCheck.jobId,'ready',{result:{}}),false);service.dispose();
});
test('history check state survives Mongoose serialization without changing an existing analysis',()=>{
  const {note}=fixture();const doc=new Note({userId:'owner',title:'Synthetic',imageUrl:'/unused.png',analysis:{subject:'History',topic:'Fixture'},
    historyCoverageCheck:{jobId:'fixture',state:'running',sourceRevision:historySourceRevision(note),input,expiresAt:new Date(Date.now()+10000),requestedAt:new Date()}});
  assert.equal(doc.validateSync(),undefined);const restored=Note.hydrate(JSON.parse(JSON.stringify(doc)));
  assert.equal(restored.historyCoverageCheck?.state,'running');assert.equal(restored.historyCoverageCheck?.input.text,input.text);
});
