import mongoose, { Schema, Document } from "mongoose";

// ─── Enums ─────────────────────────────────────────────────────────────────

export type NoteStatus =
  | "uploaded"       // image stored, OCR not started
  | "processing"     // OCR + AI analysis running
  | "analyzed"       // AI analysis complete
  | "failed";        // processing failed

// ─── Learning Gap sub-document (legacy — kept for backward compat) ──────────

export interface ILearningGap {
  concept: string;
  severity: "low" | "medium" | "high";
  suggestion: string;
}

// ─── Curriculum-Aware Gap (new — from pipeline Stage 8) ────────────────────

export interface IExplainableGap {
  outcomeId: string;
  outcomeDescription: string;
  status: "achieved" | "partially_achieved" | "not_achieved";
  evidence: string;
  missingConcepts: Array<{
    id: string;
    name: string;
    weight: number;
    severity: "high" | "medium" | "low";
    category: string;
  }>;
  recommendation: string;
}

// ─── Coverage Scores ────────────────────────────────────────────────────────

export interface ICoverageScores {
  simpleCoverage: number;          // foundConcepts / totalConcepts × 100
  weightedCoverage: number;        // Σ(weight found) / Σ(weight all) × 100
  totalConcepts: number;
  foundConcepts: number;
  missedConcepts: number;
  maxWeightedScore: number;
  achievedWeightedScore: number;
}

// ─── Exam Readiness ─────────────────────────────────────────────────────────

export interface IExamReadiness {
  rating: "Excellent" | "Good" | "Needs Work" | "At Risk";
  highPriorityConceptsCoverage: number;
  frequentlyExaminedMissing: string[];
  revisionPriority: "Low" | "Medium" | "High" | "Critical";
  estimatedScoreRange: string;
}

// ─── AI Analysis result sub-document (expanded for new pipeline) ──────────

export interface IAnalysis {
  // ── Core identification ────────────────────────────────────────────────
  subject: string;
  topic: string;
  gradeLevel: string;

  // ── Curriculum KB match ────────────────────────────────────────────────
  lessonId?: string;               // KB lesson ID if matched
  lessonMatchConfidence?: number;  // 0–1 confidence in the KB match
  lessonMatchMethod?: string;      // "exact" | "keyword" | "fuzzy" | "ai-assisted"

  // ── OCR quality ────────────────────────────────────────────────────────
  ocrConfidence?: number;          // 0–100
  ocrLowQualityWarning?: boolean;

  // ── Coverage scores ────────────────────────────────────────────────────
  keyConcepts: string[];           // concept names found
  missingConcepts: string[];       // concept names not found
  coverageScores?: ICoverageScores;
  overallCompleteness: number;     // 0-100 percentage (= weightedCoverage if available)

  // ── Explainable gaps ───────────────────────────────────────────────────
  learningGaps: ILearningGap[];    // legacy format (kept for mobile compat)
  explainableGaps?: IExplainableGap[]; // new format with curriculum links

  // ── Strengths & exam readiness ─────────────────────────────────────────
  strengthAreas: string[];
  examReadiness?: IExamReadiness;

  // ── Pipeline metadata ──────────────────────────────────────────────────
  pipelineVersion?: string;
  qualityWarnings?: string[];
  analyzedAt: Date;
}

// ─── Main Note document ────────────────────────────────────────────────────

export interface INote extends Document {
  userId: string;           // Clerk user ID
  title: string;            // optional user-provided title
  imageUrl: string;         // primary/first page uploaded image URL (backward compat)
  imageUrls: string[];      // array of all uploaded page image URLs
  pageCount: number;        // total number of pages in this note
  rawText: string;          // extracted OCR text (combined across all pages)
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

const ExplainableGapSchema = new Schema<IExplainableGap>(
  {
    outcomeId: { type: String, required: true },
    outcomeDescription: { type: String, required: true },
    status: {
      type: String,
      enum: ["achieved", "partially_achieved", "not_achieved"],
      required: true,
    },
    evidence: { type: String, default: "" },
    missingConcepts: [
      {
        id: { type: String },
        name: { type: String },
        weight: { type: Number },
        severity: { type: String, enum: ["high", "medium", "low"] },
        category: { type: String },
        _id: false,
      },
    ],
    recommendation: { type: String, default: "" },
  },
  { _id: false }
);

const CoverageScoresSchema = new Schema<ICoverageScores>(
  {
    simpleCoverage: { type: Number, min: 0, max: 100, default: 0 },
    weightedCoverage: { type: Number, min: 0, max: 100, default: 0 },
    totalConcepts: { type: Number, default: 0 },
    foundConcepts: { type: Number, default: 0 },
    missedConcepts: { type: Number, default: 0 },
    maxWeightedScore: { type: Number, default: 0 },
    achievedWeightedScore: { type: Number, default: 0 },
  },
  { _id: false }
);

const ExamReadinessSchema = new Schema<IExamReadiness>(
  {
    rating: {
      type: String,
      enum: ["Excellent", "Good", "Needs Work", "At Risk"],
      default: "Needs Work",
    },
    highPriorityConceptsCoverage: { type: Number, min: 0, max: 100, default: 0 },
    frequentlyExaminedMissing: { type: [String], default: [] },
    revisionPriority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    estimatedScoreRange: { type: String, default: "" },
  },
  { _id: false }
);

const AnalysisSchema = new Schema<IAnalysis>(
  {
    // Core identification
    subject: { type: String, required: true },
    topic: { type: String, required: true },
    gradeLevel: { type: String, default: "Unknown" },

    // Curriculum KB match
    lessonId: { type: String },
    lessonMatchConfidence: { type: Number },
    lessonMatchMethod: { type: String },

    // OCR quality
    ocrConfidence: { type: Number },
    ocrLowQualityWarning: { type: Boolean },

    // Coverage
    keyConcepts: { type: [String], default: [] },
    missingConcepts: { type: [String], default: [] },
    coverageScores: { type: CoverageScoresSchema },
    overallCompleteness: { type: Number, min: 0, max: 100, default: 0 },

    // Gaps
    learningGaps: { type: [LearningGapSchema], default: [] },
    explainableGaps: { type: [ExplainableGapSchema], default: [] },

    // Strengths & exam readiness
    strengthAreas: { type: [String], default: [] },
    examReadiness: { type: ExamReadinessSchema },

    // Pipeline metadata
    pipelineVersion: { type: String },
    qualityWarnings: { type: [String], default: [] },
    analyzedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const NoteSchema = new Schema<INote>(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, default: "Untitled Note" },
    imageUrl: { type: String, required: true },
    imageUrls: { type: [String], default: [] },
    pageCount: { type: Number, default: 1 },
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
