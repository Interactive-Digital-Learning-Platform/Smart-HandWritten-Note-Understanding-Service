/** Normal note-processing smoke test using synthetic cached OCR; no image OCR claim. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { config } from "../config/config";
import { loadCurriculum,getAllLessons } from "../curriculum";
import { Note } from "../models/Note";
import { processNote } from "../services/processingService";
import { modelConceptId } from "../ml/englishCoverageConcepts";

async function main():Promise<void> {
 let id:string|undefined;
 const userId="synthetic-english-coverage-integration-test";
 const report:any={syntheticFixture:true,usedCachedOCR:true,imageOCRAccuracyTested:false,passed:false,fixtureRemoved:false};
 try {
  await mongoose.connect(config.mongodb.uri,{serverSelectionTimeoutMS:8000});await loadCurriculum();
  const lesson=getAllLessons(10).find(l=>l.concepts.some(c=>modelConceptId(c.id)==="sci-g10-col-001"));
  if(!lesson)throw Error("Supported reproduction lesson was not available");
  const text="Reproduction revision note\nAsexual reproduction involves one parent without fusion of gametes. The offspring are genetically identical. Budding in yeast and growing a plant from a cutting are examples. This note only explains asexual reproduction.";
  // This synthetic fixture supplies text; it does not validate handwriting OCR.
  const fixture=await Note.create({userId,title:"[SYNTHETIC OCR TEST] Coverage integration",imageUrl:"/uploads/__synthetic_coverage_fixture__.png",imageUrls:["/uploads/__synthetic_coverage_fixture__.png"],pageCount:1,rawText:text,status:"uploaded",userSubject:"Science",userGrade:10,userTopic:lesson.lessonName,userLessonId:lesson.lessonId,researchConsent:{status:"not_provided"},analysis:{subject:"Science",topic:lesson.lessonName,ocrPageSummary:{totalPages:1,extractedPages:1,failedPages:0,qualityState:"known",source:"provided_text"}}});
  id=String(fixture._id);report.noteId=id;
  const result=await processNote(id,true,{skipMaterialGeneration:true,updateStudentProfile:false});
  assert.equal(result.success,true,result.error);
  const check=result.analysis?.englishCoverageCheck;
  assert.equal(check?.state,"ready");assert.equal(check?.reviewRequired,true);
  assert.ok(check?.suggestions.some(s=>s.modelConceptId==="sci-g10-col-001"));
  const response=await fetch(`http://127.0.0.1:${config.port}/api/notes/${id}`);
  assert.equal(response.status,200);const data=await response.json() as any;
  assert.equal(data.data.analysis.englishCoverageCheck.state,"ready");
  assert.equal(data.data.analysis.englishCoverageCheck.modelSha256,check?.modelSha256);
  report.passed=true;report.modelVersion=check?.modelVersion;report.modelSha256=check?.modelSha256;
  report.suggestions=check?.suggestions.map(s=>({concept:s.conceptName,status:s.prediction.suggestedStatus,reviewRequired:s.prediction.reviewRequired}));
  report.verified=["Normal processNote pipeline","Existing lesson identification and OCR-cleaning flow","Real trained-model stage","MongoDB Note.analysis persistence","Normal GET /api/notes/:id response"];
 } catch(error){report.failure=error instanceof Error?error.message:"Unknown failure";process.exitCode=1;}
 finally {
  if(id&&mongoose.connection.readyState===1){await Note.deleteOne({_id:id,userId,title:"[SYNTHETIC OCR TEST] Coverage integration"});report.fixtureRemoved=true;}
  await mongoose.disconnect();const out=path.resolve("../tmp/english-coverage-normal-note-flow.json");
  await fs.writeFile(out,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
 }
}
main().catch(()=>{console.error("Normal note-flow verification could not complete");process.exitCode=1;});
