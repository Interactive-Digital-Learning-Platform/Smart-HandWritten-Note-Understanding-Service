import mongoose, { Document, Schema } from "mongoose";
import { ConceptStatus } from "../pipeline/types";

export type ExpertAnnotationTaskStatus =
  | "queued"
  | "in_review"
  | "submitted"
  | "approved"
  | "rejected"
  | "withdrawn";

export interface IExpertTaskConcept {
  conceptId: string;
  conceptName: string;
  category: string;
  weight: number;
  isFrequentlyTested: boolean;
  keywords: string[];
  learningOutcomes: string[];
  systemStatus: ConceptStatus;
  systemProbabilities: {
    present: number;
    partial: number;
    missing: number;
  };
  systemConfidence: number;
  systemMatchMethod: "keyword" | "semantic" | "not_found";
  systemSource: "rule" | "semantic_llm" | "fallback";
  systemNeedsReview: boolean;
  systemModelVersion?: string;
  systemEvidence?: string;
  expertVerdict?: ConceptStatus;
  evidencePage?: number;
  evidenceText?: string;
  reviewerNotes?: string;
}

export interface IExpertAnnotationTask extends Document {
  sourceNoteId: string;
  noteGroupId: string;
  evaluationGroupId: string;
  consentVersion: string;
  consentGrantedAt: Date;
  consentWithdrawnAt?: Date;
  status: ExpertAnnotationTaskStatus;
  priority: number;
  assignedExpertId?: string;
  reviewStartedAt?: Date;
  submittedAt?: Date;
  subject: string;
  grade: number;
  lessonId: string;
  lessonName: string;
  language: "English" | "Sinhala" | "Mixed" | "Unknown";
  pageCount: number;
  rawOcrText: string;
  correctedText: string;
  noteScope?: string;
  ocrConfidence?: number;
  curriculumVersion: string;
  pipelineVersion?: string;
  qualityWarnings: string[];
  concepts: IExpertTaskConcept[];
  subjectConfirmed?: boolean;
  lessonConfirmed?: boolean;
  flags: {
    wrongLesson: boolean;
    unreadable: boolean;
    duplicate: boolean;
    containsPersonalData: boolean;
  };
  overallNotes?: string;
  labelQuality?: "single_review" | "double_review" | "adjudicated";
  createdAt: Date;
  updatedAt: Date;
}

const ProbabilitiesSchema = new Schema(
  {
    present: { type: Number, min: 0, max: 1, required: true },
    partial: { type: Number, min: 0, max: 1, required: true },
    missing: { type: Number, min: 0, max: 1, required: true },
  },
  { _id: false }
);

const ExpertTaskConceptSchema = new Schema<IExpertTaskConcept>(
  {
    conceptId: { type: String, required: true },
    conceptName: { type: String, required: true },
    category: { type: String, required: true },
    weight: { type: Number, min: 1, max: 5, required: true },
    isFrequentlyTested: { type: Boolean, default: false },
    keywords: { type: [String], default: [] },
    learningOutcomes: { type: [String], default: [] },
    systemStatus: {
      type: String,
      enum: ["present", "partial", "missing"],
      required: true,
    },
    systemProbabilities: { type: ProbabilitiesSchema, required: true },
    systemConfidence: { type: Number, min: 0, max: 1, required: true },
    systemMatchMethod: {
      type: String,
      enum: ["keyword", "semantic", "not_found"],
      required: true,
    },
    systemSource: {
      type: String,
      enum: ["rule", "semantic_llm", "fallback"],
      required: true,
    },
    systemNeedsReview: { type: Boolean, required: true },
    systemModelVersion: { type: String },
    systemEvidence: { type: String },
    expertVerdict: { type: String, enum: ["present", "partial", "missing"] },
    evidencePage: { type: Number, min: 1 },
    evidenceText: { type: String },
    reviewerNotes: { type: String },
  },
  { _id: false }
);

const ExpertAnnotationTaskSchema = new Schema<IExpertAnnotationTask>(
  {
    sourceNoteId: { type: String, required: true, unique: true, index: true },
    noteGroupId: { type: String, required: true, unique: true, index: true },
    evaluationGroupId: { type: String, required: true, index: true },
    consentVersion: { type: String, required: true },
    consentGrantedAt: { type: Date, required: true },
    consentWithdrawnAt: { type: Date },
    status: {
      type: String,
      enum: ["queued", "in_review", "submitted", "approved", "rejected", "withdrawn"],
      default: "queued",
      index: true,
    },
    priority: { type: Number, min: 0, max: 100, default: 50, index: true },
    assignedExpertId: { type: String, index: true },
    reviewStartedAt: { type: Date },
    submittedAt: { type: Date },
    subject: { type: String, required: true, index: true },
    grade: { type: Number, enum: [10, 11], required: true, index: true },
    lessonId: { type: String, required: true, index: true },
    lessonName: { type: String, required: true },
    language: {
      type: String,
      enum: ["English", "Sinhala", "Mixed", "Unknown"],
      required: true,
      index: true,
    },
    pageCount: { type: Number, min: 1, required: true },
    rawOcrText: { type: String, required: true },
    correctedText: { type: String, required: true },
    noteScope: { type: String },
    ocrConfidence: { type: Number, min: 0, max: 100 },
    curriculumVersion: { type: String, required: true },
    pipelineVersion: { type: String },
    qualityWarnings: { type: [String], default: [] },
    concepts: { type: [ExpertTaskConceptSchema], default: [] },
    subjectConfirmed: { type: Boolean },
    lessonConfirmed: { type: Boolean },
    flags: {
      wrongLesson: { type: Boolean, default: false },
      unreadable: { type: Boolean, default: false },
      duplicate: { type: Boolean, default: false },
      containsPersonalData: { type: Boolean, default: false },
      _id: false,
    },
    overallNotes: { type: String },
    labelQuality: {
      type: String,
      enum: ["single_review", "double_review", "adjudicated"],
    },
  },
  { timestamps: true }
);

ExpertAnnotationTaskSchema.index({ status: 1, priority: -1, createdAt: 1 });
ExpertAnnotationTaskSchema.index({ assignedExpertId: 1, status: 1 });

export const ExpertAnnotationTask = mongoose.model<IExpertAnnotationTask>(
  "ExpertAnnotationTask",
  ExpertAnnotationTaskSchema
);
