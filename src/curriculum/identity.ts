import { createHash } from "node:crypto";
import {
  ConceptCategory,
  CurriculumConcept,
  CurriculumDefinition,
  CurriculumLesson,
  LearningOutcome,
} from "./types";

/** Increment whenever curriculum identity or content semantics change. */
export const CURRICULUM_VERSION = "1.1.0";

const SUBJECT_PREFIXES: Record<string, string> = {
  science: "sci",
  history: "his",
  geography: "geo",
  ict: "ict",
  biology: "bio",
};

const shortHash = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 8);

export const toIdentifierSlug = (value: string): string => {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || `item-${shortHash(value.trim().toLowerCase())}`;
};

export const createRegistryLessonId = (
  subject: string,
  grade: number,
  lessonName: string
): string => {
  const subjectSlug = toIdentifierSlug(subject);
  const prefix = SUBJECT_PREFIXES[subjectSlug] || subjectSlug;
  return `${prefix}-g${grade}-${toIdentifierSlug(lessonName)}`;
};

export const createDynamicLessonId = (
  subject: string,
  grade: number,
  lessonName: string
): string => {
  const identity = `${subject.trim().toLowerCase()}|${grade}|${lessonName
    .trim()
    .toLowerCase()}`;
  return `db-${toIdentifierSlug(subject)}-g${grade}-${toIdentifierSlug(
    lessonName
  )}-${shortHash(identity)}`;
};

export const createConceptId = (
  lessonId: string,
  conceptName: string
): string => {
  const normalizedName = conceptName.trim().toLowerCase();
  return `${lessonId}-c-${toIdentifierSlug(conceptName)}-${shortHash(
    `${lessonId}|${normalizedName}`
  )}`;
};

export const createLearningOutcomeId = (
  lessonId: string,
  description: string
): string => {
  const normalizedDescription = description.trim().toLowerCase();
  return `${lessonId}-lo-${shortHash(`${lessonId}|${normalizedDescription}`)}`;
};

const VALID_CATEGORIES = new Set<ConceptCategory>([
  "definition",
  "process",
  "formula",
  "diagram",
  "fact",
  "law",
  "calculation",
  "experiment",
]);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asNonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(
        new Set(value.map(asNonEmptyString).filter((item): item is string => Boolean(item)))
      )
    : [];

export interface DynamicLessonIdentityInput {
  subject: string;
  grade: number;
  topic: string;
  textbookReference?: string;
  generated: unknown;
}

/**
 * Converts untrusted LLM JSON into a versioned lesson with server-owned IDs.
 * LLM-provided IDs are used only to remap relationships and are never stored.
 */
export const buildDynamicCurriculumLesson = ({
  subject,
  grade,
  topic,
  textbookReference,
  generated,
}: DynamicLessonIdentityInput): CurriculumLesson | null => {
  const parsed = asRecord(generated);
  if (!parsed) return null;

  const lessonName = asNonEmptyString(parsed.lessonName) || topic.trim();
  const lessonId = createDynamicLessonId(subject, grade, lessonName);
  const rawConcepts = Array.isArray(parsed.concepts) ? parsed.concepts : [];
  const rawToCanonicalId = new Map<string, string>();
  const conceptsById = new Map<string, CurriculumConcept>();

  for (const value of rawConcepts) {
    const rawConcept = asRecord(value);
    const name = rawConcept && asNonEmptyString(rawConcept.name);
    if (!rawConcept || !name) continue;

    const id = createConceptId(lessonId, name);
    const rawId = asNonEmptyString(rawConcept.id);
    if (rawId) rawToCanonicalId.set(rawId, id);

    const rawCategory = asNonEmptyString(rawConcept.category) as ConceptCategory | null;
    const rawWeight = Number(rawConcept.weight);
    conceptsById.set(id, {
      id,
      name,
      weight: Number.isFinite(rawWeight)
        ? Math.min(5, Math.max(1, Math.round(rawWeight)))
        : 3,
      isFrequentlyTested: rawConcept.isFrequentlyTested === true,
      category:
        rawCategory && VALID_CATEGORIES.has(rawCategory) ? rawCategory : "fact",
      keywords: asStringArray(rawConcept.keywords).length
        ? asStringArray(rawConcept.keywords)
        : [name.toLowerCase()],
    });
  }

  const concepts = Array.from(conceptsById.values());
  if (concepts.length === 0) return null;

  const outcomesById = new Map<string, LearningOutcome>();
  const rawOutcomes = Array.isArray(parsed.learningOutcomes)
    ? parsed.learningOutcomes
    : [];

  for (const value of rawOutcomes) {
    const rawOutcome = asRecord(value);
    const description = rawOutcome && asNonEmptyString(rawOutcome.description);
    if (!rawOutcome || !description) continue;

    const requiredConcepts = asStringArray(rawOutcome.requiredConcepts)
      .map((id) => rawToCanonicalId.get(id))
      .filter((id): id is string => Boolean(id));
    if (requiredConcepts.length === 0) continue;

    const id = createLearningOutcomeId(lessonId, description);
    outcomesById.set(id, { id, description, requiredConcepts });
  }

  if (outcomesById.size === 0) {
    const description = `Explain the core concepts of ${lessonName}`;
    const id = createLearningOutcomeId(lessonId, description);
    outcomesById.set(id, {
      id,
      description,
      requiredConcepts: concepts.map((concept) => concept.id),
    });
  }

  const definitions: CurriculumDefinition[] = [];
  const rawDefinitions = Array.isArray(parsed.definitions)
    ? parsed.definitions
    : [];
  for (const value of rawDefinitions) {
    const rawDefinition = asRecord(value);
    const term = rawDefinition && asNonEmptyString(rawDefinition.term);
    const definition = rawDefinition && asNonEmptyString(rawDefinition.definition);
    if (!rawDefinition || !term || !definition) continue;

    const rawConceptId = asNonEmptyString(rawDefinition.conceptId);
    definitions.push({
      term,
      definition,
      conceptId: rawConceptId
        ? rawToCanonicalId.get(rawConceptId)
        : undefined,
    });
  }

  const matchingKeywords = asStringArray(parsed.matchingKeywords);
  return {
    curriculumVersion: CURRICULUM_VERSION,
    lessonId,
    subject,
    grade,
    unit: asNonEmptyString(parsed.unit) || lessonName,
    lessonName,
    learningOutcomes: Array.from(outcomesById.values()),
    concepts,
    definitions,
    formulae: asStringArray(parsed.formulae),
    expectedDiagrams: asStringArray(parsed.expectedDiagrams),
    examKeywords: asStringArray(parsed.examKeywords).length
      ? asStringArray(parsed.examKeywords)
      : [topic],
    textbookReference,
    matchingKeywords: matchingKeywords.length
      ? matchingKeywords
      : [topic.toLowerCase(), subject.toLowerCase()],
  };
};

/** Enforces global—not merely per-lesson—identity uniqueness at startup. */
export const assertUniqueCurriculumIds = (
  lessons: CurriculumLesson[]
): void => {
  const lessonIds = new Map<string, string>();
  const conceptIds = new Map<string, string>();
  const outcomeIds = new Map<string, string>();
  const errors: string[] = [];

  for (const lesson of lessons) {
    const owner = `${lesson.subject} Grade ${lesson.grade}: ${lesson.lessonName}`;
    const existingLesson = lessonIds.get(lesson.lessonId);
    if (existingLesson) {
      errors.push(`duplicate lesson ID "${lesson.lessonId}" in ${existingLesson} and ${owner}`);
    } else {
      lessonIds.set(lesson.lessonId, owner);
    }

    for (const concept of lesson.concepts) {
      const existingConcept = conceptIds.get(concept.id);
      if (existingConcept) {
        errors.push(`duplicate concept ID "${concept.id}" in ${existingConcept} and ${owner}`);
      } else {
        conceptIds.set(concept.id, owner);
      }
    }

    for (const outcome of lesson.learningOutcomes) {
      const existingOutcome = outcomeIds.get(outcome.id);
      if (existingOutcome) {
        errors.push(`duplicate learning-outcome ID "${outcome.id}" in ${existingOutcome} and ${owner}`);
      } else {
        outcomeIds.set(outcome.id, owner);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid curriculum identities:\n- ${errors.join("\n- ")}`);
  }
};
