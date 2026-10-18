import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { AddressInfo } from "node:net";
import { createCoverageRouter } from "../routes/englishCoverage";
import { memoryCoverageStore } from "../models/EnglishCoverageReview";
import { errorHandler } from "../middleware/errorHandler";
import { EnglishCoverageService } from "./englishCoverageService";
import { coverageHash } from "./englishCoverageService";
import { AppError } from "../middleware/errorHandler";
import { CoverageSources } from "./englishCoverageSources";

const service=new EnglishCoverageService();
const input={noteText:"Asexual reproduction involves a single parent without fusion of gametes. The offspring are genetically identical.",conceptId:"sci-g10-col-001",language:"English" as const,scopeConfirmed:true as const};

test("complete procedure now retains bounded result context",async()=>{
  const noteText="Benedict test for reducing sugars\nAdd Benedict solution to the food sample.\nHeat the mixture in a hot water bath.\nA positive result changes blue to green, yellow,\norange or a brick-red precipitate.";
  const prediction=await service.predict({...input,noteText,conceptId:"sci-g10-cbl-007"});
  assert.equal(prediction.suggestedStatus,"present");
  assert.ok(!prediction.unsupportedRequiredPoints.includes("result"));
  const explicit=await service.predict({...input,noteText:noteText+"\nFor Benedict, a brick-red precipitate indicates reducing sugar.",conceptId:"sci-g10-cbl-007"});
  assert.equal(explicit.suggestedStatus,"present");
});

test("frozen model catalog and strict scope/input validation",()=>{
  assert.equal(service.catalog().concepts.length,10);
  for(const body of [{...input,language:"Sinhala"},{...input,scopeConfirmed:false},{...input,scopeConfirmed:"true"},{...input,conceptId:"unknown"},{...input,noteText:" "},{...input,noteText:"x".repeat(20001)}]) assert.throws(()=>service.validate(body));
  assert.deepEqual(service.validate({...input,modelPath:"untrusted",expertId:"forged"}),input);
  assert.throws(()=>new EnglishCoverageService("nonexistent-directory").catalog(),/integrity|unavailable/);
});

test("Unicode before evidence survives the Python bridge with exact JavaScript offsets",async()=>{
  const noteText="Revision 🧪\nGlucose → food energy.\n\nGlucose: add Benedict solution and heat in a water bath.\nA brick-red precipitate indicates reducing sugar.";
  const prediction=await service.predict({...input,noteText,conceptId:"sci-g10-cbl-007"});
  assert.equal(prediction.suggestedStatus,"present");
  for(const point of prediction.evidence.points){
    assert.ok(point.candidateEvidence);
    assert.notEqual(point.start,null);
    assert.notEqual(point.end,null);
    // Python counts Unicode code points; the API contract exposes offsets
    // for JavaScript strings, where an emoji occupies two UTF-16 code units.
    assert.equal(noteText.slice(point.start!,point.end!),point.candidateEvidence);
  }
});

test("HTTP workflow uses real model, requires auth and manual confirmation, and preserves frozen input",async()=>{
  const app=express();app.use(express.json());
  const store=memoryCoverageStore();
  app.use(createCoverageRouter({enabled:true,store,service,auth:(req,res,next)=>{
    const token=req.header("authorization");
    if(token!=="Bearer test-alice" && token!=="Bearer test-bob"){res.status(401).json({success:false});return;}
    res.locals.expertId=token.slice(12);next();
  }}));app.use(errorHandler);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
  const base="http://127.0.0.1:"+(server.address() as AddressInfo).port;
  const request=(url:string,body?:unknown,token="test-alice")=>fetch(base+url,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:body?JSON.stringify(body):undefined});
  try {
    assert.equal((await request("/concepts",undefined,"invalid")).status,401);
    assert.equal((await request("/reviews",{...input,scopeConfirmed:false})).status,400);
    const created=await request("/reviews",{...input,prediction:{suggestedStatus:"present"},expertId:"forged"});assert.equal(created.status,201);
    const row=(await created.json() as any).data;
    assert.equal(((await (await request("/reviews")).json() as any).data).length,1);
    assert.equal(((await (await request("/reviews",undefined,"test-bob")).json() as any).data).length,0);
    assert.equal(row.state,"pending");assert.equal(row.prediction.suggestedStatus,"partial");
    assert.equal(row.prediction.status,null);assert.equal(row.prediction.reviewRequired,true);assert.equal(row.humanLabel,undefined);
    assert.notEqual(row.expertId,"forged");assert.equal(row.input.noteText,input.noteText);
    assert.equal((await request("/reviews/"+row.id,undefined,"test-bob")).status,404);
    assert.equal((await request("/reviews/"+row.id+"/confirm",{confirmed:true,humanLabel:"partial",comment:""},"test-bob")).status,404);
    assert.equal((await request("/reviews/"+row.id+"/confirm",{humanLabel:"partial",comment:""})).status,400);
    assert.equal((await request("/reviews/"+row.id+"/confirm",{confirmed:true,humanLabel:"present",comment:""})).status,400);
    const saved=await request("/reviews/"+row.id+"/confirm",{confirmed:true,humanLabel:"partial",comment:"Only asexual reproduction is covered.",noteText:"tampered",prediction:{suggestedStatus:"present"}});
    assert.equal(saved.status,200);const final=(await saved.json() as any).data;
    assert.equal(final.humanLabel,"partial");assert.equal(final.state,"confirmed");assert.equal(final.input.noteText,input.noteText);
    assert.deepEqual(final.prediction,row.prediction);
    assert.equal((await request("/reviews/"+row.id+"/confirm",{confirmed:true,humanLabel:"missing",comment:"second submission"})).status,409);
  } finally {await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

test("assigned-note review rejects stale OCR, out-of-scope concepts and revoked access",async()=>{
  let granted=true,changed=false,revokeDuringSave=false;
  const source={taskId:"fixture-task",noteGroupId:"fixture-note",title:"Synthetic fixture",noteText:input.noteText,noteTextSha256:coverageHash(input.noteText),conceptIds:[input.conceptId]};
  const sources:CoverageSources={async list(){return granted?[source]:[];},async get(id,expert){if(!granted || id!==source.taskId || expert!=="alice")throw new AppError("Assigned note is unavailable",404);return {...source,noteTextSha256:changed?"updated-source-hash":source.noteTextSha256};}};
  const store=memoryCoverageStore();const save=store.create;
  store.create=async row=>{const result=await save(row);if(revokeDuringSave)granted=false;return result;};
  const app=express();app.use(express.json());app.use(createCoverageRouter({enabled:true,service,store,sources,auth:(req,res,next)=>{res.locals.expertId=req.header("x-test-expert")||"alice";next();}}));app.use(errorHandler);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
  const base="http://127.0.0.1:"+(server.address() as AddressInfo).port;
  const request=(url:string,body?:unknown,expert="alice")=>fetch(base+url,{method:body?"POST":"GET",headers:{"Content-Type":"application/json","x-test-expert":expert},body:body?JSON.stringify(body):undefined});
  try {
    const listed=(await (await request("/notes")).json() as any).data;assert.equal(listed[0].noteText,undefined);
    assert.equal((await request("/notes/fixture-task",undefined,"bob")).status,404);
    const linked={...input,sourceTaskId:source.taskId,sourceTextSha256:source.noteTextSha256};
    assert.equal((await request("/reviews",{...linked,sourceTextSha256:"stale"})).status,409);
    assert.equal((await request("/reviews",{...linked,conceptId:"sci-g10-som-005"})).status,400);
    const response=await request("/reviews",linked);assert.equal(response.status,201);const row=(await response.json() as any).data;assert.equal(row.source.taskId,source.taskId);
    changed=true;
    assert.equal((await request("/reviews/"+row.id+"/confirm",{confirmed:true,humanLabel:"partial",comment:""})).status,409);
    granted=false;
    assert.equal((await request("/reviews/"+row.id)).status,404);
    assert.equal((await request("/reviews/"+row.id+"/confirm",{confirmed:true,humanLabel:"partial",comment:""})).status,404);
    assert.equal(((await (await request("/reviews")).json() as any).data).length,0);
    granted=true;changed=false;revokeDuringSave=true;
    assert.equal((await request("/reviews",linked)).status,404);
    assert.equal((await store.list("alice")).length,1); // Only the original snapshot remains; the racing save was removed.
  }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

test("atomic store confirmation allows only one competing save",async()=>{
  const store=memoryCoverageStore();
  const prediction=await service.predict(input);
  await store.create({id:"race",expertId:"alice",input,textSha256:"fixture",modelSha256:"fixture",prediction,state:"pending",createdAt:new Date()});
  const results=await Promise.all([store.confirm("race","alice","partial","first"),store.confirm("race","alice","present","second")]);
  assert.equal(results.filter(Boolean).length,1);
});

test("disabled feature denies requests before reaching auth or inference",async()=>{
  const app=express();app.use(createCoverageRouter({enabled:false,store:memoryCoverageStore(),service,auth:()=>{throw new Error("must not run");}}));app.use(errorHandler);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
  try {const response=await fetch("http://127.0.0.1:"+(server.address() as AddressInfo).port+"/concepts");assert.equal(response.status,503);}
  finally {await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
