import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import axios from "axios";
import { conceptCoverage, conceptSources, generateLessonStudyGuide } from "./lessonStudyGuide";
import { qdrantService } from "./qdrantService";
import { curriculumDbService } from "./curriculumDbService";
import { CurriculumLesson } from "../curriculum/types";
import { IConceptFinding } from "../models/Note";

const source = "Friction opposes relative motion or the tendency of relative motion at the contact surfaces. Static friction adjusts with the applied force before motion begins. Dynamic friction acts after sliding starts.";
const names = ["Nature of Friction", "Static Friction", "Dynamic Friction"];
const lesson = { subject: "Science", grade: 10, lessonName: "Friction", concepts: names.map((name, i) => ({ id: `friction-${i}`, name, keywords: [name] })), definitions: [] } as unknown as CurriculumLesson;
const passages = [{ id: "first", text: source, filename: "grade-10-science-text-book-6200ec8f089d4.pdf", pages: [113], page_start: 113, chunk_index: 1, score: 1 }];
const findings = lesson.concepts.map((c, i) => ({ conceptId: c.id, conceptName: c.name, status: ["present", "partial", "missing"][i] })) as IConceptFinding[];
after(() => mock.restoreAll());


test("chapter retrieval follows every scroll page, enforces chapter bounds and deduplicates re-ingestion", async () => {
  const bounds = curriculumDbService.getChapterPageBounds("Science", 10, "Friction")!;
  const requests: any[] = [];
  const point = (id: string, page: number, text: string, filename = bounds.textbookFilename) => ({ id, payload: { filename, page_start: page, text } });
  const stub = mock.method(axios, "post", async (_url: string, request: any) => {
    requests.push(request);
    return { data: { result: requests.length === 1 ? { points: [point("a", 113, source, "grade-10-science-text-book-v1.pdf"), point("duplicate", 113, source), point("outside", 160, "other chapter")], next_page_offset: "next" } : { points: [point("b", 122, "Methods of reducing friction appear near the end of the lesson."), point("wrong", 113, "wrong subject", "history.pdf")] } } };
  });
  try {
    const result = await qdrantService.getStudyLessonPassages(bounds);
    assert.equal(result.length, 2); assert.equal(result[1].page_start, 122);
    assert.equal(requests[1].offset, "next"); assert.ok(requests[0].filter.must[0].match.any.includes(bounds.textbookFilename));
    assert.ok(requests[0].filter.must[0].match.any.includes("grade-10-science-text-book-v1.pdf"));
  } finally { stub.mock.restore(); }
});

test("saved status is retained by ID or exact name; a missing finding is never labelled missing", () => {
  assert.equal(conceptCoverage(lesson.concepts[0], findings), "present");
  assert.equal(conceptCoverage(lesson.concepts[1], findings), "partial");
  assert.equal(conceptCoverage(lesson.concepts[2], findings), "missing");
  assert.equal(conceptCoverage(lesson.concepts[2], []), "unchecked");
  assert.equal(conceptCoverage(lesson.concepts[1], [{ ...findings[1], conceptId: "legacy" }]), "partial");
});

test("concept evidence can come from later textbook pages, beyond the old prefix budget", () => {
  const evidence = conceptSources(lesson.concepts[2], lesson, [...passages, { ...passages[0], text: "Dynamic friction acts after sliding starts. ".repeat(15), page_start: 123, pages: [123] }], "An unrelated short note.");
  assert.match(evidence, /PDF pages 123/); assert.doesNotMatch(evidence, /unrelated short note/);
});

test("full guide teaches every concept across batches and adds analysis labels outside AI control", async () => {
  const stub = mock.method(qdrantService, "getStudyLessonPassages", async () => passages);
  const requests: string[] = [];
  try {
    const result = await generateLessonStudyGuide(lesson, "A short uploaded note.", findings, "English", async (system, user) => {
      requests.push(system);
      const batch = JSON.parse(user.split("\nDRAFT:")[0]);
      return JSON.stringify({ sections: batch.map((entry: any) => ({ conceptId: entry.conceptId, markdown: source.repeat(3), sourceIds: [entry.sources[0].sourceId], visuals: [] })) });
    });
    assert.equal(requests.length, 4); // two concepts then the remaining concept; each reviewed
    assert.equal((result.textContent.match(/<!-- note-coverage:/g) || []).length, 3);
    for (const status of ["present", "partial", "missing"]) assert.match(result.textContent, new RegExp(`note-coverage:${status}`));
    for (const name of names) assert.ok(result.textContent.includes(name));
    assert.match(result.textContent, /all 3 concepts/); assert.match(result.textContent, /not what you know/);
  } finally { stub.mock.restore(); }
});

test("omitted, duplicated, short and unsupported sections fail instead of saving a claimed full guide", async () => {
  const stub = mock.method(qdrantService, "getStudyLessonPassages", async () => passages);
  try {
    for (const mode of ["omitted", "duplicate", "short", "unsupported", "wrong-concept-source"]) {
      await assert.rejects(generateLessonStudyGuide(lesson, "", findings, "English", async (_system, user) => {
        const batch = JSON.parse(user.split("\nDRAFT:")[0]);
        const sections = batch.map((entry: any) => ({ conceptId: mode === "duplicate" ? batch[0].conceptId : entry.conceptId, markdown: mode === "short" ? "Only a definition." : source.repeat(3), sourceIds: [mode === "unsupported" ? "invented-source-id" : mode === "wrong-concept-source" ? batch[1]?.sources[0].sourceId ?? "another-concept-source" : entry.sources[0].sourceId] }));
        return JSON.stringify({ sections: mode === "omitted" ? sections.slice(1) : sections });
      }), /omitted|too short|source evidence/);
    }
  } finally { stub.mock.restore(); }
});

test("one incomplete reviewed section is repaired without regenerating accepted sections or weakening source checks",async()=>{
  const stub=mock.method(qdrantService,"getStudyLessonPassages",async()=>passages);
  let calls=0;
  try {
    const result=await generateLessonStudyGuide(lesson,"A short uploaded note.",findings,"English",async(system,user)=>{
      calls++;
      const batch=JSON.parse(user.split("\nDRAFT:")[0]);
      if(calls===3) {assert.match(system,/Repair only/);assert.equal(batch.length,1);assert.equal(batch[0].conceptId,lesson.concepts[0].id);}
      return JSON.stringify({sections:batch.map((entry:any,index:number)=>({conceptId:entry.conceptId,
        markdown:calls===2&&index===0?"":source.repeat(3),sourceIds:[entry.sources[0].sourceId]}))});
    });
    assert.equal(calls,5);
    assert.equal((result.textContent.match(/<!-- note-coverage:/g)||[]).length,3);
  } finally {stub.mock.restore();}
});

test("missing textbook fails explicitly rather than generating absent lesson content from memory", async () => {
  const stub = mock.method(qdrantService, "getStudyLessonPassages", async () => []);
  let calls = 0;
  try {
    await assert.rejects(generateLessonStudyGuide(lesson, source, findings, "English", async () => { calls++; return "{}"; }), /textbook could not be retrieved/);
    assert.equal(calls, 0);
  } finally { stub.mock.restore(); }
});

test("a misleading universal friction claim receives one repair and persistent failure is not saved", async () => {
  const stub = mock.method(qdrantService, "getStudyLessonPassages", async () => passages);
  try {
    for (const repaired of [true,false]) {
      let calls=0;
      const single={...lesson,concepts:[lesson.concepts[0]]};
      const run=generateLessonStudyGuide(single,source,findings,"English",async (_system,user)=>{
        calls++;
        const batch=JSON.parse(user.split('\nDRAFT:')[0]);
        return JSON.stringify({sections:batch.map((entry:any)=>({conceptId:entry.conceptId,sourceIds:[entry.sources[0].sourceId],markdown:'### '+entry.concept+'\n'+source.repeat(3)+' (source-1)'+(repaired&&calls===3?'':' Friction is always opposite to the applied force.')}))});
      });
      if(repaired) { const guide=await run; assert.doesNotMatch(guide.textContent,/always opposite|\(source-1\)|### Nature of Friction/); }
      else await assert.rejects(run,/misleading friction statement/);
      assert.equal(calls,3);
    }
  } finally {stub.mock.restore();}
});
