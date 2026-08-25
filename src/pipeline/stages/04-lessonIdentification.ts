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
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    let raw =
      completion.choices[0]?.message?.content
        ?.trim() ?? "";
    raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : stripped;
    const parsed = JSON.parse(jsonStr);

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
  console.log(`  [Stage 4] Lesson Identification (Curriculum DB & Qdrant Vector KB)...`);

  if (!ctx.subjectDetection) {
    throw new Error("Stage 4 requires subjectDetection from Stage 3");
  }

  const { subject, grade, topicHint } = ctx.subjectDetection;
  const text = ctx.ocrCleaning?.cleanedText ?? ctx.rawOcrText ?? "";

  // ── Strategy 1: Search Official Ingested PDF Knowledge Base (Qdrant RAG) ──
  try {
    const textbookContext = await qdrantService.getCurriculumTextbookContext(
      subject,
      topicHint,
      text
    );

    if (textbookContext.isAvailable && textbookContext.passages.length > 0) {
      ctx.textbookPassages = textbookContext.passages.map((p) => ({
        text: p.text,
        filename: p.filename,
        pages: p.pages,
        score: p.score,
      }));

      console.log(
        `  [Stage 4] 📚 Ingested PDF match: "${textbookContext.sourceTextbook}" (${textbookContext.passages.length} passages retrieved)`
      );

      // Check if static lesson exists for additional concept keywords
      let staticMatch = subject !== "Unknown" ? findLesson(subject, topicHint, grade || undefined) : null;
      if (!staticMatch && topicHint !== "Unknown Topic") {
        const sr = searchLessons(topicHint);
        if (sr.length > 0 && sr[0].confidence >= 0.2) {
          staticMatch = sr[0];
        }
      }

      if (staticMatch && staticMatch.confidence >= 0.2) {
        ctx.matchedLessonId = staticMatch.lesson.lessonId;
        ctx.matchedLesson = {
          ...staticMatch.lesson,
          textbookReference: textbookContext.textbookReference || staticMatch.lesson.textbookReference,
        };
        ctx.lessonMatchConfidence = 0.98;
        ctx.lessonMatchMethod = "pdf-ingestion-grounded";

        if (ctx.subjectDetection.subject === "Unknown") {
          ctx.subjectDetection.subject = staticMatch.lesson.subject;
        }
        if (!ctx.subjectDetection.grade) {
          ctx.subjectDetection.grade = staticMatch.lesson.grade;
        }

        console.log(
          `  [Stage 4] ✅ Grounded static lesson with PDF Knowledge Base: "${ctx.matchedLesson.lessonName}"`
        );
        return;
      }

      // If no exact static lesson, dynamically extract lesson structure from ingested PDF chunks
      const dynamicLesson = await qdrantService.extractDynamicLessonFromPassages(
        subject !== "Unknown" ? subject : "Science",
        topicHint !== "Unknown Topic" ? topicHint : "Curriculum Lesson",
        grade || 10,
        textbookContext.passages
      );

      if (dynamicLesson && dynamicLesson.concepts.length > 0) {
        ctx.matchedLessonId = dynamicLesson.lessonId;
        ctx.matchedLesson = dynamicLesson;
        ctx.lessonMatchConfidence = 0.92;
        ctx.lessonMatchMethod = "pdf-ingestion-dynamic";

        if (ctx.subjectDetection.subject === "Unknown") {
          ctx.subjectDetection.subject = dynamicLesson.subject;
        }
        if (!ctx.subjectDetection.grade) {
          ctx.subjectDetection.grade = dynamicLesson.grade;
        }

        console.log(
          `  [Stage 4] ✅ Extracted dynamic curriculum from PDF: "${dynamicLesson.lessonName}" (${dynamicLesson.concepts.length} concepts from ${dynamicLesson.textbookReference})`
        );
        return;
      }
    }
  } catch (err) {
    console.warn("  [Stage 4] ⚠️ PDF Knowledge Base search error:", err);
  }

  // ── Strategy 2: Exact/keyword match via static KB ────────────────────────
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

    // ── Strategy 3: Try searching all lessons in the detected subject ───
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

  // ── Strategy 4: Global search across all subjects ─────────────────────
  let globalResults = searchLessons(topicHint);
  if (globalResults.length === 0 || globalResults[0].confidence < 0.2) {
    // Try searching with beginning of student notes
    const textFirstLines = text.split("\n").slice(0, 3).join(" ").trim();
    if (textFirstLines) {
      globalResults = searchLessons(textFirstLines);
    }
  }

  if (globalResults.length > 0 && globalResults[0].confidence >= 0.2) {
    const best = globalResults[0];
    ctx.matchedLessonId = best.lesson.lessonId;
    ctx.matchedLesson = best.lesson;
    ctx.lessonMatchConfidence = best.confidence;
    ctx.lessonMatchMethod = best.matchMethod;

    if (ctx.subjectDetection.subject === "Unknown") {
      ctx.subjectDetection.subject = best.lesson.subject;
    }
    if (!ctx.subjectDetection.grade) {
      ctx.subjectDetection.grade = best.lesson.grade;
    }

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

