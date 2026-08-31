import fs from "node:fs";
import path from "node:path";
import { connectDB, disconnectDB } from "../config/database";
import {
  AnnotationLabelQuality,
  ConceptAnnotationRecord,
  buildAnnotationSourceFingerprint,
  redactAnnotationText,
  validateAnnotationRecord,
} from "../annotations/contract";
import { ConceptAnnotation } from "../models/ConceptAnnotation";

const readArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

const main = async (): Promise<void> => {
  const inputArg = readArg("--input");
  if (!inputArg) {
    throw new Error("--input <reviewed.jsonl> is required");
  }

  const inputPath = path.resolve(inputArg);
  const candidateArg = readArg("--candidate");
  const candidatePath = candidateArg ? path.resolve(candidateArg) : undefined;
  const fallbackReviewer = readArg("--reviewer");
  const fallbackQuality = readArg("--quality") as
    | AnnotationLabelQuality
    | undefined;
  const allowUsedUpdate = hasFlag("--allow-used-update");
  const dryRun = hasFlag("--dry-run");
  const lines = fs
    .readFileSync(inputPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const records: ConceptAnnotationRecord[] = [];
  const recordIds = new Set<string>();
  const errors: string[] = [];

  lines.forEach((line, index) => {
    try {
      const record = JSON.parse(line) as ConceptAnnotationRecord;
      record.review = {
        ...record.review,
        reviewerId: record.review?.reviewerId || fallbackReviewer,
        labelQuality: record.review?.labelQuality || fallbackQuality,
        reviewedAt: record.review?.reviewedAt || new Date().toISOString(),
      };
      const validation = validateAnnotationRecord(record, true);
      if (!validation.valid) {
        errors.push(`line ${index + 1}: ${validation.errors.join(", ")}`);
      } else if (recordIds.has(record.recordId)) {
        errors.push(`line ${index + 1}: duplicate recordId ${record.recordId}`);
      } else {
        recordIds.add(record.recordId);
        records.push(record);
      }
    } catch (error) {
      errors.push(
        `line ${index + 1}: ${
          error instanceof Error ? error.message : "invalid JSON"
        }`
      );
    }
  });

  if (errors.length > 0) {
    throw new Error(
      `Import rejected before database writes:\n- ${errors.slice(0, 50).join("\n- ")}`
    );
  }
  if (records.length === 0) {
    throw new Error("The reviewed file contains no annotation records");
  }

  if (candidatePath) {
    const candidates = new Map<string, ConceptAnnotationRecord>();
    const candidateErrors: string[] = [];
    fs.readFileSync(candidatePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .forEach((line, index) => {
        try {
          const candidate = JSON.parse(line) as ConceptAnnotationRecord;
          const validation = validateAnnotationRecord(candidate, false);
          if (!validation.valid) {
            candidateErrors.push(
              `candidate line ${index + 1}: ${validation.errors.join(", ")}`
            );
          } else if (candidates.has(candidate.recordId)) {
            candidateErrors.push(
              `candidate line ${index + 1}: duplicate recordId ${candidate.recordId}`
            );
          } else {
            candidates.set(candidate.recordId, candidate);
          }
        } catch (error) {
          candidateErrors.push(
            `candidate line ${index + 1}: ${
              error instanceof Error ? error.message : "invalid JSON"
            }`
          );
        }
      });

    for (const record of records) {
      const candidate = candidates.get(record.recordId);
      if (!candidate) {
        candidateErrors.push(
          `reviewed record ${record.recordId} is not present in the candidate file`
        );
      } else if (
        buildAnnotationSourceFingerprint(record) !==
        buildAnnotationSourceFingerprint(candidate)
      ) {
        candidateErrors.push(
          `reviewed record ${record.recordId} changed one or more immutable source fields`
        );
      }
    }
    for (const recordId of candidates.keys()) {
      if (!recordIds.has(recordId)) {
        candidateErrors.push(`candidate record ${recordId} is missing from the reviewed file`);
      }
    }
    if (candidateErrors.length > 0) {
      throw new Error(
        `Candidate integrity check failed:\n- ${candidateErrors
          .slice(0, 50)
          .join("\n- ")}`
      );
    }
  }

  const verdictCounts = records.reduce<Record<string, number>>((counts, record) => {
    const verdict = record.review.verdict || "unreviewed";
    counts[verdict] = (counts[verdict] || 0) + 1;
    return counts;
  }, {});
  const noteCount = new Set(records.map((record) => record.noteId)).size;

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          valid: true,
          databaseWrites: false,
          input: inputPath,
          candidateIntegrityChecked: Boolean(candidatePath),
          records: records.length,
          notes: noteCount,
          verdictCounts,
        },
        null,
        2
      )
    );
    return;
  }

  await connectDB();
  if (!allowUsedUpdate) {
    const locked = await ConceptAnnotation.find({
      recordId: { $in: records.map((record) => record.recordId) },
      usedForTraining: true,
    })
      .select("recordId")
      .lean();
    if (locked.length > 0) {
      throw new Error(
        `${locked.length} annotation(s) were already used for training; rerun with --allow-used-update only after dataset governance approval`
      );
    }
  }

  await ConceptAnnotation.bulkWrite(
    records.map((record) => {
      const verdict = record.review.verdict;
      const reviewerId = record.review.reviewerId;
      const labelQuality = record.review.labelQuality;
      const reviewedAt = record.review.reviewedAt;
      if (!verdict || !reviewerId || !labelQuality || !reviewedAt) {
        throw new Error(`Validated review fields missing for ${record.recordId}`);
      }

      return {
        updateOne: {
          filter: { recordId: record.recordId },
          update: {
            $set: {
              reviewerVerdict: verdict,
              reviewerId,
              labelQuality,
              evidenceText: record.review.evidenceText
                ? redactAnnotationText(record.review.evidenceText)
                : undefined,
              reviewerNotes: record.review.reviewerNotes
                ? redactAnnotationText(record.review.reviewerNotes)
                : undefined,
              reviewedAt: new Date(reviewedAt),
            },
            // Candidate evidence is an immutable source snapshot. Re-importing a
            // review updates only the review fields above.
            $setOnInsert: {
              schemaVersion: record.schemaVersion,
              recordId: record.recordId,
              noteId: record.noteId,
              curriculumVersion: record.curriculumVersion,
              pipelineVersion: record.pipelineVersion,
              subject: record.subject,
              grade: record.grade,
              lessonId: record.lessonId,
              lessonName: record.lessonName,
              language: record.language,
              noteScope: record.noteScope,
              ocrConfidence: record.ocrConfidence,
              noteTextSnapshot: redactAnnotationText(record.noteTextSnapshot),
              concept: record.concept,
              systemPrediction: {
                ...record.systemPrediction,
                evidenceText: record.systemPrediction.evidenceText
                  ? redactAnnotationText(record.systemPrediction.evidenceText)
                  : undefined,
              },
              usedForTraining: false,
            },
          },
          upsert: true,
        },
      };
    }),
    { ordered: true }
  );

  console.log(
    `Imported ${records.length} reviewed annotations from ${inputPath} (${noteCount} notes; ${JSON.stringify(
      verdictCounts
    )})`
  );
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
