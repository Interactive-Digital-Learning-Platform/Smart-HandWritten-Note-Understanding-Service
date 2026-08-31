import { ConceptProbabilities, ConceptStatus } from "../pipeline/types";

export const CONCEPT_CLASSIFIER_LABELS: ConceptStatus[] = [
  "present",
  "partial",
  "missing",
];

export const CONCEPT_FEATURE_TEMPLATE_VERSION = "1.0.0";

export interface ConceptTrainingRow {
  recordId: string;
  noteGroupId: string;
  subject: string;
  grade: number;
  lessonId: string;
  lessonName: string;
  language: string;
  noteScope?: string;
  ocrConfidence?: number;
  noteTextSnapshot: string;
  concept: {
    id: string;
    name: string;
    category: string;
    weight: number;
    isFrequentlyTested: boolean;
    keywords: string[];
    learningOutcomes: string[];
  };
  targetLabel: ConceptStatus;
}

export interface LinearClassifierParameters {
  weights: number[][];
  biases: number[];
}

export interface ClassificationMetrics {
  sampleCount: number;
  accuracy: number;
  balancedAccuracy: number;
  macroF1: number;
  confusionMatrix: number[][];
  perClass: Record<
    ConceptStatus,
    { support: number; precision: number; recall: number; f1: number }
  >;
}

export interface ConceptClassifierArtifact {
  artifactVersion: "1.0.0";
  modelType: "frozen_nomic_embedding_multinomial_logistic_regression";
  modelVersion: string;
  datasetVersion: string;
  datasetSha256: string;
  trainedAt: string;
  embeddingModel: string;
  embeddingDimension: number;
  featureTemplateVersion: string;
  labels: ConceptStatus[];
  parameters: LinearClassifierParameters;
  training: {
    rows: number;
    noteGroups: number;
    epochs: number;
    learningRate: number;
    l2: number;
    classWeights: Record<ConceptStatus, number>;
  };
  evaluation: {
    protocol: "leave_one_note_group_out";
    metrics: ClassificationMetrics;
    majorityBaseline: ClassificationMetrics;
  };
  deployment: {
    enabledByDefault: false;
    reason: string;
  };
}

const round = (value: number): number =>
  Math.round((Number.isFinite(value) ? value : 0) * 1_000_000) / 1_000_000;

export const buildConceptFeatureText = (row: ConceptTrainingRow): string => {
  const outcomes = row.concept.learningOutcomes.join("; ") || "none listed";
  const keywords = row.concept.keywords.join(", ") || "none listed";
  return [
    `Subject: ${row.subject}`,
    `Grade: ${row.grade}`,
    `Lesson: ${row.lessonName}`,
    `Concept: ${row.concept.name}`,
    `Concept category: ${row.concept.category}`,
    `Concept keywords: ${keywords}`,
    `Learning outcomes: ${outcomes}`,
    "Student note:",
    row.noteTextSnapshot,
  ].join("\n");
};

const softmax = (logits: number[]): number[] => {
  const maximum = Math.max(...logits);
  const exponentials = logits.map((value) => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map((value) => value / total);
};

export const predictProbabilities = (
  features: number[],
  parameters: LinearClassifierParameters
): ConceptProbabilities => {
  if (
    parameters.weights.length !== CONCEPT_CLASSIFIER_LABELS.length ||
    parameters.biases.length !== CONCEPT_CLASSIFIER_LABELS.length ||
    parameters.weights.some((weights) => weights.length !== features.length)
  ) {
    throw new Error("Classifier parameter dimensions do not match the feature vector.");
  }
  const logits = parameters.weights.map(
    (weights, classIndex) =>
      weights.reduce((sum, weight, index) => sum + weight * features[index], 0) +
      parameters.biases[classIndex]
  );
  const values = softmax(logits);
  return {
    present: values[0],
    partial: values[1],
    missing: values[2],
  };
};

export const decideConceptStatus = (
  probabilities: ConceptProbabilities
): ConceptStatus =>
  CONCEPT_CLASSIFIER_LABELS.reduce((best, label) =>
    probabilities[label] > probabilities[best] ? label : best
  );

export const computeBalancedClassWeights = (
  labels: ConceptStatus[]
): Record<ConceptStatus, number> => {
  const counts: Record<ConceptStatus, number> = {
    present: 0,
    partial: 0,
    missing: 0,
  };
  labels.forEach((label) => counts[label]++);
  for (const label of CONCEPT_CLASSIFIER_LABELS) {
    if (counts[label] === 0) {
      throw new Error(`Training data has no ${label} examples.`);
    }
  }
  return Object.fromEntries(
    CONCEPT_CLASSIFIER_LABELS.map((label) => [
      label,
      labels.length / (CONCEPT_CLASSIFIER_LABELS.length * counts[label]),
    ])
  ) as Record<ConceptStatus, number>;
};

export const trainLinearClassifier = (
  features: number[][],
  labels: ConceptStatus[],
  options: { epochs?: number; learningRate?: number; l2?: number } = {}
): { parameters: LinearClassifierParameters; classWeights: Record<ConceptStatus, number> } => {
  if (features.length === 0 || features.length !== labels.length) {
    throw new Error("Training features and labels must have the same non-zero length.");
  }
  const dimension = features[0].length;
  if (
    dimension === 0 ||
    features.some(
      (row) => row.length !== dimension || row.some((value) => !Number.isFinite(value))
    )
  ) {
    throw new Error("Training feature vectors must have consistent finite dimensions.");
  }

  const epochs = options.epochs ?? 300;
  const learningRate = options.learningRate ?? 0.08;
  const l2 = options.l2 ?? 0.002;
  const classWeights = computeBalancedClassWeights(labels);
  const weights = CONCEPT_CLASSIFIER_LABELS.map(() => Array(dimension).fill(0));
  const biases = CONCEPT_CLASSIFIER_LABELS.map(() => 0);
  const labelIndexes = labels.map((label) => CONCEPT_CLASSIFIER_LABELS.indexOf(label));
  const totalExampleWeight = labels.reduce(
    (sum, label) => sum + classWeights[label],
    0
  );

  for (let epoch = 0; epoch < epochs; epoch++) {
    const weightGradients = CONCEPT_CLASSIFIER_LABELS.map(() =>
      Array(dimension).fill(0)
    );
    const biasGradients = CONCEPT_CLASSIFIER_LABELS.map(() => 0);

    for (let rowIndex = 0; rowIndex < features.length; rowIndex++) {
      const row = features[rowIndex];
      const logits = weights.map(
        (classWeightsVector, classIndex) =>
          classWeightsVector.reduce(
            (sum, weight, featureIndex) => sum + weight * row[featureIndex],
            0
          ) + biases[classIndex]
      );
      const probabilities = softmax(logits);
      const exampleWeight = classWeights[labels[rowIndex]];

      for (let classIndex = 0; classIndex < CONCEPT_CLASSIFIER_LABELS.length; classIndex++) {
        const error =
          (probabilities[classIndex] - (labelIndexes[rowIndex] === classIndex ? 1 : 0)) *
          exampleWeight;
        biasGradients[classIndex] += error;
        for (let featureIndex = 0; featureIndex < dimension; featureIndex++) {
          weightGradients[classIndex][featureIndex] += error * row[featureIndex];
        }
      }
    }

    const decayedRate = learningRate / Math.sqrt(1 + epoch * 0.01);
    for (let classIndex = 0; classIndex < CONCEPT_CLASSIFIER_LABELS.length; classIndex++) {
      biases[classIndex] -=
        decayedRate * (biasGradients[classIndex] / totalExampleWeight);
      for (let featureIndex = 0; featureIndex < dimension; featureIndex++) {
        const gradient =
          weightGradients[classIndex][featureIndex] / totalExampleWeight +
          l2 * weights[classIndex][featureIndex];
        weights[classIndex][featureIndex] -= decayedRate * gradient;
      }
    }
  }

  return { parameters: { weights, biases }, classWeights };
};

export const evaluateClassifications = (
  actual: ConceptStatus[],
  predicted: ConceptStatus[]
): ClassificationMetrics => {
  if (actual.length === 0 || actual.length !== predicted.length) {
    throw new Error("Actual and predicted labels must have the same non-zero length.");
  }
  const confusionMatrix = CONCEPT_CLASSIFIER_LABELS.map(() =>
    CONCEPT_CLASSIFIER_LABELS.map(() => 0)
  );
  actual.forEach((label, index) => {
    confusionMatrix[CONCEPT_CLASSIFIER_LABELS.indexOf(label)][
      CONCEPT_CLASSIFIER_LABELS.indexOf(predicted[index])
    ]++;
  });

  const perClass = {} as ClassificationMetrics["perClass"];
  for (let index = 0; index < CONCEPT_CLASSIFIER_LABELS.length; index++) {
    const label = CONCEPT_CLASSIFIER_LABELS[index];
    const truePositive = confusionMatrix[index][index];
    const support = confusionMatrix[index].reduce((sum, count) => sum + count, 0);
    const predictedCount = confusionMatrix.reduce(
      (sum, row) => sum + row[index],
      0
    );
    const precision = predictedCount ? truePositive / predictedCount : 0;
    const recall = support ? truePositive / support : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    perClass[label] = {
      support,
      precision: round(precision),
      recall: round(recall),
      f1: round(f1),
    };
  }

  const correct = confusionMatrix.reduce(
    (sum, row, index) => sum + row[index],
    0
  );
  return {
    sampleCount: actual.length,
    accuracy: round(correct / actual.length),
    balancedAccuracy: round(
      CONCEPT_CLASSIFIER_LABELS.reduce(
        (sum, label) => sum + perClass[label].recall,
        0
      ) / CONCEPT_CLASSIFIER_LABELS.length
    ),
    macroF1: round(
      CONCEPT_CLASSIFIER_LABELS.reduce(
        (sum, label) => sum + perClass[label].f1,
        0
      ) / CONCEPT_CLASSIFIER_LABELS.length
    ),
    confusionMatrix,
    perClass,
  };
};
