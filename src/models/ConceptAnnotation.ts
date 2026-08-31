import mongoose, { Document, Schema } from "mongoose";
import {
  AnnotationLabelQuality,
  AnnotationSystemPrediction,
} from "../annotations/contract";
import { ConceptStatus } from "../pipeline/types";

export interface IConceptAnnotation extends Document {
  schemaVersion: string;
  recordId: string;
  noteId: string;
  curriculumVersion: string;
  pipelineVersion?: string;
  subject: string;
  grade: number;
  lessonId: string;
  lessonName: string;
  language: "English" | "Sinhala" | "Mixed" | "Unknown";
  noteScope?: string;
  ocrConfidence?: number;
  noteTextSnapshot: string;
  concept: {
    id: string;
    name: string;
    category: string;
    weight: number;
    isFrequentlyTested: boolean;
    keywords: string[];
    learningOutcomes: string[];
  };
  systemPrediction: AnnotationSystemPrediction;
  reviewerVerdict: ConceptStatus;
  reviewerId: string;
  labelQuality: AnnotationLabelQuality;
  evidenceText?: string;
  reviewerNotes?: string;
  reviewedAt: Date;
  usedForTraining: boolean;
  datasetVersion?: string;
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

const ConceptAnnotationSchema = new Schema<IConceptAnnotation>(
  {
    schemaVersion: { type: String, required: true },
    recordId: { type: String, required: true, unique: true, index: true },
    noteId: { type: String, required: true, index: true },
    curriculumVersion: { type: String, required: true, index: true },
    pipelineVersion: { type: String },
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
    noteScope: { type: String },
    ocrConfidence: { type: Number, min: 0, max: 100 },
    noteTextSnapshot: { type: String, required: true },
    concept: {
      id: { type: String, required: true },
      name: { type: String, required: true },
      category: { type: String, required: true },
      weight: { type: Number, min: 1, max: 5, required: true },
      isFrequentlyTested: { type: Boolean, default: false },
      keywords: { type: [String], default: [] },
      learningOutcomes: { type: [String], default: [] },
      _id: false,
    },
    systemPrediction: {
      status: {
        type: String,
        enum: ["present", "partial", "missing"],
        required: true,
      },
      probabilities: { type: ProbabilitiesSchema, required: true },
      found: { type: Boolean, required: true },
      decisionConfidence: { type: Number, min: 0, max: 1, required: true },
      matchMethod: {
        type: String,
        enum: ["keyword", "semantic", "not_found"],
        required: true,
      },
      source: {
        type: String,
        enum: ["rule", "semantic_llm", "fallback"],
        required: true,
      },
      needsReview: { type: Boolean, required: true },
      modelVersion: { type: String },
      evidenceText: { type: String },
      _id: false,
    },
    reviewerVerdict: {
      type: String,
      enum: ["present", "partial", "missing"],
      required: true,
      index: true,
    },
    reviewerId: { type: String, required: true, index: true },
    labelQuality: {
      type: String,
      enum: ["single_review", "double_review", "adjudicated"],
      required: true,
      index: true,
    },
    evidenceText: { type: String },
    reviewerNotes: { type: String },
    reviewedAt: { type: Date, required: true },
    usedForTraining: { type: Boolean, default: false, index: true },
    datasetVersion: { type: String, index: true },
  },
  { timestamps: true }
);

ConceptAnnotationSchema.index({ noteId: 1, "concept.id": 1, curriculumVersion: 1 });
ConceptAnnotationSchema.index({ subject: 1, grade: 1, reviewerVerdict: 1 });

export const ConceptAnnotation = mongoose.model<IConceptAnnotation>(
  "ConceptAnnotation",
  ConceptAnnotationSchema
);
