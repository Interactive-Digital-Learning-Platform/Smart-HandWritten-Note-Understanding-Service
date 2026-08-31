import test from "node:test";
import assert from "node:assert/strict";
import {
  conceptCoverageValue,
  determineOutcomeStatus,
  normalizeConceptStatus,
  probabilitiesForDecision,
  shouldReviewConcept,
  statusToLegacyFound,
} from "./conceptPrediction";
import { ConceptMatch, ConceptStatus, PipelineContext } from "./types";
import { runCoverageCalculation } from "./stages/07-coverageCalculation";
import { Note } from "../models/Note";

test("three-class statuses retain the legacy found contract", () => {
  assert.equal(statusToLegacyFound("present"), true);
  assert.equal(statusToLegacyFound("partial"), true);
  assert.equal(statusToLegacyFound("missing"), false);
  assert.equal(normalizeConceptStatus({ found: true }), "present");
  assert.equal(normalizeConceptStatus({ found: false }), "missing");
  assert.equal(
    normalizeConceptStatus({ status: "partial", found: false }),
    "partial"
  );
});

test("decision probabilities are normalized and select the decided class", () => {
  const probabilities = probabilitiesForDecision("partial", 0.8);
  const total =
    probabilities.present + probabilities.partial + probabilities.missing;

  assert.ok(Math.abs(total - 1) < 1e-12);
  assert.equal(probabilities.partial, 0.8);
  assert.ok(Math.abs(probabilities.present - 0.1) < 1e-12);
  assert.ok(Math.abs(probabilities.missing - 0.1) < 1e-12);
  assert.equal(shouldReviewConcept("partial", 0.95), true);
  assert.equal(shouldReviewConcept("present", 0.95), false);
});

const createMatch = (
  id: string,
  status: ConceptStatus,
  weight: number,
  confidence: number
): ConceptMatch => ({
  concept: {
    id,
    name: id,
    weight,
    isFrequentlyTested: false,
    category: "fact",
    keywords: [id],
  },
  status,
  probabilities: probabilitiesForDecision(status, confidence),
  found: statusToLegacyFound(status),
  matchConfidence: status === "missing" ? 0 : confidence,
  decisionConfidence: confidence,
  matchMethod: status === "missing" ? "not_found" : "semantic",
  source: status === "missing" ? "fallback" : "semantic_llm",
  needsReview: shouldReviewConcept(status, confidence),
});

test("coverage gives partial concepts half credit", () => {
  const context: PipelineContext = {
    noteId: "coverage-test",
    userId: "test-user",
    imageUrl: "test.jpg",
    curriculumVersion: "test",
    pipelineVersion: "test",
    startedAt: new Date(),
    stageResults: [],
    conceptMatches: [
      createMatch("present", "present", 5, 0.9),
      createMatch("partial", "partial", 4, 0.8),
      createMatch("missing", "missing", 1, 0.9),
    ],
  };

  runCoverageCalculation(context);

  assert.equal(context.coverageScores?.presentConcepts, 1);
  assert.equal(context.coverageScores?.partialConcepts, 1);
  assert.equal(context.coverageScores?.foundConcepts, 2);
  assert.equal(context.coverageScores?.missedConcepts, 1);
  assert.equal(context.coverageScores?.simpleCoverage, 50);
  assert.equal(context.coverageScores?.weightedCoverage, 70);
  assert.equal(context.coverageScores?.confidenceAdjustedWeightedCoverage, 61);
  assert.equal(conceptCoverageValue("partial"), 0.5);
});

test("learning outcomes use partial-credit equivalents", () => {
  assert.equal(determineOutcomeStatus(2, 2), "achieved");
  assert.equal(determineOutcomeStatus(1.5, 2), "partially_achieved");
  assert.equal(determineOutcomeStatus(0.5, 2), "not_achieved");
});

test("note persistence accepts both legacy and three-class findings", () => {
  const baseAnalysis = {
    subject: "Science",
    topic: "Test lesson",
    gradeLevel: "Grade 10",
    keyConcepts: [],
    missingConcepts: [],
    overallCompleteness: 0,
    learningGaps: [],
    strengthAreas: [],
    analyzedAt: new Date(),
  };
  const baseFinding = {
    conceptId: "concept-1",
    conceptName: "Concept 1",
    found: true,
    decisionConfidence: 0.8,
    matchMethod: "semantic" as const,
    curriculumCategory: "fact",
    importanceWeight: 3,
    isFrequentlyTested: false,
    studentVerification: "unverified" as const,
  };

  const legacy = new Note({
    userId: "legacy-user",
    title: "Legacy",
    imageUrl: "legacy.jpg",
    imageUrls: ["legacy.jpg"],
    analysis: {
      ...baseAnalysis,
      conceptFindings: [baseFinding],
    },
  });
  assert.equal(legacy.validateSync(), undefined);

  const current = new Note({
    userId: "current-user",
    title: "Current",
    imageUrl: "current.jpg",
    imageUrls: ["current.jpg"],
    analysis: {
      ...baseAnalysis,
      partialConcepts: ["Concept 1"],
      conceptFindings: [
        {
          ...baseFinding,
          status: "partial",
          probabilities: probabilitiesForDecision("partial", 0.8),
          source: "semantic_llm",
          needsReview: true,
        },
      ],
    },
  });
  assert.equal(current.validateSync(), undefined);
});
