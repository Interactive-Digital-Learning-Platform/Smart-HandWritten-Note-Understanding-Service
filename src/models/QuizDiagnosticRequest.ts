import mongoose, { Document, Schema } from "mongoose";

/**
 * Integration outbox record for the Quiz microservice. The note service owns
 * request creation; the Quiz service will later consume this contract through
 * the gateway/event broker without either service sharing implementation code.
 */
export interface IQuizDiagnosticRequest extends Document {
  userId: string;
  noteId: mongoose.Types.ObjectId;
  subject: string;
  grade?: number;
  lessonId?: string;
  lessonName?: string;
  curriculumVersion?: string;
  conceptId: string;
  conceptName: string;
  conceptWeight: number;
  requestedQuestionCount: number;
  status: "pending_integration" | "sent" | "completed" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

const QuizDiagnosticRequestSchema = new Schema<IQuizDiagnosticRequest>(
  {
    userId: { type: String, required: true, index: true },
    noteId: { type: Schema.Types.ObjectId, ref: "Note", required: true, index: true },
    subject: { type: String, required: true },
    grade: { type: Number },
    lessonId: { type: String },
    lessonName: { type: String },
    curriculumVersion: { type: String, index: true },
    conceptId: { type: String, required: true },
    conceptName: { type: String, required: true },
    conceptWeight: { type: Number, min: 1, max: 5, default: 3 },
    requestedQuestionCount: { type: Number, min: 1, max: 10, default: 3 },
    status: {
      type: String,
      enum: ["pending_integration", "sent", "completed", "failed"],
      default: "pending_integration",
    },
  },
  { timestamps: true }
);

// Repeated taps update one outstanding request instead of creating duplicates.
QuizDiagnosticRequestSchema.index({ noteId: 1, conceptId: 1 }, { unique: true });

export const QuizDiagnosticRequest = mongoose.model<IQuizDiagnosticRequest>(
  "QuizDiagnosticRequest",
  QuizDiagnosticRequestSchema
);
