import { Request, Response, NextFunction } from "express";
import { LearningMaterial, MaterialType } from "../models/LearningMaterial";
import { generateMaterials } from "../services/materialsService";
import { sendSuccess, sendError, AppError } from "../middleware/errorHandler";

// ─── Valid material types ──────────────────────────────────────────────────

const VALID_TYPES: MaterialType[] = [
  "structured_notes",
  "definitions",
  "flashcards",
  "mindmap",
  "revision_summary",
  "learning_points",
  "audio",
];

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

    const materials = await LearningMaterial.find({ noteId })
      .select("noteId userId type generatedAt audioUrl targetedGaps estimatedMinutes purposeDescription createdAt")
      .sort({ generatedAt: -1 });

    // Return which types exist and which are still missing
    const generatedTypes = materials.map(m => m.type);
    const missingTypes = VALID_TYPES.filter(t => !generatedTypes.includes(t));

    sendSuccess(res, {
      noteId,
      generatedCount: materials.length,
      missingCount: missingTypes.length,
      generatedTypes,
      missingTypes,
      materials,
    });
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
    }).select("-__v");

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
    const requestedTypes = req.body?.types as MaterialType[] | undefined;

    // Validate any requested subset
    if (requestedTypes) {
      const invalid = requestedTypes.filter(t => !VALID_TYPES.includes(t));
      if (invalid.length > 0) {
        sendError(
          res,
          `Invalid type(s): ${invalid.join(", ")}. Valid: ${VALID_TYPES.join(", ")}`,
          400
        );
        return;
      }
    }

    const typesToGenerate = requestedTypes ?? VALID_TYPES;

    // Fire and forget — generation runs in background
    generateMaterials(noteId as string, typesToGenerate).catch(err => {
      console.error(`❌ Background materials generation failed for ${noteId}:`, err);
    });

    sendSuccess(
      res,
      {
        noteId,
        typesQueued: typesToGenerate,
        pollUrl: `/api/materials/${noteId}`,
      },
      `Generating ${typesToGenerate.length} material(s). Poll pollUrl to check progress.`,
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

    if (!typeResult.success) {
      sendError(res, typeResult.error || "Generation failed", 500);
      return;
    }

    // Fetch and return the freshly generated material
    const material = await LearningMaterial.findOne({
      noteId,
      type: type as MaterialType,
    }).select("-__v");

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
