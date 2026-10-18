import { Note, INote, IAnalysis } from "../models/Note";
import { runPipeline } from "../pipeline";
import { PipelineContext } from "../pipeline/types";
import { cachedOcrInput } from "../pipeline/ocrProvenance";
import {claimProcessing,expireProcessingNote,processingLeaseFilter,PROCESSING_LEASE_MS} from './processingLease';
import { updateProfileFromAnalysis } from "./profileService";
import { queueNoteForExpertReview } from "./annotationCollectionService";

// Processing options.

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

// Converts pipeline results to the format stored with a note.
export const contextToAnalysis = (ctx: PipelineContext): IAnalysis => {
  const subject = ctx.matchedLesson?.subject
    ?? ctx.subjectDetection?.subject
    ?? "Unknown";

  const topic = ctx.matchedLesson?.lessonName
    ?? ctx.subjectDetection?.topicHint
    ?? "Unknown";

  const gradeLevel = ctx.subjectDetection?.grade
    ? `Grade ${ctx.subjectDetection.grade}`
    : "Unknown";

  // Concepts found or missing in the note.
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

  // Kept for older clients. These are missing from the note, not proven learning gaps.
  const learningGaps = (ctx.explainableGaps ?? []).map((g) => ({
    concept: `Needs further coverage in this note: ${g.missingConcepts.map((c) => c.name).join(", ") || g.learningOutcome.description}`,
    severity: (g.missingConcepts[0]?.severity ?? "medium") as "low" | "medium" | "high",
    suggestion: g.recommendation,
  }));

  // Gaps with supporting details.
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

  // Use weighted coverage when available.
  const overallCompleteness =
    ctx.coverageScores?.weightedCoverage ??
    ctx.coverageScores?.simpleCoverage ??
    0;

  const unitMatch = (ctx.matchedLesson?.textbookReference || "").match(/(?:Unit|Lesson)\s*(\d+)/i) ||
                    (ctx.matchedLesson?.unit || "").match(/(?:Unit|Lesson)?\s*(\d+)/i) ||
                    (topic || "").match(/^(?:Unit|Lesson)?\s*(\d+)[\.\:\-]/i);
  const parsedUnitNum = unitMatch ? parseInt(unitMatch[1], 10) : undefined;

  return {
    // Note details.
    subject,
    topic,
    gradeLevel,
    unitNumber: parsedUnitNum,
    lessonNumber: parsedUnitNum,

    // Curriculum and textbook match.
    lessonId: ctx.matchedLessonId,
    lessonMatchConfidence: ctx.lessonMatchConfidence,
    lessonMatchMethod: ctx.lessonMatchMethod,
    textbookReference: ctx.matchedLesson?.textbookReference,
    textbookPassages: ctx.textbookPassages,

    // OCR quality.
    ocrConfidence: ctx.ocrCleaning?.confidenceScore,
    ocrLowQualityWarning: ctx.ocrCleaning?.lowQualityWarning,
    ocrPageSummary: ctx.ocrExtraction,
    noteScope: ctx.noteScope,
    contentLanguage: ctx.contentLanguage,

    // Coverage.
    keyConcepts,
    partialConcepts,
    missingConcepts: missingConceptNames,
    conceptFindings,
    englishCoverageCheck: ctx.englishCoverageCheck,
    coverageScores: ctx.coverageScores,
    overallCompleteness,

    // Gaps.
    learningGaps,
    explainableGaps,

    // Strengths and exam readiness.
    strengthAreas: ctx.strengthAreas ?? [],
    examReadiness: ctx.examReadiness,

    // Processing details.
    curriculumVersion: ctx.curriculumVersion,
    pipelineVersion: ctx.pipelineVersion,
    qualityWarnings: ctx.qualityWarnings ?? [],
    analyzedAt: new Date(),
  };
};

// Processes a note and saves the result. Status: uploaded, processing, then analyzed or failed.
export const processNote = async (
  noteId: string,
  force: boolean = false,
  options: ProcessingOptions = {}
): Promise<ProcessingResult> => {
  let note: INote | null = null;
  let previousAnalysis: INote["analysis"] | undefined;
  let isForcedReanalysis = false;
  let token:string|null=null;
  let heartbeat:ReturnType<typeof setInterval>|undefined;

  try {
    // Load and check the note.
    note = await Note.findById(noteId);

    if (!note) {
      return { success: false, noteId, error: "Note not found" };
    }

    if (note.status === "processing") await expireProcessingNote(note);
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

    // Mark the note as processing.
    previousAnalysis = note.analysis;
    isForcedReanalysis = force && note.status === "analyzed";
    token=await claimProcessing(note);
    if(!token)return {success:false,noteId,error:'This note changed or another analysis already started. Refresh and try again.'};
    const activeFilter=()=>processingLeaseFilter(noteId,token!);
    heartbeat=setInterval(()=>{
      void Note.updateOne(activeFilter(),{$set:{processingLeaseExpiresAt:new Date(Date.now()+PROCESSING_LEASE_MS)}}).catch(()=>{});
    },15000);heartbeat.unref();

    // Run the analysis pipeline.
    const imageUrls = note.imageUrls && note.imageUrls.length > 0
      ? note.imageUrls
      : [note.imageUrl];

    const pipelineResult = await runPipeline(
      {
        noteId,
        userId: note.userId,
        imageUrl: note.imageUrl,
        imageUrls,
        ...cachedOcrInput(note, options.refreshOcr),
        userSubject: note.userSubject ?? options.analysisHints?.subject,
        userGrade: note.userGrade ?? options.analysisHints?.grade,
        userTopic: note.userTopic ?? options.analysisHints?.topic,
        userLessonId: note.userLessonId ?? options.analysisHints?.lessonId,
      },
      {
        asyncMaterialGeneration: true,
        beforeAnalysisPublish:async()=>{if(!await Note.exists(activeFilter()))throw Error('This analysis attempt expired or was replaced');},
        onProgress: async progress => {
          await Note.updateOne(activeFilter(),
            { $set: { processingProgress: progress } });
        },
        skipMaterialGeneration: options.skipMaterialGeneration,
        onAnalysisReady: async (ctx) => {
          if (!note) return;

          // Save the OCR text.
          const rawText = ctx.ocrCleaning?.cleanedText ?? ctx.rawOcrText ?? "";
          note.rawOcrText = ctx.rawOcrText ?? rawText;
          note.rawText = rawText;

          // Save the analysis and finish the note.
          const analysis = contextToAnalysis(ctx);
          const saved=await Note.updateOne(activeFilter(),{$set:{rawOcrText:note.rawOcrText,rawText,analysis,status:'analyzed'},
            $unset:{processingProgress:1,errorMessage:1,processingRunId:1,processingLeaseExpiresAt:1}});
          if(!saved.modifiedCount)throw Error('This analysis attempt expired or was replaced');
          note.analysis = analysis;
          note.status = "analyzed";
          note.processingProgress = undefined;
          note.errorMessage = undefined;
          note.processingRunId=undefined;note.processingLeaseExpiresAt=undefined;

          // Research collection is explicitly opt-in and must never make the
          // student-facing note analysis fail.
          if (note.researchConsent?.status === "granted") {
            try {
              await queueNoteForExpertReview(note);
            } catch (error) {
              console.error(`Could not queue note ${noteId} for expert review:`, error);
            }
          }

          // Update the profile without failing the note.
          if (options.updateStudentProfile !== false) {
            try{await updateProfileFromAnalysis(ctx, previousAnalysis);}catch{console.warn('Could not update the Notes learning profile; saved analysis is available.');}
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

    if (note && token) {
      note.processingProgress = undefined;
      if (isForcedReanalysis && previousAnalysis) {
        note.analysis = previousAnalysis;
        note.status = "analyzed";
        note.errorMessage = 'Analysis was interrupted. Your earlier results were kept. Try analyzing again.';
      } else {
        note.status = "failed";
        note.errorMessage = 'We could not finish this analysis. Please try again.';
      }
      await Note.updateOne({_id:noteId,status:'processing',processingRunId:token},
        {$set:{status:note.status,errorMessage:note.errorMessage},$unset:{processingProgress:1,processingRunId:1,processingLeaseExpiresAt:1}});
    }

    return { success: false, noteId, error: message };
  } finally {if(heartbeat)clearInterval(heartbeat);}
};
