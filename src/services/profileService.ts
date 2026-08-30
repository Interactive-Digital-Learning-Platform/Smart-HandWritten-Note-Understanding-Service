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
import { IAnalysis } from "../models/Note";
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
      timesFoundInNotes: found ? 1 : 0,
      timesNotFoundInNotes: found ? 0 : 1,
      timesStudentConfirmedNeedsHelp: 0,
      timesStudentConfirmedUnderstood: 0,
      lastSeen: new Date(),
      isPersistentSupportNeed: false,
    });
  } else {
    // Existing — update
    // Profiles created before this change do not have the newer counters.
    existing[idx].timesFoundInNotes ??= 0;
    existing[idx].timesNotFoundInNotes ??= 0;
    existing[idx].timesStudentConfirmedNeedsHelp ??= 0;
    existing[idx].timesStudentConfirmedUnderstood ??= 0;
    existing[idx].isPersistentSupportNeed ??= false;

    if (found) {
      existing[idx].timesFoundInNotes += 1;
    } else {
      existing[idx].timesNotFoundInNotes += 1;
    }
    existing[idx].lastSeen = new Date();
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
  ctx: PipelineContext,
  previousAnalysis?: IAnalysis
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

    // A re-run may happen after OCR retry or student context correction. It is
    // still the same uploaded note, so counting it again would fabricate a
    // learning trend and inflate found/not-found counters. One session per
    // noteId acts as the profile aggregation idempotency key.
    const alreadyProfiled = (profile.recentSessions ?? []).some(
      (session) => session.noteId === ctx.noteId
    );
    if (alreadyProfiled && !previousAnalysis) {
      console.log("  [Profile] Skipped duplicate aggregation for note " + ctx.noteId);
      return;
    }

    if (alreadyProfiled && previousAnalysis) {
      // Remove this note's previous contribution before adding the corrected
      // analysis below. Student self-verification counters are deliberately
      // retained because they are student actions, not pipeline output.
      for (const finding of previousAnalysis.conceptFindings ?? []) {
        const previous = (profile.conceptPerformance as IConceptPerformance[])
          .find((concept) => concept.conceptId === finding.conceptId);
        if (!previous) continue;
        if (finding.found) {
          previous.timesFoundInNotes = Math.max(0, (previous.timesFoundInNotes ?? 0) - 1);
        } else {
          previous.timesNotFoundInNotes = Math.max(0, (previous.timesNotFoundInNotes ?? 0) - 1);
        }
      }

      const previousSession = (profile.recentSessions ?? [])
        .find((session) => session.noteId === ctx.noteId);
      profile.recentSessions = (profile.recentSessions ?? [])
        .filter((session) => session.noteId !== ctx.noteId);
      profile.totalNotesAnalyzed = Math.max(0, (profile.totalNotesAnalyzed ?? 0) - 1);

      if (previousSession) {
        const mastery = (profile.subjectMastery as ISubjectMastery[])
          .find((item) => item.subjectName === previousSession.subject);
        if (mastery) {
          const priorCount = mastery.notesAnalyzed ?? 0;
          mastery.notesAnalyzed = Math.max(0, priorCount - 1);
          mastery.notesUploaded = Math.max(0, (mastery.notesUploaded ?? 0) - 1);
          const oldScoreIndex = (mastery.recentScores ?? []).indexOf(
            previousSession.weightedCoverage
          );
          if (oldScoreIndex >= 0) {
            mastery.recentScores = (mastery.recentScores ?? []).filter(
              (_, index) => index !== oldScoreIndex
            );
          }
          mastery.averageWeightedCoverage = mastery.notesAnalyzed > 0
            ? Math.round(((mastery.averageWeightedCoverage * priorCount) - previousSession.weightedCoverage) / mastery.notesAnalyzed)
            : 0;
          mastery.trend = calculateTrend(mastery.recentScores);
        }
      }
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
      .filter((c) => c.isPersistentSupportNeed).length;

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
    .filter((c) => c.isPersistentSupportNeed)
    .sort((a, b) => b.timesStudentConfirmedNeedsHelp - a.timesStudentConfirmedNeedsHelp);
};

/** Records a student confirmation without treating note absence as a weakness. */
export const recordStudentConceptVerification = async (
  userId: string,
  conceptId: string,
  previousStatus: "unverified" | "understood" | "needs_help",
  newStatus: "understood" | "needs_help"
): Promise<void> => {
  const profile = await StudentProfile.findOne({ userId });
  if (!profile) return;

  const concept = (profile.conceptPerformance as IConceptPerformance[])
    .find((item) => item.conceptId === conceptId);
  if (!concept || previousStatus === newStatus) return;

  concept.timesStudentConfirmedNeedsHelp ??= 0;
  concept.timesStudentConfirmedUnderstood ??= 0;

  if (previousStatus === "needs_help") {
    concept.timesStudentConfirmedNeedsHelp = Math.max(0, concept.timesStudentConfirmedNeedsHelp - 1);
  } else if (previousStatus === "understood") {
    concept.timesStudentConfirmedUnderstood = Math.max(0, concept.timesStudentConfirmedUnderstood - 1);
  }

  if (newStatus === "needs_help") {
    concept.timesStudentConfirmedNeedsHelp += 1;
  } else {
    concept.timesStudentConfirmedUnderstood += 1;
  }

  concept.isPersistentSupportNeed = concept.timesStudentConfirmedNeedsHelp >= 2;
  concept.lastSeen = new Date();
  profile.markModified("conceptPerformance");
  await profile.save();
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
