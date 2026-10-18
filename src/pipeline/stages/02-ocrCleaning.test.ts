import test from "node:test";
import assert from "node:assert/strict";
import {runOcrCleaning} from "./02-ocrCleaning";
import {groqPool} from "../../services/groqPool";
import {PipelineContext} from "../types";
import {runPipeline} from "../index";

const raw="--- Page 1 ---\n<deleted>Protein is made from fatty acids.</deleted>\nProteins are made from amino acids.\nStarch gives blue-black colour with iodine.";
const context=(text=raw)=>({rawOcrText:text,qualityWarnings:[]} as unknown as PipelineContext);

test("cleaning preserves raw deleted writing and never accepts an LLM content rewrite",async(t)=>{
  t.mock.method(groqPool,"createChatCompletion",async()=>({choices:[{message:{content:JSON.stringify({cleanedText:"Protein is made from fatty acids. Added textbook explanation.",confidenceScore:85,lowQualityWarning:false,qualityNote:"Readable extracted text"})}}]}));
  const ctx=context();await runOcrCleaning(ctx);
  assert.equal(ctx.rawOcrText,raw);
  assert.doesNotMatch(ctx.ocrCleaning!.cleanedText,/fatty acids|Added textbook/);
  assert.match(ctx.ocrCleaning!.cleanedText,/Proteins are made from amino acids/);
  assert.match(ctx.ocrCleaning!.cleanedText,/Starch gives blue-black colour with iodine/);
  assert.equal(ctx.ocrCleaning!.confidenceScore,85);
});

test("readability failure still excludes deleted writing and preserves active lines",async(t)=>{
  t.mock.method(groqPool,"createChatCompletion",async()=>{throw Error("synthetic provider failure");});
  const ctx=context();await runOcrCleaning(ctx);
  assert.equal(ctx.rawOcrText,raw);
  assert.doesNotMatch(ctx.ocrCleaning!.cleanedText,/fatty acids|<deleted>/);
  assert.match(ctx.ocrCleaning!.cleanedText,/amino acids/);
  assert.equal(ctx.ocrCleaning!.confidenceScore,70);
});

test("a note with only deleted content does not become a missing-concept assessment",async(t)=>{
  t.mock.method(groqPool,"createChatCompletion",()=>{throw Error("must not call provider");});
  await assert.rejects(runOcrCleaning(context("--- Page 1 ---\n<deleted>Entire note was rejected.</deleted>")),/No active note text/);
  await assert.rejects(runOcrCleaning(context("<deleted>Unclosed deletion")),/malformed crossed-out/);
});

test("the pipeline aborts when deletion markers cannot be separated safely",async(t)=>{
  t.mock.method(groqPool,"createChatCompletion",()=>{throw Error("must not call provider");});
  const result=await runPipeline({noteId:"synthetic-deletion-test",userId:"synthetic",imageUrl:"unused.png",rawOcrText:"<deleted>Unclosed rejected sentence"},{skipMaterialGeneration:true});
  assert.equal(result.success,false);
  assert.equal(result.failedAtStage,"ocr_cleaning");
  assert.match(result.error??"",/malformed crossed-out/);
});
