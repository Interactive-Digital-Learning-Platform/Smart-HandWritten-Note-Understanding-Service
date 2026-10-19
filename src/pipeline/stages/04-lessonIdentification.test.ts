import test, { mock } from "node:test";
import assert from "node:assert/strict";
import * as curriculum from "../../curriculum";
import { qdrantService } from "../../services/qdrantService";
import { runLessonIdentification } from "./04-lessonIdentification";
import { PipelineContext } from "../types";

const lesson = {lessonId:"test-science-g10",lessonName:"Chemical Basis of Life",subject:"Science",grade:10};
const context = () => ({userLessonId:lesson.lessonId,rawOcrText:"Add Benedict solution, then heat the mixture.",
  subjectDetection:{subject:"History",grade:11,topicHint:"Inconsistent upload hint"}} as PipelineContext);

test("a selected lesson retrieves v2 passages in the selected scope before returning",async()=>{
  const lookup=mock.method(curriculum,"getLessonById",()=>lesson as any);
  const calls:unknown[][]=[];
  const retrieve=mock.method(qdrantService,"getCurriculumTextbookContext",async(...args: Parameters<typeof qdrantService.getCurriculumTextbookContext>)=>{
    calls.push(args);return {isAvailable:true,passages:[{text:"Benedict test",filename:"science.pdf",pages:[15],score:.9}]} as any;
  });
  try {
    const ctx=context();await runLessonIdentification(ctx);
    assert.equal(ctx.matchedLessonId,lesson.lessonId);
    assert.equal(ctx.lessonMatchMethod,"user-specified");
    assert.deepEqual(calls,[[lesson.subject,lesson.lessonName,ctx.rawOcrText,lesson.grade]]);
    assert.deepEqual(ctx.textbookPassages,[{text:"Benedict test",filename:"science.pdf",pages:[15],score:.9}]);
  } finally {lookup.mock.restore();retrieve.mock.restore();}
});

test("an unavailable textbook preserves the selected lesson and reports a readable warning",async()=>{
  const lookup=mock.method(curriculum,"getLessonById",()=>lesson as any);
  const retrieve=mock.method(qdrantService,"getCurriculumTextbookContext",async()=>{throw Error("private provider details");});
  try {
    const ctx=context();await runLessonIdentification(ctx);
    assert.equal(ctx.matchedLessonId,lesson.lessonId);
    assert.deepEqual(ctx.textbookPassages,[]);
    assert.match(ctx.qualityWarnings?.join(" ")??"",/Textbook references are temporarily unavailable/);
    assert.ok(!JSON.stringify(ctx).includes("private provider details"));
  } finally {lookup.mock.restore();retrieve.mock.restore();}
});
