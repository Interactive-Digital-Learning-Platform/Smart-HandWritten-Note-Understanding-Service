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
import { queueMaterials, NoteDataOverride } from "../../services/materialsService";
import { MaterialType } from "../../models/LearningMaterial";
import mongoose from "mongoose";

// ─── Severity Analysis ─────────────────────────────────────────────────────

/**
 * Determines which material types to generate based on gap severity profile.
 */
const determineMaterialPriorities = (
  ctx: PipelineContext
): MaterialPriorities => {
  // A missing concept in one upload is note-coverage evidence, not a verified
  // knowledge deficit. The pipeline runs before a student can self-verify, so
  // it must not automatically create a remediation pack from those omissions.
  // A neutral revision summary remains useful without making that assumption.
  return {
    typesToGenerate: ["revision_summary"],
    severityProfile: { high: 0, medium: 0, low: 0 },
    rationale: "Generating a neutral revision summary. Targeted materials are created after the student confirms they need help with a concept.",
  };

};

// ─── Stage Runner ──────────────────────────────────────────────────────────

export const queuePipelineMaterials = async (
  ctx: PipelineContext
) => {
  console.log(`  [Stage 9] Personalized Material Generation...`);

  const priorities = determineMaterialPriorities(ctx);
  ctx.materialPriorities = priorities;

  console.log(`  [Stage 9] Strategy: ${priorities.rationale}`);
  console.log(`  [Stage 9] Types: ${priorities.typesToGenerate.join(", ")}`);

  // If MongoDB is not connected (e.g. offline evaluation scripts), skip material generation
  if (mongoose.connection.readyState === 0) {
    console.log(`  [Stage 9] ⏭️ Skipping material storage (MongoDB offline in benchmark mode)`);
    return;
  }

  try {
    // Build an override so generateMaterials doesn't need to re-read note.analysis
    // from MongoDB — at this point in the pipeline it hasn't been saved yet.
    const subject = ctx.matchedLesson?.subject ?? ctx.subjectDetection?.subject ?? "Unknown";
    const topic   = ctx.matchedLesson?.lessonName ?? ctx.subjectDetection?.topicHint ?? "Unknown";
    const grade   = ctx.subjectDetection?.grade;
    const gradeLevel = grade ? `Grade ${grade}` : "Unknown";
    const rawText = ctx.ocrCleaning?.cleanedText ?? ctx.rawOcrText ?? "";

    const foundConcepts = (ctx.conceptMatches ?? [])
      .filter((m) => m.status === "present")
      .map((m) => m.concept.name);

    const missingConcepts = (ctx.conceptMatches ?? [])
      .filter((m) => m.status !== "present")
      .map((m) => m.concept.name);

    const explainableGaps = (ctx.explainableGaps ?? []).map((g) => ({
      outcomeId: g.learningOutcome.id,
      outcomeDescription: g.learningOutcome.description,
      missingConcepts: g.missingConcepts.map((c) => ({
        id: c.id,
        name: c.name,
        severity: c.severity,
      })),
      recommendation: g.recommendation,
      evidence: g.evidence,
      findingStatus: g.findingStatus,
      verificationStatus: g.verificationStatus,
    }));

    const override: NoteDataOverride = {
      rawText,
      subject,
      topic,
      gradeLevel,
      userId: ctx.userId,
      foundConcepts,
      missingConcepts,
      explainableGaps,
      contentLanguage: ctx.contentLanguage?.primaryLanguage,
    };

    const queued = await queueMaterials(
      ctx.noteId,
      priorities.typesToGenerate as MaterialType[],
      override
    );
    return queued;
  } catch (err) {
    // Material generation failure is non-fatal
    console.error(
      `  [Stage 9] ❌ Material generation failed:`,
      err instanceof Error ? err.message : err
    );
    ctx.materialsGenerated = 0;
  }
};

export const runMaterialGeneration = async (ctx: PipelineContext): Promise<void> => {
  const queued = await queuePipelineMaterials(ctx);
  if (queued) ctx.materialsGenerated = (await queued.completion).succeeded;
};
