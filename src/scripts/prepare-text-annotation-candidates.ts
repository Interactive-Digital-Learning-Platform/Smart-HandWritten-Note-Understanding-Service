import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildTextIntakeSetSha256,
  createTextIntakeCandidates,
  inspectTextIntake,
  TextIntakeMetadata,
} from "../annotations/textIntake";
import { getLessonsBySubject, loadCurriculum } from "../curriculum";
import { CurriculumLesson } from "../curriculum/types";

const readArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

const normalizedTitle = (value: string): string =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const resolveExactLesson = (
  metadata: TextIntakeMetadata
): CurriculumLesson | null => {
  const expected = normalizedTitle(metadata.lessonName);
  const matches = getLessonsBySubject(metadata.subject, metadata.grade).filter(
    (lesson) =>
      normalizedTitle(lesson.lessonName) === expected ||
      normalizedTitle(lesson.unit) === expected
  );
  return matches.length === 1 ? matches[0] : null;
};

const main = async (): Promise<void> => {
  const rootArg = readArg("--root");
  if (!rootArg) {
    throw new Error("--root <dataset-v2-folder> is required");
  }
  const validateOnly = hasFlag("--validate-only");
  const outputArg = readArg("--output");
  if (!validateOnly && !outputArg) {
    throw new Error("--output <candidates.jsonl> is required unless --validate-only is used");
  }

  const inventory = inspectTextIntake(rootArg);
  const intakeSummary = {
    valid: true,
    root: inventory.root,
    noteCount: inventory.notes.length,
    reviewedNoteCount: inventory.reviewedNoteCount,
    readyForCandidateGeneration:
      inventory.reviewedNoteCount === inventory.notes.length,
    coverage: inventory.coverage,
    intakeSetSha256: buildTextIntakeSetSha256(inventory.notes),
    notes: inventory.notes.map((note) => ({
      noteGroupId: note.metadata.noteGroupId,
      subject: note.metadata.subject,
      grade: note.metadata.grade,
      lessonName: note.metadata.lessonName,
      language: note.metadata.language,
      pageCount: note.metadata.pageCount,
      ocrReviewed: note.metadata.ocrReviewed,
      rawOcrSha256: note.rawOcrSha256,
      correctedTextSha256: note.correctedTextSha256,
    })),
  };
  if (validateOnly) {
    console.log(JSON.stringify({ ...intakeSummary, filesWritten: false }, null, 2));
    return;
  }

  const outputPath = path.resolve(outputArg as string);
  if (path.extname(outputPath).toLowerCase() !== ".jsonl") {
    throw new Error("--output must use the .jsonl extension");
  }
  const manifestPath = outputPath.replace(/\.jsonl$/i, ".manifest.json");
  if (fs.existsSync(outputPath) || fs.existsSync(manifestPath)) {
    throw new Error("candidate output or manifest already exists; choose a new path");
  }

  await loadCurriculum();
  const exportedAt = new Date().toISOString();
  const generated = createTextIntakeCandidates(
    inventory,
    resolveExactLesson,
    exportedAt
  );
  if (generated.records.length === 0) {
    throw new Error("no annotation candidates were generated");
  }

  const jsonl = `${generated.records
    .map((record) => JSON.stringify(record))
    .join("\n")}\n`;
  const manifest = {
    schemaVersion: "1.0.0",
    sourceType: "manually_corrected_ocr_text",
    generatedAt: exportedAt,
    metadataFile: "metadata.csv",
    noteCount: inventory.notes.length,
    recordCount: generated.records.length,
    reviewedNoteCount: inventory.reviewedNoteCount,
    intakeSetSha256: buildTextIntakeSetSha256(inventory.notes),
    candidatesSha256: createHash("sha256").update(jsonl).digest("hex"),
    coverage: inventory.coverage,
    resolvedLessons: generated.lessons,
    systemStatusCounts: generated.systemStatusCounts,
    notes: intakeSummary.notes,
    generation: {
      externalServicesUsed: false,
      databaseUsed: false,
      qdrantUsed: false,
      groqUsed: false,
      ocrUsed: false,
      predictionPurpose:
        "Keyword-only triage for human annotation; every candidate still requires review.",
    },
    privacy: {
      originalImagesExcluded: true,
      noteIdsPseudonymized: true,
      commonEmailPhoneAndStudentIdPatternsRedacted: true,
      manualPrivacyReviewStillRequired: true,
    },
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, jsonl, { encoding: "utf8", flag: "wx" });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  console.log(
    JSON.stringify(
      {
        ...intakeSummary,
        records: generated.records.length,
        systemStatusCounts: generated.systemStatusCounts,
        candidates: outputPath,
        manifest: manifestPath,
        filesWritten: true,
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
