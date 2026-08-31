import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { connectDB, disconnectDB } from "../config/database";
import { AnnotationLabelQuality } from "../annotations/contract";
import { ConceptAnnotation } from "../models/ConceptAnnotation";

const readArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

const qualityLevels: Record<AnnotationLabelQuality, number> = {
  single_review: 1,
  double_review: 2,
  adjudicated: 3,
};

const parseGrade = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const grade = Number.parseInt(value, 10);
  if (grade !== 10 && grade !== 11) {
    throw new Error("--grade must be 10 or 11");
  }
  return grade;
};

const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const main = async (): Promise<void> => {
  const datasetVersion = readArg("--version");
  if (!datasetVersion || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/.test(datasetVersion)) {
    throw new Error(
      "--version is required and must be 3-80 letters, numbers, dots, underscores, or hyphens"
    );
  }

  const subject = readArg("--subject");
  const grade = parseGrade(readArg("--grade"));
  const minimumQuality = (readArg("--minimum-quality") ||
    "single_review") as AnnotationLabelQuality;
  if (!(minimumQuality in qualityLevels)) {
    throw new Error(
      "--minimum-quality must be single_review, double_review, or adjudicated"
    );
  }
  const newOnly = hasFlag("--new-only");
  const outputPath = path.resolve(
    readArg("--output") ||
      path.join(
        "data",
        "annotations",
        "datasets",
        datasetVersion,
        "concept-annotations.jsonl"
      )
  );
  const manifestPath = `${outputPath}.manifest.json`;
  if (fs.existsSync(outputPath) || fs.existsSync(manifestPath)) {
    throw new Error("Dataset output or manifest already exists; choose a new version");
  }

  const acceptedQualities = (
    Object.entries(qualityLevels) as Array<[AnnotationLabelQuality, number]>
  )
    .filter(([, level]) => level >= qualityLevels[minimumQuality])
    .map(([quality]) => quality);
  const query: Record<string, unknown> = {
    labelQuality: { $in: acceptedQualities },
  };
  if (subject) query.subject = subject;
  if (grade) query.grade = grade;
  if (newOnly) query.usedForTraining = false;

  await connectDB();
  const duplicateVersion = await ConceptAnnotation.exists({ datasetVersion });
  if (duplicateVersion) {
    throw new Error(`Dataset version ${datasetVersion} has already been registered`);
  }

  const annotations = await ConceptAnnotation.find(query)
    .sort({ recordId: 1 })
    .lean();
  if (annotations.length === 0) {
    throw new Error("No reviewed annotations match the release filters");
  }

  const releasedAt = new Date().toISOString();
  const trainingRows = annotations.map((annotation) => ({
    schemaVersion: annotation.schemaVersion,
    datasetVersion,
    recordId: annotation.recordId,
    noteGroupId: `note-${hash(annotation.noteId).slice(0, 24)}`,
    curriculumVersion: annotation.curriculumVersion,
    pipelineVersion: annotation.pipelineVersion,
    subject: annotation.subject,
    grade: annotation.grade,
    lessonId: annotation.lessonId,
    lessonName: annotation.lessonName,
    language: annotation.language,
    noteScope: annotation.noteScope,
    ocrConfidence: annotation.ocrConfidence,
    noteTextSnapshot: annotation.noteTextSnapshot,
    concept: annotation.concept,
    systemPrediction: annotation.systemPrediction,
    targetLabel: annotation.reviewerVerdict,
    labelQuality: annotation.labelQuality,
  }));
  const jsonl = `${trainingRows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  const classCounts = trainingRows.reduce<Record<string, number>>(
    (counts, row) => {
      counts[row.targetLabel] = (counts[row.targetLabel] ?? 0) + 1;
      return counts;
    },
    {}
  );
  const curriculumVersions = [...new Set(
    trainingRows.map((row) => row.curriculumVersion)
  )].sort();
  const newlyLockedIds = annotations
    .filter((annotation) => !annotation.usedForTraining)
    .map((annotation) => annotation.recordId);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, jsonl, "utf8");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        datasetVersion,
        releasedAt,
        sha256: hash(jsonl),
        recordCount: trainingRows.length,
        newlyLockedRecordCount: newlyLockedIds.length,
        reusedLockedRecordCount: trainingRows.length - newlyLockedIds.length,
        filters: { subject, grade, minimumQuality, newOnly },
        classCounts,
        curriculumVersions,
        splitRule:
          "Split by noteGroupId so concepts from the same note never cross train, validation, or test sets.",
        privacy: {
          userAndReviewerIdentifiersExcluded: true,
          originalNoteIdReplacedWithHashedGroupId: true,
        },
      },
      null,
      2
    ),
    "utf8"
  );

  if (newlyLockedIds.length > 0) {
    const result = await ConceptAnnotation.updateMany(
      { recordId: { $in: newlyLockedIds }, usedForTraining: false },
      { $set: { usedForTraining: true, datasetVersion } }
    );
    if (result.modifiedCount !== newlyLockedIds.length) {
      throw new Error(
        `Dataset files were written, but only ${result.modifiedCount}/${newlyLockedIds.length} new labels were locked; quarantine this release and investigate concurrent updates`
      );
    }
  }

  console.log(`Released ${trainingRows.length} annotations as ${datasetVersion}`);
  console.log(`Dataset: ${outputPath}`);
  console.log(`Manifest: ${manifestPath}`);
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
