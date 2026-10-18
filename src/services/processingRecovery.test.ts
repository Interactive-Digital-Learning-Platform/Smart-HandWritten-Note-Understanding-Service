import test from 'node:test';
import assert from 'node:assert/strict';
import {Note} from '../models/Note';
import * as pipeline from '../pipeline';
import * as profiles from './profileService';
import {processNote} from './processingService';
import {PipelineContext} from '../pipeline/types';

function fixture() {
  return new Note({userId:'synthetic',title:'Recovery fixture',imageUrl:'/unused.png',rawText:'Previous text',status:'analyzed',
    updatedAt:new Date(),analysis:{subject:'Science',topic:'Previous lesson',overallCompleteness:75}});
}
const context=(id:string)=>({noteId:id,userId:'synthetic',imageUrl:'/unused.png',rawOcrText:'New text',
  stageResults:[],startedAt:new Date(),curriculumVersion:'fixture',pipelineVersion:'2.1.4'} as PipelineContext);

test('an expired attempt cannot publish or overwrite a replacement, including its failure handler',async t=>{
  const note=fixture();let token='';let pipelineCalled=false;
  t.mock.method(Note,'findById',async()=>note);
  t.mock.method(Note,'exists',async(filter:any)=>{assert.equal(filter.processingRunId,token);return null;});
  t.mock.method(Note,'updateOne',async(filter:any,update:any)=>{
    if(update.$set?.processingRunId){token=update.$set.processingRunId;return {modifiedCount:1} as any;}
    assert.equal(filter.processingRunId,token);assert.equal(filter.status,'processing');
    return {modifiedCount:0} as any;
  });
  t.mock.method(pipeline,'runPipeline',async(input:Parameters<typeof pipeline.runPipeline>[0],options:Parameters<typeof pipeline.runPipeline>[1])=>{
    pipelineCalled=true;
    await assert.rejects(options!.beforeAnalysisPublish!(),/expired or was replaced/);
    await assert.rejects(Promise.resolve(options!.onAnalysisReady!(context(input.noteId))),/expired or was replaced/);
    return {success:false,noteId:input.noteId,error:'Attempt replaced'};
  });
  const result=await processNote(String(note._id),true,{updateStudentProfile:false});
  assert.equal(pipelineCalled,true);assert.equal(result.success,false);
});

test('a profile outage cannot discard an analysis already saved successfully',async t=>{
  const note=fixture();let saved=false;
  t.mock.method(Note,'findById',async()=>note);
  t.mock.method(Note,'exists',async()=>({_id:note._id}));
  t.mock.method(Note,'updateOne',async(_filter:any,update:any)=>{
    if(update.$set?.status==='analyzed')saved=true;
    return {modifiedCount:1} as any;
  });
  t.mock.method(profiles,'updateProfileFromAnalysis',async()=>{throw Error('Synthetic database outage');});
  t.mock.method(pipeline,'runPipeline',async(input:Parameters<typeof pipeline.runPipeline>[0],options:Parameters<typeof pipeline.runPipeline>[1])=>{
    const ctx=context(input.noteId);await options!.beforeAnalysisPublish!();await options!.onAnalysisReady!(ctx);
    return {success:true,noteId:input.noteId,context:ctx};
  });
  const result=await processNote(String(note._id),true);
  assert.equal(result.success,true);assert.equal(saved,true);assert.equal(note.status,'analyzed');assert.equal(note.rawText,'New text');
});

test('a competing claim stops processing before any OCR or model request',async t=>{
  const note=fixture();t.mock.method(Note,'findById',async()=>note);
  t.mock.method(Note,'updateOne',async()=>({modifiedCount:0} as any));
  t.mock.method(pipeline,'runPipeline',async()=>{assert.fail('A lost claim must not run the pipeline');});
  assert.equal((await processNote(String(note._id),true)).success,false);
});
