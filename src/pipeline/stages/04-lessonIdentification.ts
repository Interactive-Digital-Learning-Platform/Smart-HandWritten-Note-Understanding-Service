// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Stage 4 — Lesson Identification
// ═══════════════════════════════════════════════════════════════════════════
//
// Uses the subject + topic hint from Stage 3 to find the best matching
// curriculum lesson in the Knowledge Base.
//
// Strategy (in priority order):
//   1. Exact match: findLesson(subject, topicHint, grade)
//   2. Global search: searchLessons(topicHint) across all subjects
//   3. LLM-assisted: If KB search gives low confidence, ask LLM to pick
//      from the top candidate lessons
//
// Research Contribution: Curriculum retrieval replaces the LLM guessing
// which topic it thinks the notes are about (Improvement 9).
// ═══════════════════════════════════════════════════════════════════════════

import Groq from "groq-sdk";
import { config } from "../../config/config";
import { PipelineContext } from "../types";
import { findLesson, searchLessons, getLessonsBySubject } from "../../curriculum";
import { CurriculumLesson } from "../../curriculum/types";

const groq = new Groq({ apiKey: config.groq.apiKey });

// ─── LLM-assisted lesson picker ────────────────────────────────────────────

/**
 * When keyword matching gives us multiple low-confidence candidates,
 * ask the LLM to pick the best one by reading snippets of the lesson names.
 */
const pickLessonWithLlm = async (
  textSnippet: string,
  candidates: CurriculumLesson[]
): Promise<{ lessonId: string; confidence: number } | null> => {
  if (candidates.length === 0) return null;

  const options = candidates
    .slice(0, 5) // Only show top 5 to avoid token overload
    .map(
      (l, i) =>
        `  ${i + 1}. "${l.lessonName}" (${l.subject} Grade ${l.grade}, Unit: ${l.unit})`
    )
    .join("\n");

  const prompt = `A student has written notes. Identify which lesson from the list best matches these notes.

STUDENT NOTES SNIPPET:
"""
${textSnippet.slice(0, 800)}
"""

AVAILABLE LESSONS:
${options}

Respond ONLY with JSON (no markdown):
{ "lessonIndex": 1, "confidence": 85 }

lessonIndex: the number (1-based) of the best matching lesson, or 0 if none match well
confidence: 0–100 how confident you are in this match`;

  try {
    const completion = await groq.chat.completions.create({
      model: config.groq.model,
      temperature: 0.1,
      max_tokens: 64,
      messages: [{ role: "user", content: prompt }],
    });

    const raw =
      completion.choices[0]?.message?.content
        ?.trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim() ?? "";

    const parsed = JSON.parse(raw);

    const idx = typeof parsed.lessonIndex === "number" ? parsed.lessonIndex - 1 : -1;
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence / 100 : 0;

    if (idx >= 0 && idx < candidates.length && confidence > 0.3) {
      return { lessonId: candidates[idx].lessonId, confidence };
    }
  } catch {
    // Ignore LLM picker failures — fall through to no-match
  }

  return null;
};

import { qdrantService } from "../../services/qdrantService";

// ─── Stage Runner ──────────────────────────────────────────────────────────

export const runLessonIdentification = async (
  ctx: PipelineContext
): Promise<void> => {
  console.log(`  [Stage 4] Lesson Identification...`);

  // Check official Qdrant Knowledge Base status
  const kbStats = await qdrantService.getCollectionStats();
  if (kbStats.isAvailable) {
    console.log(
      `  [Stage 4] 📚 Official Qdrant Vector KB connected ("${kbStats.collection}" — ${kbStats.totalPoints} points)`
    );
  }

  if (!ctx.subjectDetection) {
    throw new Error("Stage 4 requires subjectDetection from Stage 3");
  }

  const { subject, grade, topicHint } = ctx.subjectDetection;
  const text = ctx.ocrCleaning?.cleanedText ?? ctx.rawOcrText ?? "";

  // ── Strategy 1: Exact/keyword match via KB ────────────────────────────
  if (subject !== "Unknown") {
    const result = findLesson(subject, topicHint, grade || undefined);

    if (result && result.confidence >= 0.5) {
      ctx.matchedLessonId = result.lesson.lessonId;
      ctx.matchedLesson = result.lesson;
      ctx.lessonMatchConfidence = result.confidence;
      ctx.lessonMatchMethod = result.matchMethod;

      console.log(
        `  [Stage 4] ✅ Matched: "${result.lesson.lessonName}" ` +
          `(${result.matchMethod}, confidence: ${(result.confidence * 100).toFixed(0)}%)`
      );
      return;
    }

    // ── Strategy 2: Try searching all lessons in the detected subject ───
    const subjectLessons = getLessonsBySubject(subject, grade || undefined);
    if (subjectLessons.length > 0 && text) {
      const aiPick = await pickLessonWithLlm(text, subjectLessons);
      if (aiPick) {
        const pickedLesson = subjectLessons.find(
          (l) => l.lessonId === aiPick.lessonId
        );
        if (pickedLesson) {
          ctx.matchedLessonId = pickedLesson.lessonId;
          ctx.matchedLesson = pickedLesson;
          ctx.lessonMatchConfidence = aiPick.confidence;
          ctx.lessonMatchMethod = "ai-assisted";

          console.log(
            `  [Stage 4] ✅ AI-matched: "${pickedLesson.lessonName}" ` +
              `(confidence: ${(aiPick.confidence * 100).toFixed(0)}%)`
          );
          return;
        }
      }
    }
  }

  // ── Strategy 3: Global search across all subjects ─────────────────────
  const globalResults = searchLessons(topicHint);
  if (globalResults.length > 0 && globalResults[0].confidence >= 0.3) {
    const best = globalResults[0];
    ctx.matchedLessonId = best.lesson.lessonId;
    ctx.matchedLesson = best.lesson;
    ctx.lessonMatchConfidence = best.confidence;
    ctx.lessonMatchMethod = best.matchMethod;

    console.log(
      `  [Stage 4] ✅ Global-matched: "${best.lesson.lessonName}" ` +
        `(${best.matchMethod}, confidence: ${(best.confidence * 100).toFixed(0)}%)`
    );
    return;
  }

  // ── No match — pipeline continues without curriculum context ──────────
  ctx.matchedLessonId = undefined;
  ctx.matchedLesson = undefined;
  ctx.lessonMatchConfidence = 0;
  ctx.lessonMatchMethod = "none";

  console.warn(
    `  [Stage 4] ⚠️  No curriculum lesson matched for ` +
      `"${subject}" / "${topicHint}". Pipeline will continue without KB.`
  );
};
