import test, { TestContext } from "node:test";
import assert from "node:assert/strict";
import { runConceptMatching, CONCEPT_REVIEW_WARNING } from "./06-conceptMatching";
import { runCoverageCalculation } from "./07-coverageCalculation";
import { runGapDetection } from "./08-gapDetection";
import { groqPool } from "../../services/groqPool";
import { PipelineContext } from "../types";
import { CurriculumConcept } from "../../curriculum/types";
import { contextToAnalysis } from "../../services/processingService";
import { Note } from "../../models/Note";

const friction: CurriculumConcept = { id: "fixture-friction", name: "Friction", category: "definition", weight: 4, isFrequentlyTested: true, keywords: ["friction"] };
const force: CurriculumConcept = { ...friction, id: "fixture-force", name: "Newton's second law formula", category: "formula", keywords: ["F=ma", "force"] };
const makeContext = (text: string, concepts = [friction]): PipelineContext => ({
  noteId: "synthetic-keyword-test", userId: "synthetic", imageUrl: "/unused.png", rawOcrText: text,
  ocrCleaning: { cleanedText: text, confidenceScore: 100, lowQualityWarning: false },
  matchedLessonId: "synthetic-friction", lessonMatchConfidence: 1,
  matchedLesson: { curriculumVersion: "fixture", lessonId: "synthetic-friction", subject: "Science", grade: 10,
    unit: "Fixture", lessonName: "Friction", concepts,
    definitions: [{ conceptId: friction.id, term: "Friction", definition: "A force that opposes relative motion between surfaces in contact." }],
    learningOutcomes: [{ id: "fixture-outcome", description: "Define friction", requiredConcepts: [friction.id] }],
    formulae: [], expectedDiagrams: [], examKeywords: [], matchingKeywords: [],
  }, qualityWarnings: [], stageResults: [], startedAt: new Date(), curriculumVersion: "fixture", pipelineVersion: "2.1.3",
});
const mockResponse = (t: TestContext, rows: unknown, finishReason = "stop") => t.mock.method(groqPool, "createChatCompletion", async () => ({
  choices: [{ finish_reason: finishReason, message: { content: typeof rows === "string" ? rows : JSON.stringify(rows) } }],
} as any));
const row = (evidence: string, status = "present", confidence = 0.95, index = 1) => ({ index, status, confidence, evidence });

test("homework instructions, bare headings and questions never receive full keyword credit, even with an overconfident semantic response", async t => {
  const cases = [
    ["Homework: define friction.", "Homework: define friction."],
    ["# Friction", "Friction"],
    ["1. What is friction?", "What is friction?"],
    ["Explain why friction opposes motion.", "friction opposes motion"],
    ["Homework: friction", "Homework: friction"],
    ["Questions: Friction and motion", "Friction and motion"],
    ["Learning objectives: Explain friction.", "Explain friction."],
  ];
  for (const [text, evidence] of cases) {
    const mock = mockResponse(t, [row(evidence)]);
    const ctx = makeContext(text); await runConceptMatching(ctx); runCoverageCalculation(ctx);
    assert.equal(ctx.conceptMatches?.[0].status, "partial", text);
    assert.equal(ctx.conceptMatches?.[0].needsReview, true);
    assert.equal(ctx.coverageScores?.weightedCoverage, 50);
    assert.ok(ctx.conceptMatches![0].decisionConfidence < 0.7);
    mock.mock.restore();
  }
});

test("a meaningful grounded definition can receive full coverage and stores the actual note wording", async t => {
  const text = "Friction opposes relative motion between surfaces in contact.";
  const mocked = mockResponse(t, [row(text)]);
  const ctx = makeContext(text); await runConceptMatching(ctx); runCoverageCalculation(ctx);
  assert.equal(mocked.mock.callCount(), 1);
  assert.equal(ctx.conceptMatches?.[0].status, "present");
  assert.equal(ctx.conceptMatches?.[0].source, "semantic_llm");
  assert.equal(ctx.conceptMatches?.[0].evidence, text);
  assert.equal(ctx.coverageScores?.weightedCoverage, 100);
});

test("a later answer is assessed instead of treating the first heading/question as proof", async t => {
  const answer = "Friction opposes the relative motion of touching surfaces.";
  for (const text of [`Friction\nWhat is friction?\n${answer}`, `Q: Define friction. Answer: ${answer}`, `What is friction? ${answer}`]) {
    const mock = mockResponse(t, [row(answer)]);
    const ctx = makeContext(text); await runConceptMatching(ctx);
    assert.equal(ctx.conceptMatches?.[0].status, "present", text);
    assert.equal(ctx.conceptMatches?.[0].evidence, answer);
    mock.mock.restore();
  }
});

test("short equations remain eligible but a calculation instruction is not a worked answer", async t => {
  for (const [text, expected] of [["F=ma", "present"], ["Calculate the force using F=ma.", "partial"]]) {
    const mock = mockResponse(t, [row(text)]);
    const ctx = makeContext(text, [force]); await runConceptMatching(ctx);
    assert.equal(ctx.conceptMatches?.[0].status, expected);
    mock.mock.restore();
  }
});

test("a repeated quote can be supported by a later answer, and explanatory keyword phrases do not become bare headings", async t => {
  const answer = "Friction opposes motion.";
  const mock = mockResponse(t, [row(answer)]);
  const ctx = makeContext(`Explain why friction opposes motion.\n${answer}`, [{ ...friction, keywords: ["friction", "opposes motion"] }]);
  await runConceptMatching(ctx);
  assert.equal(ctx.conceptMatches?.[0].status, "present");
  assert.equal(ctx.conceptMatches?.[0].evidence, answer);
  mock.mock.restore();
  mockResponse(t, [row(answer)]);
  const exact = makeContext(answer, [{ ...friction, keywords: [answer] }]); await runConceptMatching(exact);
  assert.equal(exact.conceptMatches?.[0].status, "present");
});

test("keyword hits and paraphrases are reviewed together in one bounded batch with bound curriculum definitions", async t => {
  const text = "Friction opposes sliding. Resultant force equals mass times acceleration.";
  const mocked = mockResponse(t, [row("Friction opposes sliding."), row("Resultant force equals mass times acceleration.", "present", 0.9, 2)]);
  const ctx = makeContext(text, [friction, { ...force, keywords: ["F=ma"] }]);
  await runConceptMatching(ctx);
  assert.equal(mocked.mock.callCount(), 1);
  const request = mocked.mock.calls[0].arguments[0] as any;
  const payload = JSON.parse(request.messages[1].content);
  assert.equal(payload.expectedConcepts.length, 2);
  assert.equal(payload.expectedConcepts[0].definitions[0].definition, ctx.matchedLesson!.definitions[0].definition);
  assert.equal(payload.expectedConcepts[1].definitions.length, 0);
  assert.deepEqual(ctx.conceptMatches?.map(match => match.status), ["present", "present"]);
});

test("provider failures keep mentions tentative and absent concepts uncertain, with an explicit quality warning", async t => {
  t.mock.method(groqPool, "createChatCompletion", async () => { throw Error("synthetic unavailable"); });
  const ctx = makeContext("Homework: define friction.", [friction, force]);
  await runConceptMatching(ctx); runCoverageCalculation(ctx);
  assert.deepEqual(ctx.conceptMatches?.map(match => match.status), ["partial", "missing"]);
  assert.ok(ctx.conceptMatches?.every(match => match.needsReview && match.source === "fallback"));
  assert.equal(ctx.coverageScores?.weightedCoverage, 25);
  assert.ok(ctx.qualityWarnings?.includes(CONCEPT_REVIEW_WARNING));
});

test("invented, paraphrased, stitched or missing quotes cannot promote keywords to full coverage", async t => {
  const text = "Friction\nThe page mentions surfaces.\nLater we discuss motion.";
  for (const evidence of ["Friction opposes motion.", "friction ... motion", "Friction Later we discuss motion.", "", null]) {
    const mock = mockResponse(t, [row(evidence as any)]);
    const ctx = makeContext(text); await runConceptMatching(ctx);
    assert.equal(ctx.conceptMatches?.[0].status, "partial");
    assert.equal(ctx.conceptMatches?.[0].source, "fallback");
    assert.ok(ctx.qualityWarnings?.includes(CONCEPT_REVIEW_WARNING));
    mock.mock.restore();
  }
});

test("whitespace-normalized direct quotes remain traceable to the original text", async t => {
  const text = "Friction  opposes\nrelative motion.";
  mockResponse(t, [row("Friction opposes relative motion.")]);
  const ctx = makeContext(text); await runConceptMatching(ctx);
  assert.equal(ctx.conceptMatches?.[0].evidence, text);
  assert.equal(ctx.conceptMatches?.[0].status, "present");
});

test("substring collisions do not create keyword evidence, while plurals, acronyms and hyphenated terms retain real excerpts", async t => {
  t.mock.method(groqPool, "createChatCompletion", async () => { throw Error("synthetic unavailable"); });
  for (const [keyword, text, expected] of [
    ["friction", "A frictionless surface", "missing"], ["cell", "cellulose", "missing"],
    ["ATP", "CATP sequence", "missing"], ["force", "forces", "partial"],
    ["cell membrane", "cell-membrane", "partial"], ["Newton's law", "Newtons law", "partial"],
  ]) {
    const ctx = makeContext(text, [{ ...friction, keywords: [keyword] }]);
    await runConceptMatching(ctx);
    assert.equal(ctx.conceptMatches?.[0].status, expected, text);
    if (expected === "partial") assert.ok(text.includes(ctx.conceptMatches![0].evidence!));
  }
});

test("malformed, duplicate, low-confidence and legacy boolean responses do not supply full credit", async t => {
  const text = "Friction opposes sliding.";
  const responses = [
    "not JSON", {}, [row(text), row(text, "missing")], [row(text, "present", 0.5)],
    [{ index: 1, found: true, confidence: 0.99, evidence: text }],
    [row(text, "present", 2)], [row(text, "present", NaN)],
    [row(text, "present", 0.99, 0)], [{ ...row(text), index: "1" }], [null],
  ];
  for (const response of responses) {
    const mock = mockResponse(t, response);
    const ctx = makeContext(text); await runConceptMatching(ctx);
    assert.equal(ctx.conceptMatches?.[0].status, "partial", JSON.stringify(response));
    assert.equal(ctx.conceptMatches?.[0].needsReview, true);
    mock.mock.restore();
  }
});

test("truncated responses or quotes outside the checked context do not create full coverage", async t => {
  let mock = mockResponse(t, [row("Friction opposes sliding.")], "length");
  let ctx = makeContext("Friction opposes sliding."); await runConceptMatching(ctx);
  assert.equal(ctx.conceptMatches?.[0].status, "partial"); mock.mock.restore();
  mockResponse(t, [row("Friction opposes sliding.")]);
  ctx = makeContext("Unrelated words. ".repeat(2000) + "Friction opposes sliding.");
  await runConceptMatching(ctx);
  assert.equal(ctx.conceptMatches?.[0].status, "partial");
  assert.ok(ctx.qualityWarnings?.includes(CONCEPT_REVIEW_WARNING));
});

test("a verified absent concept can reject an incidental keyword, and missing entries preserve other valid results", async t => {
  mockResponse(t, [row("", "missing", 0.9)]);
  const ctx = makeContext("The chapter title is Friction, but these notes are about energy.", [friction, force]);
  await runConceptMatching(ctx);
  assert.equal(ctx.conceptMatches?.[0].status, "missing");
  assert.equal(ctx.conceptMatches?.[0].source, "semantic_llm");
  assert.equal(ctx.conceptMatches?.[1].source, "fallback");
  assert.ok(ctx.qualityWarnings?.includes(CONCEPT_REVIEW_WARNING));
});

test("new statuses reach saved findings, weighted coverage and follow-up gaps without altering the trained-model result", async t => {
  const text = "Homework: define friction.";
  mockResponse(t, [row(text)]);
  const ctx = makeContext(text);
  ctx.englishCoverageCheck = { state: "skipped", reason: "unsupported_concepts", checkedAt: new Date(), reviewRequired: true, suggestions: [] };
  const originalCheck = JSON.stringify(ctx.englishCoverageCheck);
  await runConceptMatching(ctx); runCoverageCalculation(ctx);
  // Recommendations use a separate stubbed response; no paid calls.
  const recommendations = t.mock.method(groqPool, "createChatCompletion", async () => ({ choices: [{ message: { content: '["Add a definition of friction."]' } }] } as any));
  await runGapDetection(ctx); recommendations.mock.restore();
  const saved = new Note({ userId: "synthetic", title: "Synthetic", imageUrl: "/unused.png", analysis: contextToAnalysis(ctx) });
  assert.equal(saved.validateSync(), undefined);
  const analysis = saved.toObject().analysis!;
  assert.equal(analysis.overallCompleteness, 50);
  assert.equal(analysis.conceptFindings?.[0].status, "partial");
  assert.equal(analysis.conceptFindings?.[0].needsReview, true);
  assert.deepEqual(analysis.partialConcepts, ["Friction"]);
  assert.equal(analysis.explainableGaps?.length, 1);
  assert.equal(JSON.stringify(ctx.englishCoverageCheck), originalCheck);
});

test("unreadable OCR still reduces confidence and flags grounded positive findings for review", async t => {
  const text = "Friction opposes sliding.";
  mockResponse(t, [row(text)]);
  const ctx = makeContext(text); ctx.ocrCleaning!.confidenceScore = 45; ctx.ocrCleaning!.lowQualityWarning = true;
  await runConceptMatching(ctx);
  assert.ok(ctx.conceptMatches![0].decisionConfidence < 0.5);
  assert.equal(ctx.conceptMatches?.[0].needsReview, true);
});

test("no matched lesson or empty input does not call a semantic provider", async t => {
  const mocked = t.mock.method(groqPool, "createChatCompletion", async () => { throw Error("must not call"); });
  const ctx = makeContext(""); await runConceptMatching(ctx);
  assert.equal(ctx.conceptMatches?.[0].status, "missing");
  ctx.matchedLesson = undefined; await runConceptMatching(ctx);
  assert.deepEqual(ctx.conceptMatches, []);
  assert.equal(mocked.mock.callCount(), 0);
});
