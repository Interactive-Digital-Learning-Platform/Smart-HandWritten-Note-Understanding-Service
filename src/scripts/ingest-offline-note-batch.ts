import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
dotenv.config();

import { connectDB, disconnectDB } from "../config/database";
import { loadCurriculum } from "../curriculum";
import { Note } from "../models/Note";
import { processNote } from "../services/processingService";
import {
  curriculumDbService,
  TEXTBOOK_TOC_REGISTRY,
} from "../services/curriculumDbService";

interface BatchNote {
  relativeDirectory: string;
  grade: 10 | 11;
  unitNumber: number;
  unitName: string;
  studentKey: string;
  pages: string[];
  sourceFingerprint: string;
}

const readArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

const normalizeTitle = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && token !== "the")
    .join("");

const hashFile = (filePath: string): string =>
  createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

const pageNumber = (filePath: string): number => {
  const match = path.basename(filePath).match(/^page-(\d+)\.[a-z0-9]+$/i);
  return match ? Number.parseInt(match[1], 10) : Number.NaN;
};

const countDetectedOcrPages = (rawText: string, expectedPages: number): number => {
  if (!rawText) return 0;
  if (expectedPages <= 1) return 1;
  const pageNumbers = new Set(
    [...rawText.matchAll(/^--- Page (\d+) ---$/gm)]
      .map((match) => Number.parseInt(match[1], 10))
      .filter((number) => number >= 1 && number <= expectedPages)
  );
  return pageNumbers.size;
};

const detectedOcrPageLengths = (rawText: string): number[] =>
  [...rawText.matchAll(/^--- Page \d+ ---\r?\n([\s\S]*?)(?=^--- Page \d+ ---|(?![\s\S]))/gm)]
    .map((match) => match[1].trim().length);

const discoverBatch = (root: string): BatchNote[] => {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Batch root is not a directory: ${root}`);
  }

  const supportedExtensions = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".heic",
    ".heif",
  ]);
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(absolute);
      }
    }
  };
  walk(root);

  const grouped = new Map<string, string[]>();
  for (const filePath of files) {
    const relative = path.relative(root, filePath);
    const parts = relative.split(path.sep);
    if (parts.length !== 4) {
      throw new Error(
        `Unexpected image path ${relative}; expected grade-XX/unit-XX-name/student-XX/page-XX.ext`
      );
    }
    const directory = path.dirname(relative);
    grouped.set(directory, [...(grouped.get(directory) ?? []), filePath]);
  }

  if (grouped.size === 0) {
    throw new Error(`No supported note images were found below ${root}`);
  }

  const seenImageHashes = new Map<string, string>();
  const notes: BatchNote[] = [];
  for (const [relativeDirectory, unsortedPages] of grouped) {
    const [gradePart, unitPart, studentKey] = relativeDirectory.split(path.sep);
    const gradeMatch = gradePart.match(/^grade-(10|11)$/);
    const unitMatch = unitPart.match(/^unit-(\d+)-(.+)$/);
    if (!gradeMatch || !unitMatch || !/^student-[a-z0-9_-]+$/i.test(studentKey)) {
      throw new Error(`Invalid note directory structure: ${relativeDirectory}`);
    }
    const grade = Number.parseInt(gradeMatch[1], 10) as 10 | 11;
    const unitNumber = Number.parseInt(unitMatch[1], 10);
    const unitSlug = unitMatch[2];
    const registryUnit = TEXTBOOK_TOC_REGISTRY.find(
      (entry) =>
        entry.subject === "Science" &&
        entry.grade === grade &&
        entry.unitNumber === unitNumber
    );
    if (!registryUnit) {
      throw new Error(
        `No Science Grade ${grade} Unit ${unitNumber} exists in the curriculum registry`
      );
    }
    if (normalizeTitle(registryUnit.unitName) !== normalizeTitle(unitSlug)) {
      throw new Error(
        `${relativeDirectory} names unit "${unitSlug}", but the registry expects "${registryUnit.unitName}"`
      );
    }

    const pages = [...unsortedPages].sort(
      (left, right) => pageNumber(left) - pageNumber(right)
    );
    const numbers = pages.map(pageNumber);
    if (numbers.some(Number.isNaN)) {
      throw new Error(`${relativeDirectory} contains a page not named page-XX.ext`);
    }
    const expected = numbers.map((_, index) => index + 1);
    if (numbers.some((number, index) => number !== expected[index])) {
      throw new Error(
        `${relativeDirectory} page sequence must start at 01 and contain no gaps; found ${numbers.join(", ")}`
      );
    }

    const pageHashes = pages.map((page) => {
      const digest = hashFile(page);
      const previous = seenImageHashes.get(digest);
      if (previous) {
        throw new Error(
          `Duplicate page content detected in ${path.relative(root, page)} and ${previous}`
        );
      }
      seenImageHashes.set(digest, path.relative(root, page));
      return digest;
    });
    notes.push({
      relativeDirectory,
      grade,
      unitNumber,
      unitName: registryUnit.unitName,
      studentKey,
      pages,
      sourceFingerprint: createHash("sha256")
        .update(pageHashes.join("|"))
        .digest("hex")
        .slice(0, 16),
    });
  }

  return notes.sort(
    (left, right) =>
      left.grade - right.grade ||
      left.unitNumber - right.unitNumber ||
      left.studentKey.localeCompare(right.studentKey)
  );
};

const main = async (): Promise<void> => {
  const rootArg = readArg("--root");
  if (!rootArg) {
    throw new Error("--root <science-folder> is required");
  }
  const root = path.resolve(rootArg);
  const batchId = readArg("--batch-id") || "science-offline-2026-08-31";
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/i.test(batchId)) {
    throw new Error("--batch-id must be 3-80 letters, numbers, dots, underscores, or hyphens");
  }

  const execute = hasFlag("--execute");
  const statusOnly = hasFlag("--status");
  const resumeStale = hasFlag("--resume-stale");
  const pilot = hasFlag("--pilot");
  const force = hasFlag("--force");
  const refreshOcr = hasFlag("--refresh-ocr");
  const retryIncomplete = hasFlag("--retry-incomplete");
  const student = readArg("--student");
  if (pilot && student) {
    throw new Error("Use either --pilot or --student, not both");
  }
  const allNotes = discoverBatch(root);
  const selectedNotes = student
    ? allNotes.filter((note) => note.studentKey === student)
    : pilot
      ? [10, 11]
        .map((grade) => allNotes.find((note) => note.grade === grade))
        .filter((note): note is BatchNote => Boolean(note))
      : allNotes;
  if (selectedNotes.length === 0) {
    throw new Error(`No note matched --student ${student}`);
  }
  const inventory = {
    valid: true,
    executionRequested: execute,
    batchId,
    root,
    discoveredNotes: allNotes.length,
    selectedNotes: selectedNotes.length,
    selectedPages: selectedNotes.reduce((sum, note) => sum + note.pages.length, 0),
    gradeCounts: Object.fromEntries(
      [10, 11].map((grade) => [
        `grade${grade}`,
        selectedNotes.filter((note) => note.grade === grade).length,
      ])
    ),
    notes: selectedNotes.map((note) => ({
      source: note.relativeDirectory,
      grade: note.grade,
      unit: note.unitName,
      pages: note.pages.length,
      sourceFingerprint: note.sourceFingerprint,
    })),
  };

  if (!execute && !statusOnly) {
    console.log(JSON.stringify({ ...inventory, databaseWrites: false }, null, 2));
    return;
  }

  await loadCurriculum();
  await connectDB();
  const batchUserId = `offline-annotation:${batchId}`;
  if (statusOnly) {
    const records = await Note.find({ userId: batchUserId })
      .select("title status pageCount rawText analysis.subject analysis.gradeLevel analysis.topic analysis.lessonId analysis.pipelineVersion analysis.curriculumVersion analysis.conceptFindings analysis.qualityWarnings errorMessage updatedAt")
      .sort({ title: 1 })
      .lean();
    console.log(
      JSON.stringify(
        {
          batchId,
          databaseWrites: false,
          records: records.map((record) => ({
            noteId: String(record._id),
            title: record.title,
            status: record.status,
            pages: record.pageCount,
            ocrPagesDetected: countDetectedOcrPages(
              record.rawText ?? "",
              record.pageCount
            ),
            ocrPageCharacters: detectedOcrPageLengths(record.rawText ?? ""),
            subject: record.analysis?.subject,
            grade: record.analysis?.gradeLevel,
            topic: record.analysis?.topic,
            lessonId: record.analysis?.lessonId,
            pipelineVersion: record.analysis?.pipelineVersion,
            curriculumVersion: record.analysis?.curriculumVersion,
            concepts: record.analysis?.conceptFindings?.length ?? 0,
            anchoredConcepts:
              record.analysis?.conceptFindings?.filter(
                (finding) =>
                  finding.status === "present" || finding.status === "partial"
              ).length ?? 0,
            qualityWarnings: record.analysis?.qualityWarnings ?? [],
            error: record.errorMessage,
            updatedAt: record.updatedAt,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  const results: Array<Record<string, unknown>> = [];

  for (const [index, source] of selectedNotes.entries()) {
    const title = `${batchId} G${source.grade} U${String(source.unitNumber).padStart(2, "0")} ${source.studentKey} ${source.sourceFingerprint}`;
    console.log(
      `\n[${index + 1}/${selectedNotes.length}] ${source.relativeDirectory} (${source.pages.length} pages)`
    );
    let note = await Note.findOne({ userId: batchUserId, title });
    let created = false;
    if (!note) {
      note = await Note.create({
        userId: batchUserId,
        title,
        imageUrl: source.pages[0],
        imageUrls: source.pages,
        pageCount: source.pages.length,
        rawText: "",
        status: "uploaded",
        userSubject: "Science",
        userGrade: source.grade,
        userTopic: source.unitName,
      });
      created = true;
    }

    if (note.status === "processing") {
      const staleForMs = Date.now() - note.updatedAt.getTime();
      if (!resumeStale || staleForMs < 2 * 60 * 1000) {
        throw new Error(
          `${title} is already processing. Use --resume-stale only after confirming its previous process has exited and it has been unchanged for at least two minutes.`
        );
      }
      note.status = "failed";
      note.errorMessage =
        "Recovered from an interrupted offline batch process before retry.";
      await note.save();
    }

    const detectedOcrPages = countDetectedOcrPages(
      note.rawText ?? "",
      note.pageCount
    );
    const shouldRefreshIncomplete =
      retryIncomplete &&
      note.status === "analyzed" &&
      detectedOcrPages < note.pageCount;
    const processed = await processNote(
      String(note._id),
      force || shouldRefreshIncomplete,
      {
      skipMaterialGeneration: true,
      updateStudentProfile: false,
        refreshOcr: refreshOcr || shouldRefreshIncomplete,
      }
    );
    const findings = processed.analysis?.conceptFindings ?? [];
    results.push({
      source: source.relativeDirectory,
      noteId: String(note._id),
      created,
      success: processed.success,
      error: processed.error,
      expected: {
        subject: "Science",
        grade: source.grade,
        unit: source.unitName,
      },
      analyzed: processed.analysis
        ? {
            subject: processed.analysis.subject,
            grade: processed.analysis.gradeLevel,
            lessonId: processed.analysis.lessonId,
            topic: processed.analysis.topic,
            pipelineVersion: processed.analysis.pipelineVersion,
            curriculumVersion: processed.analysis.curriculumVersion,
            ocrCharacters: processed.rawText?.length ?? 0,
            concepts: findings.length,
            anchoredConcepts: findings.filter(
              (finding) => finding.status === "present" || finding.status === "partial"
            ).length,
            qualityWarnings: processed.analysis.qualityWarnings ?? [],
          }
        : null,
    });
    if (
      !processed.success &&
      /rate limited|currently at capacity/i.test(processed.error ?? "")
    ) {
      console.warn(
        "Stopping the batch early because the OCR provider requested a cooldown; rerun the same idempotent command later."
      );
      break;
    }
  }

  console.log(
    JSON.stringify(
      {
        ...inventory,
        databaseWrites: true,
        succeeded: results.filter((result) => result.success).length,
        failed: results.filter((result) => !result.success).length,
        results,
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await curriculumDbService.closePool();
    await disconnectDB();
  });
