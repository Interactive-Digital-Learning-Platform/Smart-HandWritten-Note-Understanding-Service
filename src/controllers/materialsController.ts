import { Request, Response, NextFunction } from "express";
import { LearningMaterial, MaterialType } from "../models/LearningMaterial";
import { generateMaterials, queueMaterials } from "../services/materialsService";
import { expireMaterialJobs, materialOverview, MATERIAL_TYPES } from "../services/materialJobs";
import { Note } from "../models/Note";
import { sendSuccess, sendError, AppError } from "../middleware/errorHandler";

// ─── Valid material types ──────────────────────────────────────────────────

const VALID_TYPES = MATERIAL_TYPES;

// ═══════════════════════════════════════════════════════════════════════════
// READ HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/materials/:noteId
 * Returns all generated materials for a note (summary view — no heavy content)
 */
export const getMaterialsByNote = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { noteId } = req.params;

    await expireMaterialJobs(noteId as string);
    const materials = await LearningMaterial.find({ noteId })
      .select("noteId userId type generatedAt audioUrl targetedGaps estimatedMinutes purposeDescription createdAt generationStatus generationError")
      .sort({ generatedAt: -1 });

    sendSuccess(res, { noteId, ...materialOverview(materials) });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/materials/:noteId/:type
 * Returns full content of a specific material type
 */
export const getMaterialByType = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { noteId, type } = req.params;

    if (!VALID_TYPES.includes(type as MaterialType)) {
      sendError(
        res,
        `Invalid material type '${type}'. Valid types: ${VALID_TYPES.join(", ")}`,
        400
      );
      return;
    }

    const material = await LearningMaterial.findOne({
      noteId,
      type: type as MaterialType,
      generatedAt: { $exists: true },
    }).select("-__v -generationId -generationExpiresAt");

    if (!material) {
      throw new AppError(
        `Material '${type}' has not been generated yet. Call POST /api/materials/${noteId}/generate/${type}`,
        404
      );
    }

    sendSuccess(res, material);
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GENERATION HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/materials/:noteId/generate
 * Triggers generation of ALL 7 material types for a note.
 * Returns 202 immediately — materials are generated async.
 *
 * Optional body: { "types": ["flashcards", "mindmap"] } to generate a subset.
 */
export const triggerGenerateAll = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { noteId } = req.params;
    const requestedTypes = req.body?.types;
    if (requestedTypes !== undefined && (!Array.isArray(requestedTypes) || requestedTypes.length === 0 || requestedTypes.some((type: unknown) => !VALID_TYPES.includes(type as MaterialType)))) {
      sendError(res, "types must be a non-empty array of supported material types", 400);
      return;
    }
    const note = await Note.findById(noteId).select("status analysis rawText");
    if (!note || note.status !== "analyzed" || !note.analysis || !note.rawText) {
      sendError(res, "Analyze this note before creating study materials.", 409);
      return;
    }
    const { typesQueued, completion } = await queueMaterials(noteId as string, requestedTypes ?? VALID_TYPES);
    void completion.catch(() => {});

    sendSuccess(
      res,
      {
        noteId,
        typesQueued,
        pollUrl: `/api/materials/${noteId}`,
      },
      typesQueued.length ? "Materials queued. Check the overview for progress." : "These materials are already being created.",
      202
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/materials/:noteId/generate/:type
 * Generates a single specific material type synchronously.
 * Waits for completion and returns the result directly.
 */
export const triggerGenerateOne = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { noteId, type } = req.params;

    if (!VALID_TYPES.includes(type as MaterialType)) {
      sendError(
        res,
        `Invalid type '${type}'. Valid: ${VALID_TYPES.join(", ")}`,
        400
      );
      return;
    }

    console.log(`\n⚙️  Generating '${type}' for note: ${noteId}`);

    const result = await generateMaterials(noteId as string, [type as MaterialType]);

    const typeResult = result.results[0];

    if (!typeResult) {
      sendSuccess(res, { noteId, typesQueued: [], pollUrl: `/api/materials/${noteId}` }, "This material is already being created.", 202);
      return;
    }
    if (!typeResult.success) {
      sendError(res, typeResult.error || "Generation failed", 500);
      return;
    }

    // Fetch and return the freshly generated material
    const material = await LearningMaterial.findOne({
      noteId,
      type: type as MaterialType,
      generatedAt: { $exists: true },
    }).select("-__v -generationId -generationExpiresAt");

    sendSuccess(res, material, `${type} generated successfully`);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/materials/:noteId/:type
 * Deletes a specific generated material (allows re-generation)
 */
export const deleteMaterialByType = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { noteId, type } = req.params;

    if (!VALID_TYPES.includes(type as MaterialType)) {
      sendError(res, `Invalid material type '${type}'`, 400);
      return;
    }

    const deleted = await LearningMaterial.findOneAndDelete({
      noteId,
      type: type as MaterialType,
    });

    if (!deleted) {
      throw new AppError(`Material '${type}' not found for this note`, 404);
    }

    sendSuccess(res, { deletedType: type, noteId }, `${type} deleted`);
  } catch (error) {
    next(error);
  }
};
