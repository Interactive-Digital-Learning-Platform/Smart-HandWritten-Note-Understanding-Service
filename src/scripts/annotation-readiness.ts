import { connectDB, disconnectDB } from "../config/database";
import { Note } from "../models/Note";

const groupedCounts = async (field: string): Promise<Record<string, number>> => {
  const rows = await Note.aggregate<{ _id: string | null; count: number }>([
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return Object.fromEntries(
    rows.map((row) => [String(row._id ?? "Unknown"), row.count])
  );
};

const main = async (): Promise<void> => {
  await connectDB();
  const currentContractBase = {
    status: "analyzed" as const,
    rawText: { $type: "string" as const, $ne: "" },
    "analysis.conceptFindings.0": { $exists: true },
    "analysis.curriculumVersion": { $type: "string" as const, $ne: "" },
    "analysis.lessonId": { $type: "string" as const, $ne: "" },
    "analysis.conceptFindings": {
      $elemMatch: { status: { $in: ["present", "partial"] } },
    },
  };
  const [
    total,
    statuses,
    subjects,
    grades,
    curriculumVersions,
    pipelineVersions,
    analyzed,
    analyzedWithText,
    analyzedWithFindings,
    analyzedWithCurriculumIdentity,
    currentContractEligible,
  ] = await Promise.all([
    Note.countDocuments(),
    groupedCounts("status"),
    groupedCounts("analysis.subject"),
    groupedCounts("analysis.gradeLevel"),
    groupedCounts("analysis.curriculumVersion"),
    groupedCounts("analysis.pipelineVersion"),
    Note.countDocuments({ status: "analyzed" }),
    Note.countDocuments({ status: "analyzed", rawText: { $type: "string", $ne: "" } }),
    Note.countDocuments({
      status: "analyzed",
      "analysis.conceptFindings.0": { $exists: true },
    }),
    Note.countDocuments({
      status: "analyzed",
      "analysis.curriculumVersion": { $type: "string", $ne: "" },
      "analysis.lessonId": { $type: "string", $ne: "" },
    }),
    Note.countDocuments(currentContractBase),
  ]);

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total,
        statuses,
        subjects,
        grades,
        curriculumVersions,
        pipelineVersions,
        gates: {
          analyzed,
          analyzedWithText,
          analyzedWithConceptFindings: analyzedWithFindings,
          analyzedWithCurriculumIdentity,
          currentContractEligible,
        },
        nextAction:
          currentContractEligible > 0
            ? "Export candidates for expert review."
            : "Process or deliberately reprocess consented notes with the current pipeline before annotation export.",
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
