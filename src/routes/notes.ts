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
 * Upload a handwritten note image (no auto-processing)
 * Body: multipart/form-data — fields: "image" (file), "userId" (string), "title" (optional string)
 */
router.post("/upload", upload.single("image"), uploadNote);

/**
 * POST /api/notes/upload-and-process
 * Upload AND immediately trigger OCR + AI analysis pipeline
 * This is the primary endpoint used by the mobile app.
 * Returns 202 with pollUrl — client polls GET /api/notes/:id for completion.
 */
router.post("/upload-and-process", upload.single("image"), uploadAndProcess);

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

