import { Router } from "express";
import {
  analyzeNote,
  getAnalysis,
  analyzeRawText,
} from "../controllers/analysisController";

const router = Router();

/**
 * POST /api/analyze/test
 * Dev tool: analyze raw text directly without an image.
 * Body: { "text": "student notes text..." }
 * Must be defined BEFORE /:noteId to avoid route collision.
 */
router.post("/test", analyzeRawText);

/**
 * GET /api/analyze/:noteId
 * Get the stored analysis result for a note (with gap summary).
 */
router.get("/:noteId", getAnalysis);

/**
 * POST /api/analyze/:noteId
 * Manually re-run AI analysis on a note that already has rawText.
 */
router.post("/:noteId", analyzeNote);

export default router;
