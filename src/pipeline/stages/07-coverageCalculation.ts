// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Stage 7 — Coverage Calculation
// ═══════════════════════════════════════════════════════════════════════════
//
// Computes two deterministic coverage scores from the concept matches:
//
//   Simple Coverage = foundConcepts / totalConcepts × 100
//
//   Weighted Coverage = Σ(weight of found concepts) /
//                       Σ(weight of all concepts) × 100
//
// This is a PURELY ALGORITHMIC stage — no LLM calls.
// The LLM assists in concept identification (Stage 6), but the score
// is calculated here by the algorithm.
//
// Research Contribution: Makes the completeness score TRANSPARENT,
// REPRODUCIBLE, and EXPLAINABLE (Improvements 2 + 4).
// ═══════════════════════════════════════════════════════════════════════════

import { PipelineContext, CoverageScores } from "../types";
import { conceptCoverageValue } from "../conceptPrediction";

export const runCoverageCalculation = (ctx: PipelineContext): void => {
  console.log(`  [Stage 7] Coverage Calculation...`);

  if (!ctx.conceptMatches || ctx.conceptMatches.length === 0) {
    // No curriculum context — skip coverage
    console.warn(
      `  [Stage 7] ⚠️  No concept matches — coverage calculation skipped`
    );
    return;
  }

  const matches = ctx.conceptMatches;
  const totalConcepts = matches.length;
  const foundMatches = matches.filter((m) => m.status !== "missing");
  const foundConcepts = foundMatches.length;
  const presentConcepts = matches.filter((m) => m.status === "present").length;
  const partialConcepts = matches.filter((m) => m.status === "partial").length;
  const missedConcepts = matches.filter((m) => m.status === "missing").length;
  const achievedConceptEquivalent = matches.reduce(
    (sum, match) => sum + conceptCoverageValue(match.status),
    0
  );

  // ── Simple Coverage ─────────────────────────────────────────────────────
  const simpleCoverage =
    totalConcepts > 0
      ? Math.round((achievedConceptEquivalent / totalConcepts) * 100)
      : 0;

  // ── Weighted Coverage (Improvement 4) ───────────────────────────────────
  const maxWeightedScore = matches.reduce(
    (sum, m) => sum + m.concept.weight,
    0
  );

  const achievedWeightedScore = matches.reduce(
    (sum, match) =>
      sum + match.concept.weight * conceptCoverageValue(match.status),
    0
  );

  const weightedCoverage =
    maxWeightedScore > 0
      ? Math.round((achievedWeightedScore / maxWeightedScore) * 100)
      : 0;

  // Discount each found concept by confidence from OCR and matching evidence.
  const confidenceAdjustedWeightedScore = matches.reduce(
    (sum, match) =>
      sum +
      match.concept.weight *
        conceptCoverageValue(match.status) *
        match.decisionConfidence,
    0
  );
  const confidenceAdjustedWeightedCoverage =
    maxWeightedScore > 0
      ? Math.round((confidenceAdjustedWeightedScore / maxWeightedScore) * 100)
      : 0;

  // A partial page is still useful to measure, but it cannot fairly represent
  // whole-lesson completeness. Only a complete lesson note is labelled as
  // lesson coverage; all other uploads are explicitly note coverage.
  const coverageScope = ctx.noteScope?.scope === "complete_lesson_note"
    ? "lesson_coverage" as const
    : "note_coverage" as const;

  const scores: CoverageScores = {
    simpleCoverage,
    weightedCoverage,
    confidenceAdjustedWeightedCoverage,
    totalConcepts,
    foundConcepts,
    presentConcepts,
    partialConcepts,
    missedConcepts,
    maxWeightedScore,
    achievedWeightedScore,
    confidenceAdjustedWeightedScore,
    coverageScope,
  };

  ctx.coverageScores = scores;

  console.log(
    `  [Stage 7] ✅ Simple: ${simpleCoverage}% | Weighted: ${weightedCoverage}% ` +
      `(${presentConcepts} present, ${partialConcepts} partial, ` +
      `${missedConcepts} missing; ` +
      `score: ${achievedWeightedScore}/${maxWeightedScore} pts, ${coverageScope})`
  );
};
