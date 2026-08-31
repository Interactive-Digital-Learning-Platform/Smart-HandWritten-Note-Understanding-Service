import { createHash } from "node:crypto";
import {
  ConceptProbabilities,
  ConceptStatus,
} from "../pipeline/types";

export const ANNOTATION_SCHEMA_VERSION = "1.0.0";

export type AnnotationLabelQuality =
  | "single_review"
  | "double_review"
  | "adjudicated";

export interface AnnotationSystemPrediction {
  status: ConceptStatus;
  probabilities: ConceptProbabilities;
  found: boolean;
  decisionConfidence: number;
  matchMethod: "keyword" | "semantic" | "not_found";
  source: "rule" | "semantic_llm" | "fallback";
  needsReview: boolean;
  modelVersion?: string;
  evidenceText?: string;
}

export interface AnnotationReview {
  verdict: ConceptStatus | null;
  reviewerId?: string;
  labelQuality?: AnnotationLabelQuality;
  evidenceText?: string;
  reviewerNotes?: string;
  reviewedAt?: string;
}

export interface ConceptAnnotationRecord {
  schemaVersion: typeof ANNOTATION_SCHEMA_VERSION;
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
  review: AnnotationReview;
  exportedAt: string;
}

const recordHash = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 24);

export const buildAnnotationRecordId = (
  noteId: string,
  curriculumVersion: string,
  conceptId: string
): string =>
  `ann-${recordHash(`${noteId}|${curriculumVersion}|${conceptId}`)}`;

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

/**
 * Fingerprints every immutable export field while deliberately excluding the
 * review object. This lets import reject accidental or deliberate source edits.
 */
export const buildAnnotationSourceFingerprint = (
  record: ConceptAnnotationRecord
): string => {
  const { review: _review, ...sourceSnapshot } = record;
  return createHash("sha256")
    .update(canonicalJson(sourceSnapshot))
    .digest("hex");
};

/** Removes common direct identifiers while preserving educational text. */
export const redactAnnotationText = (text: string): string =>
  text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(/(?:\+94|0)[\s-]?(?:7\d|[1-9]\d)[\s-]?\d{3}[\s-]?\d{4}\b/g, "[PHONE]")
    .replace(/\b(?:student|user)\s*id\s*[:#-]?\s*[a-z0-9_-]+\b/gi, "[STUDENT_ID]")
    .trim();

const validStatuses = new Set<ConceptStatus>([
  "present",
  "partial",
  "missing",
]);

const validLabelQualities = new Set<AnnotationLabelQuality>([
  "single_review",
  "double_review",
  "adjudicated",
]);

const validLanguages = new Set<ConceptAnnotationRecord["language"]>([
  "English",
  "Sinhala",
  "Mixed",
  "Unknown",
]);

const validMatchMethods = new Set<AnnotationSystemPrediction["matchMethod"]>([
  "keyword",
  "semantic",
  "not_found",
]);

const validPredictionSources = new Set<AnnotationSystemPrediction["source"]>([
  "rule",
  "semantic_llm",
  "fallback",
]);

export interface AnnotationValidationResult {
  valid: boolean;
  errors: string[];
}

export const validateAnnotationRecord = (
  record: unknown,
  requireCompletedReview = false
): AnnotationValidationResult => {
  const errors: string[] = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { valid: false, errors: ["record must be an object"] };
  }

  const value = record as Partial<ConceptAnnotationRecord> &
    Record<string, unknown>;
  const requiredStrings: Array<[string, unknown]> = [
    ["recordId", value.recordId],
    ["noteId", value.noteId],
    ["curriculumVersion", value.curriculumVersion],
    ["subject", value.subject],
    ["lessonId", value.lessonId],
    ["lessonName", value.lessonName],
    ["noteTextSnapshot", value.noteTextSnapshot],
  ];
  for (const [field, fieldValue] of requiredStrings) {
    if (typeof fieldValue !== "string" || !fieldValue.trim()) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (value.schemaVersion !== ANNOTATION_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${ANNOTATION_SCHEMA_VERSION}`);
  }
  if (value.grade !== 10 && value.grade !== 11) {
    errors.push("grade must be 10 or 11");
  }
  if (!value.language || !validLanguages.has(value.language)) {
    errors.push("language must be English, Sinhala, Mixed, or Unknown");
  }
  if (
    typeof value.exportedAt !== "string" ||
    Number.isNaN(Date.parse(value.exportedAt))
  ) {
    errors.push("exportedAt must be a valid ISO-compatible date string");
  }
  if (!value.concept || typeof value.concept !== "object") {
    errors.push("concept is required");
  } else if (!value.concept.id || !value.concept.name) {
    errors.push("concept.id and concept.name are required");
  } else {
    if (
      typeof value.concept.weight !== "number" ||
      value.concept.weight < 1 ||
      value.concept.weight > 5
    ) {
      errors.push("concept.weight must be between 1 and 5");
    }
    if (
      !Array.isArray(value.concept.keywords) ||
      !Array.isArray(value.concept.learningOutcomes)
    ) {
      errors.push("concept keywords and learningOutcomes must be arrays");
    }
    if (
      typeof value.noteId === "string" &&
      typeof value.curriculumVersion === "string" &&
      value.recordId !==
        buildAnnotationRecordId(
          value.noteId,
          value.curriculumVersion,
          value.concept.id
        )
    ) {
      errors.push("recordId does not match note, curriculum, and concept identity");
    }
  }

  const prediction = value.systemPrediction;
  if (!prediction || typeof prediction !== "object") {
    errors.push("systemPrediction is required");
  } else {
    if (!validStatuses.has(prediction.status)) {
      errors.push("systemPrediction.status is invalid");
    }
    if (
      typeof prediction.decisionConfidence !== "number" ||
      prediction.decisionConfidence < 0 ||
      prediction.decisionConfidence > 1
    ) {
      errors.push("systemPrediction.decisionConfidence must be between 0 and 1");
    }
    if (!validMatchMethods.has(prediction.matchMethod)) {
      errors.push("systemPrediction.matchMethod is invalid");
    }
    if (!validPredictionSources.has(prediction.source)) {
      errors.push("systemPrediction.source is invalid");
    }
    if (typeof prediction.needsReview !== "boolean") {
      errors.push("systemPrediction.needsReview must be a boolean");
    }
    if (prediction.found !== (prediction.status !== "missing")) {
      errors.push("systemPrediction.found is inconsistent with status");
    }
    const probabilities = prediction.probabilities;
    if (!probabilities) {
      errors.push("systemPrediction.probabilities is required");
    } else {
      const scores = [
        probabilities.present,
        probabilities.partial,
        probabilities.missing,
      ];
      if (
        scores.some(
          (score) =>
            typeof score !== "number" || score < 0 || score > 1
        )
      ) {
        errors.push("system prediction probabilities must be between 0 and 1");
      } else if (Math.abs(scores.reduce((sum, score) => sum + score, 0) - 1) > 0.001) {
        errors.push("system prediction probabilities must sum to 1");
      }
    }
  }

  if (!value.review || typeof value.review !== "object") {
    errors.push("review is required");
  } else if (requireCompletedReview) {
    if (!value.review.verdict || !validStatuses.has(value.review.verdict)) {
      errors.push("review.verdict must be present, partial, or missing");
    }
    if (!value.review.reviewerId?.trim()) {
      errors.push("review.reviewerId is required");
    }
    if (
      !value.review.labelQuality ||
      !validLabelQualities.has(value.review.labelQuality)
    ) {
      errors.push(
        "review.labelQuality must be single_review, double_review, or adjudicated"
      );
    }
    if (
      !value.review.reviewedAt ||
      Number.isNaN(Date.parse(value.review.reviewedAt))
    ) {
      errors.push("review.reviewedAt must be a valid date string");
    }
  }

  for (const forbidden of ["userId", "studentUserId", "imageUrl", "imageUrls"]) {
    if (forbidden in value) {
      errors.push(`${forbidden} must not be included in annotation exports`);
    }
  }

  return { valid: errors.length === 0, errors };
};
