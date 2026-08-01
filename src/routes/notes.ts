import { Router } from "express";
import { upload } from "../middleware/upload";
import {
  uploadNote,
  getNotes,
  getNoteById,
  deleteNote,
  processNote,
  uploadAndProcess,
} from "../controllers/notesController";

const router = Router();

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
router.post("/upload-and-process", upload.any(), uploadAndProcess);

/**
 * GET /api/notes
 * Get all notes for a user
 * Query: userId (required) | status | page | limit
 */
router.get("/", getNotes);

/**
 * GET /api/notes/:id
 * Get a single note by ID — used for polling processing status
 */
router.get("/:id", getNoteById);

/**
 * POST /api/notes/:id/process
 * Manually trigger OCR + AI pipeline for an already-uploaded note
 */
router.post("/:id/process", processNote);

/**
 * DELETE /api/notes/:id
 * Delete a note and all its generated learning materials
 */
router.delete("/:id", deleteNote);

export default router;
