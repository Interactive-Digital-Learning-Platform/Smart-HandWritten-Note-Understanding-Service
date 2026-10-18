import { redactAnnotationText } from "../annotations/contract";
import { pseudonymizeResearchIdentifier } from "../annotations/liveReview";
import { config } from "../config/config";
import { getLessonById } from "../curriculum";
import { ConceptAnnotation } from "../models/ConceptAnnotation";
import {
  ExpertAnnotationTask,
  IExpertAnnotationTask,
  IExpertTaskConcept,
} from "../models/ExpertAnnotationTask";
import { INote } from "../models/Note";
import { ConceptStatus } from "../pipeline/types";
import { purgeCoverageTask } from "../models/EnglishCoverageReview";

const parseGrade = (note: INote): number | undefined => {
  if (note.userGrade === 10 || note.userGrade === 11) return note.userGrade;
  const match = note.analysis?.gradeLevel?.match(/\b(10|11)\b/);
  return match ? Number(match[1]) : undefined;
};

const normalizeProbabilities = (
  status: ConceptStatus,
  probabilities?: { present: number; partial: number; missing: number }
): { present: number; partial: number; missing: number } => {
  if (probabilities) return probabilities;
  return {
    present: status === "present" ? 1 : 0,
    partial: status === "partial" ? 1 : 0,
    missing: status === "missing" ? 1 : 0,
  };
};

export const queueNoteForExpertReview = async (
  note: INote
): Promise<IExpertAnnotationTask | null> => {
  if (!config.annotationReview.enabled) return null;
  if (
    note.researchConsent?.status !== "granted" ||
    !note.researchConsent.version ||
    !note.researchConsent.grantedAt ||
    !note.analysis
  ) return null;
  if (!config.annotationReview.allowedSubjects.includes(note.analysis.subject)) {
    return null;
  }
  const grade = parseGrade(note);
  const lessonId = note.analysis.lessonId;
  if (!grade || !lessonId || !note.analysis.conceptFindings?.length) return null;
  if (!config.annotationReview.pseudonymSecret) {
    throw new Error("Annotation pseudonym secret is not configured");
  }

  const lesson = getLessonById(lessonId);
  const lessonConcepts = new Map(
    (lesson?.concepts ?? []).map((concept) => [concept.id, concept])
  );
  const concepts: IExpertTaskConcept[] = note.analysis.conceptFindings.map(
    (finding) => {
      const curriculumConcept = lessonConcepts.get(finding.conceptId);
      const status: ConceptStatus =
        finding.status ?? (finding.found ? "present" : "missing");
      const learningOutcomes = (lesson?.learningOutcomes ?? [])
        .filter((outcome) => outcome.requiredConcepts.includes(finding.conceptId))
        .map((outcome) => outcome.description);
      return {
        conceptId: finding.conceptId,
        conceptName: finding.conceptName,
        category: curriculumConcept?.category ?? finding.curriculumCategory,
        weight: curriculumConcept?.weight ?? finding.importanceWeight,
        isFrequentlyTested:
          curriculumConcept?.isFrequentlyTested ?? finding.isFrequentlyTested,
        keywords: curriculumConcept?.keywords ?? [],
        learningOutcomes,
        systemStatus: status,
        systemProbabilities: normalizeProbabilities(status, finding.probabilities),
        systemConfidence: finding.decisionConfidence,
        systemMatchMethod: finding.matchMethod,
        systemSource: finding.source ?? "fallback",
        systemNeedsReview: finding.needsReview ?? true,
        systemModelVersion: finding.modelVersion,
        systemEvidence: finding.evidence,
      };
    }
  );
  const reviewDemand = concepts.filter(
    (concept) => concept.systemNeedsReview || concept.systemConfidence < 0.7
  ).length;
  const priority = Math.min(
    100,
    40 + reviewDemand * 3 + (note.analysis.qualityWarnings?.length ?? 0) * 5
  );
  const noteId = String(note._id);
  const noteGroupId = pseudonymizeResearchIdentifier(
    "note",
    noteId,
    config.annotationReview.pseudonymSecret
  );
  const evaluationGroupId = pseudonymizeResearchIdentifier(
    "student",
    note.userId,
    config.annotationReview.pseudonymSecret
  );
  const language = note.analysis.contentLanguage?.primaryLanguage ?? "Unknown";
  const rawOcrText = redactAnnotationText(note.rawOcrText || note.rawText);
  const correctedText = redactAnnotationText(note.rawText);

  return ExpertAnnotationTask.findOneAndUpdate(
    { sourceNoteId: noteId },
    {
      $setOnInsert: {
        sourceNoteId: noteId,
        noteGroupId,
        evaluationGroupId,
        consentVersion: note.researchConsent.version,
        consentGrantedAt: note.researchConsent.grantedAt,
        status: "queued",
        priority,
        subject: note.analysis.subject,
        grade,
        lessonId,
        lessonName: note.analysis.topic,
        language,
        pageCount: note.pageCount,
        rawOcrText,
        correctedText,
        noteScope: note.analysis.noteScope?.scope,
        ocrConfidence: note.analysis.ocrConfidence,
        curriculumVersion: note.analysis.curriculumVersion ?? "unknown",
        pipelineVersion: note.analysis.pipelineVersion,
        qualityWarnings: note.analysis.qualityWarnings ?? [],
        concepts,
        flags: {
          wrongLesson: false,
          unreadable: false,
          duplicate: false,
          containsPersonalData: false,
        },
      },
    },
    { upsert: true, new: true, runValidators: true }
  );
};

export const withdrawNoteFromExpertReview = async (
  sourceNoteId: string
): Promise<void> => {
  const withdrawnAt = new Date();
  const task = await ExpertAnnotationTask.findOne({ sourceNoteId });
  if (!task) return;
  await purgeCoverageTask(String(task._id));
  await ConceptAnnotation.deleteMany({
    noteId: task.noteGroupId,
    usedForTraining: false,
  });
  await ConceptAnnotation.updateMany(
    { noteId: task.noteGroupId, usedForTraining: true },
    {
      $set: {
        trainingEligible: false,
        consentWithdrawnAt: withdrawnAt,
      },
    }
  );
  // Remove queued images/text snapshots from the review system. Labels already
  // locked into an immutable release remain only as an ineligible audit record.
  await task.deleteOne();
};
