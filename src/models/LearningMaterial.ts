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
  hint?: string;
  explanation?: string;
  kind?: "recall" | "explain" | "apply" | "compare";
  sourceQuote?: string;
}

export interface IStudyVisual {
  type: "flow" | "timeline" | "comparison" | "bar";
  afterHeading: string;
  title: string;
  caption: string;
  sourceQuote: string;
  items?: Array<{ label: string; detail: string }>;
  unit?: string;
  data?: Array<{ label: string; value: number }>;
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
  visuals?: IStudyVisual[];       // source-grounded illustrations for structured notes
  flashcards?: IFlashcard[];      // flashcards
  definitions?: IDefinition[];    // definitions
  mindMap?: IMindMapNode;         // mindmap root node
  audioUrl?: string;              // audio file path/URL

  // Personalized study metadata
  targetedGaps?: string[];        // missing concepts or outcome IDs addressed
  estimatedMinutes?: number;      // estimated study/reading duration in minutes
  purposeDescription?: string;    // pedagogical explanation of this material

  generatedAt?: Date;
  generationStatus?: "queued" | "generating" | "ready" | "failed";
  generationId?: string;
  generationExpiresAt?: Date;
  generationError?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schemas ───────────────────────────────────────────────────────────────

const FlashcardSchema = new Schema<IFlashcard>(
  {
    front: { type: String, required: true },
    back: { type: String, required: true },
    hint: String,
    explanation: String,
    kind: { type: String, enum: ["recall", "explain", "apply", "compare"] },
    sourceQuote: String,
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
    visuals: { type: [new Schema<IStudyVisual>({
      type: { type: String, enum: ["flow", "timeline", "comparison", "bar"], required: true },
      afterHeading: { type: String, required: true }, title: { type: String, required: true },
      caption: { type: String, required: true }, sourceQuote: { type: String, required: true },
      items: { type: [{ _id: false, label: String, detail: String }], default: undefined },
      data: { type: [{ _id: false, label: String, value: Number }], default: undefined }, unit: String,
    }, { _id: false })], default: undefined },
    flashcards: { type: [FlashcardSchema], default: undefined },
    definitions: { type: [DefinitionSchema], default: undefined },
    mindMap: { type: Schema.Types.Mixed, default: undefined },
    audioUrl: { type: String },
    targetedGaps: { type: [String], default: [] },
    estimatedMinutes: { type: Number, default: 3 },
    purposeDescription: { type: String },
    // Queued records have no content yet. Legacy records with generatedAt are ready.
    generatedAt: { type: Date },
    generationStatus: { type: String, enum: ["queued", "generating", "ready", "failed"] },
    generationId: String,
    generationExpiresAt: Date,
    generationError: String,
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
