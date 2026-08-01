// ═══════════════════════════════════════════════════════════════════════════
// Student Profile Service — Improvement 7
// ═══════════════════════════════════════════════════════════════════════════
//
// Provides functions to create, read, and update StudentProfile documents
// after each note analysis. Called by processingService after the pipeline
// completes.
//
// Key operations:
//   - updateProfileFromAnalysis() — update all tracking after a note is analyzed
//   - getProfile()               — fetch profile (creates if not exists)
//   - getPersistentGaps()        — return concepts missed 2+ times
//   - getSubjectMastery()        — return subject-level performance summary
// ═══════════════════════════════════════════════════════════════════════════

import {
  StudentProfile,
  IStudentProfile,
  IConceptPerformance,
  ISubjectMastery,
} from "../models/StudentProfile";
import { PipelineContext } from "../pipeline/types";

// ─── Trend Calculation ─────────────────────────────────────────────────────

/**
 * Computes whether the student's performance is improving, stable,
 * or declining based on the last 5 scores.
 */
const calculateTrend = (
  scores: number[]
): "improving" | "stable" | "declining" => {
  if (scores.length < 3) return "stable";

  const recent = scores.slice(-3);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const delta = last - first;

  if (delta >= 10) return "improving";
  if (delta <= -10) return "declining";
  return "stable";
};

// ─── Upsert concept performance ────────────────────────────────────────────

/**
 * Updates or inserts a concept performance record in the profile.
 */
const upsertConceptPerformance = (
  existing: IConceptPerformance[],
  conceptId: string,
  conceptName: string,
  subjectName: string,
  lessonId: string,
  weight: number,
  found: boolean
): IConceptPerformance[] => {
  const idx = existing.findIndex((c) => c.conceptId === conceptId);

  if (idx === -1) {
    // New concept — insert
    existing.push({
      conceptId,
      conceptName,
      subjectName,
      lessonId,
      weight,
      timesFound: found ? 1 : 0,
      timesMissed: found ? 0 : 1,
      lastSeen: new Date(),
      isPersistentGap: false,
    });
  } else {
    // Existing — update
    if (found) {
      existing[idx].timesFound += 1;
    } else {
      existing[idx].timesMissed += 1;
    }
    existing[idx].lastSeen = new Date();
    // Mark as persistent gap if missed 2+ times
    existing[idx].isPersistentGap = existing[idx].timesMissed >= 2;
  }

  return existing;
};

// ─── Upsert subject mastery ────────────────────────────────────────────────

/**
 * Updates or inserts a subject mastery record in the profile.
 */
const upsertSubjectMastery = (
  existing: ISubjectMastery[],
  subjectName: string,
  weightedCoverage: number
): ISubjectMastery[] => {
  const idx = existing.findIndex((s) => s.subjectName === subjectName);

  if (idx === -1) {
    existing.push({
      subjectName,
      averageWeightedCoverage: weightedCoverage,
      notesAnalyzed: 1,
      notesUploaded: 1,
      trend: "stable",
      recentScores: [weightedCoverage],
      lastAnalyzedAt: new Date(),
    });
  } else {
    existing[idx].notesAnalyzed += 1;
    existing[idx].notesUploaded += 1;

    // Rolling average
    const n = existing[idx].notesAnalyzed;
    existing[idx].averageWeightedCoverage = Math.round(
      (existing[idx].averageWeightedCoverage * (n - 1) + weightedCoverage) / n
    );

    // Keep last 10 scores for trend calculation
    existing[idx].recentScores = [
      ...existing[idx].recentScores.slice(-9),
      weightedCoverage,
    ];

    existing[idx].trend = calculateTrend(existing[idx].recentScores);
    existing[idx].lastAnalyzedAt = new Date();
  }

  return existing;
};

// ─── Main: Update profile from pipeline context ────────────────────────────

/**
 * Updates (or creates) the StudentProfile document after a successful
 * pipeline analysis.
 *
 * Should be called from processingService after the Note is saved.
 *
 * @param ctx - The completed PipelineContext
 */
export const updateProfileFromAnalysis = async (
  ctx: PipelineContext
): Promise<void> => {
  if (!ctx.matchedLesson || !ctx.conceptMatches) {
    // No curriculum match — skip profile update
    return;
  }

  const subject = ctx.matchedLesson.subject;
  const lessonId = ctx.matchedLesson.lessonId;
  const weightedCoverage = ctx.coverageScores?.weightedCoverage ?? 0;

  try {
    // Fetch or create profile
    let profile = await StudentProfile.findOne({ userId: ctx.userId });

    if (!profile) {
      profile = new StudentProfile({
        userId: ctx.userId,
        subjectMastery: [],
        conceptPerformance: [],
        recentSessions: [],
        totalNotesAnalyzed: 0,
      });
    }

    // ── Update concept performance ─────────────────────────────────────────
    let conceptPerformance = profile.conceptPerformance as IConceptPerformance[];

    for (const match of ctx.conceptMatches) {
      conceptPerformance = upsertConceptPerformance(
        conceptPerformance,
        match.concept.id,
        match.concept.name,
        subject,
        lessonId,
        match.concept.weight,
        match.found
      );
    }

    profile.conceptPerformance = conceptPerformance;

    // ── Update subject mastery ─────────────────────────────────────────────
    let subjectMastery = profile.subjectMastery as ISubjectMastery[];
    subjectMastery = upsertSubjectMastery(subjectMastery, subject, weightedCoverage);
    profile.subjectMastery = subjectMastery;

    // ── Update grade ───────────────────────────────────────────────────────
    if (ctx.subjectDetection?.grade && ctx.subjectDetection.grade > 0) {
      profile.primaryGrade = ctx.subjectDetection.grade;
    }

    // ── Add session ────────────────────────────────────────────────────────
    const newSession = {
      noteId: ctx.noteId,
      subject,
      lessonId,
      lessonName: ctx.matchedLesson.lessonName,
      weightedCoverage,
      conceptsFound: ctx.coverageScores?.foundConcepts ?? 0,
      conceptsMissed: ctx.coverageScores?.missedConcepts ?? 0,
      examReadinessRating: ctx.examReadiness?.rating,
      analyzedAt: new Date(),
    };

    // Keep only last 20 sessions
    const sessions = [...(profile.recentSessions ?? []), newSession].slice(-20);
    profile.recentSessions = sessions;

    // ── Totals ─────────────────────────────────────────────────────────────
    profile.totalNotesAnalyzed = (profile.totalNotesAnalyzed ?? 0) + 1;

    await profile.save();

    const persistentGapCount = (profile.conceptPerformance as IConceptPerformance[])
      .filter((c) => c.isPersistentGap).length;

    console.log(
      `  [Profile] ✅ Updated for user ${ctx.userId}: ` +
        `${subject} coverage ${weightedCoverage}%, ` +
        `${persistentGapCount} persistent gap(s)`
    );
  } catch (err) {
    // Profile update failures are non-fatal
    console.error(
      `  [Profile] ❌ Failed to update profile for user ${ctx.userId}:`,
      err instanceof Error ? err.message : err
    );
  }
};

// ─── Getters ───────────────────────────────────────────────────────────────

/**
 * Gets or creates the student profile for a userId.
 */
export const getProfile = async (
  userId: string
): Promise<IStudentProfile | null> => {
  return StudentProfile.findOne({ userId });
};

/**
 * Returns all concepts that are persistent gaps (missed 2+ times).
 * Sorted by timesMissed descending (worst gaps first).
 */
export const getPersistentGaps = async (
  userId: string
): Promise<IConceptPerformance[]> => {
  const profile = await StudentProfile.findOne({ userId });
  if (!profile) return [];

  return (profile.conceptPerformance as IConceptPerformance[])
    .filter((c) => c.isPersistentGap)
    .sort((a, b) => b.timesMissed - a.timesMissed);
};

/**
 * Returns subject mastery sorted by coverage (best first).
 */
export const getSubjectMastery = async (
  userId: string
): Promise<ISubjectMastery[]> => {
  const profile = await StudentProfile.findOne({ userId });
  if (!profile) return [];

  return [...(profile.subjectMastery as ISubjectMastery[])].sort(
    (a, b) => b.averageWeightedCoverage - a.averageWeightedCoverage
  );
};
