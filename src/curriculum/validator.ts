// ═══════════════════════════════════════════════════════════════════════════
// Curriculum Knowledge Base — Validator
// ═══════════════════════════════════════════════════════════════════════════
//
// Validates curriculum JSON files against the expected schema at startup.
// Reports detailed errors so KB authors know exactly what to fix.
// ═══════════════════════════════════════════════════════════════════════════

import { CurriculumLesson, CurriculumConcept, LearningOutcome } from "./types";

// ─── Validation result ─────────────────────────────────────────────────────

export interface ValidationError {
  file: string;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isNonEmptyArray = (v: unknown): v is unknown[] =>
  Array.isArray(v) && v.length > 0;

const VALID_CATEGORIES = [
  "definition", "process", "formula", "diagram",
  "fact", "law", "calculation", "experiment",
];

// ─── Concept validator ─────────────────────────────────────────────────────

const validateConcept = (
  concept: Partial<CurriculumConcept>,
  file: string,
  index: number
): ValidationError[] => {
  const errors: ValidationError[] = [];
  const prefix = `concepts[${index}]`;

  if (!isNonEmptyString(concept.id)) {
    errors.push({ file, field: `${prefix}.id`, message: "Concept must have a non-empty 'id'" });
  }
  if (!isNonEmptyString(concept.name)) {
    errors.push({ file, field: `${prefix}.name`, message: "Concept must have a non-empty 'name'" });
  }
  if (typeof concept.weight !== "number" || concept.weight < 1 || concept.weight > 5) {
    errors.push({ file, field: `${prefix}.weight`, message: "Concept weight must be a number between 1 and 5" });
  }
  if (typeof concept.isFrequentlyTested !== "boolean") {
    errors.push({ file, field: `${prefix}.isFrequentlyTested`, message: "Must be a boolean" });
  }
  if (!isNonEmptyString(concept.category) || !VALID_CATEGORIES.includes(concept.category)) {
    errors.push({
      file,
      field: `${prefix}.category`,
      message: `Must be one of: ${VALID_CATEGORIES.join(", ")}`,
    });
  }
  if (!isNonEmptyArray(concept.keywords)) {
    errors.push({ file, field: `${prefix}.keywords`, message: "Must have at least one keyword" });
  }

  return errors;
};

// ─── Learning outcome validator ────────────────────────────────────────────

const validateOutcome = (
  outcome: Partial<LearningOutcome>,
  file: string,
  index: number,
  knownConceptIds: Set<string>
): ValidationError[] => {
  const errors: ValidationError[] = [];
  const prefix = `learningOutcomes[${index}]`;

  if (!isNonEmptyString(outcome.id)) {
    errors.push({ file, field: `${prefix}.id`, message: "Learning outcome must have a non-empty 'id'" });
  }
  if (!isNonEmptyString(outcome.description)) {
    errors.push({ file, field: `${prefix}.description`, message: "Must have a non-empty description" });
  }
  if (!isNonEmptyArray(outcome.requiredConcepts)) {
    errors.push({ file, field: `${prefix}.requiredConcepts`, message: "Must list at least one required concept ID" });
  } else {
    // Check that referenced concept IDs actually exist
    for (const cid of outcome.requiredConcepts!) {
      if (!knownConceptIds.has(cid)) {
        errors.push({
          file,
          field: `${prefix}.requiredConcepts`,
          message: `References unknown concept ID: "${cid}"`,
        });
      }
    }
  }

  return errors;
};

// ─── Lesson validator ──────────────────────────────────────────────────────

/**
 * Validates a single curriculum lesson JSON object.
 *
 * @param lesson  - The parsed lesson object
 * @param file    - File path (for error reporting)
 * @returns ValidationResult with all errors and warnings
 */
export const validateLesson = (
  lesson: Partial<CurriculumLesson>,
  file: string
): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // ── Top-level required fields ──────────────────────────────────────────
  if (!isNonEmptyString(lesson.lessonId)) {
    errors.push({ file, field: "lessonId", message: "Must be a non-empty string" });
  }
  if (!isNonEmptyString(lesson.subject)) {
    errors.push({ file, field: "subject", message: "Must be a non-empty string" });
  }
  if (typeof lesson.grade !== "number" || ![10, 11].includes(lesson.grade)) {
    errors.push({ file, field: "grade", message: "Must be 10 or 11" });
  }
  if (!isNonEmptyString(lesson.unit)) {
    errors.push({ file, field: "unit", message: "Must be a non-empty string" });
  }
  if (!isNonEmptyString(lesson.lessonName)) {
    errors.push({ file, field: "lessonName", message: "Must be a non-empty string" });
  }

  // ── Matching keywords ──────────────────────────────────────────────────
  if (!isNonEmptyArray(lesson.matchingKeywords)) {
    errors.push({ file, field: "matchingKeywords", message: "Must have at least one matching keyword" });
  }

  // ── Concepts ───────────────────────────────────────────────────────────
  if (!isNonEmptyArray(lesson.concepts)) {
    errors.push({ file, field: "concepts", message: "Must have at least one concept" });
  } else {
    // Validate each concept & collect IDs
    const conceptIds = new Set<string>();
    lesson.concepts!.forEach((concept, i) => {
      errors.push(...validateConcept(concept, file, i));
      if (concept.id) {
        if (conceptIds.has(concept.id)) {
          errors.push({ file, field: `concepts[${i}].id`, message: `Duplicate concept ID: "${concept.id}"` });
        }
        conceptIds.add(concept.id);
      }
    });

    // ── Learning outcomes (need concept IDs to cross-reference) ─────────
    if (!isNonEmptyArray(lesson.learningOutcomes)) {
      errors.push({ file, field: "learningOutcomes", message: "Must have at least one learning outcome" });
    } else {
      lesson.learningOutcomes!.forEach((outcome, i) => {
        errors.push(...validateOutcome(outcome, file, i, conceptIds));
      });
    }
  }

  // ── Definitions ────────────────────────────────────────────────────────
  if (!Array.isArray(lesson.definitions)) {
    errors.push({ file, field: "definitions", message: "Must be an array" });
  } else {
    lesson.definitions!.forEach((def, i) => {
      if (!isNonEmptyString(def.term)) {
        errors.push({ file, field: `definitions[${i}].term`, message: "Must have a non-empty term" });
      }
      if (!isNonEmptyString(def.definition)) {
        errors.push({ file, field: `definitions[${i}].definition`, message: "Must have a non-empty definition" });
      }
    });
  }

  // ── Optional arrays (formulae, diagrams, examKeywords) ─────────────────
  if (lesson.formulae && !Array.isArray(lesson.formulae)) {
    errors.push({ file, field: "formulae", message: "Must be an array" });
  }
  if (lesson.expectedDiagrams && !Array.isArray(lesson.expectedDiagrams)) {
    errors.push({ file, field: "expectedDiagrams", message: "Must be an array" });
  }
  if (!isNonEmptyArray(lesson.examKeywords)) {
    warnings.push(`${file}: examKeywords is empty — consider adding frequently tested keywords`);
  }

  // ── Warnings ───────────────────────────────────────────────────────────
  if (lesson.concepts && lesson.concepts.length < 5) {
    warnings.push(`${file}: Only ${lesson.concepts.length} concepts — consider adding more for comprehensive coverage`);
  }
  if (!lesson.textbookReference) {
    warnings.push(`${file}: No textbookReference — consider adding for study recommendations`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};
