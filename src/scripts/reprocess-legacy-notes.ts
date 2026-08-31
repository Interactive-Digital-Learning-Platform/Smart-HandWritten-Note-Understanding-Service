import { connectDB, disconnectDB } from "../config/database";
import { loadCurriculum } from "../curriculum";
import { Note } from "../models/Note";
import { processNote } from "../services/processingService";

const readArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const execute = process.argv.includes("--execute");
const explicitNoteId = readArg("--note-id");
const explicitSubject = readArg("--subject");
const explicitTopic = readArg("--topic");
const explicitGradeText = readArg("--grade");
const explicitGrade = explicitGradeText
  ? Number.parseInt(explicitGradeText, 10)
  : undefined;
if (explicitGrade !== undefined && explicitGrade !== 10 && explicitGrade !== 11) {
  throw new Error("--grade must be 10 or 11");
}
const parsedLimit = Number.parseInt(readArg("--limit") || "3", 10);
if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
  throw new Error("--limit must be an integer between 1 and 50");
}

const scienceSubjects = ["Science", "Biology", "Chemistry", "Physics"];
const legacyConditions = [
  { "analysis.curriculumVersion": { $exists: false } },
  { "analysis.curriculumVersion": null },
  { "analysis.pipelineVersion": { $ne: "2.0.0" } },
  { "analysis.lessonId": { $exists: false } },
  { "analysis.conceptFindings.0": { $exists: false } },
];

const baseFilter = {
  status: "analyzed" as const,
  rawText: { $type: "string" as const, $ne: "" },
  $or: legacyConditions,
};

const gradeFromAnalysis = (gradeLevel?: string): number | undefined => {
  const grade = Number.parseInt(gradeLevel?.replace(/\D/g, "") || "", 10);
  return grade === 10 || grade === 11 ? grade : undefined;
};

const main = async (): Promise<void> => {
  await connectDB();
  await loadCurriculum();

  const selectedFields = "_id analysis.subject analysis.gradeLevel analysis.topic";
  let selected;
  if (explicitNoteId) {
    const note = await Note.findOne({
      _id: explicitNoteId,
      status: "analyzed",
      rawText: { $type: "string", $ne: "" },
    })
      .select(selectedFields)
      .lean();
    selected = note ? [note] : [];
  } else {
    const historyLimit =
      parsedLimit <= 3 ? 1 : Math.max(1, Math.ceil(parsedLimit / 2));
    const history = await Note.find({
      ...baseFilter,
      "analysis.subject": "History",
    })
      .sort({ updatedAt: -1 })
      .limit(historyLimit)
      .select(selectedFields)
      .lean();
    const scienceLimit = Math.max(1, parsedLimit - history.length);
    const science = await Note.find({
      ...baseFilter,
      "analysis.subject": { $in: scienceSubjects },
    })
      .sort({ updatedAt: -1 })
      .limit(scienceLimit)
      .select(selectedFields)
      .lean();
    selected = [...history, ...science].slice(0, parsedLimit);
  }

  console.log(
    JSON.stringify({
      mode: execute ? "execute" : "dry-run",
      selectedCount: selected.length,
      requestedLimit: parsedLimit,
      selection: explicitNoteId
        ? "explicit note repair"
        : "balanced recent History and Science-family legacy notes",
      safeguards: {
        usesExistingOcrText: true,
        skipsMaterialGeneration: true,
        skipsStudentProfileUpdate: true,
        preservesPreviousAnalysisOnFailure: true,
      },
    })
  );
  if (!execute) {
    console.log("Dry run only. Add --execute to reprocess selected notes.");
    return;
  }

  const results: Array<{
    success: boolean;
    subject?: string;
    grade?: string;
    lessonIdentified: boolean;
    conceptCount: number;
    curriculumVersion?: string;
    pipelineVersion?: string;
    error?: string;
  }> = [];
  for (const candidate of selected) {
    const result = await processNote(String(candidate._id), true, {
      skipMaterialGeneration: true,
      updateStudentProfile: false,
      analysisHints: {
        subject: explicitSubject ?? candidate.analysis?.subject,
        grade:
          explicitGrade ?? gradeFromAnalysis(candidate.analysis?.gradeLevel),
        topic: explicitTopic ?? candidate.analysis?.topic,
      },
    });
    results.push({
      success: result.success,
      subject: result.analysis?.subject,
      grade: result.analysis?.gradeLevel,
      lessonIdentified: Boolean(result.analysis?.lessonId),
      conceptCount: result.analysis?.conceptFindings?.length ?? 0,
      curriculumVersion: result.analysis?.curriculumVersion,
      pipelineVersion: result.analysis?.pipelineVersion,
      error: result.error,
    });
  }

  console.log(
    JSON.stringify(
      {
        processed: results.length,
        successful: results.filter((result) => result.success).length,
        currentContractReady: results.filter(
          (result) =>
            result.success &&
            result.lessonIdentified &&
            result.conceptCount > 0 &&
            result.curriculumVersion &&
            result.pipelineVersion === "2.0.0"
        ).length,
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
  .finally(disconnectDB);
