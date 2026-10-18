import test, { TestContext } from "node:test";
import assert from "node:assert/strict";
import { cachedOcrInput, completeOcrPages, ocrIdentity, restoreOcrSummary, UNKNOWN_OCR_WARNING } from "./ocrProvenance";
import { CachedOcrInput, PipelineContext } from "./types";
import { runOcrExtraction } from "./stages/01-ocrExtraction";
import { runOcrCleaning } from "./stages/02-ocrCleaning";
import { runEnglishCoverageCheck } from "./stages/06-englishCoverageCheck";
import { runQualityVerification } from "./stages/10-qualityVerification";
import { groqPool } from "../services/groqPool";
import * as ocrService from "../services/ocrService";
import * as pipeline from "./index";
import { contextToAnalysis, processNote } from "../services/processingService";
import { Note } from "../models/Note";

const text = "Asexual reproduction involves one parent without fusion of gametes.";
const pages = ["/synthetic-1.png", "/synthetic-2.png", "/synthetic-3.png", "/synthetic-4.png", "/synthetic-5.png"];
const partial = { totalPages: 5, extractedPages: 4, failedPages: 1 };
const full = { totalPages: 5, extractedPages: 5, failedPages: 0 };
const makeContext = (cachedOcr?: CachedOcrInput): PipelineContext => ({
  noteId: "synthetic-provenance", userId: "synthetic", imageUrl: pages[0], imageUrls: pages,
  rawOcrText: text, cachedOcr, stageResults: [], startedAt: new Date(), qualityWarnings: [],
  curriculumVersion: "fixture", pipelineVersion: "fixture",
  contentLanguage: { primaryLanguage: "English", confidence: 95 },
} as PipelineContext);
const forbidModel = { catalog() { throw Error("must not load model"); }, async predict() { throw Error("must not infer"); } };
const readable = (t: TestContext) => t.mock.method(groqPool, "createChatCompletion", async () => ({
  choices: [{ message: { content: JSON.stringify({ confidenceScore: 98, lowQualityWarning: false }) } }],
} as any));

test("unreadable-page counts and outlier warnings survive repeated reanalysis and schema round trips", async t => {
  readable(t);
  let cached: CachedOcrInput = { extraction: partial, warnings: ["OCR page 3 was excluded because its text was an extreme cross-page outlier."] };
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctx = makeContext(cached);
    await runOcrExtraction(ctx); await runOcrCleaning(ctx);
    await runEnglishCoverageCheck(ctx, forbidModel, true);
    assert.equal(ctx.englishCoverageCheck?.reason, "ocr_quality");
    const document = new Note({ userId: "synthetic", title: "fixture", imageUrl: pages[0], analysis: contextToAnalysis(ctx) });
    assert.equal(document.validateSync(), undefined);
    const saved = Note.hydrate(JSON.parse(JSON.stringify(document)));
    assert.equal(saved.analysis?.ocrPageSummary?.failedPages, 1);
    assert.equal(saved.analysis?.ocrPageSummary?.extractedPages, 4);
    assert.ok(saved.analysis?.qualityWarnings?.some(w => /page 3 was excluded/.test(w)));
    assert.equal(new Set(saved.analysis?.qualityWarnings).size, saved.analysis?.qualityWarnings?.length);
    cached = cachedOcrInput({ rawOcrText: text, analysis: saved.analysis }).cachedOcr!;
  }
});

test("absent or invalid counts stay unknown without fabricated page successes", async () => {
  for (const extraction of [undefined, { ...full, totalPages: 4 }, { ...full, extractedPages: 4 }, { ...full, extractedPages: -1 }, { ...full, failedPages: 0.5 }]) {
    const ctx = makeContext({ extraction });
    await runOcrExtraction(ctx);
    assert.equal(ctx.ocrExtraction?.qualityState, "unknown");
    assert.equal(ctx.ocrExtraction?.extractedPages, undefined);
    assert.equal(ctx.ocrExtraction?.failedPages, undefined);
    assert.ok(ctx.qualityWarnings?.includes(UNKNOWN_OCR_WARNING));
    await runEnglishCoverageCheck(ctx, forbidModel, true);
    assert.equal(ctx.englishCoverageCheck?.reason, "ocr_quality");
    const saved = new Note({ userId: "synthetic", title: "fixture", imageUrl: pages[0], analysis: contextToAnalysis(ctx) }).toObject();
    assert.equal(saved.analysis?.ocrPageSummary?.failedPages, undefined);
    assert.equal(saved.analysis?.ocrPageSummary?.qualityState, "unknown");
  }
});

test("known legacy summaries remain usable, missing summaries do not become zero counts", () => {
  const restored = restoreOcrSummary(text, pages, { extraction: full });
  assert.equal(completeOcrPages(restored, 5), true);
  assert.deepEqual(ocrIdentity(text, pages), { textSha256: restored.textSha256, imagesSha256: restored.imagesSha256 });
  const legacy = new Note({ userId: "synthetic", title: "fixture", imageUrl: pages[0], analysis: { subject: "Science", topic: "fixture" } });
  assert.equal(legacy.analysis?.ocrPageSummary, undefined);
});

test("changed text, image identity, page order, or incomplete fingerprints invalidate saved counts", () => {
  const extraction = { ...full, ...ocrIdentity(text, pages) };
  for (const [newText, newPages, snapshot] of [
    [text + " changed", pages, extraction], [text, [...pages].reverse(), extraction],
    [text, [...pages.slice(0, 4), "/replaced.png"], extraction],
    [text, pages, { ...extraction, textSha256: undefined }],
  ] as const) {
    const summary = restoreOcrSummary(newText, [...newPages], { extraction: snapshot });
    assert.equal(completeOcrPages(summary, newPages.length), false);
    assert.equal(summary.qualityState, "unknown");
    assert.equal(summary.extractedPages, undefined);
  }
});

test("contradictory failure warnings and explicit unknown state cannot turn into complete OCR", () => {
  for (const extraction of [full, { ...full, qualityState: "unknown" as const }]) {
    const summary = restoreOcrSummary(text, pages, { extraction, warnings: ["OCR could not read 1 of 5 uploaded page(s); coverage may be incomplete."] });
    assert.equal(completeOcrPages(summary, 5), false);
    assert.equal(summary.qualityState, "unknown");
  }
});

test("cached readability cannot improve past saved low confidence or erase warnings", async t => {
  readable(t);
  for (const cached of [
    { extraction: full, confidenceScore: 45, lowQualityWarning: true },
    { extraction: { ...full, readability: { confidenceScore: 50, lowQualityWarning: true } } },
    { extraction: full, warnings: ["Low OCR confidence: recapture this note."] },
  ]) {
    const ctx = makeContext(cached);
    await runOcrExtraction(ctx); await runOcrCleaning(ctx);
    assert.equal(ctx.ocrCleaning?.lowQualityWarning, true);
    if (cached.confidenceScore) assert.equal(ctx.ocrCleaning?.confidenceScore, 45);
    assert.equal(ctx.ocrExtraction?.readability?.lowQualityWarning, true);
    await runEnglishCoverageCheck(ctx, forbidModel, true);
    assert.equal(ctx.englishCoverageCheck?.reason, "ocr_quality");
  }
});

test("low-quality warnings remain deduplicated through final verification on repeated saves", async t => {
  readable(t);
  let cached: CachedOcrInput = { extraction: full, confidenceScore: 45, lowQualityWarning: true };
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctx = makeContext(cached);
    await runOcrExtraction(ctx); await runOcrCleaning(ctx); runQualityVerification(ctx);
    assert.equal(new Set(ctx.qualityWarnings).size, ctx.qualityWarnings?.length);
    assert.equal(ctx.ocrCleaning?.confidenceScore, 45);
    cached = cachedOcrInput({ rawOcrText: text, analysis: contextToAnalysis(ctx) }).cachedOcr!;
  }
});

test("pipeline orchestration passes saved provenance into extraction before a later abort", async () => {
  const result = await pipeline.runPipeline({ noteId: "synthetic-provenance", userId: "synthetic", imageUrl: pages[0], imageUrls: pages,
    rawOcrText: "<deleted>malformed", cachedOcr: { extraction: partial },
  }, { skipMaterialGeneration: true });
  assert.equal(result.failedAtStage, "ocr_cleaning");
  assert.equal(result.context?.ocrExtraction?.failedPages, 1);
});

test("new vision extraction replaces old quality and records the new page and text identity", async t => {
  readable(t);
  t.mock.method(ocrService, "extractTextFromImage", async () => ({ success: true, text }));
  const ctx = makeContext({ extraction: partial, lowQualityWarning: true, confidenceScore: 20 });
  ctx.rawOcrText = undefined; ctx.imageUrls = [pages[0]];
  await runOcrExtraction(ctx); await runOcrCleaning(ctx);
  assert.equal(ctx.cachedOcr, undefined);
  assert.equal(ctx.ocrExtraction?.source, "vision");
  assert.equal(completeOcrPages(ctx.ocrExtraction, 1), true);
  assert.equal(ctx.ocrCleaning?.lowQualityWarning, false);
  assert.equal(ctx.ocrCleaning?.confidenceScore, 98);
  assert.deepEqual(ocrIdentity(text, [pages[0]]), { textSha256: ctx.ocrExtraction?.textSha256, imagesSha256: ctx.ocrExtraction?.imagesSha256 });
});

test("blank successful OCR output is a failed page rather than a complete empty transcription", async t => {
  t.mock.method(ocrService, "extractTextFromImage", async () => ({ success: true, text: "   " }));
  const ctx = makeContext(); ctx.rawOcrText = undefined; ctx.imageUrls = [pages[0]];
  await assert.rejects(runOcrExtraction(ctx), /OCR failed on all 1 page/);
});

test("processing passes server-saved metadata and refresh bypasses both saved text and provenance", async t => {
  for (const refreshOcr of [false, true]) {
    const note = new Note({ userId: "synthetic", title: "fixture", imageUrl: pages[0], imageUrls: pages,
      rawOcrText: text, rawText: "different cleaned text", status: "analyzed",
      analysis: { subject: "Science", topic: "fixture", ocrPageSummary: partial, ocrConfidence: 45, ocrLowQualityWarning: true },
    });
    const save = t.mock.method(note, "save", async () => note);
    const find = t.mock.method(Note, "findById", async () => note);
    const update=t.mock.method(Note,'updateOne',async(_filter:any,change:any)=>{
      Object.assign(note,change.$set??{});for(const key of Object.keys(change.$unset??{}))(note as any)[key]=undefined;
      return {modifiedCount:1} as any;
    });
    const run = t.mock.method(pipeline, "runPipeline", async (input: Parameters<typeof pipeline.runPipeline>[0], options: Parameters<typeof pipeline.runPipeline>[1]) => {
      assert.equal(input.rawOcrText, refreshOcr ? undefined : text);
      assert.equal(input.cachedOcr?.extraction?.failedPages, refreshOcr ? undefined : 1);
      assert.equal(input.cachedOcr?.lowQualityWarning, refreshOcr ? undefined : true);
      const ctx = makeContext(input.cachedOcr);
      if (!refreshOcr) {
        await runOcrExtraction(ctx);
        await options?.onAnalysisReady?.(ctx);
        assert.equal(note.analysis?.ocrPageSummary?.failedPages, 1);
      }
      return { success: true, context: ctx, totalDurationMs: 0 };
    });
    const result = await processNote(String(note._id), true, { refreshOcr, skipMaterialGeneration: true, updateStudentProfile: false });
    assert.equal(result.success, true, result.error);
    run.mock.restore(); find.mock.restore(); save.mock.restore();update.mock.restore();
  }
});
