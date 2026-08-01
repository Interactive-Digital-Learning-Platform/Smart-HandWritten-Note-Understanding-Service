// ═══════════════════════════════════════════════════════════════════════════
// Curriculum Knowledge Base — Type Definitions
// ═══════════════════════════════════════════════════════════════════════════
//
// These types define the structured curriculum knowledge base for the
// Sri Lankan G.C.E. O/L syllabus (Grade 10 & 11).
//
// Hierarchy:
//   Subject → Grade → Unit → Lesson → Learning Outcomes → Required Concepts
//
// Each concept carries an importance weight (1–5), exam frequency flag,
// keyword synonyms for OCR matching, and a category tag.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Concept Category ──────────────────────────────────────────────────────

/**
 * Categories help the system understand *what kind* of knowledge a concept
 * represents. This is used in gap detection to provide more specific
 * study recommendations (e.g., "practice drawing this diagram" vs
 * "memorize this definition").
 */
export type ConceptCategory =
  | "definition"   // A term that must be defined (e.g., "Photosynthesis")
  | "process"      // A step-by-step process (e.g., "Light Reaction")
  | "formula"      // A mathematical equation or chemical formula
  | "diagram"      // A diagram or visual representation expected
  | "fact"         // A factual statement (e.g., "Chlorophyll is green")
  | "law"          // A scientific law or principle (e.g., "Ohm's Law")
  | "calculation"  // A numerical calculation or problem-solving method
  | "experiment";  // A practical experiment or lab activity

// ─── Curriculum Concept ────────────────────────────────────────────────────

/**
 * A single knowledge concept within a curriculum lesson.
 *
 * Example:
 * {
 *   id: "bio-g10-photo-001",
 *   name: "Chlorophyll",
 *   weight: 4,
 *   isFrequentlyTested: true,
 *   category: "definition",
 *   keywords: ["chlorophyll", "green pigment", "chloroplast pigment"],
 *   relatedConcepts: ["bio-g10-photo-002"]
 * }
 */
export interface CurriculumConcept {
  /** Unique identifier, e.g., "bio-g10-photo-001" */
  id: string;

  /** Human-readable name, e.g., "Chlorophyll" */
  name: string;

  /**
   * Importance weight on a 1–5 scale:
   *   5 = Critical — exam failure if missing
   *   4 = Very important — frequently tested
   *   3 = Important — standard curriculum content
   *   2 = Supporting — aids understanding but not critical
   *   1 = Supplementary — nice to know
   */
  weight: number;

  /** Whether this concept appears frequently in past O/L exam papers */
  isFrequentlyTested: boolean;

  /** What kind of knowledge this concept represents */
  category: ConceptCategory;

  /**
   * Keywords and synonyms used for matching against OCR-extracted text.
   * Should include variations students might write:
   *   e.g., ["ATP", "adenosine triphosphate", "energy molecule", "energy currency"]
   */
  keywords: string[];

  /** IDs of related concepts in the same or other lessons */
  relatedConcepts?: string[];
}

// ─── Learning Outcome ──────────────────────────────────────────────────────

/**
 * A specific learning outcome from the Sri Lankan curriculum.
 * Each outcome maps to one or more required concepts.
 *
 * Example:
 * {
 *   id: "bio-g10-photo-lo-01",
 *   description: "Explain the process of photosynthesis including inputs and outputs",
 *   requiredConcepts: ["bio-g10-photo-001", "bio-g10-photo-002", ...]
 * }
 */
export interface LearningOutcome {
  /** Unique identifier, e.g., "bio-g10-photo-lo-01" */
  id: string;

  /** Full description of the learning outcome */
  description: string;

  /** IDs of CurriculumConcepts that a student must demonstrate for this outcome */
  requiredConcepts: string[];
}

// ─── Curriculum Lesson ─────────────────────────────────────────────────────

/**
 * A single lesson within the curriculum. This is the primary unit
 * that student notes are matched against.
 *
 * Example: "Photosynthesis" under Biology → Grade 10 → Plant Nutrition
 */
export interface CurriculumLesson {
  /** Unique lesson identifier, e.g., "bio-g10-photosynthesis" */
  lessonId: string;

  /** Subject name, e.g., "Biology" */
  subject: string;

  /** Grade level: 10 or 11 */
  grade: number;

  /** Unit/chapter name, e.g., "Plant Nutrition" */
  unit: string;

  /** Lesson name, e.g., "Photosynthesis" */
  lessonName: string;

  /** Ordered list of learning outcomes for this lesson */
  learningOutcomes: LearningOutcome[];

  /** All required concepts, each with weight and keywords */
  concepts: CurriculumConcept[];

  /** Key definitions students must know */
  definitions: CurriculumDefinition[];

  /** Important formulae or equations */
  formulae: string[];

  /** Diagrams students are expected to draw or recognize */
  expectedDiagrams: string[];

  /** Keywords that commonly appear in O/L exam questions for this lesson */
  examKeywords: string[];

  /** Optional textbook section reference */
  textbookReference?: string;

  /**
   * Keywords and phrases used to match OCR text to this lesson.
   * Broader than concept-level keywords — used for lesson identification.
   * e.g., ["photosynthesis", "plant food", "sunlight energy", "carbon fixation"]
   */
  matchingKeywords: string[];
}

// ─── Curriculum Definition ─────────────────────────────────────────────────

/**
 * A key term and its curriculum-standard definition.
 */
export interface CurriculumDefinition {
  /** The term being defined */
  term: string;

  /** The official/expected definition */
  definition: string;

  /** The concept ID this definition belongs to (if applicable) */
  conceptId?: string;
}

// ─── Subject Curriculum ────────────────────────────────────────────────────

/**
 * Top-level container for all lessons within a single subject,
 * organized by grade.
 */
export interface SubjectCurriculum {
  /** Subject name, e.g., "Biology" */
  subject: string;

  /** Curriculum knowledge base version (for tracking/comparison) */
  version: string;

  /** Last updated timestamp */
  lastUpdated: string;

  /** Lessons organized by grade number */
  grades: {
    [grade: number]: CurriculumLesson[];
  };
}

// ─── Curriculum Index ──────────────────────────────────────────────────────

/**
 * The full in-memory curriculum index, organized by subject.
 * This is what `loadCurriculum()` returns.
 */
export interface CurriculumIndex {
  /** All subjects in the knowledge base */
  subjects: {
    [subjectName: string]: SubjectCurriculum;
  };

  /** Total number of lessons across all subjects and grades */
  totalLessons: number;

  /** Total number of concepts across all lessons */
  totalConcepts: number;

  /** KB version identifier */
  version: string;

  /** When the KB was loaded into memory */
  loadedAt: Date;
}

// ─── Lesson Search Result ──────────────────────────────────────────────────

/**
 * Returned by the KB search/query functions when looking up lessons.
 */
export interface LessonSearchResult {
  /** The matched lesson */
  lesson: CurriculumLesson;

  /** How confident the match is (0–1) */
  confidence: number;

  /** How the match was found */
  matchMethod: "exact" | "keyword" | "fuzzy" | "ai-assisted";
}
