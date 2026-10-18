import { Request, Response, NextFunction } from "express";
import { Note } from "../models/Note";
import { analyzeNoteContent } from "../services/analysisService";
import { processNote as runPipeline } from "../services/processingService";
import { sendSuccess, sendError, AppError } from "../middleware/errorHandler";

// ─── Analyze a note ────────────────────────────────────────────────────────

/**
 * POST /api/analyze/:noteId
 *
 * Backward-compatible alias for the full curriculum-grounded pipeline.
 * This endpoint must never persist the legacy generic LLM analysis because it
 * would overwrite the structured concept and coverage results.
 */
export const analyzeNote = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { noteId } = req.params;

    const note = await Note.findById(noteId).select("status");

    if (!note) {
      throw new AppError("Note not found", 404);
    }

    if (note.status === "processing") {
      sendError(res, "Note is already being processed.", 409);
      return;
    }

    runPipeline(noteId as string, true).catch((error) => {
      console.error(`Background pipeline error for note ${noteId}:`, error);
    });

    sendSuccess(
      res,
      {
        noteId,
        status: "processing",
        pollUrl: `/api/notes/${noteId}`,
      },
      "Curriculum-grounded processing started. Poll pollUrl to track progress.",
      202
    );
  } catch (error) {
    next(error);
  }
};

// ─── Get analysis results for a note ──────────────────────────────────────

/**
 * GET /api/analyze/:noteId
 *
 * Returns the stored analysis for a note.
 * Includes learning gaps, completeness score, subject, topic, etc.
 */
export const getAnalysis = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { noteId } = req.params;

    const note = await Note.findById(noteId).select(
      "title status analysis rawText createdAt updatedAt"
    );

    if (!note) {
      throw new AppError("Note not found", 404);
    }

    if (!note.analysis) {
      sendError(
        res,
        note.status === "processing"
          ? "Note is still being processed. Poll GET /api/notes/:id for status."
          : "Analysis not yet available. Trigger processing via POST /api/notes/:id/process",
        404
      );
      return;
    }

    sendSuccess(res, {
      noteId,
      title: note.title,
      status: note.status,
      analysis: note.analysis,
      // Include a learning gap summary at the top level for easy mobile consumption
      summary: {
        subject: note.analysis.subject,
        topic: note.analysis.topic,
        gradeLevel: note.analysis.gradeLevel,
        overallCompleteness: note.analysis.overallCompleteness,
        totalGaps: note.analysis.learningGaps.length,
        highPriorityGaps: note.analysis.learningGaps.filter(
          (g) => g.severity === "high"
        ).length,
        mediumPriorityGaps: note.analysis.learningGaps.filter(
          (g) => g.severity === "medium"
        ).length,
        lowPriorityGaps: note.analysis.learningGaps.filter(
          (g) => g.severity === "low"
        ).length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Analyze raw text directly (dev/debug tool) ────────────────────────────

/**
 * POST /api/analyze/test
 *
 * Accepts raw text in the body and runs analysis directly.
 * Useful for testing the AI analysis without uploading an image.
 * Body: { "text": "..." }
 */
export const analyzeRawText = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== "string" || text.trim().length < 10) {
      sendError(res, "Request body must contain a 'text' field with at least 10 characters", 400);
      return;
    }

    console.log(`\n Test analysis on raw text (${text.length} chars)`);

    const result = await analyzeNoteContent(text);

    if (!result.success || !result.analysis) {
      sendError(res, result.error || "Analysis failed", 500);
      return;
    }

    sendSuccess(res, { analysis: result.analysis }, "Analysis complete");
  } catch (error) {
    next(error);
  }
};
