import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config/config";
import {
  CONCEPT_CLASSIFIER_LABELS,
  CONCEPT_FEATURE_TEMPLATE_VERSION,
  ConceptClassifierArtifact,
  ConceptTrainingRow,
  buildConceptFeatureText,
  decideConceptStatus,
  evaluateClassifications,
  predictProbabilities,
  trainLinearClassifier,
} from "../ml/conceptClassifier";
import { ConceptStatus } from "../pipeline/types";
import { embeddingService } from "../services/embeddingService";

interface DatasetManifest {
  datasetVersion: string;
  sha256: string;
  recordCount: number;
}

interface EmbeddingCache {
  datasetSha256: string;
  embeddingModel: string;
  embeddingDimension: number;
  embeddingMaxTokens: number;
  featureTemplateVersion: string;
  recordIds: string[];
  vectors: number[][];
}

const readArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

const parsePositiveNumber = (name: string, fallback: number): number => {
  const raw = readArg(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const readDataset = (
  datasetPath: string
): { rows: ConceptTrainingRow[]; manifest: DatasetManifest } => {
  const manifestPath = `${datasetPath}.manifest.json`;
  if (!fs.existsSync(datasetPath) || !fs.existsSync(manifestPath)) {
    throw new Error("Dataset JSONL and its manifest must both exist");
  }
  const jsonl = fs.readFileSync(datasetPath, "utf8");
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8")
  ) as DatasetManifest;
  if (sha256(jsonl) !== manifest.sha256) {
    throw new Error("Dataset SHA-256 does not match its immutable manifest");
  }
  const rows = jsonl
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as ConceptTrainingRow;
      } catch {
        throw new Error(`Invalid JSON on dataset line ${index + 1}`);
      }
    });
  if (rows.length !== manifest.recordCount) {
    throw new Error(
      `Manifest declares ${manifest.recordCount} rows but dataset has ${rows.length}`
    );
  }
  if (
    rows.some(
      (row) =>
        !row.recordId ||
        !row.noteGroupId ||
        (row.evaluationGroupId !== undefined && !row.evaluationGroupId) ||
        !row.noteTextSnapshot ||
        !row.concept?.id ||
        !CONCEPT_CLASSIFIER_LABELS.includes(row.targetLabel)
    )
  ) {
    throw new Error("Dataset contains an incomplete or invalid training row");
  }
  return { rows, manifest };
};

const readValidEmbeddingCache = (
  cachePath: string,
  rows: ConceptTrainingRow[],
  datasetSha256: string
): number[][] | undefined => {
  if (!fs.existsSync(cachePath)) return undefined;
  const cache = JSON.parse(fs.readFileSync(cachePath, "utf8")) as EmbeddingCache;
  const valid =
    cache.datasetSha256 === datasetSha256 &&
    cache.embeddingModel === config.embedding.model &&
    cache.embeddingDimension === config.embedding.expectedDimension &&
    cache.embeddingMaxTokens === config.embedding.maxTokens &&
    cache.featureTemplateVersion === CONCEPT_FEATURE_TEMPLATE_VERSION &&
    cache.recordIds.length === rows.length &&
    cache.recordIds.every((id, index) => id === rows[index].recordId) &&
    cache.vectors.length === rows.length &&
    cache.vectors.every(
      (vector) =>
        vector.length === config.embedding.expectedDimension &&
        vector.every(Number.isFinite)
    );
  return valid ? cache.vectors : undefined;
};

const embedRows = async (
  rows: ConceptTrainingRow[],
  cachePath: string,
  datasetSha256: string,
  batchSize: number
): Promise<number[][]> => {
  const cached = readValidEmbeddingCache(cachePath, rows, datasetSha256);
  if (cached) {
    console.log(`Using verified embedding cache: ${cachePath}`);
    return cached;
  }

  const vectors: number[][] = [];
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const embedded = await embeddingService.embedClassificationBatch(
      batch.map(buildConceptFeatureText)
    );
    vectors.push(...embedded);
    console.log(`Embedded ${vectors.length}/${rows.length} training rows`);
  }

  const cache: EmbeddingCache = {
    datasetSha256,
    embeddingModel: config.embedding.model,
    embeddingDimension: config.embedding.expectedDimension,
    embeddingMaxTokens: config.embedding.maxTokens,
    featureTemplateVersion: CONCEPT_FEATURE_TEMPLATE_VERSION,
    recordIds: rows.map((row) => row.recordId),
    vectors,
  };
  fs.writeFileSync(cachePath, JSON.stringify(cache), "utf8");
  return vectors;
};

const main = async (): Promise<void> => {
  const datasetArgument = readArg("--dataset");
  if (!datasetArgument) {
    throw new Error("--dataset is required and must point to a released JSONL snapshot");
  }
  const datasetPath = path.resolve(datasetArgument);
  const { rows, manifest } = readDataset(datasetPath);
  const modelVersion =
    readArg("--model-version") || `${manifest.datasetVersion}-nomic-linear-v1`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,119}$/.test(modelVersion)) {
    throw new Error("--model-version has an invalid format");
  }

  const epochs = Math.floor(parsePositiveNumber("--epochs", 300));
  const learningRate = parsePositiveNumber("--learning-rate", 0.08);
  const l2 = parsePositiveNumber("--l2", 0.002);
  const batchSize = Math.floor(parsePositiveNumber("--embedding-batch-size", 8));
  const outputPath = path.resolve(
    readArg("--output") ||
      path.join("data", "models", "concept-classifier", modelVersion, "model.json")
  );
  if (fs.existsSync(outputPath) && !hasFlag("--force")) {
    throw new Error("Model output already exists; choose a new version or pass --force");
  }

  const cachePath = `${datasetPath}.${config.embedding.model
    .replace(/[^a-zA-Z0-9._-]+/g, "-")}.features.json`;
  const features = await embedRows(rows, cachePath, manifest.sha256, batchSize);
  const labels = rows.map((row) => row.targetLabel);
  const evaluationGroupFor = (row: ConceptTrainingRow): string =>
    row.evaluationGroupId || row.noteGroupId;
  const evaluationGroups = [...new Set(rows.map(evaluationGroupFor))].sort();
  if (evaluationGroups.length < 5) {
    throw new Error(
      "At least five independent evaluation groups are required for grouped evaluation"
    );
  }

  const outOfFoldPredictions: ConceptStatus[] = Array(rows.length).fill("missing");
  const majorityPredictions: ConceptStatus[] = Array(rows.length).fill("missing");
  for (const heldOutGroup of evaluationGroups) {
    const trainingIndexes = rows
      .map((row, index) => (evaluationGroupFor(row) !== heldOutGroup ? index : -1))
      .filter((index) => index >= 0);
    const testingIndexes = rows
      .map((row, index) => (evaluationGroupFor(row) === heldOutGroup ? index : -1))
      .filter((index) => index >= 0);
    const foldLabels = trainingIndexes.map((index) => labels[index]);
    const trained = trainLinearClassifier(
      trainingIndexes.map((index) => features[index]),
      foldLabels,
      { epochs, learningRate, l2 }
    );
    const counts = Object.fromEntries(
      CONCEPT_CLASSIFIER_LABELS.map((label) => [
        label,
        foldLabels.filter((candidate) => candidate === label).length,
      ])
    ) as Record<ConceptStatus, number>;
    const foldMajority = CONCEPT_CLASSIFIER_LABELS.reduce((best, label) =>
      counts[label] > counts[best] ? label : best
    );
    for (const index of testingIndexes) {
      outOfFoldPredictions[index] = decideConceptStatus(
        predictProbabilities(features[index], trained.parameters)
      );
      majorityPredictions[index] = foldMajority;
    }
    console.log(
      `Evaluated held-out evaluation group ${
        evaluationGroups.indexOf(heldOutGroup) + 1
      }/${evaluationGroups.length}`
    );
  }

  const evaluationMetrics = evaluateClassifications(labels, outOfFoldPredictions);
  const majorityBaseline = evaluateClassifications(labels, majorityPredictions);
  let fixedSplits: ConceptClassifierArtifact["evaluation"]["fixedSplits"];
  const hasFixedSplits = rows.every((row) => row.preassignedSplit !== undefined);
  if (hasFixedSplits) {
    const trainingIndexes = rows
      .map((row, index) => (row.preassignedSplit === "train" ? index : -1))
      .filter((index) => index >= 0);
    const fixedTrainingLabels = trainingIndexes.map((index) => labels[index]);
    const trained = trainLinearClassifier(
      trainingIndexes.map((index) => features[index]),
      fixedTrainingLabels,
      { epochs, learningRate, l2 }
    );
    const counts = Object.fromEntries(
      CONCEPT_CLASSIFIER_LABELS.map((label) => [
        label,
        fixedTrainingLabels.filter((candidate) => candidate === label).length,
      ])
    ) as Record<ConceptStatus, number>;
    const trainingMajority = CONCEPT_CLASSIFIER_LABELS.reduce((best, label) =>
      counts[label] > counts[best] ? label : best
    );
    fixedSplits = Object.fromEntries(
      (["validation", "test"] as const).map((split) => {
        const indexes = rows
          .map((row, index) => (row.preassignedSplit === split ? index : -1))
          .filter((index) => index >= 0);
        if (indexes.length === 0) {
          throw new Error(`Preassigned ${split} split is empty`);
        }
        const actual = indexes.map((index) => labels[index]);
        const predicted = indexes.map((index) =>
          decideConceptStatus(predictProbabilities(features[index], trained.parameters))
        );
        return [
          split,
          {
            metrics: evaluateClassifications(actual, predicted),
            majorityBaseline: evaluateClassifications(
              actual,
              actual.map(() => trainingMajority)
            ),
          },
        ];
      })
    ) as NonNullable<ConceptClassifierArtifact["evaluation"]["fixedSplits"]>;
  }
  const finalModel = trainLinearClassifier(features, labels, {
    epochs,
    learningRate,
    l2,
  });
  const artifact: ConceptClassifierArtifact = {
    artifactVersion: "1.0.0",
    modelType: "frozen_nomic_embedding_multinomial_logistic_regression",
    modelVersion,
    datasetVersion: manifest.datasetVersion,
    datasetSha256: manifest.sha256,
    trainedAt: new Date().toISOString(),
    embeddingModel: config.embedding.model,
    embeddingDimension: config.embedding.expectedDimension,
    embeddingMaxTokens: config.embedding.maxTokens,
    featureTemplateVersion: CONCEPT_FEATURE_TEMPLATE_VERSION,
    labels: [...CONCEPT_CLASSIFIER_LABELS],
    parameters: finalModel.parameters,
    training: {
      rows: rows.length,
      noteGroups: evaluationGroups.length,
      sourceNotes: new Set(rows.map((row) => row.noteGroupId)).size,
      epochs,
      learningRate,
      l2,
      classWeights: finalModel.classWeights,
    },
    evaluation: {
      protocol: "leave_one_evaluation_group_out",
      metrics: evaluationMetrics,
      majorityBaseline,
      ...(fixedSplits ? { fixedSplits } : {}),
    },
    deployment: {
      enabledByDefault: false,
      reason:
        "Experimental baseline: synthetic AI-reviewed labels without independent human certification; disabled pending real-note validation.",
    },
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        modelVersion,
        datasetVersion: manifest.datasetVersion,
        rows: rows.length,
        evaluationGroups: evaluationGroups.length,
        sourceNotes: new Set(rows.map((row) => row.noteGroupId)).size,
        evaluation: evaluationMetrics,
        majorityBaseline,
        fixedSplits,
        enabledByDefault: false,
        output: outputPath,
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
