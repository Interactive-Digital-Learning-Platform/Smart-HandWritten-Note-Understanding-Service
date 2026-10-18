/** Tests only a uniquely named disposable collection using synthetic data. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose, { Connection } from "mongoose";
import { config } from "../config/config";
import { createMongoCoverageStore } from "../models/EnglishCoverageReview";
import { coverageHash, EnglishCoverageService } from "../services/englishCoverageService";
import { MongoCoverageSources } from "../services/englishCoverageSources";
import { Note, INote } from "../models/Note";
import { ExpertAnnotationTask, IExpertAnnotationTask } from "../models/ExpertAnnotationTask";

async function main():Promise<void> {
 const collection="coverage_smoke_"+randomUUID().replace(/-/g,"");
 const reportPath=path.resolve("../tmp/english-coverage-mongo-verification.json");
 const report:any={collection,syntheticFixture:true,existingRecordsTouched:false,passed:false,checks:[],cleanupCompleted:false};
 let connection:Connection|undefined;
 const connect=async()=>mongoose.createConnection(config.mongodb.uri,{serverSelectionTimeoutMS:8000,connectTimeoutMS:8000}).asPromise();
 try {
  connection=await connect();report.checks.push("Connected to configured MongoDB without exposing connection details");
  let store=createMongoCoverageStore(connection,collection);
  const service=new EnglishCoverageService();
  const input={noteText:"Asexual reproduction involves a single parent without fusion of gametes. The offspring are genetically identical.",conceptId:"sci-g10-col-001",language:"English" as const,scopeConfirmed:true as const};
  const prediction=await service.predict(input);const id=randomUUID();
  await store.create({id,expertId:"synthetic-persistence-test",input,textSha256:coverageHash(input.noteText),modelSha256:service.catalog().modelSha256,prediction,state:"pending",createdAt:new Date()});
  assert.equal((await store.get(id,"synthetic-persistence-test"))?.state,"pending");
  assert.equal(await store.get(id,"other-reviewer"),null);
  assert.equal((await store.list("synthetic-persistence-test")).length,1);
  report.checks.push("Created, read and listed pending snapshot; isolated reviewer access");
  const tasks=connection.model<IExpertAnnotationTask>("CoverageSmokeTasks",ExpertAnnotationTask.schema,collection+"_tasks");
  const notes=connection.model<INote>("CoverageSmokeNotes",Note.schema,collection+"_notes");
  const noteId=new mongoose.Types.ObjectId(),taskId=new mongoose.Types.ObjectId();
  await notes.collection.insertOne({_id:noteId,rawText:input.noteText,status:"analyzed",researchConsent:{status:"granted"},analysis:{lessonId:"fixture-lesson",conceptFindings:[{conceptId:input.conceptId}]}});
  await tasks.collection.insertOne({_id:taskId,sourceNoteId:String(noteId),noteGroupId:"synthetic-fixture-note",lessonId:"fixture-lesson",lessonName:"Synthetic reproduction",assignedExpertId:"test-expert",status:"in_review",language:"English",concepts:[{conceptId:input.conceptId}],flags:{}});
  const sources=new MongoCoverageSources(tasks,notes);
  const firstSource=await sources.get(String(taskId),"test-expert",[input.conceptId]);
  assert.equal(firstSource.noteText,input.noteText);assert.equal((await sources.list("test-expert",[input.conceptId])).length,1);
  await assert.rejects(sources.get(String(taskId),"different-expert",[input.conceptId]));
  await notes.collection.updateOne({_id:noteId},{$set:{"researchConsent.status":"withdrawn"}});
  await assert.rejects(sources.get(String(taskId),"test-expert",[input.conceptId]));
  assert.equal((await sources.list("test-expert",[input.conceptId])).length,0);
  await notes.collection.updateOne({_id:noteId},{$set:{"researchConsent.status":"granted",rawText:input.noteText+" Updated."}});
  assert.notEqual((await sources.get(String(taskId),"test-expert",[input.conceptId])).noteTextSha256,firstSource.noteTextSha256);
  await tasks.collection.updateOne({_id:taskId},{$set:{"flags.containsPersonalData":true}});
  await assert.rejects(sources.get(String(taskId),"test-expert",[input.conceptId]));
  report.checks.push("Assigned-note loading, reviewer isolation, consent withdrawal, OCR changes and quarantine verified using isolated fixture collections");
  await connection.close();connection=await connect();store=createMongoCoverageStore(connection,collection);
  const restored=await store.get(id,"synthetic-persistence-test");
  assert.equal(restored?.input.noteText,input.noteText);assert.equal(restored?.prediction.rawModelStatus,prediction.rawModelStatus);
  report.checks.push("Snapshot survived a database connection restart");
  const saves=await Promise.all([store.confirm(id,"synthetic-persistence-test","partial","Synthetic persistence fixture only"),store.confirm(id,"synthetic-persistence-test","present","Competing test submission")]);
  assert.equal(saves.filter(Boolean).length,1);
  const confirmed=await store.get(id,"synthetic-persistence-test");
  assert.equal(confirmed?.state,"confirmed");assert.ok(confirmed?.confirmedAt);assert.equal(await store.confirm(id,"synthetic-persistence-test","missing","Retry"),null);
  assert.equal(confirmed?.textSha256,coverageHash(input.noteText));assert.deepEqual(confirmed?.prediction,prediction);
  report.checks.push("Atomic confirmation, duplicate rejection and immutable prediction snapshot verified");
  await connection.close();connection=await connect();store=createMongoCoverageStore(connection,collection);
  assert.equal((await store.get(id,"synthetic-persistence-test"))?.state,"confirmed");
  report.checks.push("Confirmed judgment survived another database connection restart");
  report.passed=true;
 } catch(error) {
  report.errorType=error instanceof Error?error.name:"UnknownError";
  report.errorCode=(error as {code?:unknown})?.code;
  report.failure="MongoDB verification failed; credentials and connection details are omitted.";
  process.exitCode=1;
 } finally {
  if(connection?.readyState===1 && /^coverage_smoke_[a-f0-9]{32}$/.test(collection)) {
   try {for(const name of [collection,collection+"_tasks",collection+"_notes"]){try{await connection.db!.dropCollection(name);}catch(e){if((e as {code?:number}).code!==26)throw e;}}report.cleanupCompleted=true;}
   catch(error){if((error as {code?:number}).code===26)report.cleanupCompleted=true;else{report.cleanupError=true;process.exitCode=1;}}
  }
  await connection?.close();await fs.mkdir(path.dirname(reportPath),{recursive:true});
  await fs.writeFile(reportPath,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
 }
}
main().catch(()=>{console.error("Storage verification could not complete");process.exitCode=1;});
