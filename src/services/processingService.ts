import { Note, INote, IAnalysis } from "../models/Note";
import { runPipeline } from "../pipeline";
import { PipelineContext } from "../pipeline/types";
import { updateProfileFromAnalysis } from "./profileService";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProcessingResult {
  success: boolean;
  noteId: string;
  rawText?: string;
  analysis?: INote["analysis"];
  materialsGenerated?: number;
  error?: string;
}

export interface ProcessingOptions {
  skipMaterialGeneration?: boolean;
  updateStudentProfile?: boolean;
  refreshOcr?: boolean;
  analysisHints?: {
    subject?: string;
    grade?: number;
    topic?: string;
    lessonId?: string;
  };
}

// ─── Context → IAnalysis Mapper ─────────────────────────────────────────────

/**
 * Converts the final PipelineContext into the IAnalysis shape
 * stored in the Note MongoDB document.
 *
 * Maps new pipeline fields to the expanded IAnalysis interface
 * AND maintains backward-compatible legacy fields for existing
 * mobile app consumers.
 */
const contextToAnalysis = (ctx: PipelineContext): IAnalysis => {
  const subject = ctx.matchedLesson?.subject
    ?? ctx.subjectDetection?.subject
    ?? "Unknown";

  const topic = ctx.matchedLesson?.lessonName
    ?? ctx.subjectDetection?.topicHint
    ?? "Unknown";

  const gradeLevel = ctx.subjectDetection?.grade
    ? `Grade ${ctx.subjectDetection.grade}`
    : "Unknown";

  // ── Found / missing concept names ───────────────────────────────────────
  const keyConcepts = (ctx.conceptMatches ?? [])
    .filter((m) => m.status === "present")
    .map((m) => m.concept.name);

  const partialConcepts = (ctx.conceptMatches ?? [])
    .filter((m) => m.status === "partial")
    .map((m) => m.concept.name);

  const missingConceptNames = (ctx.conceptMatches ?? [])
    .filter((m) => m.status === "missing")
    .map((m) => m.concept.name);

  const conceptFindings = (ctx.conceptMatches ?? []).map((m) => ({
    conceptId: m.concept.id,
    conceptName: m.concept.name,
    status: m.status,
    probabilities: m.probabilities,
    found: m.found,
    decisionConfidence: m.decisionConfidence,
    matchMethod: m.matchMethod,
    source: m.source,
    needsReview: m.needsReview,
    modelVersion: m.modelVersion,
    evidence: m.evidence,
    curriculumCategory: m.concept.category,
    importanceWeight: m.concept.weight,
    isFrequentlyTested: m.concept.isFrequentlyTested,
    studentVerification: "unverified" as const,
  }));

  // ── Legacy learningGaps (backward compatibility only) ───────────────────
  // These represent concepts not covered in this upload, not verified
  // knowledge deficits. New clients should use explainableGaps.findingStatus.
  const learningGaps = (ctx.explainableGaps ?? []).map((g) => ({
    concept: `Needs further coverage in this note: ${g.missingConcepts.map((c) => c.name).join(", ") || g.learningOutcome.description}`,
    severity: (g.missingConcepts[0]?.severity ?? "medium") as "low" | "medium" | "high",
    suggestion: g.recommendation,
  }));

  // ── New explainable gaps ─────────────────────────────────────────────────
  const explainableGaps = (ctx.explainableGaps ?? []).map((g) => ({
    outcomeId: g.learningOutcome.id,
    outcomeDescription: g.learningOutcome.description,
    status: g.status,
    evidence: g.evidence,
    missingConcepts: g.missingConcepts,
    recommendation: g.recommendation,
    findingStatus: g.findingStatus,
    verificationStatus: g.verificationStatus,
  }));

  // ── Overall completeness: prefer weighted coverage ───────────────────────
  const overallCompleteness =
    ctx.coverageScores?.weightedCoverage ??
    ctx.coverageScores?.simpleCoverage ??
    0;

  const unitMatch = (ctx.matchedLesson?.textbookReference || "").match(/(?:Unit|Lesson)\s*(\d+)/i) ||
                    (ctx.matchedLesson?.unit || "").match(/(?:Unit|Lesson)?\s*(\d+)/i) ||
                    (topic || "").match(/^(?:Unit|Lesson)?\s*(\d+)[\.\:\-]/i);
  const parsedUnitNum = unitMatch ? parseInt(unitMatch[1], 10) : undefined;

  return {
    // Core identification
    subject,
    topic,
    gradeLevel,
    unitNumber: parsedUnitNum,
    lessonNumber: parsedUnitNum,

    // Curriculum KB match & Ingested Textbook
    lessonId: ctx.matchedLessonId,
    lessonMatchConfidence: ctx.lessonMatchConfidence,
    lessonMatchMethod: ctx.lessonMatchMethod,
    textbookReference: ctx.matchedLesson?.textbookReference,
    textbookPassages: ctx.textbookPassages,

    // OCR quality
    ocrConfidence: ctx.ocrCleaning?.confidenceScore,
    ocrLowQualityWarning: ctx.ocrCleaning?.lowQualityWarning,
    ocrPageSummary: ctx.ocrExtraction,
    noteScope: ctx.noteScope,
    contentLanguage: ctx.contentLanguage,

    // Coverage
    keyConcepts,
    partialConcepts,
    missingConcepts: missingConceptNames,
    conceptFindings,
    coverageScores: ctx.coverageScores,
    overallCompleteness,

    // Gaps
    learningGaps,
    explainableGaps,

    // Strengths & exam readiness
    strengthAreas: ctx.strengthAreas ?? [],
    examReadiness: ctx.examReadiness,

    // Pipeline metadata
    curriculumVersion: ctx.curriculumVersion,
    pipelineVersion: ctx.pipelineVersion,
    qualityWarnings: ctx.qualityWarnings ?? [],
    analyzedAt: new Date(),
  };
};

// ─── Main Pipeline ──────────────────────────────────────────────────────────

/**
 * Full processing pipeline for a handwritten note.
 *
 * Delegates all processing to the new 10-stage Hybrid Pipeline.
 * After the pipeline completes, maps the PipelineContext back to the
 * IAnalysis shape and saves it to MongoDB.
 *
 * Status transitions: uploaded → processing → analyzed | failed
 *
 * @param noteId - MongoDB ObjectId string of the note to process
 */
export const processNote = async (
  noteId: string,
  force: boolean = false,
  options: ProcessingOptions = {}
): Promise<ProcessingResult> => {
  let note: INote | null = null;
  let previousAnalysis: INote["analysis"] | undefined;
  let isForcedReanalysis = false;

  try {
    // ── Fetch & validate ────────────────────────────────────────────────────
    note = await Note.findById(noteId);

    if (!note) {
      return { success: false, noteId, error: "Note not found" };
    }

    if (note.status === "processing") {
      return {
        success: false,
        noteId,
        error: "Note is already being processed. Please wait.",
      };
    }

    if (note.status === "analyzed" && !force) {
      return {
        success: true,
        noteId,
        rawText: note.rawText,
        analysis: note.analysis,
      };
    }

    // ── Mark as processing ──────────────────────────────────────────────────
    previousAnalysis = note.analysis;
    isForcedReanalysis = force && note.status === "analyzed";
    note.status = "processing";
    await note.save();

    // ── Run the Hybrid Pipeline ─────────────────────────────────────────────
    const imageUrls = note.imageUrls && note.imageUrls.length > 0
      ? note.imageUrls
      : [note.imageUrl];

    const pipelineResult = await runPipeline(
      {
        noteId,
        userId: note.userId,
        imageUrl: note.imageUrl,
        imageUrls,
        rawOcrText: options.refreshOcr ? undefined : note.rawText || undefined,
        userSubject: note.userSubject ?? options.analysisHints?.subject,
        userGrade: note.userGrade ?? options.analysisHints?.grade,
        userTopic: note.userTopic ?? options.analysisHints?.topic,
        userLessonId: note.userLessonId ?? options.analysisHints?.lessonId,
      },
      {
        asyncMaterialGeneration: true,
        skipMaterialGeneration: options.skipMaterialGeneration,
        onAnalysisReady: async (ctx) => {
          if (!note) return;

          // ── Persist OCR text ──────────────────────────────────────────────
          const rawText = ctx.ocrCleaning?.cleanedText ?? ctx.rawOcrText ?? "";
          note.rawText = rawText;

          // ── Persist analysis & mark as analyzed immediately ───────────────
          const analysis = contextToAnalysis(ctx);
          note.analysis = analysis;
          note.status = "analyzed";
          note.errorMessage = undefined;
          await note.save();

          // ── Update Student Profile (non-fatal) ─────────────────────────────
          if (options.updateStudentProfile !== false) {
            await updateProfileFromAnalysis(ctx, previousAnalysis);
          }

          console.log(
            `✅ Note analysis complete & saved for note ${noteId}: ` +
              `${analysis.subject} / ${analysis.topic} — ` +
              `${analysis.overallCompleteness}% coverage, ` +
              `${analysis.learningGaps.length} gaps`
          );
        },
      }
    );

    if (!pipelineResult.success || !pipelineResult.context) {
      throw new Error(
        pipelineResult.error ?? "Pipeline completed with no context"
      );
    }

    const ctx = pipelineResult.context;
    const rawText = ctx.ocrCleaning?.cleanedText ?? ctx.rawOcrText ?? "";
    const analysis = note.analysis || contextToAnalysis(ctx);

    return {
      success: true,
      noteId,
      rawText,
      analysis,
      materialsGenerated: ctx.materialsGenerated ?? 0,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown processing error";

    console.error(`\n❌ Processing failed for note ${noteId}: ${message}\n`);

    if (note) {
      if (isForcedReanalysis && previousAnalysis) {
        note.analysis = previousAnalysis;
        note.status = "analyzed";
        note.errorMessage = `Reanalysis failed; previous analysis preserved: ${message}`;
      } else {
        note.status = "failed";
        note.errorMessage = message;
      }
      await note.save();
    }

    return { success: false, noteId, error: message };
  }
};
