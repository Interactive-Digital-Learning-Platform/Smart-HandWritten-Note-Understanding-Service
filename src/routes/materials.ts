import { Router } from "express";
import {
  getMaterialsByNote,
  getMaterialByType,
  triggerGenerateAll,
  triggerGenerateOne,
  deleteMaterialByType,
} from "../controllers/materialsController";
import { aiRateLimit } from "../middleware/aiRateLimit";

const router = Router();

// ─── Generation routes ──────────────────────────────────────────────────────

/**
 * POST /api/materials/:noteId/generate
 * Generate ALL 7 material types (or a subset via body.types[]).
 * Returns 202 — runs async. Poll GET /api/materials/:noteId to check progress.
 * Body (optional): { "types": ["flashcards", "mindmap"] }
 */
router.post("/:noteId/generate", aiRateLimit(10, 10 * 60 * 1000), triggerGenerateAll);

/**
 * POST /api/materials/:noteId/generate/:type
 * Generate ONE material type synchronously. Returns the result immediately.
 * Types: structured_notes | definitions | flashcards | mindmap |
 *        revision_summary | learning_points | audio
 */
router.post("/:noteId/generate/:type", aiRateLimit(10, 10 * 60 * 1000), triggerGenerateOne);

// ─── Read routes ────────────────────────────────────────────────────────────

/**
 * GET /api/materials/:noteId
 * Get overview of all generated materials for a note (which types exist).
 */
router.get("/:noteId", getMaterialsByNote);

/**
 * GET /api/materials/:noteId/:type
 * Get the full content of a specific material type.
 */
router.get("/:noteId/:type", getMaterialByType);

// ─── Delete route ───────────────────────────────────────────────────────────

/**
 * DELETE /api/materials/:noteId/:type
 * Delete a material to allow re-generation.
 */
router.delete("/:noteId/:type", deleteMaterialByType);

export default router;
