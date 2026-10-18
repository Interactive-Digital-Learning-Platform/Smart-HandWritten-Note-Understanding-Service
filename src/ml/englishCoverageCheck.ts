import { CoveragePrediction } from "../services/englishCoverageService";

export interface EnglishCoverageCheck {
  state: "ready" | "skipped" | "unavailable";
  reason?: "disabled" | "language" | "ocr_quality" | "lesson_scope" | "unsupported_concepts" | "runtime";
  modelVersion?: string;
  modelSha256?: string;
  textSha256?: string;
  lessonId?: string;
  checkedAt: Date;
  reviewRequired: true;
  suggestions: Array<{ conceptId:string; modelConceptId:string; conceptName:string; prediction:CoveragePrediction }>;
}
