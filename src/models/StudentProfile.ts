import mongoose, { Schema, Document } from "mongoose";

// ═══════════════════════════════════════════════════════════════════════════
// Student Profile Model — Improvement 7
// ═══════════════════════════════════════════════════════════════════════════
//
// Tracks cumulative learning history for each student across multiple
// note submissions. Enables:
//   - Identifying persistent knowledge gaps (appears in 3+ analyses)
//   - Tracking improvement over time per concept
//   - Computing subject-level mastery scores
//   - Personalized recommendations based on history
// ═══════════════════════════════════════════════════════════════════════════

// ─── Per-concept performance record ───────────────────────────────────────

export interface IConceptPerformance {
  /** KB concept ID e.g., "bio-g10-photo-001" */
  conceptId: string;
  conceptName: string;
  subjectName: string;
  lessonId: string;
  /** Weight from the KB (1–5) */
  weight: number;
  /**
   * Number of times this concept appeared in an analysis
   * and was found in the student's notes
   */
  timesFoundInNotes: number;
  /**
   * Number of times this concept appeared in an analysis
   * and was MISSING from the student's notes
   */
  timesNotFoundInNotes: number;
  /** Number of times the student explicitly selected "I need help". */
  timesStudentConfirmedNeedsHelp: number;
  /** Number of times the student explicitly selected "I understand this". */
  timesStudentConfirmedUnderstood: number;
  /** Most recent analysis result for this concept */
  lastSeen: Date;
  /** Whether the concept is currently flagged as a persistent gap (missed 2+ times) */
  isPersistentSupportNeed: boolean;
}

// ─── Per-subject mastery record ────────────────────────────────────────────

export interface ISubjectMastery {
  subjectName: string;
  /** Average weighted coverage score across all analyses for this subject */
  averageWeightedCoverage: number;
  /** Total number of notes analyzed for this subject */
  notesAnalyzed: number;
  /** Number of notes uploaded for this subject (including failed) */
  notesUploaded: number;
  /** Trend: "improving" | "stable" | "declining" */
  trend: "improving" | "stable" | "declining";
  /** Last 5 coverage scores, oldest first */
  recentScores: number[];
  /** Most recent analysis date */
  lastAnalyzedAt: Date;
}

// ─── Session summary ───────────────────────────────────────────────────────

export interface IStudySession {
  noteId: string;
  subject: string;
  lessonId?: string;
  lessonName?: string;
  weightedCoverage: number;
  conceptsFound: number;
  conceptsMissed: number;
  examReadinessRating?: string;
  analyzedAt: Date;
}

// ─── Student Profile ───────────────────────────────────────────────────────

export interface IStudentProfile extends Document {
  /** Clerk user ID */
  userId: string;
  /** Display name (pulled from Clerk on first access) */
  displayName?: string;
  /** Detected grade level based on most recent analyses */
  primaryGrade?: number;
  /** Subject mastery records, keyed by subject name */
  subjectMastery: ISubjectMastery[];
  /** Per-concept performance history */
  conceptPerformance: IConceptPerformance[];
  /** Last 20 study sessions */
  recentSessions: IStudySession[];
  /** Total notes analyzed across all subjects */
  totalNotesAnalyzed: number;
  /** Profile creation date */
  createdAt: Date;
  /** Profile last updated */
  updatedAt: Date;
}

// ─── Schemas ───────────────────────────────────────────────────────────────

const ConceptPerformanceSchema = new Schema<IConceptPerformance>(
  {
    conceptId: { type: String, required: true },
    conceptName: { type: String, required: true },
    subjectName: { type: String, required: true },
    lessonId: { type: String, required: true },
    weight: { type: Number, required: true },
    timesFoundInNotes: { type: Number, default: 0 },
    timesNotFoundInNotes: { type: Number, default: 0 },
    timesStudentConfirmedNeedsHelp: { type: Number, default: 0 },
    timesStudentConfirmedUnderstood: { type: Number, default: 0 },
    lastSeen: { type: Date, default: Date.now },
    isPersistentSupportNeed: { type: Boolean, default: false },
  },
  { _id: false }
);

const SubjectMasterySchema = new Schema<ISubjectMastery>(
  {
    subjectName: { type: String, required: true },
    averageWeightedCoverage: { type: Number, default: 0 },
    notesAnalyzed: { type: Number, default: 0 },
    notesUploaded: { type: Number, default: 0 },
    trend: {
      type: String,
      enum: ["improving", "stable", "declining"],
      default: "stable",
    },
    recentScores: { type: [Number], default: [] },
    lastAnalyzedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const StudySessionSchema = new Schema<IStudySession>(
  {
    noteId: { type: String, required: true },
    subject: { type: String, required: true },
    lessonId: { type: String },
    lessonName: { type: String },
    weightedCoverage: { type: Number, default: 0 },
    conceptsFound: { type: Number, default: 0 },
    conceptsMissed: { type: Number, default: 0 },
    examReadinessRating: { type: String },
    analyzedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const StudentProfileSchema = new Schema<IStudentProfile>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    displayName: { type: String },
    primaryGrade: { type: Number },
    subjectMastery: { type: [SubjectMasterySchema], default: [] },
    conceptPerformance: { type: [ConceptPerformanceSchema], default: [] },
    recentSessions: { type: [StudySessionSchema], default: [] },
    totalNotesAnalyzed: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ───────────────────────────────────────────────────────────────

StudentProfileSchema.index({ userId: 1 }, { unique: true });

// ─── Export ────────────────────────────────────────────────────────────────

export const StudentProfile = mongoose.model<IStudentProfile>(
  "StudentProfile",
  StudentProfileSchema
);
