import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CurriculumLesson } from "../curriculum/types";
import {
  createTextIntakeCandidates,
  inspectTextIntake,
  TextIntakeValidationError,
} from "./textIntake";

const HEADERS =
  "note_group_id,subject,grade,lesson_name,language,page_count,ocr_reviewed\n";

const newRoot = (t: test.TestContext): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "text-intake-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
};

const writeNote = (
  root: string,
  noteGroupId: string,
  rawText: string | Buffer,
  correctedText?: string | Buffer
): void => {
  const directory = path.join(root, noteGroupId);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "raw-ocr.txt"), rawText);
  if (correctedText !== undefined) {
    fs.writeFileSync(path.join(directory, "corrected-text.txt"), correctedText);
  }
};

const lesson: CurriculumLesson = {
  curriculumVersion: "1.1.0",
  lessonId: "sci-g10-cells",
  subject: "Science",
  grade: 10,
  unit: "Cells",
  lessonName: "Cells, tissues and organs",
  matchingKeywords: ["cell"],
  examKeywords: ["cell"],
  definitions: [],
  formulae: [],
  expectedDiagrams: [],
  concepts: [
    {
      id: "sci-g10-cells-nucleus",
      name: "Nucleus",
      category: "definition",
      weight: 5,
      isFrequentlyTested: true,
      keywords: ["nucleus"],
    },
    {
      id: "sci-g10-cells-mitochondria",
      name: "Mitochondria",
      category: "fact",
      weight: 4,
      isFrequentlyTested: true,
      keywords: ["mitochondria"],
    },
  ],
  learningOutcomes: [
    {
      id: "sci-g10-cells-lo-1",
      description: "Describe the main structures of a cell",
      requiredConcepts: [
        "sci-g10-cells-nucleus",
        "sci-g10-cells-mitochondria",
      ],
    },
  ],
};

test("text intake inventories valid UTF-8 notes and coverage", (t) => {
  const root = newRoot(t);
  fs.writeFileSync(
    path.join(root, "metadata.csv"),
    `${HEADERS}note-001,Science,10,"Cells, tissues and organs",English,2,true\n` +
      "note-002,History,11,Independence,Sinhala,1,false\n"
  );
  writeNote(root, "note-001", "raw nucleus", "A cell has a nucleus.");
  writeNote(root, "note-002", "raw history", "නිදහස පිළිබඳ සටහන්");

  const inventory = inspectTextIntake(root);
  assert.equal(inventory.notes.length, 2);
  assert.equal(inventory.reviewedNoteCount, 1);
  assert.deepEqual(inventory.coverage.subjects, { Science: 1, History: 1 });
  assert.deepEqual(inventory.coverage.grades, { "10": 1, "11": 1 });
  assert.equal(inventory.notes[0].metadata.lessonName, "Cells, tissues and organs");
  assert.match(inventory.notes[0].correctedTextSha256, /^[a-f0-9]{64}$/);
});

test("text intake reports duplicate content, missing files, and unlisted folders together", (t) => {
  const root = newRoot(t);
  fs.writeFileSync(
    path.join(root, "metadata.csv"),
    `${HEADERS}note-001,Science,10,Cells,English,1,true\n` +
      "note-002,Science,10,Cells,English,1,true\n" +
      "note-003,Science,10,Cells,English,1,true\n"
  );
  writeNote(root, "note-001", "same raw", "same corrected");
  writeNote(root, "note-002", "same raw", " SAME   CORRECTED ");
  writeNote(root, "note-003", "third raw");
  fs.mkdirSync(path.join(root, "note-unlisted"));

  assert.throws(
    () => inspectTextIntake(root),
    (error: unknown) => {
      assert.ok(error instanceof TextIntakeValidationError);
      const message = error.issues.join(" ");
      assert.match(message, /corrected text duplicates note-001/);
      assert.match(message, /raw OCR text duplicates note-001/);
      assert.match(message, /note-003: corrected-text\.txt is missing/);
      assert.match(message, /note-unlisted has no matching note_group_id/);
      return true;
    }
  );
});

test("text intake rejects invalid UTF-8 instead of silently replacing bytes", (t) => {
  const root = newRoot(t);
  fs.writeFileSync(
    path.join(root, "metadata.csv"),
    `${HEADERS}note-001,Science,10,Cells,English,1,true\n`
  );
  writeNote(root, "note-001", "raw text", Buffer.from([0xc3, 0x28]));

  assert.throws(
    () => inspectTextIntake(root),
    (error: unknown) => {
      assert.ok(error instanceof TextIntakeValidationError);
      assert.match(error.message, /corrected-text\.txt is not valid UTF-8/);
      return true;
    }
  );
});

test("candidate conversion is deterministic, privacy-redacted, and always reviewable", (t) => {
  const root = newRoot(t);
  fs.writeFileSync(
    path.join(root, "metadata.csv"),
    `${HEADERS}note-001,Science,10,"Cells, tissues and organs",English,1,true\n`
  );
  writeNote(
    root,
    "note-001",
    "cell raw ocr",
    "Student id: STU-42. The nucleus controls the cell."
  );
  const inventory = inspectTextIntake(root);
  const generated = createTextIntakeCandidates(
    inventory,
    () => lesson,
    "2026-09-18T00:00:00.000Z"
  );
  const repeated = createTextIntakeCandidates(
    inventory,
    () => lesson,
    "2026-09-18T00:00:00.000Z"
  );

  assert.equal(generated.records.length, 2);
  assert.deepEqual(generated.records, repeated.records);
  assert.deepEqual(generated.systemStatusCounts, { present: 1, missing: 1 });
  assert.equal(generated.records[0].systemPrediction.needsReview, true);
  assert.equal(generated.records[0].systemPrediction.decisionConfidence, 0.6);
  assert.equal(generated.records[1].systemPrediction.decisionConfidence, 0.5);
  assert.match(generated.records[0].noteTextSnapshot, /\[STUDENT_ID\]/);
  assert.doesNotMatch(generated.records[0].noteTextSnapshot, /STU-42/);
  assert.match(generated.records[0].noteId, /^text-note-[a-f0-9]{24}$/);
});

test("candidate conversion blocks notes whose OCR correction is not confirmed", (t) => {
  const root = newRoot(t);
  fs.writeFileSync(
    path.join(root, "metadata.csv"),
    `${HEADERS}note-001,Science,10,Cells,English,1,false\n`
  );
  writeNote(root, "note-001", "raw", "corrected");
  const inventory = inspectTextIntake(root);
  assert.throws(
    () => createTextIntakeCandidates(inventory, () => lesson),
    /OCR correction is not confirmed for: note-001/
  );
});
