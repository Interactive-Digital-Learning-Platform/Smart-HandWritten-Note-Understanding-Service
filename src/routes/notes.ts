import { Router } from "express";
import { upload } from "../middleware/upload";
import { aiRateLimit } from "../middleware/aiRateLimit";
import { requireNoteOwner } from "../middleware/studentOwnership";
import {
  uploadNote,
  getNotes,
  getNoteById,
  verifyConceptFinding,
  deleteNote,
  processNote,
  uploadAndProcess,
  updateNoteContextAndProcess,
  updateResearchConsent,
} from "../controllers/notesController";

const router = Router();
router.param("id", (req, res, next) => requireNoteOwner("id")(req, res, next));

/**
 * POST /api/notes/upload
 * Upload one or multiple handwritten note page images (no auto-processing).
 * Body: multipart/form-data — fields: "images" or "image", "userId", "title"
 */
router.post("/upload", upload.any(), uploadNote);

/**
 * POST /api/notes/upload-and-process
 * Upload one or multiple note page images AND immediately trigger OCR + AI analysis pipeline.
 * Primary endpoint used by the mobile app.
 * Returns 202 with pollUrl — client polls GET /api/notes/:id for completion.
 */
router.post("/upload-and-process", aiRateLimit(5, 10 * 60 * 1000), upload.any(), uploadAndProcess);

/**
 * GET /api/notes
 * Get all notes for a user
 * Query: userId (required) | status | page | limit
 */
router.get("/", getNotes);

/**
 * PATCH /api/notes/:id/concepts/:conceptId/verification
 * Student self-verification of an individual note-coverage finding.
 */
router.patch("/:id/concepts/:conceptId/verification", verifyConceptFinding);

/** Optional, versioned research consent; separate from normal app use. */
router.patch("/:id/research-consent", updateResearchConsent);

/** Student correction of subject/grade/topic, followed by re-analysis. */
router.patch("/:id/context", updateNoteContextAndProcess);

/**
 * GET /api/notes/:id
 * Get a single note by ID — used for polling processing status
 */
router.get("/:id", getNoteById);

/**
 * POST /api/notes/:id/process
 * Manually trigger OCR + AI pipeline for an already-uploaded note
 */
router.post("/:id/process", aiRateLimit(5, 10 * 60 * 1000), processNote);

/**
 * DELETE /api/notes/:id
 * Delete a note and all its generated learning materials
 */
router.delete("/:id", deleteNote);

export default router;
