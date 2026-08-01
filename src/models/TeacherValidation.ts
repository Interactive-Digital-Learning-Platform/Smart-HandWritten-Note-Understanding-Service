import mongoose, { Schema, Document } from "mongoose";

// ═══════════════════════════════════════════════════════════════════════════
// Teacher Validation Model — Improvement 8
// ═══════════════════════════════════════════════════════════════════════════
//
// Allows teachers to review and override the system's analysis output.
// Teacher feedback is stored here and used to:
//   1. Correct incorrect subject/lesson matches
//   2. Validate or dispute coverage scores
//   3. Flag analysis errors for system improvement (Improvement 10)
//   4. Add human-verified learning gaps that the system missed
// ═══════════════════════════════════════════════════════════════════════════

export type ValidationStatus =
  | "pending"   // Awaiting teacher review
  | "approved"  // Teacher validated the analysis as correct
  | "corrected" // Teacher made corrections
  | "disputed"; // Teacher flagged as incorrect, needs attention

export interface ITeacherCorrection {
  /** Field that was corrected */
  field:
    | "subject"
    | "lesson"
    | "coverageScore"
    | "gap"
    | "strength"
    | "exam_readiness"
    | "other";
  /** What the system said */
  originalValue: string;
  /** What the teacher corrected it to */
  correctedValue: string;
  /** Teacher's explanation for the correction */
  reason?: string;
}

export interface ITeacherValidation extends Document {
  /** The note that was analyzed */
  noteId: string;
  /** The student's user ID */
  studentUserId: string;
  /** The teacher's user ID (Clerk) */
  teacherUserId: string;
  /** Teacher's display name */
  teacherName?: string;

  /** Overall validation status */
  status: ValidationStatus;

  /** Whether the teacher agrees with the subject detection */
  subjectCorrect?: boolean;
  /** Whether the teacher agrees with the lesson match */
  lessonCorrect?: boolean;
  /** Whether the teacher agrees with the coverage score (±10%) */
  coverageScoreAccurate?: boolean;
  /** Whether the gaps identified are educationally relevant */
  gapsRelevant?: boolean;

  /** Specific corrections made by the teacher */
  corrections: ITeacherCorrection[];

  /** Additional gaps the teacher says the system missed */
  teacherAddedGaps: string[];

  /** Strengths the teacher wants to highlight */
  teacherAddedStrengths: string[];

  /** Teacher's overall comment */
  comment?: string;

  /** Teacher's rating of the analysis quality (1–5) */
  analysisQualityRating?: number;

  /** Whether this feedback has been used for system improvement */
  usedForImprovement: boolean;

  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ────────────────────────────────────────────────────────────────

const TeacherCorrectionSchema = new Schema<ITeacherCorrection>(
  {
    field: {
      type: String,
      enum: ["subject", "lesson", "coverageScore", "gap", "strength", "exam_readiness", "other"],
      required: true,
    },
    originalValue: { type: String, required: true },
    correctedValue: { type: String, required: true },
    reason: { type: String },
  },
  { _id: false }
);

const TeacherValidationSchema = new Schema<ITeacherValidation>(
  {
    noteId: { type: String, required: true, index: true },
    studentUserId: { type: String, required: true, index: true },
    teacherUserId: { type: String, required: true },
    teacherName: { type: String },
    status: {
      type: String,
      enum: ["pending", "approved", "corrected", "disputed"],
      default: "pending",
    },
    subjectCorrect: { type: Boolean },
    lessonCorrect: { type: Boolean },
    coverageScoreAccurate: { type: Boolean },
    gapsRelevant: { type: Boolean },
    corrections: { type: [TeacherCorrectionSchema], default: [] },
    teacherAddedGaps: { type: [String], default: [] },
    teacherAddedStrengths: { type: [String], default: [] },
    comment: { type: String },
    analysisQualityRating: { type: Number, min: 1, max: 5 },
    usedForImprovement: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ───────────────────────────────────────────────────────────────

TeacherValidationSchema.index({ noteId: 1, teacherUserId: 1 }, { unique: true });
TeacherValidationSchema.index({ status: 1 });
TeacherValidationSchema.index({ usedForImprovement: 1 });

// ─── Export ────────────────────────────────────────────────────────────────

export const TeacherValidation = mongoose.model<ITeacherValidation>(
  "TeacherValidation",
  TeacherValidationSchema
);
