import { Request, Response, NextFunction } from "express";
import { Note } from "../models/Note";
import { analyzeNoteContent } from "../services/analysisService";
import { sendSuccess, sendError, AppError } from "../middleware/errorHandler";

// ─── Analyze a note ────────────────────────────────────────────────────────

/**
 * POST /api/analyze/:noteId
 *
 * Manually re-runs AI analysis on a note that already has rawText.
 * Useful for:
 *   - Re-analyzing after OCR is confirmed correct
 *   - Re-running with updated prompts during development
 *   - Testing analysis independently of the full pipeline
 */
export const analyzeNote = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { noteId } = req.params;

    const note = await Note.findById(noteId);

    if (!note) {
      throw new AppError("Note not found", 404);
    }

    if (!note.rawText || note.rawText.trim().length < 10) {
      sendError(
        res,
        "Note has no extracted text yet. Run OCR first via POST /api/notes/:id/process",
        400
      );
      return;
    }

    console.log(`\n🔄 Manual re-analysis triggered for note: ${noteId}`);

    const result = await analyzeNoteContent(note.rawText);

    if (!result.success || !result.analysis) {
      sendError(res, result.error || "Analysis failed", 500);
      return;
    }

    // Save updated analysis
    note.analysis = result.analysis;
    note.status = "analyzed";
    await note.save();

    sendSuccess(
      res,
      {
        noteId,
        analysis: result.analysis,
      },
      "Note analyzed successfully"
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

    console.log(`\n🧪 Test analysis on raw text (${text.length} chars)`);

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
