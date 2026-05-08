import mongoose, { Schema, Document } from "mongoose";

// ─── Enums ─────────────────────────────────────────────────────────────────

export type NoteStatus =
  | "uploaded"       // image stored, OCR not started
  | "processing"     // OCR + AI analysis running
  | "analyzed"       // AI analysis complete
  | "failed";        // processing failed

// ─── Learning Gap sub-document ─────────────────────────────────────────────

export interface ILearningGap {
  concept: string;
  severity: "low" | "medium" | "high";
  suggestion: string;
}

// ─── AI Analysis result sub-document ──────────────────────────────────────

export interface IAnalysis {
  subject: string;
  topic: string;
  gradeLevel: string;
  keyConcepts: string[];
  learningGaps: ILearningGap[];
  strengthAreas: string[];
  missingConcepts: string[];
  overallCompleteness: number; // 0-100 percentage
  analyzedAt: Date;
}

// ─── Main Note document ────────────────────────────────────────────────────

export interface INote extends Document {
  userId: string;           // Clerk user ID
  title: string;            // optional user-provided title
  imageUrl: string;         // path/URL to original uploaded image
  rawText: string;          // extracted OCR text
  status: NoteStatus;
  analysis?: IAnalysis;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schemas ───────────────────────────────────────────────────────────────

const LearningGapSchema = new Schema<ILearningGap>(
  {
    concept: { type: String, required: true },
    severity: { type: String, enum: ["low", "medium", "high"], required: true },
    suggestion: { type: String, required: true },
  },
  { _id: false }
);

const AnalysisSchema = new Schema<IAnalysis>(
  {
    subject: { type: String, required: true },
    topic: { type: String, required: true },
    gradeLevel: { type: String, default: "Unknown" },
    keyConcepts: { type: [String], default: [] },
    learningGaps: { type: [LearningGapSchema], default: [] },
    strengthAreas: { type: [String], default: [] },
    missingConcepts: { type: [String], default: [] },
    overallCompleteness: { type: Number, min: 0, max: 100, default: 0 },
    analyzedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const NoteSchema = new Schema<INote>(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, default: "Untitled Note" },
    imageUrl: { type: String, required: true },
    rawText: { type: String, default: "" },
    status: {
      type: String,
      enum: ["uploaded", "processing", "analyzed", "failed"],
      default: "uploaded",
    },
    analysis: { type: AnalysisSchema, default: undefined },
    errorMessage: { type: String },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ───────────────────────────────────────────────────────────────

NoteSchema.index({ userId: 1, createdAt: -1 });
NoteSchema.index({ status: 1 });

// ─── Export ────────────────────────────────────────────────────────────────

export const Note = mongoose.model<INote>("Note", NoteSchema);
