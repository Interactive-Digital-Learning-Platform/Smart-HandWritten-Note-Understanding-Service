import { Router, Request, Response } from "express";
import { TeacherValidation, ITeacherCorrection } from "../models/TeacherValidation";
import { Note } from "../models/Note";
import { computeEvaluationMetrics } from "../services/evaluationService";
import { sendSuccess, sendError } from "../middleware/errorHandler";

/**
 * INTERNAL LEGACY ANNOTATION ROUTER.
 *
 * The student application has no teacher role, so this router is deliberately
 * not mounted by server.ts. Do not expose it without a separate authenticated
 * reviewer identity and authorization boundary. Dataset annotation will use an
 * offline export/import workflow instead.
 */

const router = Router();

// ─── POST /api/teacher/validate ───────────────────────────────────────────

/**
 * Submit a teacher validation for an analyzed note.
 *
 * Body:
 * {
 *   noteId: string,
 *   teacherUserId: string,
 *   teacherName?: string,
 *   subjectCorrect?: boolean,
 *   lessonCorrect?: boolean,
 *   coverageScoreAccurate?: boolean,
 *   gapsRelevant?: boolean,
 *   corrections?: ITeacherCorrection[],
 *   teacherAddedGaps?: string[],
 *   teacherAddedStrengths?: string[],
 *   comment?: string,
 *   analysisQualityRating?: number (1-5)
 * }
 */
router.post("/validate", async (req: Request, res: Response) => {
  try {
    const {
      noteId,
      teacherUserId,
      teacherName,
      subjectCorrect,
      lessonCorrect,
      coverageScoreAccurate,
      gapsRelevant,
      corrections = [],
      conceptReviews = [],
      explainabilitySurvey,
      teacherAddedGaps = [],
      teacherAddedStrengths = [],
      comment,
      analysisQualityRating,
    } = req.body;

    if (!noteId || !teacherUserId) {
      sendError(res, "noteId and teacherUserId are required", 400);
      return;
    }

    // Verify note exists and has been analyzed
    const note = await Note.findById(noteId);
    if (!note) {
      sendError(res, `Note not found: ${noteId}`, 404);
      return;
    }
    if (note.status !== "analyzed") {
      sendError(res, "Note has not been analyzed yet. Run analysis first.", 400);
      return;
    }

    // Determine validation status
    const hasCorrections =
      corrections.length > 0 ||
      teacherAddedGaps.length > 0 ||
      teacherAddedStrengths.length > 0;
    const isDisputed =
      subjectCorrect === false || lessonCorrect === false || coverageScoreAccurate === false;

    let status: "approved" | "corrected" | "disputed";
    if (isDisputed) {
      status = "disputed";
    } else if (hasCorrections) {
      status = "corrected";
    } else {
      status = "approved";
    }

    // Upsert validation (one per note per teacher)
    const validation = await TeacherValidation.findOneAndUpdate(
      { noteId, teacherUserId },
      {
        noteId,
        studentUserId: note.userId,
        teacherUserId,
        teacherName,
        status,
        subjectCorrect,
        lessonCorrect,
        coverageScoreAccurate,
        gapsRelevant,
        corrections: corrections as ITeacherCorrection[],
        conceptReviews,
        explainabilitySurvey,
        teacherAddedGaps,
        teacherAddedStrengths,
        comment,
        analysisQualityRating:
          analysisQualityRating !== undefined
            ? Math.min(5, Math.max(1, Math.round(Number(analysisQualityRating))))
            : undefined,
        usedForImprovement: false,
      },
      { upsert: true, new: true, runValidators: true }
    );

    sendSuccess(res, {
      validationId: validation._id,
      noteId,
      status,
      message: `Teacher validation recorded as "${status}".`,
    });
  } catch (error) {
    console.error("Teacher validation error:", error);
    sendError(res, "Failed to save teacher validation", 500);
  }
});

// ─── GET /api/teacher/validations/:noteId ─────────────────────────────────

/**
 * Get all teacher validations for a specific note.
 */
router.get("/validations/:noteId", async (req: Request, res: Response) => {
  try {
    const { noteId } = req.params as { noteId: string };

    const validations = await TeacherValidation.find({ noteId }).lean();

    sendSuccess(res, {
      noteId,
      count: validations.length,
      validations,
    });
  } catch (error) {
    sendError(res, "Failed to retrieve validations", 500);
  }
});

// ─── GET /api/teacher/validations/status/:status ──────────────────────────

/**
 * Get validations by status (pending / approved / corrected / disputed).
 */
router.get(
  "/validations/status/:status",
  async (req: Request, res: Response) => {
    try {
      const { status } = req.params as {
        status: "pending" | "approved" | "corrected" | "disputed";
      };

      const allowed = ["pending", "approved", "corrected", "disputed"];
      if (!allowed.includes(status)) {
        sendError(res, `Invalid status. Must be one of: ${allowed.join(", ")}`, 400);
        return;
      }

      const validations = await TeacherValidation.find({ status })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      sendSuccess(res, {
        status,
        count: validations.length,
        validations,
      });
    } catch (error) {
      sendError(res, "Failed to retrieve validations by status", 500);
    }
  }
);

// ─── GET /api/teacher/metrics ─────────────────────────────────────────────

/**
 * Compute and return system evaluation metrics.
 * Improvement 10: Research-level performance metrics.
 *
 * Query params:
 *   ?days=30 — number of days to look back (default 30)
 */
router.get("/metrics", async (req: Request, res: Response) => {
  try {
    const days = Math.min(365, parseInt(req.query.days as string) || 30);
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - days * 24 * 60 * 60 * 1000);

    const metrics = await computeEvaluationMetrics(fromDate, toDate);

    sendSuccess(res, {
      ...metrics,
      generatedAt: new Date(),
      periodDays: days,
    });
  } catch (error) {
    console.error("Evaluation metrics error:", error);
    sendError(res, "Failed to compute evaluation metrics", 500);
  }
});

export default router;
