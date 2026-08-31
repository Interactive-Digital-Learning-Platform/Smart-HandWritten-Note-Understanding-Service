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
    status?: "partial" | "missing";
  }>;
  recommendation: string;
  /** Absence from one note is not automatically a learning gap. */
  findingStatus: "covered_in_note" | "partially_covered_in_note" | "not_found_in_note" | "confirmed_learning_gap";
  /** Diagnostic/quiz verification state. */
  verificationStatus: "not_required" | "pending" | "verified";
}

// ─── Coverage Scores ────────────────────────────────────────────────────────

export interface ICoverageScores {
  simpleCoverage: number;          // present=1, partial=0.5, missing=0
  weightedCoverage: number;        // weighted equivalent / max weight × 100
  confidenceAdjustedWeightedCoverage: number;
  totalConcepts: number;
  foundConcepts: number;
  presentConcepts?: number;
  partialConcepts?: number;
  missedConcepts: number;
  confidenceAdjustedWeightedScore: number;
  maxWeightedScore: number;
  achievedWeightedScore: number;
  coverageScope: "lesson_coverage" | "note_coverage";
}

export interface IConceptFinding {
  conceptId: string;
  conceptName: string;
  status?: "present" | "partial" | "missing";
  probabilities?: {
    present: number;
    partial: number;
    missing: number;
  };
  found: boolean;
  decisionConfidence: number;
  matchMethod: "keyword" | "semantic" | "not_found";
  source?: "rule" | "semantic_llm" | "fallback";
  needsReview?: boolean;
  modelVersion?: string;
  evidence?: string;
  curriculumCategory: string;
  importanceWeight: number;
  isFrequentlyTested: boolean;
  studentVerification: "unverified" | "understood" | "needs_help";
  verifiedAt?: Date;
}

// ─── Exam Readiness ─────────────────────────────────────────────────────────

export interface IExamReadiness {
  rating: "Excellent" | "Good" | "Needs Work" | "At Risk";
  highPriorityConceptsCoverage: number;
  frequentlyExaminedMissing: string[];
  revisionPriority: "Low" | "Medium" | "High" | "Critical";
}

// ─── AI Analysis result sub-document (expanded for new pipeline) ──────────

export interface IAnalysis {
  // ── Core identification ────────────────────────────────────────────────
  subject: string;
  topic: string;
  gradeLevel: string;
  unitNumber?: number;             // Unit / Chapter number (e.g. 1, 2, 3...)
  lessonNumber?: number;           // Lesson number

  // ── Curriculum KB match & Ingested Textbook ────────────────────────────
  lessonId?: string;               // KB lesson ID if matched
  lessonMatchConfidence?: number;  // 0–1 confidence in the KB match
  lessonMatchMethod?: string;      // "exact" | "keyword" | "fuzzy" | "ai-assisted" | "pdf-ingestion-grounded" | "pdf-ingestion-dynamic"
  textbookReference?: string;      // Source textbook PDF filename and pages
  textbookPassages?: Array<{
    text: string;
    filename: string;
    pages: number[];
    score: number;
  }>;

  // ── OCR quality ────────────────────────────────────────────────────────
  ocrConfidence?: number;          // 0–100
  ocrLowQualityWarning?: boolean;
  ocrPageSummary?: {
    totalPages: number;
    extractedPages: number;
    failedPages: number;
  };
  noteScope?: {
    scope: "complete_lesson_note" | "partial_lesson_note" | "revision_summary" | "exercise_or_worksheet" | "diagram_or_formula_sheet" | "unknown";
    confidence: number;
    rationale: string;
  };
  contentLanguage?: {
    primaryLanguage: "Sinhala" | "English" | "Mixed" | "Unknown";
    confidence: number;
  };

  // ── Coverage scores ────────────────────────────────────────────────────
  keyConcepts: string[];           // concept names found
  partialConcepts?: string[];      // concept names only partly covered
  missingConcepts: string[];       // concept names not found
  conceptFindings?: IConceptFinding[];
  coverageScores?: ICoverageScores;
  overallCompleteness: number;     // 0-100 percentage (= weightedCoverage if available)

  // ── Explainable gaps ───────────────────────────────────────────────────
  learningGaps: ILearningGap[];    // legacy format (kept for mobile compat)
  explainableGaps?: IExplainableGap[]; // new format with curriculum links

  // ── Strengths & exam readiness ─────────────────────────────────────────
  strengthAreas: string[];
  examReadiness?: IExamReadiness;

  // ── Pipeline metadata ──────────────────────────────────────────────────
  curriculumVersion?: string;
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
  userSubject?: string;     // optional user-selected subject (e.g., "Science")
  userGrade?: number;       // optional user-selected grade (e.g., 10)
  userTopic?: string;       // optional user-selected topic / lesson name
  userLessonId?: string;    // optional user-selected lesson ID
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
        status: { type: String, enum: ["partial", "missing"] },
        _id: false,
      },
    ],
    recommendation: { type: String, default: "" },
    findingStatus: {
      type: String,
      enum: ["covered_in_note", "partially_covered_in_note", "not_found_in_note", "confirmed_learning_gap"],
      default: "not_found_in_note",
    },
    verificationStatus: {
      type: String,
      enum: ["not_required", "pending", "verified"],
      default: "pending",
    },
  },
  { _id: false }
);

const CoverageScoresSchema = new Schema<ICoverageScores>(
  {
    simpleCoverage: { type: Number, min: 0, max: 100, default: 0 },
    weightedCoverage: { type: Number, min: 0, max: 100, default: 0 },
    confidenceAdjustedWeightedCoverage: { type: Number, min: 0, max: 100, default: 0 },
    totalConcepts: { type: Number, default: 0 },
    foundConcepts: { type: Number, default: 0 },
    presentConcepts: { type: Number, default: 0 },
    partialConcepts: { type: Number, default: 0 },
    missedConcepts: { type: Number, default: 0 },
    confidenceAdjustedWeightedScore: { type: Number, default: 0 },
    maxWeightedScore: { type: Number, default: 0 },
    achievedWeightedScore: { type: Number, default: 0 },
    coverageScope: {
      type: String,
      enum: ["lesson_coverage", "note_coverage"],
      default: "note_coverage",
    },
  },
  { _id: false }
);

const ConceptFindingSchema = new Schema<IConceptFinding>(
  {
    conceptId: { type: String, required: true },
    conceptName: { type: String, required: true },
    status: { type: String, enum: ["present", "partial", "missing"] },
    probabilities: {
      present: { type: Number, min: 0, max: 1 },
      partial: { type: Number, min: 0, max: 1 },
      missing: { type: Number, min: 0, max: 1 },
      _id: false,
    },
    found: { type: Boolean, required: true },
    decisionConfidence: { type: Number, min: 0, max: 1, required: true },
    matchMethod: { type: String, enum: ["keyword", "semantic", "not_found"], required: true },
    source: { type: String, enum: ["rule", "semantic_llm", "fallback"] },
    needsReview: { type: Boolean },
    modelVersion: { type: String },
    evidence: { type: String },
    curriculumCategory: { type: String, required: true },
    importanceWeight: { type: Number, min: 1, max: 5, required: true },
    isFrequentlyTested: { type: Boolean, default: false },
    studentVerification: {
      type: String,
      enum: ["unverified", "understood", "needs_help"],
      default: "unverified",
    },
    verifiedAt: { type: Date },
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
  },
  { _id: false }
);

const AnalysisSchema = new Schema<IAnalysis>(
  {
    // Core identification
    subject: { type: String, required: true },
    topic: { type: String, required: true },
    gradeLevel: { type: String, default: "Unknown" },
    unitNumber: { type: Number },
    lessonNumber: { type: Number },

    // Curriculum KB match
    lessonId: { type: String },
    lessonMatchConfidence: { type: Number },
    lessonMatchMethod: { type: String },
    textbookReference: { type: String },
    textbookPassages: { type: [Schema.Types.Mixed], default: [] },

    // OCR quality
    ocrConfidence: { type: Number },
    ocrLowQualityWarning: { type: Boolean },
    ocrPageSummary: {
      totalPages: { type: Number, default: 0 },
      extractedPages: { type: Number, default: 0 },
      failedPages: { type: Number, default: 0 },
      _id: false,
    },
    noteScope: {
      scope: {
        type: String,
        enum: ["complete_lesson_note", "partial_lesson_note", "revision_summary", "exercise_or_worksheet", "diagram_or_formula_sheet", "unknown"],
      },
      confidence: { type: Number, min: 0, max: 100 },
      rationale: { type: String },
      _id: false,
    },
    contentLanguage: {
      primaryLanguage: { type: String, enum: ["Sinhala", "English", "Mixed", "Unknown"] },
      confidence: { type: Number, min: 0, max: 100 },
      _id: false,
    },

    // Coverage
    keyConcepts: { type: [String], default: [] },
    partialConcepts: { type: [String], default: [] },
    missingConcepts: { type: [String], default: [] },
    conceptFindings: { type: [ConceptFindingSchema], default: [] },
    coverageScores: { type: CoverageScoresSchema },
    overallCompleteness: { type: Number, min: 0, max: 100, default: 0 },

    // Gaps
    learningGaps: { type: [LearningGapSchema], default: [] },
    explainableGaps: { type: [ExplainableGapSchema], default: [] },

    // Strengths & exam readiness
    strengthAreas: { type: [String], default: [] },
    examReadiness: { type: ExamReadinessSchema },

    // Pipeline metadata
    curriculumVersion: { type: String },
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
    userSubject: { type: String },
    userGrade: { type: Number },
    userTopic: { type: String },
    userLessonId: { type: String },
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
