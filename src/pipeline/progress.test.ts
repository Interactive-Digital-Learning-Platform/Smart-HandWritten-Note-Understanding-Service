import test from "node:test";
import assert from "node:assert/strict";
import { createProgressReporter, ProcessingProgress } from "./progress";
import { PipelineStage } from "./types";
import { Note } from "../models/Note";

test("OCR page and stage updates come from execution, with stable start time", async () => {
  const received: ProcessingProgress[] = [];
  const completed: PipelineStage[] = [];
  const start = new Date("2026-10-15T00:00:00Z");
  const report = createProgressReporter(start, 5, () => completed, p => { received.push(p); });
  await report({ stage: "ocr_extraction", currentPage: 2 });
  completed.push("ocr_extraction");
  await report({ stage: "ocr_cleaning" });
  assert.equal(received[0]!.stage, "ocr_extraction");
  assert.equal(received[0]!.currentPage, 2);
  assert.equal(received[0]!.totalPages, 5);
  assert.deepEqual(received[0]!.completedStages, []);
  assert.deepEqual(received[1]!.completedStages, ["ocr_extraction"]);
  assert.equal(received[1]!.currentPage, undefined);
  assert.equal(received[0]!.startedAt, start.toISOString());
  assert.equal(received[1]!.startedAt, start.toISOString());
});

test("progress-write errors do not fail the analysis", async () => {
  const report = createProgressReporter(new Date(), 1, () => [], () => { throw new Error("database unavailable"); });
  await assert.doesNotReject(report({ stage: "concept_matching" }));
});

test("internal callers can omit progress publishing", async () => {
  await assert.doesNotReject(createProgressReporter(new Date(), 1, () => [])({ stage: "saving_analysis" }));
});

test("note schema retains processing details and allows terminal cleanup", () => {
  const note = new Note({ userId: "progress-unit-test", imageUrl: "/uploads/test.jpg", status: "processing",
    processingProgress: { stage: "ocr_extraction", completedStages: [], currentPage: 1, totalPages: 5,
      startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
  assert.equal(note.validateSync(), undefined);
  assert.equal(note.toJSON().processingProgress?.currentPage, 1);
  note.status = "analyzed";
  note.processingProgress = undefined;
  assert.equal(note.toJSON().processingProgress, undefined);
});
