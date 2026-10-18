import test from "node:test";
import assert from "node:assert/strict";
import { runEnglishCoverageCheck } from "./06-englishCoverageCheck";
import { PipelineContext } from "../types";
import { EnglishCoverageService, coverageHash } from "../../services/englishCoverageService";
import { contextToAnalysis } from "../../services/processingService";
import { Note } from "../../models/Note";

const model=new EnglishCoverageService();
const text="Asexual reproduction involves one parent without fusion of gametes. Offspring are genetically identical.";
function context():PipelineContext {
 return {noteId:"fixture",userId:"fixture",imageUrl:"/synthetic.png",rawOcrText:text,contentLanguage:{primaryLanguage:"English",confidence:90},
  ocrExtraction:{totalPages:1,extractedPages:1,failedPages:0,qualityState:"known",source:"provided_text"},
  matchedLessonId:"fixture-lesson",lessonMatchConfidence:.9,matchedLesson:{lessonId:"fixture-lesson",lessonName:"Reproduction",subject:"Science",grade:10,concepts:[{id:"sci-g10-col-001",name:"Sexual and Asexual Reproduction"}]},
  qualityWarnings:["Existing quality warning"],conceptMatches:[],stageResults:[],curriculumVersion:"fixture",pipelineVersion:"fixture",startedAt:new Date()} as unknown as PipelineContext;
}
test("normal analysis stores real trained-model suggestions with frozen identity",async()=>{
 const ctx=context();await runEnglishCoverageCheck(ctx,model,true);
 assert.equal(ctx.englishCoverageCheck?.state,"ready");assert.equal(ctx.englishCoverageCheck?.textSha256,coverageHash(text));
 assert.equal(ctx.englishCoverageCheck?.suggestions[0].prediction.suggestedStatus,"partial");
 assert.equal(ctx.englishCoverageCheck?.suggestions[0].prediction.reviewRequired,true);assert.equal(ctx.englishCoverageCheck?.suggestions[0].prediction.status,null);
 assert.deepEqual(ctx.conceptMatches,[]);
 const analysis=contextToAnalysis(ctx);
 const note=new Note({userId:"synthetic-model-test",title:"Fixture",imageUrl:"/synthetic.png",rawText:text,status:"analyzed",analysis});
 assert.equal(note.validateSync(),undefined);
 const serialized=JSON.parse(JSON.stringify(note.toObject()));
 assert.equal(serialized.analysis.englishCoverageCheck.state,"ready");assert.equal(serialized.analysis.englishCoverageCheck.suggestions[0].prediction.suggestedStatus,"partial");
 assert.equal(serialized.analysis.overallCompleteness,analysis.overallCompleteness);
});
test("English/OCR/lesson gates skip safely before inference",async()=>{
 const cases:Array<[string,(ctx:PipelineContext)=>void,boolean]>=[
  ["disabled",()=>{},false],
  ["language",c=>{c.contentLanguage={primaryLanguage:"Sinhala",confidence:95};},true],
  ["ocr_quality",c=>{c.ocrExtraction={totalPages:2,extractedPages:1,failedPages:1};},true],
  ["lesson_scope",c=>{c.lessonMatchConfidence=.4;},true],
 ];
 const forbidden={catalog(){throw Error("must not call model");},async predict(){throw Error("must not infer");}};
 for(const [reason,edit,enabled] of cases){const ctx=context();edit(ctx);await runEnglishCoverageCheck(ctx,forbidden,enabled);assert.equal(ctx.englishCoverageCheck?.state,"skipped");assert.equal(ctx.englishCoverageCheck?.reason,reason);assert.deepEqual(ctx.englishCoverageCheck?.suggestions,[]);}
});
test("unsupported concept does not acquire an invented missing label",async()=>{
 const ctx=context();ctx.matchedLesson!.concepts[0].id="unknown-concept";
 await runEnglishCoverageCheck(ctx,{catalog:()=>model.catalog(),async predict(){throw Error("must not infer");}},true);
 assert.equal(ctx.englishCoverageCheck?.reason,"unsupported_concepts");assert.deepEqual(ctx.englishCoverageCheck?.suggestions,[]);
});
test("verified registry alias reaches the correct rubric while retaining the source ID",async()=>{
 const ctx=context();ctx.matchedLesson!.concepts[0].id="sci-g10-cho-007";
 await runEnglishCoverageCheck(ctx,model,true);
 assert.equal(ctx.englishCoverageCheck?.suggestions[0].conceptId,"sci-g10-cho-007");
 assert.equal(ctx.englishCoverageCheck?.suggestions[0].modelConceptId,"sci-g10-col-001");
 assert.equal(ctx.englishCoverageCheck?.suggestions[0].prediction.suggestedStatus,"partial");
});
test("runtime failure records unavailable and preserves earlier warnings",async()=>{
 const ctx=context();await runEnglishCoverageCheck(ctx,{catalog:()=>model.catalog(),async predict(){throw Error("fixture failure");}},true);
 assert.equal(ctx.englishCoverageCheck?.state,"unavailable");assert.deepEqual(ctx.englishCoverageCheck?.suggestions,[]);
 assert.ok(ctx.qualityWarnings?.includes("Existing quality warning"));
});
