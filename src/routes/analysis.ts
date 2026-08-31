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
 * Backward-compatible alias for the full curriculum-grounded note pipeline.
 */
router.post("/:noteId", analyzeNote);

export default router;
