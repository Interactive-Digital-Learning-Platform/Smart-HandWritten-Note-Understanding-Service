import test from "node:test";
import assert from "node:assert/strict";
import { extractTextFromImage, validateOcrPageText } from "./ocrService";
import { activeOcrText, markReviewedDeletions } from "./ocrText";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../config/config";
import { groqPool } from "./groqPool";
const tinyPng=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5l8AAAAASUVORK5CYII=","base64");

test("image OCR sends the configured vision model and returns transcription", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-model-test-"));
  const image = path.join(directory, "page.png");
  fs.writeFileSync(image, tinyPng);
  const previousKeys = config.groq.apiKeys;
  const previousModel = config.groq.ocrModel;
  config.groq.apiKeys = ["test-key"];
  config.groq.ocrModel = "configured-vision-model";
  t.after(() => {
    config.groq.apiKeys = previousKeys;
    config.groq.ocrModel = previousModel;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  t.mock.method(groqPool, "getStatus", () => ({ totalKeys: 1, healthyKeys: 1, cooldowns: [] }));
  let calls = 0;
  t.mock.method(groqPool, "getNextClient", () => ({
    keyIndex: 0,
    maskedKey: "test-key",
    client: { chat: { completions: { create: async (request: any) => {
      calls++;
      assert.equal(request.model, "configured-vision-model");
      assert.equal(request.messages[0].content[1].image_url.url,
        `data:image/png;base64,${tinyPng.toString("base64")}`);
      if(request.response_format)return {choices:[{finish_reason:"stop",message:{content:JSON.stringify({deletedText:[]})}}]};
      return { choices: [{ finish_reason: "stop", message: { content: "Asexual reproduction uses one parent." } }] };
    } } } },
  }));
  const result = await extractTextFromImage(image);
  assert.equal(result.success, true);
  assert.equal(result.text, "Asexual reproduction uses one parent.");
  assert.equal(calls, 2);
});

test("OCR page validation accepts a normal handwritten transcription", () => {
  const result = validateOcrPageText(
    "1.6 Minerals\nCalcium: bones and teeth\nIron: haemoglobin"
  );
  assert.equal(result.valid, true);
});

test("OCR page validation rejects implausibly long single-page output", () => {
  const result = validateOcrPageText("hallucinated textbook content ".repeat(600));
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /characters for one handwritten page/);
});

test("OCR page validation rejects leaked model reasoning", () => {
  const result = validateOcrPageText(
    "<think>I should explain the lesson before transcribing it.</think>"
  );
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /model reasoning/);
});

const repeatedSection = "Carbohydrates contain carbon hydrogen and oxygen. Glucose is a monosaccharide. Starch stores food in plants. Glycogen stores food in animals. Cellulose forms plant cell walls. Carbohydrates supply energy and structural material.";

test("OCR rejects a duplicated passage even when the second copy has fragmented lines", () => {
  const repeated = `${repeatedSection}\n\n${repeatedSection.replace(/(.{15})/g, "$1\n")}`;
  assert.match(validateOcrPageText(repeated).reason ?? "", /repeated passage/);
  const detailedSection = repeatedSection + " Glucose and fructose join to form sucrose and water. Maltose contains two glucose units. Starch and cellulose are polysaccharides with different roles. Iodine gives a blue-black colour when starch is present.";
  const fragments = detailedSection.match(/.{1,35}/g)!;
  const reordered: string[] = [];
  for(let index=0;index<fragments.length;index+=2){
    if(fragments[index+1])reordered.push(fragments[index+1]);
    reordered.push(fragments[index]);
  }
  assert.match(validateOcrPageText(`${detailedSection}\n\n${reordered.join("\n")}`).reason ?? "", /repeated passage/);
  assert.equal(validateOcrPageText("Benedict test\nAdd Benedict solution.\nBenedict test\nHeat in a water bath.").valid, true);
});

test("deletion markers exclude only rejected phrases and preserve active replacements", () => {
  const text = "Proteins contain <deleted>fatty acids</deleted> amino acids.\nCarbohydrates\n<deleted>All carbon compounds are organic.</deleted>\nCO2 is inorganic.";
  const active = activeOcrText(text);
  assert.doesNotMatch(active, /fatty acids|All carbon compounds/);
  assert.match(active, /amino acids/);
  assert.match(active, /Carbohydrates/);
  assert.match(active, /CO2 is inorganic/);
  assert.equal(validateOcrPageText("<deleted>unclosed crossed-out sentence").valid, false);
});

test("a repeated heading alone does not reject distinct note sections", () => {
  const first=`Revision notes\n${repeatedSection}`;
  const second="Revision notes\nProteins are polymers made from amino acids. They contain carbon hydrogen oxygen and nitrogen. Protein functions include growth repair enzymes and antibodies. Foods supplying protein include meat fish egg white dhal and cereals. Biuret reagent produces a purple colour with protein.";
  assert.equal(validateOcrPageText(`${first}\n\n${second}`).valid,true);
});

test('OCR rejects a restarted page number followed by a fragmented second copy, while distinct numbered sections remain valid',()=>{
  const original=repeatedSection+' Glucose and fructose join to form sucrose and water. Maltose contains two glucose units. Starch and cellulose have different structural roles in organisms.';
  const compact=original.replace(/[^a-z0-9]/gi,'');
  const fragments=compact.match(/.{1,18}/g)!;const reordered:string[]=[];
  for(let i=0;i<fragments.length;i+=2){if(fragments[i+1])reordered.push(fragments[i+1]);reordered.push(fragments[i]);}
  assert.match(validateOcrPageText('2\n'+original+'\n\n2\n'+reordered.join('\n')).reason??'',/repeated passage/);
  assert.equal(validateOcrPageText('2\n'+original+'\n\n2\nProteins are composed of amino acids and have functions in growth, repair, enzymes and antibodies.').valid,true);
});

test("image OCR retries repeated output and preserves deletion markers in raw transcription", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-quality-test-"));
  const image = path.join(directory, "page.png");
  fs.writeFileSync(image, tinyPng);
  const previousKeys = config.groq.apiKeys;
  config.groq.apiKeys = ["test-key"];
  t.after(() => {config.groq.apiKeys = previousKeys; fs.rmSync(directory, {recursive:true,force:true});});
  t.mock.method(groqPool,"getStatus",()=>({totalKeys:1,healthyKeys:1,cooldowns:[]}));
  let attempts=0;
  const corrected="Proteins contain <deleted>fatty acids</deleted> amino acids.";
  t.mock.method(groqPool,"getNextClient",()=>({keyIndex:0,maskedKey:"test-key",client:{chat:{completions:{create:async (request:any)=>{
    if(request.response_format)return {choices:[{finish_reason:"stop",message:{content:JSON.stringify({deletedText:[]})}}]};
    attempts++;
    if(attempts===2) assert.match(request.messages[0].content[0].text,/previous transcription failed quality checks/);
    return {choices:[{finish_reason:"stop",message:{content:attempts===1?`${repeatedSection}\n${repeatedSection}`:corrected}}]};
  }}}}}));
  const result=await extractTextFromImage(image);
  assert.equal(result.success,true);
  assert.equal(result.text,corrected);
  assert.equal(attempts,2);
});

test("visual deletion review marks exact phrases without adding or replacing content",()=>{
  const line="Uses: energy, food storage, structure, part of nucleic acids.";
  const raw=`Carbohydrates\n${line}\n<deleted>Rejected old statement.</deleted>\nKeep this active sentence.`;
  const marked=markReviewedDeletions(raw,[{line,text:"food storage"}]);
  assert.match(marked,/<deleted>food storage<\/deleted>/);
  assert.match(marked,/<deleted>Rejected old statement\.<\/deleted>/);
  assert.doesNotMatch(activeOcrText(marked),/food storage|Rejected old/);
  assert.match(activeOcrText(marked),/energy.*structure/);
  assert.match(activeOcrText(marked),/Keep this active sentence/);
  for(const review of [[{line,text:"invented phrase"}],[{line:"invented line",text:"energy"}],[{line,text:"food storage"},{line,text:"food storage"}]]){
    assert.throws(()=>markReviewedDeletions(raw,review),/unique/);
  }
  assert.throws(()=>markReviewedDeletions(`${line}\n${line}`,[{line,text:"food storage"}]),/unique OCR line/);
});
