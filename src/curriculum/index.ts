// ═══════════════════════════════════════════════════════════════════════════
// Curriculum Knowledge Base — Loader & Query API
// ═══════════════════════════════════════════════════════════════════════════
//
// This module loads all curriculum JSON files from the data/ directory at
// startup, validates them, and provides a query API for the rest of the
// system to look up lessons, concepts, and learning outcomes.
//
// Usage:
//   import { loadCurriculum, findLesson, getCurriculum } from "./curriculum";
//   await loadCurriculum();
//   const result = findLesson("Biology", "Photosynthesis", 10);
// ═══════════════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import {
  CurriculumLesson,
  CurriculumIndex,
  SubjectCurriculum,
  LessonSearchResult,
  CurriculumConcept,
} from "./types";
import { validateLesson } from "./validator";

// ─── Module state ──────────────────────────────────────────────────────────

const KB_VERSION = "1.0.0";
const DATA_DIR = path.resolve(__dirname, "data");

let curriculumIndex: CurriculumIndex | null = null;

// ─── File Discovery ────────────────────────────────────────────────────────

/**
 * Recursively finds all .json files under the given directory.
 */
const findJsonFiles = (dir: string): string[] => {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      results.push(fullPath);
    }
  }

  return results;
};

// ─── Load & Validate ───────────────────────────────────────────────────────

/**
 * Loads all curriculum JSON files from `src/curriculum/data/`, validates
 * each one, and builds the in-memory CurriculumIndex.
 *
 * Call this once at server startup (before routes are registered).
 *
 * @throws Error if the data directory is missing or no valid lessons found
 */
import { TEXTBOOK_TOC_REGISTRY } from "../services/curriculumDbService";

export const loadCurriculum = async (): Promise<CurriculumIndex> => {
  console.log("\n📚 Loading Curriculum Knowledge Base (Neon PostgreSQL & Registry)...");
  console.log(`   Data directory: ${DATA_DIR}`);

  const subjects: Record<string, SubjectCurriculum> = {};
  let totalLessons = 0;
  let totalConcepts = 0;
  let totalErrors = 0;

  const jsonFiles = fs.existsSync(DATA_DIR) ? findJsonFiles(DATA_DIR) : [];

  if (jsonFiles.length > 0) {
    console.log(`   Found ${jsonFiles.length} local curriculum file(s)`);
    for (const file of jsonFiles) {
      const relativePath = path.relative(DATA_DIR, file);
      try {
        const raw = fs.readFileSync(file, "utf-8");
        const lesson: CurriculumLesson = JSON.parse(raw);
        const result = validateLesson(lesson, relativePath);
        if (!result.valid) continue;

        const subjectKey = lesson.subject;
        if (!subjects[subjectKey]) {
          subjects[subjectKey] = {
            subject: subjectKey,
            version: KB_VERSION,
            lastUpdated: new Date().toISOString(),
            grades: {},
          };
        }
        if (!subjects[subjectKey].grades[lesson.grade]) {
          subjects[subjectKey].grades[lesson.grade] = [];
        }
        subjects[subjectKey].grades[lesson.grade].push(lesson);
        totalLessons++;
        totalConcepts += lesson.concepts.length;
      } catch (err) {
        // Skip invalid file
      }
    }
  }

  // Populate from TEXTBOOK_TOC_REGISTRY (Database Registry)
  for (const toc of TEXTBOOK_TOC_REGISTRY) {
    const sKey = toc.subject;
    if (!subjects[sKey]) {
      subjects[sKey] = {
        subject: sKey,
        version: KB_VERSION,
        lastUpdated: new Date().toISOString(),
        grades: {},
      };
    }
    if (!subjects[sKey].grades[toc.grade]) {
      subjects[sKey].grades[toc.grade] = [];
    }

    const slug = toc.unitName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const lessonId = `sci-g${toc.grade}-${slug}`;

    const existing = subjects[sKey].grades[toc.grade].find((l) => l.lessonName === toc.unitName);
    if (!existing) {
      const concepts = (toc.concepts && toc.concepts.length > 0)
        ? toc.concepts
        : [
            {
              id: `${lessonId}-c1`,
              name: `${toc.unitName} Fundamentals`,
              weight: 5,
              isFrequentlyTested: true,
              category: "definition" as const,
              keywords: toc.matchingKeywords.slice(0, 5),
            },
            {
              id: `${lessonId}-c2`,
              name: `${toc.unitName} Applications & Laws`,
              weight: 4,
              isFrequentlyTested: true,
              category: "fact" as const,
              keywords: toc.matchingKeywords.slice(5, 10),
            },
          ];

      const learningOutcomes = (toc.learningOutcomes && toc.learningOutcomes.length > 0)
        ? toc.learningOutcomes
        : [
            {
              id: `${lessonId}-lo-1`,
              description: `Understand the core principles and concepts of ${toc.unitName}`,
              requiredConcepts: concepts.slice(0, 2).map((c) => c.id),
            },
          ];

      const dbLesson: CurriculumLesson = {
        lessonId,
        subject: toc.subject,
        grade: toc.grade,
        unit: toc.unitName,
        lessonName: toc.unitName,
        textbookReference: toc.textbookReference,
        matchingKeywords: toc.matchingKeywords,
        learningOutcomes,
        concepts,
        definitions: toc.definitions || [],
        formulae: toc.formulae || [],
        expectedDiagrams: toc.expectedDiagrams || [],
        examKeywords: toc.matchingKeywords,
      };

      subjects[sKey].grades[toc.grade].push(dbLesson);
      totalLessons++;
      totalConcepts += dbLesson.concepts.length;
    }
  }

  // ── Build index ────────────────────────────────────────────────────────

  curriculumIndex = {
    subjects,
    totalLessons,
    totalConcepts,
    version: KB_VERSION,
    loadedAt: new Date(),
  };

  console.log(`\n📚 Curriculum KB loaded successfully!`);
  console.log(`   Subjects: ${Object.keys(subjects).join(", ")}`);
  console.log(`   Total lessons: ${totalLessons}`);
  console.log(`   Total concepts: ${totalConcepts}`);
  console.log(`   Version: ${KB_VERSION}`);
  if (totalErrors > 0) {
    console.warn(`   ⚠️  ${totalErrors} file(s) had errors and were skipped`);
  }
  console.log("");

  return curriculumIndex;
};

// ─── Getters ───────────────────────────────────────────────────────────────

/**
 * Returns the loaded curriculum index.
 * @throws Error if curriculum hasn't been loaded yet
 */
export const getCurriculum = (): CurriculumIndex => {
  if (!curriculumIndex) {
    throw new Error("Curriculum KB not loaded. Call loadCurriculum() first.");
  }
  return curriculumIndex;
};

/**
 * Returns whether the curriculum KB has been loaded.
 */
export const isCurriculumLoaded = (): boolean => curriculumIndex !== null;

/**
 * Returns all available subject names.
 */
export const getAllSubjects = (): string[] => {
  const subjects = Object.keys(getCurriculum().subjects);
  if (!subjects.some(s => s.toLowerCase() === "science")) {
    subjects.unshift("Science");
  }
  return subjects;
};

/**
 * Returns all lessons for a given subject and optional grade.
 */
export const getLessonsBySubject = (
  subject: string,
  grade?: number
): CurriculumLesson[] => {
  const curriculum = getCurriculum();

  // If subject is "Science", combine Biology, Chemistry, Physics, and Science
  if (subject.toLowerCase() === "science") {
    const combined: CurriculumLesson[] = [];
    const scienceSubdisciplines = ["Science", "Biology", "Chemistry", "Physics"];
    for (const sub of scienceSubdisciplines) {
      const sData = curriculum.subjects[sub];
      if (sData) {
        if (grade !== undefined) {
          combined.push(...(sData.grades[grade] ?? []));
        } else {
          for (const gLessons of Object.values(sData.grades)) {
            combined.push(...gLessons);
          }
        }
      }
    }
    return combined;
  }

  const subjectData = curriculum.subjects[subject];

  if (!subjectData) return [];

  if (grade !== undefined) {
    return subjectData.grades[grade] ?? [];
  }

  // Return all grades
  const allLessons: CurriculumLesson[] = [];
  for (const gradeLessons of Object.values(subjectData.grades)) {
    allLessons.push(...gradeLessons);
  }
  return allLessons;
};

/**
 * Returns all lessons across all subjects, optionally filtered by grade.
 */
export const getAllLessons = (grade?: number): CurriculumLesson[] => {
  const curriculum = getCurriculum();
  const allLessons: CurriculumLesson[] = [];

  for (const subjectData of Object.values(curriculum.subjects)) {
    if (grade !== undefined) {
      allLessons.push(...(subjectData.grades[grade] ?? []));
    } else {
      for (const gradeLessons of Object.values(subjectData.grades)) {
        allLessons.push(...gradeLessons);
      }
    }
  }

  return allLessons;
};

// ─── Lesson Search ─────────────────────────────────────────────────────────

/**
 * Finds a curriculum lesson by subject, topic, and optionally grade.
 * Uses exact matching first, then keyword matching, then fuzzy matching.
 *
 * @param subject  - Subject name (e.g., "Biology")
 * @param topic    - Topic/lesson name (e.g., "Photosynthesis")
 * @param grade    - Optional grade filter (10 or 11)
 * @returns LessonSearchResult or null if no match found
 */
export const findLesson = (
  subject: string,
  topic: string,
  grade?: number
): LessonSearchResult | null => {
  let candidates = getLessonsBySubject(subject, grade);

  if (candidates.length === 0 && grade) {
    // If grade filter yielded 0 results, search across all grades for that subject
    candidates = getLessonsBySubject(subject);
  }

  if (candidates.length === 0) {
    // Try case-insensitive subject match
    const allSubjects = getAllSubjects();
    const match = allSubjects.find(
      (s) => s.toLowerCase() === subject.toLowerCase()
    );
    if (match && match !== subject) {
      return findLesson(match, topic, grade);
    }
    if (match && match === subject) {
      candidates = getLessonsBySubject(match);
    }
    if (candidates.length === 0) {
      return null;
    }
  }

  const topicLower = topic.toLowerCase().trim();

  // ── 1. Exact or substring match on lessonName or unit ──────────────────
  for (const lesson of candidates) {
    const lName = lesson.lessonName.toLowerCase();
    const uName = lesson.unit.toLowerCase();
    if (lName === topicLower || topicLower.includes(lName) || (topicLower.length >= 5 && lName.includes(topicLower))) {
      return { lesson, confidence: 1.0, matchMethod: "exact" };
    }
    if (uName === topicLower || topicLower.includes(uName) || (topicLower.length >= 5 && uName.includes(topicLower))) {
      return { lesson, confidence: 0.95, matchMethod: "exact" };
    }
  }

  // ── 2. Keyword match on matchingKeywords ──────────────────────────────
  let bestMatch: CurriculumLesson | null = null;
  let bestScore = 0;

  for (const lesson of candidates) {
    const keywordHits = lesson.matchingKeywords.filter((kw) =>
      topicLower.includes(kw.toLowerCase()) ||
      kw.toLowerCase().includes(topicLower)
    ).length;

    const score = keywordHits / lesson.matchingKeywords.length;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = lesson;
    }
  }

  if (bestMatch && bestScore > 0.1) {
    return {
      lesson: bestMatch,
      confidence: Math.min(0.95, bestScore + 0.3), // Boost keyword matches
      matchMethod: "keyword",
    };
  }

  // ── 3. Fuzzy match: check if topic words appear in lesson name or unit ─
  const topicWords = topicLower.split(/\s+/).filter((w) => w.length > 2);

  for (const lesson of candidates) {
    const lessonText = `${lesson.lessonName} ${lesson.unit}`.toLowerCase();
    const matchingWords = topicWords.filter((w) => lessonText.includes(w));
    const score = matchingWords.length / topicWords.length;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = lesson;
    }
  }

  if (bestMatch && bestScore > 0.2) {
    return {
      lesson: bestMatch,
      confidence: Math.min(0.8, bestScore),
      matchMethod: "fuzzy",
    };
  }

  return null;
};

/**
 * Searches ALL lessons across all subjects for a topic match.
 * Useful when the subject hasn't been identified yet.
 *
 * @param topic - The topic text to search for
 * @returns Array of LessonSearchResult sorted by confidence (highest first)
 */
export const searchLessons = (topic: string): LessonSearchResult[] => {
  const results: LessonSearchResult[] = [];
  const topicLower = topic.toLowerCase().trim();

  for (const lesson of getAllLessons()) {
    const lName = lesson.lessonName.toLowerCase();
    const uName = lesson.unit.toLowerCase();

    // Direct match on lesson name or unit
    if (lName === topicLower || topicLower.includes(lName) || (topicLower.length >= 5 && lName.includes(topicLower))) {
      results.push({
        lesson,
        confidence: 1.0,
        matchMethod: "exact",
      });
      continue;
    }
    if (uName === topicLower || topicLower.includes(uName) || (topicLower.length >= 5 && uName.includes(topicLower))) {
      results.push({
        lesson,
        confidence: 0.95,
        matchMethod: "exact",
      });
      continue;
    }

    // Check matchingKeywords
    const keywordHits = lesson.matchingKeywords.filter(
      (kw) =>
        topicLower.includes(kw.toLowerCase()) ||
        kw.toLowerCase().includes(topicLower)
    ).length;

    if (keywordHits > 0) {
      const score = keywordHits / lesson.matchingKeywords.length;
      results.push({
        lesson,
        confidence: Math.min(0.95, score + 0.2),
        matchMethod: "keyword",
      });
      continue;
    }

    // Check lessonName and examKeywords
    const allText = [
      lesson.lessonName,
      lesson.unit,
      ...lesson.examKeywords,
    ]
      .join(" ")
      .toLowerCase();

    const topicWords = topicLower.split(/\s+/).filter((w) => w.length > 2);
    const matchCount = topicWords.filter((w) => allText.includes(w)).length;

    if (matchCount > 0) {
      const score = matchCount / topicWords.length;
      results.push({
        lesson,
        confidence: Math.min(0.7, score * 0.5),
        matchMethod: "fuzzy",
      });
    }
  }

  // Sort by confidence, descending
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
};

/**
 * Retrieves a lesson by its unique lessonId.
 */
export const getLessonById = (lessonId: string): CurriculumLesson | null => {
  for (const lesson of getAllLessons()) {
    if (lesson.lessonId === lessonId) {
      return lesson;
    }
  }
  return null;
};

/**
 * Returns all concepts for a given lesson ID.
 */
export const getConceptsForLesson = (
  lessonId: string
): CurriculumConcept[] => {
  const lesson = getLessonById(lessonId);
  return lesson?.concepts ?? [];
};

// ─── Stats ─────────────────────────────────────────────────────────────────

/**
 * Returns a summary of the loaded curriculum KB.
 */
export const getCurriculumStats = () => {
  const curriculum = getCurriculum();

  const subjectStats = Object.entries(curriculum.subjects).map(
    ([name, data]) => {
      const gradeCounts: Record<number, number> = {};
      let conceptCount = 0;

      for (const [grade, lessons] of Object.entries(data.grades)) {
        gradeCounts[Number(grade)] = lessons.length;
        for (const lesson of lessons) {
          conceptCount += lesson.concepts.length;
        }
      }

      return {
        subject: name,
        grades: gradeCounts,
        totalLessons: Object.values(gradeCounts).reduce((a, b) => a + b, 0),
        totalConcepts: conceptCount,
      };
    }
  );

  return {
    version: curriculum.version,
    loadedAt: curriculum.loadedAt,
    totalSubjects: Object.keys(curriculum.subjects).length,
    totalLessons: curriculum.totalLessons,
    totalConcepts: curriculum.totalConcepts,
    subjects: subjectStats,
  };
};
