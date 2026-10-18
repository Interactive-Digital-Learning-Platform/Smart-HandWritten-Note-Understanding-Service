// Creates and updates student learning profiles.

import {
  StudentProfile,
  IStudentProfile,
  IConceptPerformance,
  ISubjectMastery,
} from "../models/StudentProfile";
import { IAnalysis } from "../models/Note";
import { ConceptStatus, PipelineContext } from "../pipeline/types";
import { normalizeConceptStatus } from "../pipeline/conceptPrediction";

// Finds the trend from the last five scores.
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

// Adds or updates a concept result.
const upsertConceptPerformance = (
  existing: IConceptPerformance[],
  conceptId: string,
  conceptName: string,
  subjectName: string,
  lessonId: string,
  curriculumVersion: string,
  weight: number,
  status: ConceptStatus
): IConceptPerformance[] => {
  const idx = existing.findIndex((c) => c.conceptId === conceptId);

  if (idx === -1) {
    // Add a new concept.
    existing.push({
      conceptId,
      conceptName,
      subjectName,
      lessonId,
      curriculumVersion,
      weight,
      timesFoundInNotes: status === "present" ? 1 : 0,
      timesPartiallyFoundInNotes: status === "partial" ? 1 : 0,
      timesNotFoundInNotes: status === "missing" ? 1 : 0,
      timesStudentConfirmedNeedsHelp: 0,
      timesStudentConfirmedUnderstood: 0,
      lastSeen: new Date(),
      isPersistentSupportNeed: false,
    });
  } else {
    // Update an existing concept. Older profiles may not have these counters.
    existing[idx].timesFoundInNotes ??= 0;
    existing[idx].timesPartiallyFoundInNotes ??= 0;
    existing[idx].timesNotFoundInNotes ??= 0;
    existing[idx].timesStudentConfirmedNeedsHelp ??= 0;
    existing[idx].timesStudentConfirmedUnderstood ??= 0;
    existing[idx].isPersistentSupportNeed ??= false;
    existing[idx].curriculumVersion = curriculumVersion;

    if (status === "present") {
      existing[idx].timesFoundInNotes += 1;
    } else if (status === "partial") {
      existing[idx].timesPartiallyFoundInNotes += 1;
    } else {
      existing[idx].timesNotFoundInNotes += 1;
    }
    existing[idx].lastSeen = new Date();
  }

  return existing;
};

// Adds or updates subject progress.
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

    // Update the average score.
    const n = existing[idx].notesAnalyzed;
    existing[idx].averageWeightedCoverage = Math.round(
      (existing[idx].averageWeightedCoverage * (n - 1) + weightedCoverage) / n
    );

    // Keep the last ten scores for the trend.
    existing[idx].recentScores = [
      ...existing[idx].recentScores.slice(-9),
      weightedCoverage,
    ];

    existing[idx].trend = calculateTrend(existing[idx].recentScores);
    existing[idx].lastAnalyzedAt = new Date();
  }

  return existing;
};

// Updates the student profile after a note is analyzed.
export const updateProfileFromAnalysis = async (
  ctx: PipelineContext,
  previousAnalysis?: IAnalysis
): Promise<void> => {
  if (!ctx.matchedLesson || !ctx.conceptMatches) {
    // Skip notes without a curriculum match.
    return;
  }

  const subject = ctx.matchedLesson.subject;
  const lessonId = ctx.matchedLesson.lessonId;
  const weightedCoverage = ctx.coverageScores?.weightedCoverage ?? 0;

  try {
    // Load or create the profile.
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

    // Count each note once, even when it is processed again.
    const alreadyProfiled = (profile.recentSessions ?? []).some(
      (session) => session.noteId === ctx.noteId
    );
    if (alreadyProfiled && !previousAnalysis) {
      console.log("  [Profile] Skipped duplicate aggregation for note " + ctx.noteId);
      return;
    }

    if (alreadyProfiled && previousAnalysis) {
      // Replace the old analysis but keep the student's own answers.
      for (const finding of previousAnalysis.conceptFindings ?? []) {
        const previous = (profile.conceptPerformance as IConceptPerformance[])
          .find((concept) => concept.conceptId === finding.conceptId);
        if (!previous) continue;
        const previousStatus = normalizeConceptStatus(finding);
        if (previousStatus === "present") {
          previous.timesFoundInNotes = Math.max(0, (previous.timesFoundInNotes ?? 0) - 1);
        } else if (previousStatus === "partial") {
          previous.timesPartiallyFoundInNotes = Math.max(
            0,
            (previous.timesPartiallyFoundInNotes ?? 0) - 1
          );
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

    // Update concept results.
    let conceptPerformance = profile.conceptPerformance as IConceptPerformance[];

    for (const match of ctx.conceptMatches) {
      conceptPerformance = upsertConceptPerformance(
        conceptPerformance,
        match.concept.id,
        match.concept.name,
        subject,
        lessonId,
        ctx.curriculumVersion,
        match.concept.weight,
        match.status
      );
    }

    profile.conceptPerformance = conceptPerformance;

    // Update subject progress.
    let subjectMastery = profile.subjectMastery as ISubjectMastery[];
    subjectMastery = upsertSubjectMastery(subjectMastery, subject, weightedCoverage);
    profile.subjectMastery = subjectMastery;

    // Update the grade.
    if (ctx.subjectDetection?.grade && ctx.subjectDetection.grade > 0) {
      profile.primaryGrade = ctx.subjectDetection.grade;
    }

    // Add this session.
    const newSession = {
      noteId: ctx.noteId,
      subject,
      lessonId,
      lessonName: ctx.matchedLesson.lessonName,
      curriculumVersion: ctx.curriculumVersion,
      weightedCoverage,
      conceptsFound: ctx.coverageScores?.foundConcepts ?? 0,
      conceptsPresent: ctx.coverageScores?.presentConcepts ?? 0,
      conceptsPartial: ctx.coverageScores?.partialConcepts ?? 0,
      conceptsMissed: ctx.coverageScores?.missedConcepts ?? 0,
      examReadinessRating: ctx.examReadiness?.rating,
      analyzedAt: new Date(),
    };

    // Keep the last twenty sessions.
    const sessions = [...(profile.recentSessions ?? []), newSession].slice(-20);
    profile.recentSessions = sessions;

    // Update totals.
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
    // Do not fail note processing if this update fails.
    console.error(
      `  [Profile] ❌ Failed to update profile for user ${ctx.userId}:`,
      err instanceof Error ? err.message : err
    );
  }
};

// Gets or creates a student profile.
export const getProfile = async (
  userId: string
): Promise<IStudentProfile | null> => {
  return StudentProfile.findOne({ userId });
};

// Gets concepts missed at least twice, worst first.
export const getPersistentGaps = async (
  userId: string
): Promise<IConceptPerformance[]> => {
  const profile = await StudentProfile.findOne({ userId });
  if (!profile) return [];

  return (profile.conceptPerformance as IConceptPerformance[])
    .filter((c) => c.isPersistentSupportNeed)
    .sort((a, b) => b.timesStudentConfirmedNeedsHelp - a.timesStudentConfirmedNeedsHelp);
};

/** Saves the student's answer about a concept. */
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

// Gets subject progress, best first.
export const getSubjectMastery = async (
  userId: string
): Promise<ISubjectMastery[]> => {
  const profile = await StudentProfile.findOne({ userId });
  if (!profile) return [];

  return [...(profile.subjectMastery as ISubjectMastery[])].sort(
    (a, b) => b.averageWeightedCoverage - a.averageWeightedCoverage
  );
};
