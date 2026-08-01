// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Stage 10 — Quality Verification
// ═══════════════════════════════════════════════════════════════════════════
//
// Final validation pass before the analysis is persisted to the database.
// Checks the pipeline context for:
//   1. Completeness — required fields are populated
//   2. Sanity checks — scores are in valid ranges
//   3. Data consistency — gap count matches outcome assessment count
//
// This is a LIGHTWEIGHT, DETERMINISTIC stage — no LLM calls.
// ═══════════════════════════════════════════════════════════════════════════

import { PipelineContext } from "../types";

export const runQualityVerification = (ctx: PipelineContext): void => {
  console.log(`  [Stage 10] Quality Verification...`);

  const warnings: string[] = [];

  // ── Check OCR quality ──────────────────────────────────────────────────
  if (!ctx.rawOcrText || ctx.rawOcrText.trim().length < 10) {
    warnings.push("OCR text is very short or empty — notes may not have been extracted correctly");
  }

  if (ctx.ocrCleaning?.lowQualityWarning) {
    warnings.push(
      `Low image quality detected (confidence: ${ctx.ocrCleaning.confidenceScore}%). ` +
        "Consider re-uploading with better lighting or higher resolution."
    );
  }

  // ── Check subject detection ────────────────────────────────────────────
  if (ctx.subjectDetection?.subject === "Unknown") {
    warnings.push("Could not identify the academic subject. Please ensure the notes are for a supported O/L subject.");
  }

  if (ctx.subjectDetection && ctx.subjectDetection.grade === 0) {
    warnings.push("Could not determine grade level (10 or 11) from the notes.");
  }

  // ── Check lesson matching ──────────────────────────────────────────────
  if (!ctx.matchedLesson) {
    warnings.push("No matching curriculum lesson found. Coverage analysis was skipped.");
  } else if (
    ctx.lessonMatchConfidence !== undefined &&
    ctx.lessonMatchConfidence < 0.5
  ) {
    warnings.push(
      `Low lesson match confidence (${(ctx.lessonMatchConfidence * 100).toFixed(0)}%). ` +
        "Analysis may be for the wrong lesson."
    );
  }

  // ── Check coverage scores ──────────────────────────────────────────────
  if (ctx.coverageScores) {
    const { simpleCoverage, weightedCoverage } = ctx.coverageScores;

    if (simpleCoverage < 0 || simpleCoverage > 100) {
      warnings.push(`Invalid simple coverage score: ${simpleCoverage}`);
    }
    if (weightedCoverage < 0 || weightedCoverage > 100) {
      warnings.push(`Invalid weighted coverage score: ${weightedCoverage}`);
    }
  }

  // ── Check gap/outcome consistency ─────────────────────────────────────
  if (ctx.matchedLesson && ctx.outcomeAssessments) {
    const expectedOutcomes = ctx.matchedLesson.learningOutcomes.length;
    const actualAssessments = ctx.outcomeAssessments.length;

    if (expectedOutcomes !== actualAssessments) {
      warnings.push(
        `Outcome count mismatch: expected ${expectedOutcomes}, got ${actualAssessments}`
      );
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────
  ctx.qualityChecked = true;
  ctx.qualityWarnings = warnings;

  if (warnings.length === 0) {
    console.log(`  [Stage 10] ✅ All quality checks passed`);
  } else {
    console.log(`  [Stage 10] ✅ Done with ${warnings.length} warning(s):`);
    warnings.forEach((w) => console.log(`    ⚠️  ${w}`));
  }
};
