import assert from "node:assert/strict";
import test from "node:test";
import {
  parseResearchConsent,
  pseudonymizeResearchIdentifier,
  validateExpertSubmission,
} from "./liveReview";

test("research consent is opt-in and versioned", () => {
  assert.deepEqual(parseResearchConsent(undefined, undefined, "1.0"), {
    status: "not_provided",
  });
  const consent = parseResearchConsent("true", "2.0", "1.0");
  assert.equal(consent.status, "granted");
  assert.equal(consent.version, "2.0");
  assert.ok(consent.grantedAt instanceof Date);
});

test("research pseudonyms are deterministic and namespace-separated", () => {
  const first = pseudonymizeResearchIdentifier("student", "user-123", "secret");
  assert.equal(
    first,
    pseudonymizeResearchIdentifier("student", "user-123", "secret")
  );
  assert.notEqual(
    first,
    pseudonymizeResearchIdentifier("note", "user-123", "secret")
  );
  assert.ok(!first.includes("user-123"));
});

test("completed expert reviews require exact evidence for non-missing labels", () => {
  const result = validateExpertSubmission(
    {
      correctedText: "--- Page 1 ---\nA cell contains a nucleus.",
      subjectConfirmed: true,
      lessonConfirmed: true,
      flags: {
        wrongLesson: false,
        unreadable: false,
        duplicate: false,
        containsPersonalData: false,
      },
      concepts: [
        {
          conceptId: "cell-1",
          verdict: "present",
          evidencePage: 1,
          evidenceText: "A cell contains a nucleus.",
        },
        { conceptId: "cell-2", verdict: "missing" },
      ],
    },
    ["cell-1", "cell-2"],
    1
  );
  assert.equal(result.valid, true);
});

test("quarantined notes require a reason but not concept labels", () => {
  const result = validateExpertSubmission(
    {
      correctedText: "Unreadable marks",
      subjectConfirmed: false,
      lessonConfirmed: false,
      flags: {
        wrongLesson: false,
        unreadable: true,
        duplicate: false,
        containsPersonalData: false,
      },
      overallNotes: "Image is too blurred to annotate.",
      concepts: [],
    },
    ["cell-1"],
    1
  );
  assert.equal(result.valid, true);
  assert.equal(result.quarantine, true);
});

test("evidence must occur on the declared page", () => {
  const result = validateExpertSubmission(
    {
      correctedText: "--- Page 1 ---\nCell wall\n--- Page 2 ---\nNucleus",
      subjectConfirmed: true,
      lessonConfirmed: true,
      flags: {
        wrongLesson: false,
        unreadable: false,
        duplicate: false,
        containsPersonalData: false,
      },
      concepts: [
        {
          conceptId: "nucleus",
          verdict: "present",
          evidencePage: 1,
          evidenceText: "Nucleus",
        },
      ],
    },
    ["nucleus"],
    2
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /declared page/);
});
