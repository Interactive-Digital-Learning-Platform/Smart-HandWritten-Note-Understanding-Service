import { Router, Request, Response } from "express";
import { StudentProfile } from "../models/StudentProfile";
import { requireProfileOwner } from "../middleware/studentOwnership";
import {
  getProfile,
  getPersistentGaps,
  getSubjectMastery,
} from "../services/profileService";
import { sendSuccess, sendError } from "../middleware/errorHandler";

const router = Router();
router.param("userId", (req, res, next) => requireProfileOwner(req, res, next));

// ─── GET /api/profile/:userId ──────────────────────────────────────────────

/**
 * Returns the full student profile for a userId.
 * Creates a minimal profile record if one doesn't exist.
 */
router.get("/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params as { userId: string };

    let profile = await getProfile(userId);

    if (!profile) {
      // Return empty profile shape (no DB record yet)
      sendSuccess(res, {
        userId,
        exists: false,
        message: "No profile yet. Upload and analyze some notes to build your profile.",
        totalNotesAnalyzed: 0,
        subjectMastery: [],
        persistentGaps: [],
        recentSessions: [],
      });
      return;
    }

    sendSuccess(res, {
      userId,
      exists: true,
      displayName: profile.displayName,
      primaryGrade: profile.primaryGrade,
      totalNotesAnalyzed: profile.totalNotesAnalyzed,
      subjectMastery: profile.subjectMastery,
      recentSessions: profile.recentSessions.slice(-10), // Last 10
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    });
  } catch (error) {
    sendError(res, "Failed to retrieve student profile", 500);
  }
});

// ─── GET /api/profile/:userId/gaps ────────────────────────────────────────

/**
 * Returns the student's persistent knowledge gaps —
 * concepts that have been missed 2 or more times across different analyses.
 * Sorted by timesMissed descending.
 */
router.get("/:userId/gaps", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params as { userId: string };
    const gaps = await getPersistentGaps(userId);

    sendSuccess(res, {
      userId,
      persistentGapCount: gaps.length,
      gaps: gaps.map((g) => ({
        conceptId: g.conceptId,
        conceptName: g.conceptName,
        subjectName: g.subjectName,
        lessonId: g.lessonId,
        curriculumVersion: g.curriculumVersion,
        weight: g.weight,
        timesStudentConfirmedNeedsHelp: g.timesStudentConfirmedNeedsHelp,
        timesStudentConfirmedUnderstood: g.timesStudentConfirmedUnderstood,
        timesNotFoundInNotes: g.timesNotFoundInNotes,
        timesFoundInNotes: g.timesFoundInNotes,
        timesPartiallyFoundInNotes: g.timesPartiallyFoundInNotes,
        lastSeen: g.lastSeen,
      })),
    });
  } catch (error) {
    sendError(res, "Failed to retrieve persistent gaps", 500);
  }
});

// ─── GET /api/profile/:userId/mastery ─────────────────────────────────────

/**
 * Returns subject-level mastery scores with trend analysis.
 * Sorted by average weighted coverage descending (best subject first).
 */
router.get("/:userId/mastery", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params as { userId: string };
    const mastery = await getSubjectMastery(userId);

    sendSuccess(res, {
      userId,
      subjectCount: mastery.length,
      subjects: mastery,
    });
  } catch (error) {
    sendError(res, "Failed to retrieve subject mastery", 500);
  }
});

// ─── GET /api/profile/:userId/sessions ────────────────────────────────────

/**
 * Returns the student's recent study session history.
 * Optional ?limit=N query parameter (default 10, max 20).
 */
router.get("/:userId/sessions", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(20, parseInt(req.query.limit as string) || 10);

    const profile = await getProfile(userId);

    if (!profile) {
      sendSuccess(res, { userId, sessions: [] });
      return;
    }

    const sessions = [...profile.recentSessions]
      .reverse() // Most recent first
      .slice(0, limit);

    sendSuccess(res, {
      userId,
      count: sessions.length,
      sessions,
    });
  } catch (error) {
    sendError(res, "Failed to retrieve study sessions", 500);
  }
});

// ─── GET /api/profile/:userId/summary ─────────────────────────────────────

/**
 * Returns a concise profile summary suitable for the mobile app dashboard.
 * Includes: best subject, worst subject, top persistent gaps, and trend.
 */
router.get("/:userId/summary", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params as { userId: string };

    const profile = await getProfile(userId);

    if (!profile || profile.totalNotesAnalyzed === 0) {
      sendSuccess(res, {
        userId,
        hasData: false,
        message: "No analyses yet. Upload your first note to get started.",
      });
      return;
    }

    const mastery = [...profile.subjectMastery].sort(
      (a, b) => b.averageWeightedCoverage - a.averageWeightedCoverage
    );

    const bestSubject = mastery[0] ?? null;
    const worstSubject = mastery[mastery.length - 1] ?? null;

    const topPersistentGaps = (profile.conceptPerformance ?? [])
      .filter((c) => c.isPersistentSupportNeed)
      .sort((a, b) => b.timesStudentConfirmedNeedsHelp - a.timesStudentConfirmedNeedsHelp)
      .slice(0, 5)
      .map((g) => ({
        name: g.conceptName,
        subject: g.subjectName,
        timesStudentConfirmedNeedsHelp: g.timesStudentConfirmedNeedsHelp,
      }));

    const lastSession = profile.recentSessions.slice(-1)[0] ?? null;

    sendSuccess(res, {
      userId,
      hasData: true,
      primaryGrade: profile.primaryGrade,
      totalNotesAnalyzed: profile.totalNotesAnalyzed,
      bestSubject: bestSubject
        ? {
            name: bestSubject.subjectName,
            averageCoverage: bestSubject.averageWeightedCoverage,
            trend: bestSubject.trend,
          }
        : null,
      worstSubject:
        worstSubject && worstSubject.subjectName !== bestSubject?.subjectName
          ? {
              name: worstSubject.subjectName,
              averageCoverage: worstSubject.averageWeightedCoverage,
              trend: worstSubject.trend,
            }
          : null,
      persistentGapCount: topPersistentGaps.length,
      topPersistentGaps,
      lastSession: lastSession
        ? {
            subject: lastSession.subject,
            lessonName: lastSession.lessonName,
            coverage: lastSession.weightedCoverage,
            date: lastSession.analyzedAt,
          }
        : null,
    });
  } catch (error) {
    sendError(res, "Failed to retrieve profile summary", 500);
  }
});

export default router;
