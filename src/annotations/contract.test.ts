import test from "node:test";
import assert from "node:assert/strict";
import {
  ANNOTATION_SCHEMA_VERSION,
  buildAnnotationRecordId,
  buildAnnotationSourceFingerprint,
  ConceptAnnotationRecord,
  redactAnnotationText,
  validateAnnotationRecord,
} from "./contract";

const createCandidate = (): ConceptAnnotationRecord => {
  const noteId = "note-123";
  const curriculumVersion = "1.1.0";
  const conceptId = "sci-g10-cell-structure";
  return {
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    recordId: buildAnnotationRecordId(noteId, curriculumVersion, conceptId),
    noteId,
    curriculumVersion,
    pipelineVersion: "2.0.0",
    subject: "Science",
    grade: 10,
    lessonId: "sci-g10-cell",
    lessonName: "Cell structure",
    language: "English",
    noteTextSnapshot: "Cells have a nucleus and a cell membrane.",
    concept: {
      id: conceptId,
      name: "Cell structure",
      category: "fact",
      weight: 4,
      isFrequentlyTested: true,
      keywords: ["cell", "nucleus"],
      learningOutcomes: ["Describe the main structures of a cell"],
    },
    systemPrediction: {
      status: "partial",
      probabilities: { present: 0.1, partial: 0.8, missing: 0.1 },
      found: true,
      decisionConfidence: 0.8,
      matchMethod: "semantic",
      source: "semantic_llm",
      needsReview: true,
    },
    review: { verdict: null },
    exportedAt: "2026-08-30T10:00:00.000Z",
  };
};

const cloneCandidate = (): ConceptAnnotationRecord =>
  JSON.parse(JSON.stringify(createCandidate())) as ConceptAnnotationRecord;

test("annotation record IDs are deterministic and identity-sensitive", () => {
  const first = buildAnnotationRecordId("note-1", "1.1.0", "concept-1");
  assert.equal(
    first,
    buildAnnotationRecordId("note-1", "1.1.0", "concept-1")
  );
  assert.notEqual(
    first,
    buildAnnotationRecordId("note-1", "1.2.0", "concept-1")
  );
  assert.match(first, /^ann-[a-f0-9]{24}$/);
});

test("annotation text redaction removes common direct identifiers", () => {
  const redacted = redactAnnotationText(
    "Email pupil@example.com, phone 077 123 4567, student id: STU-42"
  );
  assert.equal(redacted.includes("pupil@example.com"), false);
  assert.equal(redacted.includes("077 123 4567"), false);
  assert.equal(redacted.includes("STU-42"), false);
  assert.match(redacted, /\[EMAIL\].*\[PHONE\].*\[STUDENT_ID\]/);
});

test("a valid unreviewed annotation candidate passes validation", () => {
  assert.deepEqual(validateAnnotationRecord(createCandidate()), {
    valid: true,
    errors: [],
  });
});

test("completed imports require reviewer provenance and a valid timestamp", () => {
  const incomplete = createCandidate();
  const result = validateAnnotationRecord(incomplete, true);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /review\.verdict/);
  assert.match(result.errors.join(" "), /review\.reviewerId/);
  assert.match(result.errors.join(" "), /review\.labelQuality/);
  assert.match(result.errors.join(" "), /review\.reviewedAt/);

  const completed = cloneCandidate();
  completed.review = {
    verdict: "partial",
    reviewerId: "reviewer-01",
    labelQuality: "single_review",
    reviewedAt: "2026-08-30T11:00:00.000Z",
  };
  assert.equal(validateAnnotationRecord(completed, true).valid, true);
});

test("validation rejects identity leakage and record ID tampering", () => {
  const leaked = createCandidate() as ConceptAnnotationRecord & {
    userId: string;
  };
  leaked.userId = "student-123";
  leaked.recordId = "ann-tampered";
  const result = validateAnnotationRecord(leaked);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /recordId does not match/);
  assert.match(result.errors.join(" "), /userId must not be included/);
});

test("validation rejects inconsistent predictions and probabilities", () => {
  const candidate = cloneCandidate();
  candidate.systemPrediction.found = false;
  candidate.systemPrediction.probabilities = {
    present: 0.5,
    partial: 0.5,
    missing: 0.5,
  };
  const result = validateAnnotationRecord(candidate);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /found is inconsistent/);
  assert.match(result.errors.join(" "), /probabilities must sum to 1/);
});

test("source fingerprints allow review edits but reject source edits", () => {
  const candidate = createCandidate();
  const reviewed = cloneCandidate();
  reviewed.review = {
    verdict: "present",
    reviewerId: "reviewer-01",
    labelQuality: "single_review",
    reviewedAt: "2026-08-30T11:00:00.000Z",
  };
  assert.equal(
    buildAnnotationSourceFingerprint(reviewed),
    buildAnnotationSourceFingerprint(candidate)
  );

  reviewed.noteTextSnapshot = "The source text was changed.";
  assert.notEqual(
    buildAnnotationSourceFingerprint(reviewed),
    buildAnnotationSourceFingerprint(candidate)
  );
});
