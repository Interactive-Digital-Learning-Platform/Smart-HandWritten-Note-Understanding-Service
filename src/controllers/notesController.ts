import { Request, Response, NextFunction } from "express";
import path from "path";
import { Note } from "../models/Note";
import { LearningMaterial } from "../models/LearningMaterial";
import { sendSuccess, sendError, AppError } from "../middleware/errorHandler";
import { processNote as runPipeline } from "../services/processingService";

// ─── Upload Note ──────────────────────────────────────────────────────────

/**
 * POST /api/notes/upload
 * Accepts a note image, stores it, creates a Note document with status "uploaded"
 */
export const uploadNote = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.file) {
      sendError(res, "No image file provided. Use field name 'image'.", 400);
      return;
    }

    const { userId, title } = req.body;

    if (!userId) {
      sendError(res, "userId is required in the request body", 400);
      return;
    }

    // Build the image URL — in production this would be a cloud URL
    const imageUrl = `/uploads/${path.basename(req.file.path)}`;

    const note = await Note.create({
      userId,
      title: title || "Untitled Note",
      imageUrl,
      rawText: "",
      status: "uploaded",
    });

    sendSuccess(
      res,
      {
        noteId: note._id,
        imageUrl: note.imageUrl,
        status: note.status,
        title: note.title,
        createdAt: note.createdAt,
      },
      "Note uploaded successfully. Ready for processing.",
      201
    );
  } catch (error) {
    next(error);
  }
};

// ─── Get All Notes ─────────────────────────────────────────────────────────

/**
 * GET /api/notes?userId=xxx&status=analyzed&page=1&limit=10
 */
export const getNotes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId, status } = req.query;

    if (!userId) {
      sendError(res, "userId query parameter is required", 400);
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    // Build filter
    const filter: Record<string, unknown> = { userId };
    if (status) filter.status = status;

    const [notes, total] = await Promise.all([
      Note.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-__v"),
      Note.countDocuments(filter),
    ]);

    sendSuccess(res, {
      notes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Get Note By ID ────────────────────────────────────────────────────────

/**
 * GET /api/notes/:id
 */
export const getNoteById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const note = await Note.findById(req.params.id).select("-__v");

    if (!note) {
      throw new AppError("Note not found", 404);
    }

    sendSuccess(res, note);
  } catch (error) {
    next(error);
  }
};

// ─── Delete Note ───────────────────────────────────────────────────────────

/**
 * DELETE /api/notes/:id
 */
export const deleteNote = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const note = await Note.findByIdAndDelete(req.params.id);

    if (!note) {
      throw new AppError("Note not found", 404);
    }

    // Also remove all generated materials for this note
    await LearningMaterial.deleteMany({ noteId: req.params.id });

    sendSuccess(res, { deletedId: req.params.id }, "Note deleted successfully");
  } catch (error) {
    next(error);
  }
};

// ─── Process Note (OCR + AI Pipeline) ────────────────────────────────────

/**
 * POST /api/notes/:id/process
 * Triggers the async processing pipeline for a note:
 *   1. OCR  — extracts raw text from the image (Phase 2)
 *   2. AI Analysis — detects gaps and generates structured content (Phase 3)
 *
 * Returns 202 Accepted immediately. The client should poll
 * GET /api/notes/:id to check when status changes to "analyzed" or "failed".
 */
export const processNote = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const note = await Note.findById(id).select("status title");

    if (!note) {
      throw new AppError("Note not found", 404);
    }

    if (note.status === "processing") {
      sendError(
        res,
        "Note is already being processed. Poll GET /api/notes/:id to track progress.",
        409
      );
      return;
    }

    // ── Fire-and-forget: run pipeline in background ─────────────────────
    // We do NOT await this — it runs async so we can return 202 immediately.
    runPipeline(id as string).catch((err) => {
      console.error(`Background pipeline error for note ${id}:`, err);
    });

    // ── Return immediately ───────────────────────────────────────────────
    sendSuccess(
      res,
      {
        noteId: id,
        status: "processing",
        pollUrl: `/api/notes/${id}`,
      },
      "Processing started. Poll pollUrl to track progress.",
      202
    );
  } catch (error) {
    next(error);
  }
};

// ─── Upload and immediately trigger processing ────────────────────────────

/**
 * POST /api/notes/upload-and-process
 * Convenience endpoint: uploads the image AND immediately triggers the pipeline.
 * Returns 202 with noteId so the client can poll.
 */
export const uploadAndProcess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.file) {
      sendError(res, "No image file provided. Use field name 'image'.", 400);
      return;
    }

    const { userId, title } = req.body;

    if (!userId) {
      sendError(res, "userId is required in the request body", 400);
      return;
    }

    const imageUrl = `/uploads/${path.basename(req.file.path)}`;

    const note = await Note.create({
      userId,
      title: title || "Untitled Note",
      imageUrl,
      rawText: "",
      status: "uploaded",
    });

    const noteId = (note._id as unknown as string).toString();

    // Fire-and-forget pipeline
    runPipeline(noteId).catch((err) => {
      console.error(`Background pipeline error for note ${noteId}:`, err);
    });

    sendSuccess(
      res,
      {
        noteId,
        imageUrl: note.imageUrl,
        status: "processing",
        title: note.title,
        pollUrl: `/api/notes/${noteId}`,
        createdAt: note.createdAt,
      },
      "Note uploaded and processing started. Poll pollUrl to track progress.",
      202
    );
  } catch (error) {
    next(error);
  }
};
