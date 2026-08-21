import { Router, Request, Response } from "express";
import {
  getCurriculumStats,
  getAllSubjects,
  getLessonsBySubject,
  findLesson,
  searchLessons,
  getLessonById,
  isCurriculumLoaded,
} from "../curriculum";
import { sendSuccess, sendError } from "../middleware/errorHandler";
import { qdrantService } from "../services/qdrantService";

const router = Router();

// ─── GET /api/curriculum/stats ─────────────────────────────────────────────

/**
 * Returns a summary of the loaded curriculum KB.
 * Useful for health checks and debugging.
 */
router.get("/stats", (_req: Request, res: Response) => {
  try {
    if (!isCurriculumLoaded()) {
      sendError(res, "Curriculum KB has not been loaded yet", 503);
      return;
    }
    sendSuccess(res, getCurriculumStats());
  } catch (error) {
    sendError(res, "Failed to retrieve curriculum stats", 500);
  }
});

// ─── GET /api/curriculum/subjects ──────────────────────────────────────────

/**
 * Returns the list of available subjects.
 */
router.get("/subjects", (_req: Request, res: Response) => {
  try {
    sendSuccess(res, { subjects: getAllSubjects() });
  } catch (error) {
    sendError(res, "Failed to retrieve subjects", 500);
  }
});

// ─── GET /api/curriculum/lessons?subject=Biology&grade=10 ──────────────────

/**
 * Returns lessons for a given subject and optional grade.
 */
router.get("/lessons", (req: Request, res: Response) => {
  try {
    const { subject, grade } = req.query;

    if (!subject || typeof subject !== "string") {
      sendError(res, "Query parameter 'subject' is required", 400);
      return;
    }

    const gradeNum = grade ? parseInt(grade as string, 10) : undefined;

    const lessons = getLessonsBySubject(subject, gradeNum);

    sendSuccess(res, {
      subject,
      grade: gradeNum,
      count: lessons.length,
      lessons: lessons.map((l) => ({
        lessonId: l.lessonId,
        lessonName: l.lessonName,
        unit: l.unit,
        grade: l.grade,
        conceptCount: l.concepts.length,
        outcomeCount: l.learningOutcomes.length,
      })),
    });
  } catch (error) {
    sendError(res, "Failed to retrieve lessons", 500);
  }
});

// ─── GET /api/curriculum/lesson/:lessonId ──────────────────────────────────

/**
 * Returns the full lesson data by lessonId.
 */
router.get("/lesson/:lessonId", (req: Request, res: Response) => {
  try {
    const lessonId = req.params.lessonId as string;
    const lesson = getLessonById(lessonId);

    if (!lesson) {
      sendError(res, `Lesson not found: ${lessonId}`, 404);
      return;
    }

    sendSuccess(res, lesson);
  } catch (error) {
    sendError(res, "Failed to retrieve lesson", 500);
  }
});

// ─── GET /api/curriculum/find?subject=Biology&topic=Photosynthesis&grade=10 ─

/**
 * Finds the best matching lesson for a subject + topic query.
 * Used by the pipeline to match student notes to curriculum lessons.
 */
router.get("/find", (req: Request, res: Response) => {
  try {
    const { subject, topic, grade } = req.query;

    if (!subject || !topic) {
      sendError(res, "Query parameters 'subject' and 'topic' are required", 400);
      return;
    }

    const gradeNum = grade ? parseInt(grade as string, 10) : undefined;

    const result = findLesson(
      subject as string,
      topic as string,
      gradeNum
    );

    if (!result) {
      sendSuccess(res, {
        found: false,
        message: `No matching lesson found for ${subject} / ${topic}`,
      });
      return;
    }

    sendSuccess(res, {
      found: true,
      confidence: result.confidence,
      matchMethod: result.matchMethod,
      lesson: {
        lessonId: result.lesson.lessonId,
        lessonName: result.lesson.lessonName,
        subject: result.lesson.subject,
        grade: result.lesson.grade,
        unit: result.lesson.unit,
        conceptCount: result.lesson.concepts.length,
        outcomeCount: result.lesson.learningOutcomes.length,
      },
    });
  } catch (error) {
    sendError(res, "Failed to search curriculum", 500);
  }
});

// ─── GET /api/curriculum/search?q=photosynthesis ───────────────────────────

/**
 * Searches all lessons across all subjects for a topic match.
 * Returns top results sorted by confidence.
 */
router.get("/search", (req: Request, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== "string" || q.trim().length < 2) {
      sendError(res, "Query parameter 'q' must be at least 2 characters", 400);
      return;
    }

    const results = searchLessons(q).slice(0, 10); // Top 10 results

    sendSuccess(res, {
      query: q,
      count: results.length,
      results: results.map((r) => ({
        lessonId: r.lesson.lessonId,
        lessonName: r.lesson.lessonName,
        subject: r.lesson.subject,
        grade: r.lesson.grade,
        unit: r.lesson.unit,
        confidence: r.confidence,
        matchMethod: r.matchMethod,
      })),
    });
  } catch (error) {
    sendError(res, "Failed to search curriculum", 500);
  }
});

// ─── GET /api/curriculum/documents ─────────────────────────────────────────

/**
 * Returns all official ingested PDF textbook documents from the knowledge base.
 */
router.get("/documents", async (_req: Request, res: Response) => {
  try {
    const docs = await qdrantService.getIngestedDocuments();
    const stats = await qdrantService.getCollectionStats();

    sendSuccess(res, {
      totalPoints: stats.totalPoints,
      documentCount: docs.length,
      documents: docs,
    });
  } catch (error) {
    sendError(res, "Failed to retrieve ingested documents", 500);
  }
});

// ─── GET /api/curriculum/pdf-search?q=photosynthesis ─────────────────────────

/**
 * Searches the official PDF Ingestion Knowledge Base with dense vector similarity.
 */
router.get("/pdf-search", async (req: Request, res: Response) => {
  try {
    const { q, limit, filename } = req.query;
    if (!q || typeof q !== "string") {
      sendError(res, "Query parameter 'q' is required", 400);
      return;
    }

    const limitNum = limit ? parseInt(limit as string, 10) : 8;
    const filenameStr = typeof filename === "string" ? filename : undefined;

    const passages = await qdrantService.searchKnowledgeBase(q, limitNum, undefined, filenameStr);

    sendSuccess(res, {
      query: q,
      count: passages.length,
      passages,
    });
  } catch (error) {
    sendError(res, "Failed to search PDF knowledge base", 500);
  }
});

export default router;

