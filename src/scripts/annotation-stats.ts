import fs from "node:fs";
import path from "node:path";
import { connectDB, disconnectDB } from "../config/database";
import { ConceptAnnotation } from "../models/ConceptAnnotation";

const readArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const groupCounts = async (field: string): Promise<Record<string, number>> => {
  const rows = await ConceptAnnotation.aggregate<{ _id: string; count: number }>([
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return Object.fromEntries(rows.map((row) => [row._id || "Unknown", row.count]));
};

const main = async (): Promise<void> => {
  await connectDB();
  const [
    total,
    usedForTraining,
    verdicts,
    systemPredictions,
    subjects,
    languages,
    labelQuality,
    curriculumVersions,
    agreementRows,
    confusionRows,
  ] = await Promise.all([
    ConceptAnnotation.countDocuments(),
    ConceptAnnotation.countDocuments({ usedForTraining: true }),
    groupCounts("reviewerVerdict"),
    groupCounts("systemPrediction.status"),
    groupCounts("subject"),
    groupCounts("language"),
    groupCounts("labelQuality"),
    groupCounts("curriculumVersion"),
    ConceptAnnotation.aggregate<{ total: number; agreements: number }>([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          agreements: {
            $sum: {
              $cond: [
                { $eq: ["$reviewerVerdict", "$systemPrediction.status"] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    ConceptAnnotation.aggregate<{
      _id: { predicted: string; reviewed: string };
      count: number;
    }>([
      {
        $group: {
          _id: {
            predicted: "$systemPrediction.status",
            reviewed: "$reviewerVerdict",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.predicted": 1, "_id.reviewed": 1 } },
    ]),
  ]);

  const agreement = agreementRows[0] ?? { total: 0, agreements: 0 };
  const classCounts = ["present", "partial", "missing"].map(
    (status) => verdicts[status] ?? 0
  );
  const nonZeroClassCounts = classCounts.filter((count) => count > 0);

  const report = {
    generatedAt: new Date().toISOString(),
    total,
    availableForNextDataset: total - usedForTraining,
    usedForTraining,
    verdicts,
    systemPredictions,
    subjects,
    languages,
    labelQuality,
    curriculumVersions,
    quality: {
      systemReviewerExactAgreement:
        agreement.total > 0
          ? Number((agreement.agreements / agreement.total).toFixed(4))
          : null,
      agreementSampleCount: agreement.total,
      confusionMatrix: confusionRows.map((row) => ({
        predicted: row._id.predicted,
        reviewed: row._id.reviewed,
        count: row.count,
      })),
      smallestClassCount: Math.min(...classCounts),
      largestToSmallestNonZeroClassRatio:
        nonZeroClassCounts.length === 3
          ? Number(
              (
                Math.max(...nonZeroClassCounts) /
                Math.min(...nonZeroClassCounts)
              ).toFixed(2)
            )
          : null,
      missingClasses: ["present", "partial", "missing"].filter(
        (status) => (verdicts[status] ?? 0) === 0
      ),
    },
    interpretation:
      "Agreement is descriptive only; candidate exports can be review-biased and are not a held-out evaluation set.",
  };
  const output = readArg("--output");
  if (output) {
    const outputPath = path.resolve(output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`Annotation statistics written to ${outputPath}`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
