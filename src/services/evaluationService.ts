// ═══════════════════════════════════════════════════════════════════════════
// Evaluation Metrics Module — Improvement 10
// ═══════════════════════════════════════════════════════════════════════════
//
// Provides quantitative evaluation metrics to measure how well the system
// is performing. Metrics are computed from:
//   - TeacherValidation records (teacher agreement rates, correction patterns)
//   - StudentProfile data (learning improvement trajectories)
//   - Note analysis results (coverage accuracy, gap relevance)
//
// These metrics allow the research group to evaluate the framework against
// standard educational AI benchmarks.
//
// Metrics computed:
//   1. Subject Detection Accuracy       — % teacher-approved subject identifications
//   2. Lesson Match Accuracy            — % teacher-approved lesson matches
//   3. Coverage Score Agreement         — % teacher-approved coverage scores
//   4. Gap Relevance Rate               — % gaps teacher found educationally relevant
//   5. Analysis Quality Distribution    — distribution of 1–5 star ratings
//   6. Improvement Rate                 — % of students showing improving trend
//   7. Persistent Gap Detection Rate    — % persistent gaps caught by system
// ═══════════════════════════════════════════════════════════════════════════

import { TeacherValidation } from "../models/TeacherValidation";
import { StudentProfile } from "../models/StudentProfile";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EvaluationMetrics {
  /** Date range of the evaluation */
  period: { from: Date; to: Date };

  /** Number of teacher validations included in this report */
  totalValidations: number;

  /** Teacher accuracy agreements */
  accuracy: {
    /** % of validations where teacher approved subject detection */
    subjectDetectionAccuracy: number | null;
    /** % of validations where teacher approved lesson match */
    lessonMatchAccuracy: number | null;
    /** % of validations where teacher agreed coverage score was accurate */
    coverageScoreAgreementRate: number | null;
    /** % of validations where teacher found gaps educationally relevant */
    gapRelevanceRate: number | null;
    /** Overall system approval rate (teacher clicked "approve") */
    overallApprovalRate: number | null;
  };

  /** Granular concept-level teacher verification metrics */
  conceptLevelMetrics: {
    totalConceptReviews: number;
    conceptAgreementRate: number | null;
    falsePositiveCount: number;
    falseNegativeCount: number;
  };

  /** Explainability & Trust Evaluation (5-point Likert Scale) */
  explainabilityScores: {
    averageExplanationClarity: number | null;
    averageTextbookEvidenceTrust: number | null;
    averageRemediationUsefulness: number | null;
    averagePerceivedAccuracy: number | null;
  };

  /** Analysis quality distribution (1–5 star ratings) */
  qualityDistribution: {
    rating1: number;
    rating2: number;
    rating3: number;
    rating4: number;
    rating5: number;
    averageRating: number | null;
  };

  /** Common correction patterns (what teachers most often correct) */
  commonCorrectionFields: Array<{
    field: string;
    count: number;
    percentage: number;
  }>;

  /** Number of gaps teachers had to add that the system missed */
  teacherAddedGapsTotal: number;

  /** Student learning progress */
  learningProgress: {
    /** Total students with a profile */
    totalStudents: number;
    /** % of students showing "improving" trend in at least one subject */
    improvingStudentRate: number | null;
    /** Average number of persistent gaps per student */
    averagePersistentGaps: number | null;
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const safePercentage = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100 * 10) / 10; // 1 decimal place
};

// ─── Main Evaluation Function ──────────────────────────────────────────────

/**
 * Computes evaluation metrics from teacher validations and student profiles
 * within the specified date range.
 *
 * @param fromDate - Start of evaluation period (default: 30 days ago)
 * @param toDate   - End of evaluation period (default: now)
 */
export const computeEvaluationMetrics = async (
  fromDate?: Date,
  toDate?: Date
): Promise<EvaluationMetrics> => {
  const to = toDate ?? new Date();
  const from = fromDate ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  // ── Fetch teacher validations in range ────────────────────────────────
  const validations = await TeacherValidation.find({
    createdAt: { $gte: from, $lte: to },
  }).lean();

  const total = validations.length;

  // ── Accuracy metrics ──────────────────────────────────────────────────
  const withSubjectFeedback = validations.filter((v) => v.subjectCorrect !== undefined);
  const withLessonFeedback = validations.filter((v) => v.lessonCorrect !== undefined);
  const withCoverageFeedback = validations.filter((v) => v.coverageScoreAccurate !== undefined);
  const withGapFeedback = validations.filter((v) => v.gapsRelevant !== undefined);
  const approved = validations.filter((v) => v.status === "approved");

  const subjectDetectionAccuracy = safePercentage(
    withSubjectFeedback.filter((v) => v.subjectCorrect === true).length,
    withSubjectFeedback.length
  );

  const lessonMatchAccuracy = safePercentage(
    withLessonFeedback.filter((v) => v.lessonCorrect === true).length,
    withLessonFeedback.length
  );

  const coverageScoreAgreementRate = safePercentage(
    withCoverageFeedback.filter((v) => v.coverageScoreAccurate === true).length,
    withCoverageFeedback.length
  );

  const gapRelevanceRate = safePercentage(
    withGapFeedback.filter((v) => v.gapsRelevant === true).length,
    withGapFeedback.length
  );

  const overallApprovalRate = safePercentage(approved.length, total);

  // ── Granular concept-level reviews ───────────────────────────────────
  let totalConceptReviews = 0;
  let agreedConceptReviews = 0;
  let falsePositiveCount = 0;
  let falseNegativeCount = 0;

  for (const v of validations) {
    if (v.conceptReviews && v.conceptReviews.length > 0) {
      for (const cr of v.conceptReviews) {
        totalConceptReviews++;
        if (cr.agreement) {
          agreedConceptReviews++;
        } else {
          if (cr.systemFound && cr.teacherVerdict === "missing") {
            falsePositiveCount++;
          } else if (!cr.systemFound && cr.teacherVerdict === "present") {
            falseNegativeCount++;
          }
        }
      }
    }
  }

  const conceptAgreementRate = safePercentage(agreedConceptReviews, totalConceptReviews);

  // ── Explainability survey metrics ─────────────────────────────────────
  const withSurvey = validations.filter((v) => v.explainabilitySurvey);
  const avgSurvey = (field: "explanationClarity" | "textbookEvidenceTrust" | "remediationUsefulness" | "overallPerceivedAccuracy"): number | null => {
    const validScores = withSurvey
      .map((v) => v.explainabilitySurvey?.[field])
      .filter((s): s is number => typeof s === "number");
    if (validScores.length === 0) return null;
    return Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 10) / 10;
  };

  const explainabilityScores = {
    averageExplanationClarity: avgSurvey("explanationClarity"),
    averageTextbookEvidenceTrust: avgSurvey("textbookEvidenceTrust"),
    averageRemediationUsefulness: avgSurvey("remediationUsefulness"),
    averagePerceivedAccuracy: avgSurvey("overallPerceivedAccuracy"),
  };

  // ── Quality distribution ──────────────────────────────────────────────
  const withRating = validations.filter((v) => v.analysisQualityRating !== undefined);
  const ratings = {
    rating1: withRating.filter((v) => v.analysisQualityRating === 1).length,
    rating2: withRating.filter((v) => v.analysisQualityRating === 2).length,
    rating3: withRating.filter((v) => v.analysisQualityRating === 3).length,
    rating4: withRating.filter((v) => v.analysisQualityRating === 4).length,
    rating5: withRating.filter((v) => v.analysisQualityRating === 5).length,
  };
  const sumRatings = withRating.reduce((sum, v) => sum + (v.analysisQualityRating ?? 0), 0);
  const averageRating = withRating.length > 0
    ? Math.round((sumRatings / withRating.length) * 10) / 10
    : null;

  // ── Common correction fields ──────────────────────────────────────────
  const correctionCounts = new Map<string, number>();
  let totalCorrections = 0;

  for (const v of validations) {
    for (const c of v.corrections) {
      correctionCounts.set(c.field, (correctionCounts.get(c.field) ?? 0) + 1);
      totalCorrections++;
    }
  }

  const commonCorrectionFields = [...correctionCounts.entries()]
    .map(([field, count]) => ({
      field,
      count,
      percentage: Math.round((count / Math.max(1, totalCorrections)) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  // ── Teacher-added gaps ────────────────────────────────────────────────
  const teacherAddedGapsTotal = validations.reduce(
    (sum, v) => sum + (v.teacherAddedGaps?.length ?? 0),
    0
  );

  // ── Student learning progress ─────────────────────────────────────────
  const allProfiles = await StudentProfile.find({}).lean();
  const totalStudents = allProfiles.length;

  const improvingStudents = allProfiles.filter((p) =>
    (p.subjectMastery ?? []).some((s) => s.trend === "improving")
  ).length;

  const improvingStudentRate = safePercentage(improvingStudents, totalStudents);

  const totalPersistentGaps = allProfiles.reduce(
    (sum, p) => sum + (p.conceptPerformance ?? []).filter((c) => c.isPersistentSupportNeed).length,
    0
  );

  const averagePersistentGaps =
    totalStudents > 0
      ? Math.round((totalPersistentGaps / totalStudents) * 10) / 10
      : null;

  return {
    period: { from, to },
    totalValidations: total,
    accuracy: {
      subjectDetectionAccuracy,
      lessonMatchAccuracy,
      coverageScoreAgreementRate,
      gapRelevanceRate,
      overallApprovalRate,
    },
    conceptLevelMetrics: {
      totalConceptReviews,
      conceptAgreementRate,
      falsePositiveCount,
      falseNegativeCount,
    },
    explainabilityScores,
    qualityDistribution: {
      ...ratings,
      averageRating,
    },
    commonCorrectionFields,
    teacherAddedGapsTotal,
    learningProgress: {
      totalStudents,
      improvingStudentRate,
      averagePersistentGaps,
    },
  };
};
