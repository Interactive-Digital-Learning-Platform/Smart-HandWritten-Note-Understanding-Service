// ═══════════════════════════════════════════════════════════════════════════
// Hybrid Pipeline — Type Definitions
// ═══════════════════════════════════════════════════════════════════════════
//
// Defines the shared types for the multi-stage processing pipeline.
// Each stage receives a PipelineContext object and enriches it before
// passing it to the next stage.
// ═══════════════════════════════════════════════════════════════════════════

import { CurriculumLesson, CurriculumConcept, LearningOutcome } from "../curriculum/types";

// ─── Stage Names ───────────────────────────────────────────────────────────

export type PipelineStage =
  | "ocr_extraction"
  | "ocr_cleaning"
  | "note_scope_assessment"
  | "language_detection"
  | "subject_detection"
  | "lesson_identification"
  | "curriculum_retrieval"
  | "concept_matching"
  | "coverage_calculation"
  | "gap_detection"
  | "material_generation"
  | "quality_verification";

// ─── Stage Result ──────────────────────────────────────────────────────────

export interface StageResult {
  stage: PipelineStage;
  success: boolean;
  durationMs: number;
  error?: string;
}

// ─── OCR Cleaning Output ───────────────────────────────────────────────────

export interface OcrExtractionOutput {
  totalPages: number;
  extractedPages: number;
  failedPages: number;
}

export interface OcrCleaningOutput {
  /** The cleaned and normalized text */
  cleanedText: string;
  /** Estimated legibility score 0–100 (100 = very clear) */
  confidenceScore: number;
  /** True if the image was flagged as low quality */
  lowQualityWarning: boolean;
  /** Human-readable note about image quality if flagged */
  qualityNote?: string;
}

// ─── Subject Detection Output ──────────────────────────────────────────────

export interface SubjectDetectionOutput {
  /** Detected subject (e.g., "Biology") */
  subject: string;
  /** Detected grade level (10 or 11) */
  grade: number;
  /** Rough topic hint from the text (e.g., "Photosynthesis") */
  topicHint: string;
  /** Confidence 0–1 in the subject detection */
  confidence: number;
  /** Raw grade string as detected (e.g., "Grade 10", "O/L", "10") */
  rawGradeText: string;
}

// ─── Concept Match ─────────────────────────────────────────────────────────

/** Result of matching a single curriculum concept against student notes */
export type ConceptStatus = "present" | "partial" | "missing";

export interface ConceptProbabilities {
  present: number;
  partial: number;
  missing: number;
}

export interface ConceptMatch {
  concept: CurriculumConcept;
  /** Authoritative three-class coverage decision. */
  status: ConceptStatus;
  /** Calibratable probability contract for the future learned model. */
  probabilities: ConceptProbabilities;
  /** Whether the concept was found in the student's notes */
  found: boolean;
  /**
   * Confidence in the match (0–1).
   * 1.0 = exact keyword found, 0.7–0.9 = semantic match, 0 = not found.
   */
  matchConfidence: number;
  /** Confidence that the covered/not-covered decision is correct. */
  decisionConfidence: number;
  /** The method used to detect this concept */
  matchMethod: "keyword" | "semantic" | "not_found";
  /** Component that produced this decision. */
  source: "rule" | "semantic_llm" | "fallback";
  /** True when confidence or partial coverage warrants human review. */
  needsReview: boolean;
  /** Populated once a trained classifier is introduced. */
  modelVersion?: string;
  /** Snippet from student text that triggered the match, if found */
  evidence?: string;
}

/** What kind of learning artefact the upload represents. */
export interface NoteScopeOutput {
  scope:
    | "complete_lesson_note"
    | "partial_lesson_note"
    | "revision_summary"
    | "exercise_or_worksheet"
    | "diagram_or_formula_sheet"
    | "unknown";
  confidence: number;
  rationale: string;
}

export interface LanguageDetectionOutput {
  primaryLanguage: "Sinhala" | "English" | "Mixed" | "Unknown";
  confidence: number;
}

/**
 * Meaning of a curriculum finding. An absence from one uploaded note is
 * evidence about note coverage only; it is not evidence that the student
 * lacks the knowledge. `confirmed_learning_gap` is reserved for a later
 * diagnostic/quiz integration that can verify understanding.
 */
export type LearningFindingStatus =
  | "covered_in_note"
  | "partially_covered_in_note"
  | "not_found_in_note"
  | "confirmed_learning_gap";

// ─── Coverage Scores ───────────────────────────────────────────────────────

export interface CoverageScores {
  /** Simple score where present=1, partial=0.5, and missing=0. */
  simpleCoverage: number;
  /** Weighted score: Σ(found.weight) / Σ(all.weight) × 100 */
  weightedCoverage: number;
  /** Weighted coverage discounted by each finding's decision confidence. */
  confidenceAdjustedWeightedCoverage: number;
  /** Total number of concepts in the lesson */
  totalConcepts: number;
  /** Legacy covered count: present + partial concepts. */
  foundConcepts: number;
  /** Number of concepts judged fully present. */
  presentConcepts: number;
  /** Number of concepts judged partially present. */
  partialConcepts: number;
  /** Number of concepts missed by student */
  missedConcepts: number;
  /** Max possible weighted score */
  maxWeightedScore: number;
  /** Achieved weighted score */
  achievedWeightedScore: number;
  /** Confidence-adjusted achieved weighted score. */
  confidenceAdjustedWeightedScore: number;
  /** Whether this is valid as whole-lesson coverage or only upload coverage. */
  coverageScope: "lesson_coverage" | "note_coverage";
}

// ─── Learning Outcome Assessment ───────────────────────────────────────────

export interface OutcomeAssessment {
  outcome: LearningOutcome;
  status: "achieved" | "partially_achieved" | "not_achieved";
  /** How many required concepts were found */
  foundConceptCount: number;
  /** How many required concepts were fully present. */
  presentConceptCount: number;
  /** How many required concepts were only partially present. */
  partialConceptCount: number;
  /** Present=1, partial=0.5, missing=0 coverage equivalent. */
  coverageEquivalent: number;
  /** How many required concepts are in the lesson */
  totalConceptCount: number;
  /** Names of missing concepts for this outcome */
  missingConceptNames: string[];
  /** Evidence for the status determination */
  evidence: string;
}

// ─── Explainable Gap ───────────────────────────────────────────────────────

export interface ExplainableGap {
  /** The learning outcome this gap is linked to */
  learningOutcome: {
    id: string;
    description: string;
  };
  /** Achievement status of this outcome */
  status: "achieved" | "partially_achieved" | "not_achieved";
  /** Evidence from the student's notes supporting this status */
  evidence: string;
  /** Missing concepts for this outcome */
  missingConcepts: {
    id: string;
    name: string;
    weight: number;
    severity: "high" | "medium" | "low";
    category: string;
    status: "partial" | "missing";
  }[];
  /** Actionable study recommendation with textbook reference */
  recommendation: string;
  /** Distinguishes note coverage from an actual verified knowledge gap. */
  findingStatus: LearningFindingStatus;
  /** No diagnostic evidence exists yet, so pipeline findings start unverified. */
  verificationStatus: "not_required" | "pending" | "verified";
}

// ─── Exam Readiness ────────────────────────────────────────────────────────

export interface ExamReadiness {
  /** Overall readiness rating */
  rating: "Excellent" | "Good" | "Needs Work" | "At Risk";
  /** Coverage percentage for weight-4 and weight-5 concepts only */
  highPriorityConceptsCoverage: number;
  /** Names of frequently-tested concepts that are missing */
  frequentlyExaminedMissing: string[];
  /** Revision priority recommendation */
  revisionPriority: "Low" | "Medium" | "High" | "Critical";
}

// ─── Material Priorities ───────────────────────────────────────────────────

/** Determines which material types to generate based on gap severity */
export interface MaterialPriorities {
  /** Material types to generate, in priority order */
  typesToGenerate: string[];
  /** The severity profile that drove this decision */
  severityProfile: {
    high: number;
    medium: number;
    low: number;
  };
  /** Human-readable rationale for the selection */
  rationale: string;
}

// ─── Pipeline Context ──────────────────────────────────────────────────────

/**
 * The shared context object passed through all pipeline stages.
 * Each stage reads from and enriches this object.
 * The final state of this object becomes the stored analysis result.
 */
export interface PipelineContext {
  // ── Input ────────────────────────────────────────────────────────────────
  noteId: string;
  userId: string;
  imageUrl: string;
  imageUrls?: string[];

  // ── Optional User Hints (from UI upload) ──────────────────────────────────
  userSubject?: string;
  userGrade?: number;
  userTopic?: string;
  userLessonId?: string;

  // ── Stage 1: OCR Extraction ───────────────────────────────────────────────
  rawOcrText?: string;

  // ── Stage 2: OCR Cleaning ─────────────────────────────────────────────────
  ocrExtraction?: OcrExtractionOutput;
  ocrCleaning?: OcrCleaningOutput;

  // ── Stage 3: Note Scope Assessment ─────────────────────────────────────
  noteScope?: NoteScopeOutput;
  contentLanguage?: LanguageDetectionOutput;

  // ── Stage 3: Subject Detection ────────────────────────────────────────────
  subjectDetection?: SubjectDetectionOutput;

  // ── Stage 4 & 5: Lesson Identification + Curriculum Retrieval ─────────────
  matchedLessonId?: string;
  matchedLesson?: CurriculumLesson;
  lessonMatchConfidence?: number;
  lessonMatchMethod?: string;
  textbookPassages?: Array<{
    text: string;
    filename: string;
    pages: number[];
    score: number;
  }>;

  // ── Stage 6: Concept Matching ─────────────────────────────────────────────
  conceptMatches?: ConceptMatch[];

  // ── Stage 7: Coverage Calculation ────────────────────────────────────────
  coverageScores?: CoverageScores;

  // ── Stage 8: Gap Detection ────────────────────────────────────────────────
  outcomeAssessments?: OutcomeAssessment[];
  explainableGaps?: ExplainableGap[];
  strengthAreas?: string[];
  examReadiness?: ExamReadiness;

  // ── Stage 9: Material Generation ─────────────────────────────────────────
  materialPriorities?: MaterialPriorities;
  materialsGenerated?: number;

  // ── Stage 10: Quality Verification ───────────────────────────────────────
  qualityChecked?: boolean;
  qualityWarnings?: string[];

  // ── Pipeline Metadata ─────────────────────────────────────────────────────
  curriculumVersion: string;
  pipelineVersion: string;
  startedAt: Date;
  stageResults: StageResult[];
  totalDurationMs?: number;
}

// ─── Pipeline Result ───────────────────────────────────────────────────────

export interface PipelineResult {
  success: boolean;
  noteId: string;
  context?: PipelineContext;
  error?: string;
  failedAtStage?: PipelineStage;
}
