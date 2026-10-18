import { Router } from "express";
import { requireNoteOwner } from "../middleware/studentOwnership";
import { aiRateLimit } from "../middleware/aiRateLimit";
import {
  analyzeNote,
  getAnalysis,
  analyzeRawText,
} from "../controllers/analysisController";

const router = Router();
router.param("noteId", (req, res, next) => requireNoteOwner("noteId")(req, res, next));

/**
 * POST /api/analyze/test
 * Dev tool: analyze raw text directly without an image.
 * Body: { "text": "student notes text..." }
 * Must be defined BEFORE /:noteId to avoid route collision.
 */
router.post("/test", aiRateLimit(5, 10 * 60 * 1000), analyzeRawText);

/**
 * GET /api/analyze/:noteId
 * Get the stored analysis result for a note (with gap summary).
 */
router.get("/:noteId", getAnalysis);

/**
 * POST /api/analyze/:noteId
 * Backward-compatible alias for the full curriculum-grounded note pipeline.
 */
router.post("/:noteId", aiRateLimit(5, 10 * 60 * 1000), analyzeNote);

export default router;
