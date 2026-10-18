import { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs/promises";
import { Note } from "../models/Note";
import {expireProcessingNote} from '../services/processingLease';
import { LearningMaterial } from "../models/LearningMaterial";
import { sendSuccess, sendError, AppError } from "../middleware/errorHandler";
import { processNote as runPipeline } from "../services/processingService";
import { recordStudentConceptVerification } from "../services/profileService";
import { queueMaterials } from "../services/materialsService";
import { QuizDiagnosticRequest } from "../models/QuizDiagnosticRequest";
import { config } from "../config/config";
import { studentId } from "../middleware/studentAuth";
import { parseResearchConsent } from "../annotations/liveReview";
import {
  queueNoteForExpertReview,
  withdrawNoteFromExpertReview,
} from "../services/annotationCollectionService";

/** Deletes a storage file only by its basename inside an approved directory. */
const deleteStoredFile = async (directory: string, storedUrl?: string): Promise<void> => {
  if (!storedUrl) return;
  const filename = path.basename(storedUrl.split("?")[0]);
  if (!filename || filename === "." || filename === path.sep) return;
  const root = path.resolve(directory);
  const target = path.resolve(root, filename);
  if (!target.startsWith(root + path.sep)) return;
  try {
    await fs.unlink(target);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Could not remove stored file " + target, error);
    }
  }
};

/**
 * Helper to extract all uploaded Multer files from req.file or req.files
 * supporting single file, array of files ("images"), or fields object.
 */
const extractUploadedFiles = (req: Request): Express.Multer.File[] => {
  const files: Express.Multer.File[] = [];

  if (req.file) {
    files.push(req.file);
  } else if (Array.isArray(req.files)) {
    files.push(...req.files);
  } else if (req.files && typeof req.files === "object") {
    for (const key of Object.keys(req.files)) {
      const fieldFiles = (req.files as Record<string, Express.Multer.File[]>)[key];
      if (Array.isArray(fieldFiles)) {
        files.push(...fieldFiles);
      }
    }
  }

  return files;
};

// ─── Upload Note ──────────────────────────────────────────────────────────

/**
 * POST /api/notes/upload
 * Accepts one or more note image pages, stores them, creates a Note document.
 * Body: multipart/form-data — fields: "images" or "image", "userId", "title"
 */
export const uploadNote = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const uploadedFiles = extractUploadedFiles(req);

    if (uploadedFiles.length === 0) {
      sendError(
        res,
        "No image file(s) provided. Use field name 'images' or 'image'.",
        400
      );
      return;
    }

    const {
      title, subject, grade, topic, lessonName, lessonId,
      researchConsent, researchConsentVersion,
    } = req.body;
    const userId = studentId(res);

    const imageUrls = uploadedFiles.map(
      (file) => `/uploads/${path.basename(file.path)}`
    );
    const primaryImageUrl = imageUrls[0];
    const pageCount = imageUrls.length;

    const parsedGrade = grade ? parseInt(String(grade), 10) : undefined;
    const userTopic = topic || lessonName || undefined;

    const note = await Note.create({
      userId,
      title: title || (userTopic ? `${userTopic} Note` : "Untitled Note"),
      imageUrl: primaryImageUrl,
      imageUrls,
      pageCount,
      rawText: "",
      status: "uploaded",
      userSubject: subject || undefined,
      userGrade: !isNaN(parsedGrade as number) ? parsedGrade : undefined,
      userTopic,
      userLessonId: lessonId || undefined,
      researchConsent: parseResearchConsent(
        researchConsent,
        researchConsentVersion,
        config.annotationReview.consentVersion
      ),
    });

    sendSuccess(
      res,
      {
        noteId: note._id,
        imageUrl: note.imageUrl,
        imageUrls: note.imageUrls,
        pageCount: note.pageCount,
        status: note.status,
        title: note.title,
        userSubject: note.userSubject,
        userGrade: note.userGrade,
        userTopic: note.userTopic,
        researchConsent: note.researchConsent,
        createdAt: note.createdAt,
      },
      `Note uploaded successfully (${pageCount} page(s)). Ready for processing.`,
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
    const { status } = req.query;
    const userId = studentId(res);
    if (req.query.userId !== undefined && req.query.userId !== userId) throw new AppError("You can only list your own notes", 403);

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

    await Promise.all(notes.filter(note=>note.status==='processing').map(note=>expireProcessingNote(note)));
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

    if(note.status==='processing')await expireProcessingNote(note);
    sendSuccess(res, note);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notes/:id/concepts/:conceptId/verification
 * Records the student's own response to a note-coverage finding. This is not
 * a teacher workflow: "needs_help" is the student's explicit confirmation
 * that this concept should become a personalised learning priority.
 */
export const verifyConceptFinding = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id, conceptId } = req.params as { id: string; conceptId: string };
    const { status } = req.body as { status?: "understood" | "needs_help" };

    if (status !== "understood" && status !== "needs_help") {
      sendError(res, "status must be either 'understood' or 'needs_help'", 400);
      return;
    }

    const note = await Note.findById(id);
    if (!note || !note.analysis) {
      throw new AppError("Analyzed note not found", 404);
    }

    const findings = note.analysis.conceptFindings ?? [];
    const finding = findings.find((item) => item.conceptId === conceptId);
    if (!finding) {
      throw new AppError("Concept finding not found for this note", 404);
    }

    const previousStatus: "unverified" | "understood" | "needs_help" =
      finding.studentVerification === "understood"
        ? "understood"
        : finding.studentVerification === "needs_help"
        ? "needs_help"
        : "unverified";
    finding.studentVerification = status;
    finding.verifiedAt = new Date();

    // A student asking for help is sufficient to prioritise this concept for
    // personalised materials and the future Quiz-service diagnostic handoff.
    if (status === "needs_help") {
      for (const gap of note.analysis.explainableGaps ?? []) {
        if (gap.missingConcepts.some((concept) => concept.id === conceptId)) {
          gap.findingStatus = "confirmed_learning_gap";
          gap.verificationStatus = "verified";
        }
      }
    }

    note.markModified("analysis");
    await note.save();
    await recordStudentConceptVerification(note.userId, conceptId, previousStatus, status);

    let quizRequest: InstanceType<typeof QuizDiagnosticRequest> | null = null;

    if (status === "needs_help") {
      const confirmedConcepts = (note.analysis.conceptFindings ?? [])
        .filter((item) => item.studentVerification === "needs_help")
        .map((item) => item.conceptName);

      // Material generation is asynchronous, matching the rest of the note
      // workflow. It uses only concepts the student confirmed need support.
      const materialJobs = await queueMaterials(
        id,
        ["structured_notes", "flashcards", "learning_points"],
        undefined,
        { targetConcepts: confirmedConcepts }
      );
      materialJobs.completion.catch((err) => {
        console.error(`Targeted material generation failed for note ${id}:`, err);
      });

      const matchedConcept = note.analysis.conceptFindings?.find(
        (item) => item.conceptId === conceptId
      );
      const gapDetail = note.analysis.explainableGaps
        ?.flatMap((gap) => gap.missingConcepts)
        .find((concept) => concept.id === conceptId);

      // This writes an outbox record only. The Quiz service is not called
      // until the microservice integration is enabled.
      quizRequest = await QuizDiagnosticRequest.findOneAndUpdate(
        { noteId: note._id, conceptId },
        {
          $set: {
            userId: note.userId,
            noteId: note._id,
            subject: note.analysis.subject,
            grade: Number.parseInt(note.analysis.gradeLevel.replace(/\D/g, ""), 10) || undefined,
            lessonId: note.analysis.lessonId,
            lessonName: note.analysis.topic,
            curriculumVersion: note.analysis.curriculumVersion,
            conceptId,
            conceptName: matchedConcept?.conceptName ?? gapDetail?.name ?? conceptId,
            conceptWeight: gapDetail?.weight ?? 3,
            requestedQuestionCount: gapDetail?.weight && gapDetail.weight >= 4 ? 5 : 3,
            status: "pending_integration",
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    sendSuccess(res, {
      noteId: id,
      conceptId,
      status,
      note,
      quizIntegration: status === "needs_help"
        ? {
            ready: true,
            requestId: quizRequest?._id,
            conceptId,
            action: "request_targeted_diagnostic",
            status: quizRequest?.status,
          }
        : { ready: false },
    }, "Your learning preference has been saved.");
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
    const note = await Note.findById(req.params.id);

    if (!note) {
      throw new AppError("Note not found", 404);
    }

    await withdrawNoteFromExpertReview(String(note._id));

    // Remove derived audio before its material metadata is deleted.
    const materials = await LearningMaterial.find({ noteId: req.params.id }).select("audioUrl");
    await Promise.all(
      materials.map((material) =>
        deleteStoredFile(path.resolve(process.cwd(), "generated_audio"), material.audioUrl)
      )
    );

    // Uploaded handwriting is sensitive student data. Only basenames are used,
    // so a database value can never delete a file outside the uploads directory.
    const noteImageUrls = note.imageUrls?.length ? note.imageUrls : [note.imageUrl];
    await Promise.all(
      noteImageUrls.map((imageUrl) => deleteStoredFile(config.uploads.uploadDir, imageUrl))
    );

    await LearningMaterial.deleteMany({ noteId: req.params.id });
    await QuizDiagnosticRequest.deleteMany({ noteId: req.params.id });
    await note.deleteOne();

    sendSuccess(res, { deletedId: req.params.id }, "Note and associated stored data deleted successfully");
  } catch (error) {
    next(error);
  }
};

// ─── Process Note (OCR + AI Pipeline) ────────────────────────────────────

/**
 * POST /api/notes/:id/process
 * Triggers the async processing pipeline for a note.
 */
export const processNote = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const note = await Note.findById(id);

    if (!note) {
      throw new AppError("Note not found", 404);
    }

    if(note.status==='processing')await expireProcessingNote(note);
    if (note.status === "processing") {
      sendError(
        res,
        "Note is already being processed. Poll GET /api/notes/:id to track progress.",
        409
      );
      return;
    }

    // Fire-and-forget: run pipeline in background (force=true so already analyzed notes can be re-analyzed)
    runPipeline(id as string, true).catch((err) => {
      console.error(`Background pipeline error for note ${id}:`, err);
    });

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
 * PATCH /api/notes/:id/context
 * Lets a student correct optional curriculum context and immediately reruns
 * analysis. This is an explicit correction, not silent model retraining.
 */
export const updateNoteContextAndProcess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const note = await Note.findById(id);

    if (!note) throw new AppError("Note not found", 404);
    if (note.status === "processing") await expireProcessingNote(note);
    if (note.status === "processing") {
      sendError(res, "Note is already being processed.", 409);
      return;
    }

    const { subject, grade, topic, lessonId } = req.body as Record<string, unknown>;
    const update: Record<string, string | number | undefined> = {};
    if (subject !== undefined) update.userSubject = String(subject).trim() || undefined;
    if (topic !== undefined) update.userTopic = String(topic).trim() || undefined;
    if (lessonId !== undefined) update.userLessonId = String(lessonId).trim() || undefined;
    if (grade !== undefined && grade !== "") {
      const parsedGrade = Number(grade);
      if (parsedGrade !== 10 && parsedGrade !== 11) {
        sendError(res, "grade must be 10 or 11 when provided", 400);
        return;
      }
      update.userGrade = parsedGrade;
    } else if (grade !== undefined) {
      update.userGrade = undefined;
    }

    const values = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
    const removed = Object.fromEntries(Object.entries(update).filter(([, value]) => value === undefined).map(([key]) => [key, 1]));
    const changed = await Note.updateOne({_id: id, status: {$ne: 'processing'}, updatedAt: note.updatedAt},
      {$set: values, ...(Object.keys(removed).length ? {$unset: removed} : {})});
    if (!changed.matchedCount) {
      sendError(res, "This note changed or another analysis started. Refresh and try again.", 409);
      return;
    }
    Object.assign(note, update);
    // Materials were generated for the previous curriculum mapping.
    await LearningMaterial.deleteMany({ noteId: id });

    runPipeline(id as string, true).catch((err) => {
      console.error(`Background re-analysis error for note ${id}:`, err);
    });

    sendSuccess(res, {
      noteId: id,
      status: "processing",
      context: {
        subject: note.userSubject,
        grade: note.userGrade,
        topic: note.userTopic,
        lessonId: note.userLessonId,
      },
      pollUrl: `/api/notes/${id}`,
    }, "Context saved and re-analysis started.", 202);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/notes/upload-and-process
 * Convenience endpoint: uploads one or more note pages AND immediately triggers the pipeline.
 */
export const uploadAndProcess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const uploadedFiles = extractUploadedFiles(req);

    if (uploadedFiles.length === 0) {
      sendError(
        res,
        "No image file(s) provided. Use field name 'images' or 'image'.",
        400
      );
      return;
    }

    // These hints are optional: they give the pipeline student-provided context
    // without preventing automatic identification when a student does not know it.
    const {
      title, subject, grade, topic, lessonName, lessonId,
      researchConsent, researchConsentVersion,
    } = req.body;

    const imageUrls = uploadedFiles.map(
      (file) => `/uploads/${path.basename(file.path)}`
    );
    const primaryImageUrl = imageUrls[0];
    const pageCount = imageUrls.length;
    const parsedGrade = grade ? parseInt(String(grade), 10) : undefined;
    const userTopic = topic || lessonName || undefined;

    const note = await Note.create({
      userId: studentId(res),
      title: title || (userTopic ? `${userTopic} Note` : "Untitled Note"),
      imageUrl: primaryImageUrl,
      imageUrls,
      pageCount,
      rawText: "",
      status: "uploaded",
      userSubject: subject || undefined,
      userGrade: !isNaN(parsedGrade as number) ? parsedGrade : undefined,
      userTopic,
      userLessonId: lessonId || undefined,
      researchConsent: parseResearchConsent(
        researchConsent,
        researchConsentVersion,
        config.annotationReview.consentVersion
      ),
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
        imageUrls: note.imageUrls,
        pageCount: note.pageCount,
        status: "processing",
        title: note.title,
        userSubject: note.userSubject,
        userGrade: note.userGrade,
        userTopic: note.userTopic,
        userLessonId: note.userLessonId,
        researchConsent: note.researchConsent,
        pollUrl: `/api/notes/${noteId}`,
        createdAt: note.createdAt,
      },
      `Note uploaded (${pageCount} page(s)) and processing started. Poll pollUrl to track progress.`,
      202
    );
  } catch (error) {
    next(error);
  }
};

/** Grant or withdraw optional research-data use for an existing note. */
export const updateResearchConsent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { userId, status, version } = req.body as {
      userId?: string;
      status?: "granted" | "withdrawn";
      version?: string;
    };
    if (!userId || (status !== "granted" && status !== "withdrawn")) {
      sendError(res, "userId and status (granted or withdrawn) are required", 400);
      return;
    }
    const note = await Note.findById(id);
    if (!note) throw new AppError("Note not found", 404);
    if (note.userId !== userId) throw new AppError("Note owner mismatch", 403);

    if (status === "granted") {
      note.researchConsent = parseResearchConsent(
        true,
        version,
        config.annotationReview.consentVersion
      );
      await note.save();
      if (note.status === "analyzed") {
        await queueNoteForExpertReview(note);
      }
    } else {
      note.researchConsent = {
        status: "withdrawn",
        version: note.researchConsent?.version,
        grantedAt: note.researchConsent?.grantedAt,
        withdrawnAt: new Date(),
      };
      await note.save();
      await withdrawNoteFromExpertReview(id);
    }

    sendSuccess(res, { noteId: id, researchConsent: note.researchConsent });
  } catch (error) {
    next(error);
  }
};
