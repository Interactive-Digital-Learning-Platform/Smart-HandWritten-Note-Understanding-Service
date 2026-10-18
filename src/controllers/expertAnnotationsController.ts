import { NextFunction, Request, Response } from "express";
import path from "node:path";
import { buildAnnotationRecordId, redactAnnotationText } from "../annotations/contract";
import {
  ExpertSubmissionInput,
  validateExpertSubmission,
} from "../annotations/liveReview";
import { config } from "../config/config";
import { sendError, sendSuccess, AppError } from "../middleware/errorHandler";
import { ConceptAnnotation } from "../models/ConceptAnnotation";
import {
  ExpertAnnotationTask,
  ExpertAnnotationTaskStatus,
} from "../models/ExpertAnnotationTask";
import { Note } from "../models/Note";

const allowedStatuses = new Set<ExpertAnnotationTaskStatus>([
  "queued",
  "in_review",
  "submitted",
  "approved",
  "rejected",
  "withdrawn",
]);

const expertId = (res: Response): string => String(res.locals.expertId);

export const getExpertAnnotationSummary = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const counts = await ExpertAnnotationTask.aggregate<{
      _id: ExpertAnnotationTaskStatus;
      count: number;
    }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
    sendSuccess(res, {
      counts: Object.fromEntries(counts.map((entry) => [entry._id, entry.count])),
      expertId: expertId(res),
    });
  } catch (error) {
    next(error);
  }
};

export const listExpertAnnotationTasks = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(String(req.query.limit || "20"), 10))
    );
    const status = String(req.query.status || "queued");
    if (!allowedStatuses.has(status as ExpertAnnotationTaskStatus)) {
      sendError(res, "Invalid annotation task status", 400);
      return;
    }
    const filter: Record<string, unknown> = { status };
    if (req.query.mine === "true") filter.assignedExpertId = expertId(res);
    const [tasks, total] = await Promise.all([
      ExpertAnnotationTask.find(filter)
        .select(
          "noteGroupId status priority assignedExpertId subject grade lessonName language pageCount concepts createdAt updatedAt"
        )
        .sort({ priority: -1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ExpertAnnotationTask.countDocuments(filter),
    ]);
    sendSuccess(res, {
      tasks: tasks.map((task) => ({
        ...task,
        conceptCount: task.concepts.length,
        concepts: undefined,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

export const getExpertAnnotationTask = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const task = await ExpertAnnotationTask.findById(req.params.id)
      .select("-sourceNoteId -__v")
      .lean();
    if (!task) throw new AppError("Annotation task not found", 404);
    sendSuccess(res, task);
  } catch (error) {
    next(error);
  }
};

export const claimExpertAnnotationTask = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const reviewer = expertId(res);
    const task = await ExpertAnnotationTask.findOneAndUpdate(
      {
        _id: req.params.id,
        status: { $in: ["queued", "in_review"] },
        $or: [
          { assignedExpertId: { $exists: false } },
          { assignedExpertId: reviewer },
        ],
      },
      {
        $set: {
          status: "in_review",
          assignedExpertId: reviewer,
          reviewStartedAt: new Date(),
        },
      },
      { new: true }
    ).select("-sourceNoteId -__v");
    if (!task) {
      throw new AppError("Task is unavailable or assigned to another expert", 409);
    }
    sendSuccess(res, task);
  } catch (error) {
    next(error);
  }
};

const applyDraft = (
  task: InstanceType<typeof ExpertAnnotationTask>,
  input: Partial<ExpertSubmissionInput>
): void => {
  if (typeof input.correctedText === "string" && input.correctedText.trim()) {
    task.correctedText = redactAnnotationText(input.correctedText);
  }
  if (typeof input.subjectConfirmed === "boolean") {
    task.subjectConfirmed = input.subjectConfirmed;
  }
  if (typeof input.lessonConfirmed === "boolean") {
    task.lessonConfirmed = input.lessonConfirmed;
  }
  if (input.flags) task.flags = { ...task.flags, ...input.flags };
  if (typeof input.overallNotes === "string") {
    task.overallNotes = input.overallNotes.trim();
  }
  if (Array.isArray(input.concepts)) {
    const reviews = new Map(input.concepts.map((review) => [review.conceptId, review]));
    for (const concept of task.concepts) {
      const review = reviews.get(concept.conceptId);
      if (!review) continue;
      concept.expertVerdict = review.verdict;
      concept.evidencePage = review.evidencePage;
      concept.evidenceText = review.evidenceText?.trim();
      concept.reviewerNotes = review.reviewerNotes?.trim();
    }
  }
};

export const saveExpertAnnotationDraft = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const task = await ExpertAnnotationTask.findOne({
      _id: req.params.id,
      assignedExpertId: expertId(res),
      status: "in_review",
    });
    if (!task) throw new AppError("Claim this task before editing it", 409);
    applyDraft(task, req.body as Partial<ExpertSubmissionInput>);
    await task.save();
    sendSuccess(res, { taskId: task.id, status: task.status, updatedAt: task.updatedAt });
  } catch (error) {
    next(error);
  }
};

export const submitExpertAnnotationTask = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const reviewer = expertId(res);
    const task = await ExpertAnnotationTask.findOne({
      _id: req.params.id,
      assignedExpertId: reviewer,
      status: "in_review",
    });
    if (!task) throw new AppError("Claim this task before submitting it", 409);
    const input = req.body as ExpertSubmissionInput;
    const validation = validateExpertSubmission(
      input,
      task.concepts.map((concept) => concept.conceptId),
      task.pageCount
    );
    if (!validation.valid) {
      sendError(res, validation.errors.join("; "), 400);
      return;
    }
    applyDraft(task, { ...input, correctedText: validation.correctedText });
    task.submittedAt = new Date();
    task.labelQuality = "single_review";

    if (validation.quarantine) {
      task.status = "rejected";
      await task.save();
      sendSuccess(res, { taskId: task.id, status: task.status, annotations: 0 });
      return;
    }

    const reviewedAt = new Date();
    const operations = task.concepts.map((concept) => ({
      updateOne: {
        filter: {
          recordId: buildAnnotationRecordId(
            task.noteGroupId,
            task.curriculumVersion,
            concept.conceptId
          ),
        },
        update: {
          $setOnInsert: {
            schemaVersion: "1.0.0",
            recordId: buildAnnotationRecordId(
              task.noteGroupId,
              task.curriculumVersion,
              concept.conceptId
            ),
            noteId: task.noteGroupId,
            evaluationGroupId: task.evaluationGroupId,
            curriculumVersion: task.curriculumVersion,
            pipelineVersion: task.pipelineVersion,
            subject: task.subject,
            grade: task.grade,
            lessonId: task.lessonId,
            lessonName: task.lessonName,
            language: task.language,
            noteScope: task.noteScope,
            ocrConfidence: task.ocrConfidence,
            noteTextSnapshot: validation.correctedText,
            concept: {
              id: concept.conceptId,
              name: concept.conceptName,
              category: concept.category,
              weight: concept.weight,
              isFrequentlyTested: concept.isFrequentlyTested,
              keywords: concept.keywords,
              learningOutcomes: concept.learningOutcomes,
            },
            systemPrediction: {
              status: concept.systemStatus,
              probabilities: concept.systemProbabilities,
              found: concept.systemStatus !== "missing",
              decisionConfidence: concept.systemConfidence,
              matchMethod: concept.systemMatchMethod,
              source: concept.systemSource,
              needsReview: concept.systemNeedsReview,
              modelVersion: concept.systemModelVersion,
              evidenceText: concept.systemEvidence,
            },
            reviewerVerdict: concept.expertVerdict,
            reviewerId: reviewer,
            labelQuality: "single_review" as const,
            evidencePage: concept.evidencePage,
            evidenceText: concept.evidenceText,
            reviewerNotes: concept.reviewerNotes,
            reviewedAt,
            usedForTraining: false,
            trainingEligible: true,
          },
        },
        upsert: true,
      },
    }));
    await ConceptAnnotation.bulkWrite(operations, { ordered: true });
    task.status = "submitted";
    await task.save();
    sendSuccess(res, {
      taskId: task.id,
      status: task.status,
      annotations: task.concepts.length,
      labelQuality: task.labelQuality,
    });
  } catch (error) {
    next(error);
  }
};

export const getExpertAnnotationImage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Number.parseInt(String(req.params.page), 10);
    const task = await ExpertAnnotationTask.findById(req.params.id).select(
      "sourceNoteId pageCount"
    );
    if (!task) throw new AppError("Annotation task not found", 404);
    if (!Number.isInteger(page) || page < 1 || page > task.pageCount) {
      throw new AppError("Image page is out of range", 404);
    }
    const note = await Note.findById(task.sourceNoteId).select("imageUrl imageUrls");
    if (!note) throw new AppError("Source note image is no longer available", 404);
    const urls = note.imageUrls?.length ? note.imageUrls : [note.imageUrl];
    const storedUrl = urls[page - 1];
    if (!storedUrl) {
      throw new AppError("Source note image page is no longer available", 404);
    }
    const filename = path.basename(storedUrl.split("?")[0]);
    const root = path.resolve(config.uploads.uploadDir);
    const target = path.resolve(root, filename);
    if (!target.startsWith(root + path.sep)) {
      throw new AppError("Invalid stored image path", 400);
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(target, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
};
