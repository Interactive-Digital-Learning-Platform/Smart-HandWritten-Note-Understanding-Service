import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import { CurriculumLesson } from "../curriculum/types";
import { probabilitiesForDecision } from "../pipeline/conceptPrediction";
import {
  ANNOTATION_SCHEMA_VERSION,
  buildAnnotationRecordId,
  ConceptAnnotationRecord,
  redactAnnotationText,
  validateAnnotationRecord,
} from "./contract";

const REQUIRED_METADATA_HEADERS = [
  "note_group_id",
  "subject",
  "grade",
  "lesson_name",
  "language",
  "page_count",
  "ocr_reviewed",
] as const;

const SUPPORTED_SUBJECTS = new Map<string, TextIntakeMetadata["subject"]>([
  ["science", "Science"],
  ["history", "History"],
] as const);

const SUPPORTED_LANGUAGES = new Map<string, TextIntakeMetadata["language"]>([
  ["english", "English"],
  ["sinhala", "Sinhala"],
  ["mixed", "Mixed"],
] as const);

export interface TextIntakeMetadata {
  noteGroupId: string;
  subject: "Science" | "History";
  grade: 10 | 11;
  lessonName: string;
  language: "English" | "Sinhala" | "Mixed";
  pageCount: number;
  ocrReviewed: boolean;
}

export interface TextIntakeNote {
  metadata: TextIntakeMetadata;
  relativeDirectory: string;
  rawOcrText: string;
  correctedText: string;
  rawOcrSha256: string;
  correctedTextSha256: string;
}

export interface TextIntakeInventory {
  root: string;
  metadataPath: string;
  notes: TextIntakeNote[];
  reviewedNoteCount: number;
  coverage: {
    subjects: Record<string, number>;
    grades: Record<string, number>;
    subjectGrades: Record<string, number>;
    languages: Record<string, number>;
  };
}

export class TextIntakeValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Text intake validation failed:\n- ${issues.join("\n- ")}`);
    this.name = "TextIntakeValidationError";
  }
}

const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.trim()) {
        throw new Error("a quoted CSV field must begin with a quote");
      }
      field = "";
      inQuotes = true;
    } else if (character === ",") {
      row.push(field.trim());
      field = "";
    } else if (character === "\n") {
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (inQuotes) throw new Error("unterminated quoted CSV field");
  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
};

const readUtf8File = (filePath: string): string => {
  const bytes = fs.readFileSync(filePath);
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return decoded.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
};

const normalizedTextFingerprint = (text: string): string =>
  sha256(text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim());

const addCount = (counts: Record<string, number>, key: string): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

export const inspectTextIntake = (rootPath: string): TextIntakeInventory => {
  const root = path.resolve(rootPath);
  const issues: string[] = [];
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new TextIntakeValidationError([`intake root is not a directory: ${root}`]);
  }

  const metadataPath = path.join(root, "metadata.csv");
  if (!fs.existsSync(metadataPath) || !fs.statSync(metadataPath).isFile()) {
    throw new TextIntakeValidationError(["metadata.csv is missing from the intake root"]);
  }

  let rows: string[][];
  try {
    rows = parseCsv(readUtf8File(metadataPath));
  } catch (error) {
    throw new TextIntakeValidationError([
      `metadata.csv is not valid UTF-8 CSV: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ]);
  }
  if (rows.length === 0) {
    throw new TextIntakeValidationError(["metadata.csv is empty"]);
  }

  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, ""));
  const duplicateHeaders = headers.filter(
    (header, index) => headers.indexOf(header) !== index
  );
  if (duplicateHeaders.length > 0) {
    issues.push(`metadata.csv contains duplicate header(s): ${[...new Set(duplicateHeaders)].join(", ")}`);
  }
  const missingHeaders = REQUIRED_METADATA_HEADERS.filter(
    (header) => !headers.includes(header)
  );
  const unexpectedHeaders = headers.filter(
    (header) =>
      !REQUIRED_METADATA_HEADERS.includes(
        header as (typeof REQUIRED_METADATA_HEADERS)[number]
      )
  );
  if (missingHeaders.length > 0) {
    issues.push(`metadata.csv is missing header(s): ${missingHeaders.join(", ")}`);
  }
  if (unexpectedHeaders.length > 0) {
    issues.push(`metadata.csv contains unexpected header(s): ${unexpectedHeaders.join(", ")}`);
  }
  if (issues.length > 0) throw new TextIntakeValidationError(issues);

  const headerIndex = Object.fromEntries(
    headers.map((header, index) => [header, index])
  ) as Record<(typeof REQUIRED_METADATA_HEADERS)[number], number>;
  const metadataRecords: TextIntakeMetadata[] = [];
  const seenGroupIds = new Map<string, number>();

  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    const lineNumber = index + 1;
    if (row.length !== headers.length) {
      issues.push(
        `metadata.csv line ${lineNumber} has ${row.length} column(s); expected ${headers.length}`
      );
      continue;
    }
    const value = (header: (typeof REQUIRED_METADATA_HEADERS)[number]): string =>
      row[headerIndex[header]]?.trim() ?? "";
    const noteGroupId = value("note_group_id");
    const subject = SUPPORTED_SUBJECTS.get(value("subject").toLowerCase());
    const language = SUPPORTED_LANGUAGES.get(value("language").toLowerCase());
    const parsedGrade = Number(value("grade"));
    const parsedPageCount = Number(value("page_count"));
    const reviewedValue = value("ocr_reviewed").toLowerCase();

    let rowValid = true;
    if (!/^[a-z0-9][a-z0-9._-]{2,79}$/i.test(noteGroupId)) {
      issues.push(
        `metadata.csv line ${lineNumber}: note_group_id must be 3-80 letters, numbers, dots, underscores, or hyphens`
      );
      rowValid = false;
    } else {
      const groupKey = noteGroupId.toLowerCase();
      const previousLine = seenGroupIds.get(groupKey);
      if (previousLine) {
        issues.push(
          `metadata.csv line ${lineNumber}: duplicate note_group_id ${noteGroupId} (first seen on line ${previousLine})`
        );
        rowValid = false;
      } else {
        seenGroupIds.set(groupKey, lineNumber);
      }
    }
    if (!subject) {
      issues.push(
        `metadata.csv line ${lineNumber}: subject must be Science or History`
      );
      rowValid = false;
    }
    if (parsedGrade !== 10 && parsedGrade !== 11) {
      issues.push(`metadata.csv line ${lineNumber}: grade must be 10 or 11`);
      rowValid = false;
    }
    const lessonName = value("lesson_name");
    if (!lessonName) {
      issues.push(`metadata.csv line ${lineNumber}: lesson_name must not be empty`);
      rowValid = false;
    }
    if (!language) {
      issues.push(
        `metadata.csv line ${lineNumber}: language must be English, Sinhala, or Mixed`
      );
      rowValid = false;
    }
    if (!Number.isInteger(parsedPageCount) || parsedPageCount < 1) {
      issues.push(
        `metadata.csv line ${lineNumber}: page_count must be a positive integer`
      );
      rowValid = false;
    }
    if (reviewedValue !== "true" && reviewedValue !== "false") {
      issues.push(
        `metadata.csv line ${lineNumber}: ocr_reviewed must be true or false`
      );
      rowValid = false;
    }

    if (rowValid && subject && language) {
      metadataRecords.push({
        noteGroupId,
        subject,
        grade: parsedGrade as 10 | 11,
        lessonName,
        language,
        pageCount: parsedPageCount,
        ocrReviewed: reviewedValue === "true",
      });
    }
  }

  if (metadataRecords.length === 0 && issues.length === 0) {
    issues.push("metadata.csv contains no note rows");
  }

  const expectedDirectories = new Set(
    metadataRecords.map((record) => record.noteGroupId.toLowerCase())
  );
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      !entry.name.startsWith(".") &&
      !expectedDirectories.has(entry.name.toLowerCase())
    ) {
      issues.push(
        `directory ${entry.name} has no matching note_group_id in metadata.csv`
      );
    }
  }

  const notes: TextIntakeNote[] = [];
  const correctedFingerprints = new Map<string, string>();
  const rawFingerprints = new Map<string, string>();
  for (const metadata of metadataRecords) {
    const directory = path.join(root, metadata.noteGroupId);
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
      issues.push(`${metadata.noteGroupId}: note directory is missing`);
      continue;
    }

    const rawPath = path.join(directory, "raw-ocr.txt");
    const correctedPath = path.join(directory, "corrected-text.txt");
    let rawOcrText: string | undefined;
    let correctedText: string | undefined;
    for (const [label, filePath] of [
      ["raw-ocr.txt", rawPath],
      ["corrected-text.txt", correctedPath],
    ] as const) {
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        issues.push(`${metadata.noteGroupId}: ${label} is missing`);
        continue;
      }
      try {
        const content = readUtf8File(filePath);
        if (!content) {
          issues.push(`${metadata.noteGroupId}: ${label} is empty`);
        } else if (content.includes("\u0000")) {
          issues.push(`${metadata.noteGroupId}: ${label} contains null bytes`);
        } else if (label === "raw-ocr.txt") {
          rawOcrText = content;
        } else {
          correctedText = content;
        }
      } catch (error) {
        issues.push(
          `${metadata.noteGroupId}: ${label} is not valid UTF-8 (${error instanceof Error ? error.message : String(error)})`
        );
      }
    }
    if (!rawOcrText || !correctedText) continue;

    const correctedFingerprint = normalizedTextFingerprint(correctedText);
    const duplicateCorrected = correctedFingerprints.get(correctedFingerprint);
    if (duplicateCorrected) {
      issues.push(
        `${metadata.noteGroupId}: corrected text duplicates ${duplicateCorrected}`
      );
    } else {
      correctedFingerprints.set(correctedFingerprint, metadata.noteGroupId);
    }
    const rawFingerprint = normalizedTextFingerprint(rawOcrText);
    const duplicateRaw = rawFingerprints.get(rawFingerprint);
    if (duplicateRaw) {
      issues.push(`${metadata.noteGroupId}: raw OCR text duplicates ${duplicateRaw}`);
    } else {
      rawFingerprints.set(rawFingerprint, metadata.noteGroupId);
    }

    notes.push({
      metadata,
      relativeDirectory: metadata.noteGroupId,
      rawOcrText,
      correctedText,
      rawOcrSha256: sha256(rawOcrText),
      correctedTextSha256: sha256(correctedText),
    });
  }

  if (issues.length > 0) throw new TextIntakeValidationError(issues);

  const coverage: TextIntakeInventory["coverage"] = {
    subjects: {},
    grades: {},
    subjectGrades: {},
    languages: {},
  };
  for (const note of notes) {
    addCount(coverage.subjects, note.metadata.subject);
    addCount(coverage.grades, String(note.metadata.grade));
    addCount(
      coverage.subjectGrades,
      `${note.metadata.subject}-grade-${note.metadata.grade}`
    );
    addCount(coverage.languages, note.metadata.language);
  }

  return {
    root,
    metadataPath,
    notes,
    reviewedNoteCount: notes.filter((note) => note.metadata.ocrReviewed).length,
    coverage,
  };
};

const normalizeForKeywordMatch = (value: string): string =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");

const keywordEvidence = (
  text: string,
  keywords: string[]
): { keyword: string; evidence: string } | null => {
  const normalizedText = normalizeForKeywordMatch(text);
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeForKeywordMatch(keyword).trim();
    if (!normalizedKeyword || !normalizedText.includes(normalizedKeyword)) continue;

    const rawIndex = text.toLowerCase().indexOf(keyword.toLowerCase());
    const start = rawIndex >= 0 ? Math.max(0, rawIndex - 50) : 0;
    const end = rawIndex >= 0
      ? Math.min(text.length, rawIndex + keyword.length + 80)
      : Math.min(text.length, 160);
    return {
      keyword,
      evidence: `"...${text.slice(start, end).replace(/\s+/g, " ").trim()}..."`,
    };
  }
  return null;
};

export interface CandidateGenerationResult {
  records: ConceptAnnotationRecord[];
  lessons: Record<string, string>;
  systemStatusCounts: Record<string, number>;
}

export const createTextIntakeCandidates = (
  inventory: TextIntakeInventory,
  resolveLesson: (metadata: TextIntakeMetadata) => CurriculumLesson | null,
  exportedAt = new Date().toISOString()
): CandidateGenerationResult => {
  const unreviewed = inventory.notes
    .filter((note) => !note.metadata.ocrReviewed)
    .map((note) => note.metadata.noteGroupId);
  if (unreviewed.length > 0) {
    throw new TextIntakeValidationError([
      `OCR correction is not confirmed for: ${unreviewed.join(", ")}`,
    ]);
  }

  const records: ConceptAnnotationRecord[] = [];
  const lessons: Record<string, string> = {};
  const issues: string[] = [];
  for (const note of inventory.notes) {
    const lesson = resolveLesson(note.metadata);
    if (!lesson) {
      issues.push(
        `${note.metadata.noteGroupId}: no exact ${note.metadata.subject} Grade ${note.metadata.grade} curriculum lesson matches "${note.metadata.lessonName}"`
      );
      continue;
    }
    if (lesson.grade !== note.metadata.grade) {
      issues.push(
        `${note.metadata.noteGroupId}: resolved lesson ${lesson.lessonId} belongs to Grade ${lesson.grade}`
      );
      continue;
    }
    lessons[note.metadata.noteGroupId] = lesson.lessonId;

    const noteId = `text-note-${sha256(
      `${note.metadata.noteGroupId}|${note.correctedTextSha256}`
    ).slice(0, 24)}`;
    const noteTextSnapshot = redactAnnotationText(note.correctedText);
    for (const concept of lesson.concepts) {
      const match = keywordEvidence(noteTextSnapshot, concept.keywords);
      const status = match ? "present" : "missing";
      const decisionConfidence = match ? 0.6 : 0.5;
      const learningOutcomes = lesson.learningOutcomes
        .filter((outcome) => outcome.requiredConcepts.includes(concept.id))
        .map((outcome) => outcome.description);
      const record: ConceptAnnotationRecord = {
        schemaVersion: ANNOTATION_SCHEMA_VERSION,
        recordId: buildAnnotationRecordId(
          noteId,
          lesson.curriculumVersion,
          concept.id
        ),
        noteId,
        curriculumVersion: lesson.curriculumVersion,
        pipelineVersion: "text-intake-1.0.0",
        subject: note.metadata.subject,
        grade: note.metadata.grade,
        lessonId: lesson.lessonId,
        lessonName: lesson.lessonName,
        language: note.metadata.language,
        noteTextSnapshot,
        concept: {
          id: concept.id,
          name: concept.name,
          category: concept.category,
          weight: concept.weight,
          isFrequentlyTested: concept.isFrequentlyTested,
          keywords: concept.keywords,
          learningOutcomes,
        },
        systemPrediction: {
          status,
          probabilities: probabilitiesForDecision(status, decisionConfidence),
          found: Boolean(match),
          decisionConfidence,
          matchMethod: match ? "keyword" : "not_found",
          source: match ? "rule" : "fallback",
          needsReview: true,
          evidenceText: match?.evidence,
        },
        review: { verdict: null },
        exportedAt,
      };
      const validation = validateAnnotationRecord(record);
      if (!validation.valid) {
        issues.push(
          `${note.metadata.noteGroupId}/${concept.id}: ${validation.errors.join(", ")}`
        );
      } else {
        records.push(record);
      }
    }
  }
  if (issues.length > 0) throw new TextIntakeValidationError(issues);

  const systemStatusCounts: Record<string, number> = {};
  for (const record of records) {
    addCount(systemStatusCounts, record.systemPrediction.status);
  }
  return { records, lessons, systemStatusCounts };
};

export const buildTextIntakeSetSha256 = (notes: TextIntakeNote[]): string =>
  sha256(
    [...notes]
      .sort((left, right) =>
        left.metadata.noteGroupId.localeCompare(right.metadata.noteGroupId)
      )
      .map(
        (note) =>
          `${note.metadata.noteGroupId}|${note.rawOcrSha256}|${note.correctedTextSha256}`
      )
      .join("\n")
  );
