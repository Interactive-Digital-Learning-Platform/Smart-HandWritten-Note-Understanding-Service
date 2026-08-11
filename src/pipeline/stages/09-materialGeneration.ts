// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Stage 9 — Personalized Material Generation
// ═══════════════════════════════════════════════════════════════════════════
//
// Generates targeted learning materials based on the gaps detected in Stage 8.
// Instead of generating the same materials for every student, this stage:
//   1. Analyzes the severity profile of the gaps (high/medium/low)
//   2. Decides WHICH material types to generate based on the severity profile
//   3. Creates materials via the existing materialsService
//
// Material type priorities:
//   At Risk       → structured_notes + definitions + flashcards + summary
//   Needs Work    → structured_notes + flashcards + learning_points
//   Good          → flashcards + learning_points
//   Excellent     → revision_summary only
//
// Research Contribution: Improvement 6 — materials are targeted to gap
// severity rather than being a fixed set generated for every note.
// ═══════════════════════════════════════════════════════════════════════════

import { PipelineContext, MaterialPriorities } from "../types";
import { generateMaterials, NoteDataOverride } from "../../services/materialsService";
import { MaterialType } from "../../models/LearningMaterial";

// ─── Severity Analysis ─────────────────────────────────────────────────────

/**
 * Determines which material types to generate based on gap severity profile.
 */
const determineMaterialPriorities = (
  ctx: PipelineContext
): MaterialPriorities => {
  const gaps = ctx.explainableGaps ?? [];
  const examReadiness = ctx.examReadiness;

  let highCount = 0, mediumCount = 0, lowCount = 0;

  for (const gap of gaps) {
    for (const mc of gap.missingConcepts) {
      if (mc.severity === "high") highCount++;
      else if (mc.severity === "medium") mediumCount++;
      else lowCount++;
    }
  }

  const severityProfile = { high: highCount, medium: mediumCount, low: lowCount };
  const rating = examReadiness?.rating ?? "Needs Work";

  let typesToGenerate: string[];
  let rationale: string;

  if (rating === "At Risk" || highCount >= 3) {
    typesToGenerate = ["structured_notes", "definitions", "flashcards", "revision_summary", "learning_points"];
    rationale = `Critical gaps detected (${highCount} high-severity concepts missing). Generating full study pack.`;
  } else if (rating === "Needs Work" || highCount >= 1) {
    typesToGenerate = ["structured_notes", "flashcards", "learning_points"];
    rationale = `Significant gaps found. Generating targeted structured notes and practice materials.`;
  } else if (rating === "Good") {
    typesToGenerate = ["flashcards", "learning_points", "revision_summary"];
    rationale = `Minor gaps only. Generating flashcards and revision summary for reinforcement.`;
  } else {
    typesToGenerate = ["revision_summary"];
    rationale = `Excellent coverage. Generating a concise revision summary.`;
  }

  return { typesToGenerate, severityProfile, rationale };
};

// ─── Stage Runner ──────────────────────────────────────────────────────────

export const runMaterialGeneration = async (
  ctx: PipelineContext
): Promise<void> => {
  console.log(`  [Stage 9] Personalized Material Generation...`);

  const priorities = determineMaterialPriorities(ctx);
  ctx.materialPriorities = priorities;

  console.log(`  [Stage 9] Strategy: ${priorities.rationale}`);
  console.log(`  [Stage 9] Types: ${priorities.typesToGenerate.join(", ")}`);

  try {
    // Build an override so generateMaterials doesn't need to re-read note.analysis
    // from MongoDB — at this point in the pipeline it hasn't been saved yet.
    const subject = ctx.matchedLesson?.subject ?? ctx.subjectDetection?.subject ?? "Unknown";
    const topic   = ctx.matchedLesson?.lessonName ?? ctx.subjectDetection?.topicHint ?? "Unknown";
    const grade   = ctx.subjectDetection?.grade;
    const gradeLevel = grade ? `Grade ${grade}` : "Unknown";
    const rawText = ctx.ocrCleaning?.cleanedText ?? ctx.rawOcrText ?? "";

    const override: NoteDataOverride = {
      rawText,
      subject,
      topic,
      gradeLevel,
      userId: ctx.userId,
    };

    const result = await generateMaterials(
      ctx.noteId,
      priorities.typesToGenerate as MaterialType[],
      override
    );
    ctx.materialsGenerated = result?.results?.length ?? 0;
    console.log(`  [Stage 9] ✅ Generated ${ctx.materialsGenerated} material(s)`);
  } catch (err) {
    // Material generation failure is non-fatal
    console.error(
      `  [Stage 9] ❌ Material generation failed:`,
      err instanceof Error ? err.message : err
    );
    ctx.materialsGenerated = 0;
  }
};
