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
  const foundMatches = matches.filter((m) => m.found);
  const foundConcepts = foundMatches.length;
  const missedConcepts = totalConcepts - foundConcepts;

  // ── Simple Coverage ─────────────────────────────────────────────────────
  const simpleCoverage =
    totalConcepts > 0
      ? Math.round((foundConcepts / totalConcepts) * 100)
      : 0;

  // ── Weighted Coverage (Improvement 4) ───────────────────────────────────
  const maxWeightedScore = matches.reduce(
    (sum, m) => sum + m.concept.weight,
    0
  );

  const achievedWeightedScore = foundMatches.reduce(
    (sum, m) => sum + m.concept.weight,
    0
  );

  const weightedCoverage =
    maxWeightedScore > 0
      ? Math.round((achievedWeightedScore / maxWeightedScore) * 100)
      : 0;

  const scores: CoverageScores = {
    simpleCoverage,
    weightedCoverage,
    totalConcepts,
    foundConcepts,
    missedConcepts,
    maxWeightedScore,
    achievedWeightedScore,
  };

  ctx.coverageScores = scores;

  console.log(
    `  [Stage 7] ✅ Simple: ${simpleCoverage}% | Weighted: ${weightedCoverage}% ` +
      `(${foundConcepts}/${totalConcepts} concepts, ` +
      `score: ${achievedWeightedScore}/${maxWeightedScore} pts)`
  );
};
