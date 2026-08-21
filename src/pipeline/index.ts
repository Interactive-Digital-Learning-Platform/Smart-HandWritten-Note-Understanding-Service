// ═══════════════════════════════════════════════════════════════════════════
// Hybrid Pipeline — Orchestrator
// ═══════════════════════════════════════════════════════════════════════════
//
// The main entry point for the new multi-stage processing pipeline.
// Executes all 10 stages in sequence, passing a shared PipelineContext
// between stages.
//
// Features:
//   - Per-stage timing tracked in ctx.stageResults
//   - Per-stage error handling: critical stages abort the pipeline;
//     non-critical stages are skipped on failure with a warning
//   - Total duration tracked for performance monitoring
//
// Usage:
//   import { runPipeline } from "../pipeline";
//   const result = await runPipeline({ noteId, userId, imageUrl });
// ═══════════════════════════════════════════════════════════════════════════

import { PipelineContext, PipelineResult, PipelineStage, StageResult } from "./types";
import { runOcrExtraction } from "./stages/01-ocrExtraction";
import { runOcrCleaning } from "./stages/02-ocrCleaning";
import { runSubjectDetection } from "./stages/03-subjectDetection";
import { runLessonIdentification } from "./stages/04-lessonIdentification";
import { runCurriculumRetrieval } from "./stages/05-curriculumRetrieval";
import { runConceptMatching } from "./stages/06-conceptMatching";
import { runCoverageCalculation } from "./stages/07-coverageCalculation";
import { runGapDetection } from "./stages/08-gapDetection";
import { runMaterialGeneration } from "./stages/09-materialGeneration";
import { runQualityVerification } from "./stages/10-qualityVerification";

const PIPELINE_VERSION = "1.0.0";

// ─── Stage Definition ──────────────────────────────────────────────────────

type StageRunner = (ctx: PipelineContext) => Promise<void> | void;

interface StageDefinition {
  name: PipelineStage;
  run: StageRunner;
  /** If true, pipeline aborts if this stage throws */
  critical: boolean;
}

const STAGES: StageDefinition[] = [
  { name: "ocr_extraction",      run: runOcrExtraction,      critical: true  },
  { name: "ocr_cleaning",        run: runOcrCleaning,        critical: false },
  { name: "subject_detection",   run: runSubjectDetection,   critical: false },
  { name: "lesson_identification", run: runLessonIdentification, critical: false },
  { name: "curriculum_retrieval",  run: runCurriculumRetrieval,  critical: false },
  { name: "concept_matching",    run: runConceptMatching,    critical: false },
  { name: "coverage_calculation",run: runCoverageCalculation, critical: false },
  { name: "gap_detection",       run: runGapDetection,       critical: false },
  { name: "material_generation", run: runMaterialGeneration, critical: false },
  { name: "quality_verification",run: runQualityVerification, critical: false },
];

// ─── Pipeline Runner ───────────────────────────────────────────────────────

/**
 * Executes the full 10-stage hybrid processing pipeline for a single note.
 *
 * @param input.noteId    - MongoDB ObjectId of the Note document
 * @param input.userId    - The user who uploaded the note
 * @param input.imageUrl  - Path/URL to the uploaded image file
 * @returns PipelineResult with the final context or an error
 */
export const runPipeline = async (input: {
  noteId: string;
  userId: string;
  imageUrl: string;
  imageUrls?: string[];
  rawOcrText?: string;
}): Promise<PipelineResult> => {
  const pipelineStart = Date.now();

  const pages = input.imageUrls && input.imageUrls.length > 0 ? input.imageUrls : [input.imageUrl];

  console.log(`\n${"═".repeat(60)}`);
  console.log(`🔬 Pipeline START — note: ${input.noteId} (${pages.length} page(s))`);
  console.log(`${"═".repeat(60)}`);

  // ── Initialize context ─────────────────────────────────────────────────
  const ctx: PipelineContext = {
    noteId: input.noteId,
    userId: input.userId,
    imageUrl: pages[0],
    imageUrls: pages,
    rawOcrText: input.rawOcrText,
    pipelineVersion: PIPELINE_VERSION,
    startedAt: new Date(),
    stageResults: [],
  };


  // ── Execute stages in sequence ─────────────────────────────────────────
  for (const stage of STAGES) {
    const stageStart = Date.now();

    try {
      await Promise.resolve(stage.run(ctx));

      const stageResult: StageResult = {
        stage: stage.name,
        success: true,
        durationMs: Date.now() - stageStart,
      };
      ctx.stageResults.push(stageResult);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - stageStart;

      const stageResult: StageResult = {
        stage: stage.name,
        success: false,
        durationMs,
        error: errorMsg,
      };
      ctx.stageResults.push(stageResult);

      if (stage.critical) {
        // Critical failure — abort pipeline
        ctx.totalDurationMs = Date.now() - pipelineStart;

        console.error(`\n❌ Pipeline ABORTED at stage "${stage.name}": ${errorMsg}`);
        console.log(`${"═".repeat(60)}\n`);

        return {
          success: false,
          noteId: input.noteId,
          error: `Pipeline failed at stage "${stage.name}": ${errorMsg}`,
          failedAtStage: stage.name,
          context: ctx,
        };
      } else {
        // Non-critical — log warning and continue
        console.warn(
          `  ⚠️  Stage "${stage.name}" failed (non-critical), continuing: ${errorMsg}`
        );
      }
    }
  }

  // ── Done ───────────────────────────────────────────────────────────────
  ctx.totalDurationMs = Date.now() - pipelineStart;

  const stageTimings = ctx.stageResults
    .map((r) => `  ${r.stage}: ${r.durationMs}ms ${r.success ? "✅" : "❌"}`)
    .join("\n");

  console.log(`\n🎉 Pipeline COMPLETE — ${ctx.totalDurationMs}ms total`);
  console.log(`Stage timings:\n${stageTimings}`);

  const warnings = ctx.qualityWarnings ?? [];
  if (warnings.length > 0) {
    console.log(`Quality warnings:\n${warnings.map((w) => `  ⚠️  ${w}`).join("\n")}`);
  }
  console.log(`${"═".repeat(60)}\n`);

  return {
    success: true,
    noteId: input.noteId,
    context: ctx,
  };
};
