// Calculates evaluation metrics from teacher feedback and student profiles.

import { TeacherValidation } from "../models/TeacherValidation";
import { StudentProfile } from "../models/StudentProfile";

// Evaluation result.

export interface EvaluationMetrics {
  /** Report date range. */
  period: { from: Date; to: Date };

  /** Number of teacher reviews. */
  totalValidations: number;

  /** Teacher agreement rates. */
  accuracy: {
    /** Approved subject matches. */
    subjectDetectionAccuracy: number | null;
    /** Approved lesson matches. */
    lessonMatchAccuracy: number | null;
    /** Approved coverage scores. */
    coverageScoreAgreementRate: number | null;
    /** Gaps marked as relevant. */
    gapRelevanceRate: number | null;
    /** Overall approval rate. */
    overallApprovalRate: number | null;
  };

  /** Concept review totals. */
  conceptLevelMetrics: {
    totalConceptReviews: number;
    conceptAgreementRate: number | null;
    falsePositiveCount: number;
    falseNegativeCount: number;
    partialMismatchCount: number;
  };

  /** Explainability survey scores. */
  explainabilityScores: {
    averageExplanationClarity: number | null;
    averageTextbookEvidenceTrust: number | null;
    averageRemediationUsefulness: number | null;
    averagePerceivedAccuracy: number | null;
  };

  /** Analysis ratings from 1 to 5. */
  qualityDistribution: {
    rating1: number;
    rating2: number;
    rating3: number;
    rating4: number;
    rating5: number;
    averageRating: number | null;
  };

  /** Fields teachers corrected most often. */
  commonCorrectionFields: Array<{
    field: string;
    count: number;
    percentage: number;
  }>;

  /** Gaps added by teachers. */
  teacherAddedGapsTotal: number;

  /** Student progress. */
  learningProgress: {
    /** Students with a profile. */
    totalStudents: number;
    /** Students improving in at least one subject. */
    improvingStudentRate: number | null;
    /** Average persistent gaps per student. */
    averagePersistentGaps: number | null;
  };
}

// Rounds a percentage value.

const safePercentage = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100 * 10) / 10; // 1 decimal place
};

// Calculates metrics for the selected date range.
export const computeEvaluationMetrics = async (
  fromDate?: Date,
  toDate?: Date
): Promise<EvaluationMetrics> => {
  const to = toDate ?? new Date();
  const from = fromDate ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get teacher reviews in the date range.
  const validations = await TeacherValidation.find({
    createdAt: { $gte: from, $lte: to },
  }).lean();

  const total = validations.length;

  // Calculate agreement rates.
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

  // Count concept reviews.
  let totalConceptReviews = 0;
  let agreedConceptReviews = 0;
  let falsePositiveCount = 0;
  let falseNegativeCount = 0;
  let partialMismatchCount = 0;

  for (const v of validations) {
    if (v.conceptReviews && v.conceptReviews.length > 0) {
      for (const cr of v.conceptReviews) {
        totalConceptReviews++;
        const systemStatus =
          cr.systemStatus ?? (cr.systemFound ? "present" : "missing");
        if (systemStatus === cr.teacherVerdict) {
          agreedConceptReviews++;
        } else {
          if (systemStatus === "present" && cr.teacherVerdict === "missing") {
            falsePositiveCount++;
          } else if (systemStatus === "missing" && cr.teacherVerdict === "present") {
            falseNegativeCount++;
          }
          if (
            systemStatus === "partial" ||
            cr.teacherVerdict === "partial"
          ) {
            partialMismatchCount++;
          }
        }
      }
    }
  }

  const conceptAgreementRate = safePercentage(agreedConceptReviews, totalConceptReviews);

  // Calculate survey scores.
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

  // Count analysis ratings.
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

  // Count corrected fields.
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

  // Count gaps added by teachers.
  const teacherAddedGapsTotal = validations.reduce(
    (sum, v) => sum + (v.teacherAddedGaps?.length ?? 0),
    0
  );

  // Calculate student progress.
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
      partialMismatchCount,
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
