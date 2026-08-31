import assert from "node:assert/strict";
import test from "node:test";
import {
  computeBalancedClassWeights,
  decideConceptStatus,
  evaluateClassifications,
  predictProbabilities,
  trainLinearClassifier,
} from "./conceptClassifier";

test("balanced class weights give minority classes more influence", () => {
  const weights = computeBalancedClassWeights([
    "missing",
    "missing",
    "missing",
    "partial",
    "present",
  ]);
  assert.ok(weights.present > weights.missing);
  assert.ok(weights.partial > weights.missing);
});

test("linear classifier learns a separable three-class problem", () => {
  const features = [
    [1, 0, 0],
    [0.9, 0.1, 0],
    [0, 1, 0],
    [0.1, 0.9, 0],
    [0, 0, 1],
    [0, 0.1, 0.9],
  ];
  const labels = [
    "present",
    "present",
    "partial",
    "partial",
    "missing",
    "missing",
  ] as const;
  const { parameters } = trainLinearClassifier(features, [...labels], {
    epochs: 250,
    learningRate: 0.2,
    l2: 0.001,
  });
  const predicted = features.map((row) =>
    decideConceptStatus(predictProbabilities(row, parameters))
  );
  assert.deepEqual(predicted, [...labels]);
});

test("classification metrics use explicit present, partial, missing order", () => {
  const metrics = evaluateClassifications(
    ["present", "partial", "missing", "missing"],
    ["present", "missing", "missing", "partial"]
  );
  assert.equal(metrics.accuracy, 0.5);
  assert.deepEqual(metrics.confusionMatrix, [
    [1, 0, 0],
    [0, 0, 1],
    [0, 1, 1],
  ]);
});
