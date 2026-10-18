import test from 'node:test';
import assert from 'node:assert/strict';
import {processingIsExpired,expireProcessingNote,claimProcessing,processingLeaseFilter,PROCESSING_LIMIT_MS} from './processingLease';
import {Note} from '../models/Note';
const makeNote=()=>new Note({userId:'synthetic',title:'Fixture',imageUrl:'/unused.png',status:'processing',updatedAt:new Date(),
  processingRunId:'old',processingLeaseExpiresAt:new Date(Date.now()+90000),processingProgress:{startedAt:new Date().toISOString()}});
test('a live long stage remains active; lost leases and legacy stalled jobs expire; a hard limit bounds hung workers',()=>{
  const note=makeNote();assert.equal(processingIsExpired(note),false);
  note.processingLeaseExpiresAt=new Date(0);assert.equal(processingIsExpired(note),true);
  note.processingLeaseExpiresAt=new Date(Date.now()+90000);note.processingProgress!.startedAt=new Date(Date.now()-PROCESSING_LIMIT_MS-1).toISOString();assert.equal(processingIsExpired(note),true);
  note.processingRunId=undefined;note.processingLeaseExpiresAt=undefined;note.processingProgress=undefined;note.updatedAt=new Date(Date.now()-PROCESSING_LIMIT_MS-1000);assert.equal(processingIsExpired(note),true);
  note.status='analyzed';assert.equal(processingIsExpired(note),false);
});
test('interrupted reanalysis keeps prior results and expiry cannot modify a superseding attempt',async t=>{
  const note=makeNote();note.processingLeaseExpiresAt=new Date(0);note.analysis={subject:'Science',topic:'Previous'} as any;
  const mock=t.mock.method(Note,'updateOne',async(filter:any)=>{assert.equal(filter.processingRunId,'old');assert.equal(filter.updatedAt,note.updatedAt);return {modifiedCount:1} as any;});
  await expireProcessingNote(note);assert.equal(note.status,'analyzed');assert.equal(note.analysis?.topic,'Previous');assert.equal(note.processingRunId,undefined);
  mock.mock.restore();const replaced=makeNote();replaced.processingLeaseExpiresAt=new Date(0);
  t.mock.method(Note,'updateOne',async()=>({modifiedCount:0} as any));assert.equal(await expireProcessingNote(replaced),false);assert.equal(replaced.status,'processing');
});
test('new attempts use compare-and-set ownership, and failed claims do not start a pipeline',async t=>{
  const note=makeNote();note.status='failed';
  const mock=t.mock.method(Note,'updateOne',async(filter:any,update:any)=>{assert.equal(filter.status.$ne,'processing');assert.ok(update.$set.processingLeaseExpiresAt>Date.now());return {modifiedCount:1} as any;});
  const token=await claimProcessing(note);assert.ok(token);const filter=processingLeaseFilter(String(note._id),token!);assert.equal(filter.processingRunId,token);assert.equal(filter.status,'processing');
  mock.mock.restore();t.mock.method(Note,'updateOne',async()=>({modifiedCount:0} as any));assert.equal(await claimProcessing(note),null);
});
