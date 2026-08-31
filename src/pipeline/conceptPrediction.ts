import {
  ConceptProbabilities,
  ConceptStatus,
} from "./types";

export const clampProbability = (value: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export const statusToLegacyFound = (status: ConceptStatus): boolean =>
  status !== "missing";

export const conceptCoverageValue = (status: ConceptStatus): number => {
  if (status === "present") return 1;
  if (status === "partial") return 0.5;
  return 0;
};

export const determineOutcomeStatus = (
  coverageEquivalent: number,
  totalCount: number
): "achieved" | "partially_achieved" | "not_achieved" => {
  if (totalCount === 0) return "achieved";
  const ratio = coverageEquivalent / totalCount;
  if (ratio >= 0.8) return "achieved";
  if (ratio >= 0.4) return "partially_achieved";
  return "not_achieved";
};

export const probabilitiesForDecision = (
  status: ConceptStatus,
  confidence: number
): ConceptProbabilities => {
  // Until a calibrated model supplies real probabilities, keep the decided
  // class at least tied for the maximum while retaining low confidence in the
  // separate decisionConfidence field.
  const selected = Math.max(1 / 3, clampProbability(confidence));
  const remainder = (1 - selected) / 2;
  return {
    present: status === "present" ? selected : remainder,
    partial: status === "partial" ? selected : remainder,
    missing: status === "missing" ? selected : remainder,
  };
};

export const normalizeConceptStatus = (finding: {
  status?: ConceptStatus | null;
  found?: boolean | null;
}): ConceptStatus => {
  if (
    finding.status === "present" ||
    finding.status === "partial" ||
    finding.status === "missing"
  ) {
    return finding.status;
  }
  return finding.found ? "present" : "missing";
};

export const shouldReviewConcept = (
  status: ConceptStatus,
  confidence: number,
  lowQualityInput = false
): boolean =>
  status === "partial" || clampProbability(confidence) < 0.7 || lowQualityInput;
