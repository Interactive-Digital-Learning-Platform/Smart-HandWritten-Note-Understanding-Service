import mongoose, { Schema, Document } from "mongoose";

// ─── Types ─────────────────────────────────────────────────────────────────

export type MaterialType =
  | "structured_notes"
  | "definitions"
  | "flashcards"
  | "mindmap"
  | "revision_summary"
  | "learning_points"
  | "audio";

// ─── Flashcard sub-document ────────────────────────────────────────────────

export interface IFlashcard {
  front: string;
  back: string;
}

// ─── Definition sub-document ───────────────────────────────────────────────

export interface IDefinition {
  term: string;
  definition: string;
}

// ─── Mind Map Node ─────────────────────────────────────────────────────────

export interface IMindMapNode {
  label: string;
  children?: IMindMapNode[];
}

// ─── Main LearningMaterial document ───────────────────────────────────────

export interface ILearningMaterial extends Document {
  noteId: mongoose.Types.ObjectId;
  userId: string;
  type: MaterialType;

  // Content fields — only one will be populated depending on type
  textContent?: string;           // structured_notes, revision_summary, learning_points
  flashcards?: IFlashcard[];      // flashcards
  definitions?: IDefinition[];    // definitions
  mindMap?: IMindMapNode;         // mindmap root node
  audioUrl?: string;              // audio file path/URL

  // Personalized study metadata
  targetedGaps?: string[];        // missing concepts or outcome IDs addressed
  estimatedMinutes?: number;      // estimated study/reading duration in minutes
  purposeDescription?: string;    // pedagogical explanation of this material

  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schemas ───────────────────────────────────────────────────────────────

const FlashcardSchema = new Schema<IFlashcard>(
  {
    front: { type: String, required: true },
    back: { type: String, required: true },
  },
  { _id: false }
);

const DefinitionSchema = new Schema<IDefinition>(
  {
    term: { type: String, required: true },
    definition: { type: String, required: true },
  },
  { _id: false }
);

// Recursive mind map schema via Mixed type (mongoose doesn't support true recursion)
const LearningMaterialSchema = new Schema<ILearningMaterial>(
  {
    noteId: {
      type: Schema.Types.ObjectId,
      ref: "Note",
      required: true,
      index: true,
    },
    userId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: [
        "structured_notes",
        "definitions",
        "flashcards",
        "mindmap",
        "revision_summary",
        "learning_points",
        "audio",
      ],
      required: true,
    },
    textContent: { type: String },
    flashcards: { type: [FlashcardSchema], default: undefined },
    definitions: { type: [DefinitionSchema], default: undefined },
    mindMap: { type: Schema.Types.Mixed, default: undefined },
    audioUrl: { type: String },
    targetedGaps: { type: [String], default: [] },
    estimatedMinutes: { type: Number, default: 3 },
    purposeDescription: { type: String },
    generatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ───────────────────────────────────────────────────────────────

// Each note can have only ONE material of each type
LearningMaterialSchema.index({ noteId: 1, type: 1 }, { unique: true });

// ─── Export ────────────────────────────────────────────────────────────────

export const LearningMaterial = mongoose.model<ILearningMaterial>(
  "LearningMaterial",
  LearningMaterialSchema
);
