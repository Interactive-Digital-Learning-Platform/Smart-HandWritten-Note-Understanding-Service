import fs from "node:fs";
import path from "node:path";
import { connectDB, disconnectDB } from "../config/database";
import { loadCurriculum, getLessonById } from "../curriculum";
import {
  ANNOTATION_SCHEMA_VERSION,
  buildAnnotationRecordId,
  ConceptAnnotationRecord,
  redactAnnotationText,
  validateAnnotationRecord,
} from "../annotations/contract";
import { Note } from "../models/Note";
import {
  normalizeConceptStatus,
  probabilitiesForDecision,
  shouldReviewConcept,
  statusToLegacyFound,
} from "../pipeline/conceptPrediction";

const readArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

const countExpectedPageMarkers = (
  rawText: string,
  expectedPages: number
): number => {
  if (expectedPages <= 1) return rawText.trim() ? 1 : 0;
  return new Set(
    [...rawText.matchAll(/^--- Page (\d+) ---$/gm)]
      .map((match) => Number.parseInt(match[1], 10))
      .filter((number) => number >= 1 && number <= expectedPages)
  ).size;
};

const batchOcrPageLengths = (rawText: string): number[] =>
  [...rawText.matchAll(/^--- Page \d+ ---\r?\n([\s\S]*?)(?=^--- Page \d+ ---|(?![\s\S]))/gm)]
    .map((match) => match[1].trim().length);

const analysisSubjectsForFilter = (subject: string): string[] =>
  subject.toLowerCase() === "science"
    ? ["Science", "Biology", "Chemistry", "Physics"]
    : [subject];

const parseGrade = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const grade = Number.parseInt(value, 10);
  if (grade !== 10 && grade !== 11) {
    throw new Error("--grade must be 10 or 11");
  }
  return grade;
};

const main = async (): Promise<void> => {
  const subject = readArg("--subject");
  const batchId = readArg("--batch-id");
  if (batchId && !/^[a-z0-9][a-z0-9._-]{2,79}$/i.test(batchId)) {
    throw new Error("--batch-id must be 3-80 letters, numbers, dots, underscores, or hyphens");
  }
  const grade = parseGrade(readArg("--grade"));
  const parsedLimit = Number.parseInt(readArg("--limit") || "500", 10);
  if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
    throw new Error("--limit must be a positive integer");
  }
  const limit = parsedLimit;
  const includeAll = hasFlag("--all");
  const allowQualityWarnings = hasFlag("--allow-quality-warnings");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.resolve(
    readArg("--output") ||
      path.join("data", "annotations", `candidates-${timestamp}.jsonl`)
  );

  await connectDB();
  await loadCurriculum();

  const query: Record<string, unknown> = {
    status: "analyzed",
    "analysis.conceptFindings.0": { $exists: true },
    // A note with every concept marked missing is usually a lesson mismatch.
    // Require at least one positive/partial anchor, while still exporting all
    // missing concepts from an otherwise grounded note as negative examples.
    "analysis.conceptFindings": {
      $elemMatch: { status: { $in: ["present", "partial"] } },
    },
  };
  if (subject) {
    query["analysis.subject"] = {
      $in: analysisSubjectsForFilter(subject),
    };
  }
  if (batchId) {
    query.userId = `offline-annotation:${batchId}`;
  }
  if (!allowQualityWarnings) {
    query["analysis.qualityWarnings.0"] = { $exists: false };
  }

  const notes = await Note.find(query)
    .sort({ _id: 1 })
    .limit(limit)
    .lean();
  const records: ConceptAnnotationRecord[] = [];
  const exportedNoteIds = new Set<string>();

  for (const note of notes) {
    if (!note.analysis || !note.rawText?.trim()) continue;
    if (batchId) {
      const expectedPages = note.pageCount || note.imageUrls?.length || 1;
      const detectedPages = countExpectedPageMarkers(note.rawText, expectedPages);
      if (detectedPages < expectedPages) {
        console.warn(
          `Skipping batch note ${note._id}: OCR contains ${detectedPages}/${expectedPages} expected pages`
        );
        continue;
      }
      const pageLengths = batchOcrPageLengths(note.rawText);
      if (pageLengths.some((length) => length > 2_200)) {
        console.warn(
          `Skipping batch note ${note._id}: at least one OCR page exceeds the 2,200-character plausibility limit`
        );
        continue;
      }
      if (
        note.errorMessage &&
        !note.errorMessage.startsWith(
          "Recovered from an interrupted offline batch process"
        )
      ) {
        console.warn(
          `Skipping batch note ${note._id}: it retains a processing error`
        );
        continue;
      }
    }
    const noteGrade = Number.parseInt(
      note.analysis.gradeLevel?.replace(/\D/g, "") || "",
      10
    );
    if ((noteGrade !== 10 && noteGrade !== 11) || (grade && noteGrade !== grade)) {
      continue;
    }

    const lessonId = note.analysis.lessonId;
    if (!lessonId || !note.analysis.curriculumVersion) continue;
    const lesson = getLessonById(lessonId);
    const noteTextSnapshot = redactAnnotationText(note.rawText);
    if (!noteTextSnapshot) continue;

    for (const finding of note.analysis.conceptFindings ?? []) {
      const status = normalizeConceptStatus(finding);
      const confidence = finding.decisionConfidence ?? 0;
      const needsReview =
        finding.needsReview ??
        shouldReviewConcept(
          status,
          confidence,
          note.analysis.ocrLowQualityWarning === true
        );
      if (!includeAll && !needsReview) continue;

      const curriculumConcept = lesson?.concepts.find(
        (concept) => concept.id === finding.conceptId
      );
      const learningOutcomes = lesson?.learningOutcomes
        .filter((outcome) =>
          outcome.requiredConcepts.includes(finding.conceptId)
        )
        .map((outcome) => outcome.description) ?? [];
      const source =
        finding.source ??
        (finding.matchMethod === "keyword"
          ? "rule"
          : finding.matchMethod === "semantic"
            ? "semantic_llm"
            : "fallback");

      const record: ConceptAnnotationRecord = {
        schemaVersion: ANNOTATION_SCHEMA_VERSION,
        recordId: buildAnnotationRecordId(
          String(note._id),
          note.analysis.curriculumVersion,
          finding.conceptId
        ),
        noteId: String(note._id),
        curriculumVersion: note.analysis.curriculumVersion,
        pipelineVersion: note.analysis.pipelineVersion,
        subject: note.analysis.subject,
        grade: noteGrade,
        lessonId,
        lessonName: note.analysis.topic,
        language:
          note.analysis.contentLanguage?.primaryLanguage ?? "Unknown",
        noteScope: note.analysis.noteScope?.scope,
        ocrConfidence: note.analysis.ocrConfidence,
        noteTextSnapshot,
        concept: {
          id: finding.conceptId,
          name: finding.conceptName,
          category: finding.curriculumCategory,
          weight: finding.importanceWeight,
          isFrequentlyTested: finding.isFrequentlyTested,
          keywords: curriculumConcept?.keywords ?? [],
          learningOutcomes,
        },
        systemPrediction: {
          status,
          probabilities:
            finding.probabilities ??
            probabilitiesForDecision(status, confidence),
          found: statusToLegacyFound(status),
          decisionConfidence: confidence,
          matchMethod: finding.matchMethod,
          source,
          needsReview,
          modelVersion: finding.modelVersion,
          evidenceText: finding.evidence
            ? redactAnnotationText(finding.evidence)
            : undefined,
        },
        review: { verdict: null },
        exportedAt: new Date().toISOString(),
      };

      const validation = validateAnnotationRecord(record);
      if (!validation.valid) {
        console.warn(
          `Skipping invalid candidate ${record.recordId}: ${validation.errors.join(", ")}`
        );
        continue;
      }
      records.push(record);
      exportedNoteIds.add(String(note._id));
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    records.map((record) => JSON.stringify(record)).join("\n") +
      (records.length ? "\n" : ""),
    "utf8"
  );

  const classCounts = records.reduce<Record<string, number>>((counts, record) => {
    counts[record.systemPrediction.status] =
      (counts[record.systemPrediction.status] ?? 0) + 1;
    return counts;
  }, {});
  const manifestPath = outputPath.replace(/\.jsonl$/i, ".manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        schemaVersion: ANNOTATION_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        filters: {
          subject,
          grade,
          batchId,
          limit,
          includeAll,
          allowQualityWarnings,
        },
        noteCount: exportedNoteIds.size,
        recordCount: records.length,
        systemStatusCounts: classCounts,
        privacy: {
          directUserAndImageIdentifiersExcluded: true,
          commonEmailPhoneAndStudentIdPatternsRedacted: true,
          manualPrivacyReviewStillRequired: true,
        },
        eligibility: {
          requiresAtLeastOnePresentOrPartialConceptPerNote: true,
          excludesQualityWarningsByDefault: true,
          offlineBatchRequiresEveryExpectedOcrPage: true,
          rationale:
            "All-missing notes are quarantined as likely lesson mismatches.",
        },
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Exported ${records.length} annotation candidates to ${outputPath}`);
  console.log(`Manifest written to ${manifestPath}`);
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
