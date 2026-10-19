import { config } from "../../config/config";
import { groqPool } from "../../services/groqPool";
import { PipelineContext } from "../types";
import { findLesson, searchLessons, getLessonsBySubject, getLessonById } from "../../curriculum";
import { CurriculumLesson } from "../../curriculum/types";
import { qdrantService } from "../../services/qdrantService";
import { curriculumDbService } from "../../services/curriculumDbService";
import { createRegistryLessonId } from "../../curriculum/identity";

const scienceFamily = new Set(["science", "biology", "chemistry", "physics"]);

const lessonMatchesDetectedScope = (
  lesson: CurriculumLesson,
  subject: string,
  grade: number
): boolean => {
  const detectedSubject = subject.toLowerCase();
  const lessonSubject = lesson.subject.toLowerCase();
  const subjectMatches =
    detectedSubject === lessonSubject ||
    (scienceFamily.has(detectedSubject) && scienceFamily.has(lessonSubject));
  return subjectMatches && (!grade || lesson.grade === grade);
};

// ─── LLM-assisted lesson picker ────────────────────────────────────────────

const pickLessonWithLlm = async (
  textSnippet: string,
  candidates: CurriculumLesson[]
): Promise<{ lessonId: string; confidence: number } | null> => {
  if (candidates.length === 0) return null;

  const options = candidates
    .slice(0, 5)
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
    const completion = await groqPool.createChatCompletion({
      model: config.groq.model,
      temperature: 0.1,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    let raw = completion.choices[0]?.message?.content?.trim() ?? "";
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
    // Ignore LLM picker failures
  }

  return null;
};

// ─── Stage Runner ──────────────────────────────────────────────────────────

export const runLessonIdentification = async (
  ctx: PipelineContext
): Promise<void> => {
  console.log(`  [Stage 4] Lesson Identification (Curriculum DB & Bounded Qdrant KB)...`);

  if (!ctx.subjectDetection) {
    throw new Error("Stage 4 requires subjectDetection from Stage 3");
  }

  const text = ctx.ocrCleaning?.cleanedText ?? ctx.rawOcrText ?? "";

  // 0. Priority: User explicitly provided a lesson ID (e.g. from UI or Benchmark)
  if (ctx.userLessonId) {
    const userLesson = getLessonById(ctx.userLessonId);
    if (userLesson) {
      ctx.matchedLessonId = userLesson.lessonId;
      ctx.matchedLesson = userLesson;
      ctx.lessonMatchConfidence = 1.0;
      ctx.lessonMatchMethod = "user-specified";
      console.log(`  [Stage 4] 🎯 Using specified lesson: "${userLesson.lessonName}" (${userLesson.lessonId})`);
      // Selecting a lesson fixes the scope; it must not skip textbook retrieval.
      // Use the selected lesson's own identity, never inconsistent upload hints.
      try {
        const textbook = await qdrantService.getCurriculumTextbookContext(
          userLesson.subject, userLesson.lessonName, text, userLesson.grade
        );
        ctx.textbookPassages = textbook.passages.map(p => ({
          text: p.text, filename: p.filename, pages: p.pages, score: p.score,
        }));
        if (!ctx.textbookPassages.length) {
          ctx.qualityWarnings = [...(ctx.qualityWarnings ?? []),
            "Textbook references are temporarily unavailable. Your note was checked against the lesson checklist."];
        }
      } catch {
        ctx.textbookPassages = [];
        ctx.qualityWarnings = [...(ctx.qualityWarnings ?? []),
          "Textbook references are temporarily unavailable. Your note was checked against the lesson checklist."];
      }
      return;
    }
  }

  const { subject, grade, topicHint } = ctx.subjectDetection;

  // 1. Check Table of Contents Chapter Boundaries from Neon Database Registry
  const chapterBounds = curriculumDbService.getChapterPageBounds(subject, grade || 10, topicHint);

  // 2. Search Ingested PDF Knowledge Base in Qdrant (Strictly bounded to chapter PDF pages)
  try {
    const textbookContext = await qdrantService.getCurriculumTextbookContext(
      subject,
      topicHint,
      text,
      grade || 10
    );

    if (textbookContext.isAvailable) {
      if (textbookContext.passages.length > 0) {
        ctx.textbookPassages = textbookContext.passages.map((p) => ({
          text: p.text,
          filename: p.filename,
          pages: p.pages,
          score: p.score,
        }));
        console.log(
          `  [Stage 4] 📚 Ingested PDF match: "${textbookContext.sourceTextbook}" ` +
            `(${textbookContext.passages.length} bounded passages retrieved: ${textbookContext.textbookReference || ""})`
        );
      } else {
        console.log(
          `  [Stage 4] 📚 Grounded with TOC registry: ${textbookContext.textbookReference || ""}`
        );
      }

      // Check if static lesson exists
      let staticMatch = subject !== "Unknown" ? findLesson(subject, topicHint, grade || undefined) : null;
      if (!staticMatch && topicHint !== "Unknown Topic") {
        const sr = searchLessons(topicHint).filter((result) =>
          lessonMatchesDetectedScope(result.lesson, subject, grade)
        );
        if (sr.length > 0 && sr[0].confidence >= 0.2) {
          staticMatch = sr[0];
        }
      }

      const authoritativeRef =
        chapterBounds?.textbookReference ||
        staticMatch?.lesson.textbookReference ||
        textbookContext.textbookReference;

      if (staticMatch && staticMatch.confidence >= 0.2) {
        ctx.matchedLessonId = staticMatch.lesson.lessonId;
        ctx.matchedLesson = {
          ...staticMatch.lesson,
          textbookReference: authoritativeRef || staticMatch.lesson.textbookReference,
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
          `  [Stage 4] ✅ Grounded lesson: "${ctx.matchedLesson.lessonName}" [Ref: ${ctx.matchedLesson.textbookReference}]`
        );
        return;
      }

      // Dynamically extract lesson structure from database chunks if no static JSON
      if (textbookContext.passages.length > 0 || chapterBounds) {
        const dynamicLesson = await qdrantService.extractDynamicLessonFromPassages(
          subject !== "Unknown" ? subject : "Science",
          topicHint !== "Unknown Topic" ? topicHint : "Curriculum Lesson",
          grade || 10,
          textbookContext.passages,
          chapterBounds
        );

        if (dynamicLesson && dynamicLesson.concepts.length > 0) {
          ctx.matchedLessonId = dynamicLesson.lessonId;
          ctx.matchedLesson = {
            ...dynamicLesson,
            textbookReference: authoritativeRef || dynamicLesson.textbookReference,
          };
          ctx.lessonMatchConfidence = 0.95;
          ctx.lessonMatchMethod = "pdf-ingestion-dynamic";

          if (ctx.subjectDetection.subject === "Unknown") {
            ctx.subjectDetection.subject = dynamicLesson.subject;
          }
          if (!ctx.subjectDetection.grade) {
            ctx.subjectDetection.grade = dynamicLesson.grade;
          }

          console.log(
            `  [Stage 4] ✅ Extracted dynamic curriculum from DB: "${dynamicLesson.lessonName}" (${dynamicLesson.concepts.length} concepts) [Ref: ${ctx.matchedLesson.textbookReference}]`
          );
          return;
        }
      }
    }
  } catch (err) {
    console.warn("  [Stage 4] ⚠️ PDF Knowledge Base search error:", err);
  }

  // 3. Fallback: exact/keyword match via static KB
  if (subject !== "Unknown") {
    const result = findLesson(subject, topicHint, grade || undefined);

    if (result && result.confidence >= 0.5) {
      ctx.matchedLessonId = result.lesson.lessonId;
      ctx.matchedLesson = {
        ...result.lesson,
        textbookReference: chapterBounds?.textbookReference || result.lesson.textbookReference,
      };
      ctx.lessonMatchConfidence = result.confidence;
      ctx.lessonMatchMethod = result.matchMethod;

      console.log(
        `  [Stage 4] ✅ Matched static: "${result.lesson.lessonName}" ` +
          `(${result.matchMethod}, confidence: ${(result.confidence * 100).toFixed(0)}%)`
      );
      return;
    }

    const subjectLessons = getLessonsBySubject(subject, grade || undefined);
    if (subjectLessons.length > 0 && text) {
      const aiPick = await pickLessonWithLlm(text, subjectLessons);
      if (aiPick) {
        const pickedLesson = subjectLessons.find(
          (l) => l.lessonId === aiPick.lessonId
        );
        if (pickedLesson) {
          ctx.matchedLessonId = pickedLesson.lessonId;
          ctx.matchedLesson = {
            ...pickedLesson,
            textbookReference: chapterBounds?.textbookReference || pickedLesson.textbookReference,
          };
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

  // 4. Global search
  let globalResults = searchLessons(topicHint);
  globalResults = globalResults.filter((result) =>
    lessonMatchesDetectedScope(result.lesson, subject, grade)
  );
  if (globalResults.length === 0 || globalResults[0].confidence < 0.2) {
    const textFirstLines = text.split("\n").slice(0, 3).join(" ").trim();
    if (textFirstLines) {
      globalResults = searchLessons(textFirstLines).filter((result) =>
        lessonMatchesDetectedScope(result.lesson, subject, grade)
      );
    }
  }

  if (globalResults.length > 0 && globalResults[0].confidence >= 0.2) {
    const best = globalResults[0];
    ctx.matchedLessonId = best.lesson.lessonId;
    ctx.matchedLesson = {
      ...best.lesson,
      textbookReference: chapterBounds?.textbookReference || best.lesson.textbookReference,
    };
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

  // 5. If chapter bounds matched from TOC, construct a clean dynamic lesson
  if (chapterBounds) {
    ctx.matchedLessonId = createRegistryLessonId(
      chapterBounds.subject,
      chapterBounds.grade,
      chapterBounds.unitName
    );
    ctx.matchedLesson = {
      curriculumVersion: ctx.curriculumVersion,
      lessonId: ctx.matchedLessonId,
      subject: chapterBounds.subject,
      grade: chapterBounds.grade,
      unit: chapterBounds.unitName,
      lessonName: chapterBounds.unitName,
      textbookReference: chapterBounds.textbookReference,
      matchingKeywords: chapterBounds.matchingKeywords,
      learningOutcomes: [],
      concepts: [],
      definitions: [],
      formulae: [],
      expectedDiagrams: [],
      examKeywords: chapterBounds.matchingKeywords,
    };
    ctx.lessonMatchConfidence = 0.9;
    ctx.lessonMatchMethod = "toc-registry";
    console.log(
      `  [Stage 4] ✅ Matched from TOC Registry: "${chapterBounds.unitName}" [Ref: ${chapterBounds.textbookReference}]`
    );
    return;
  }

  ctx.matchedLessonId = undefined;
  ctx.matchedLesson = undefined;
  ctx.lessonMatchConfidence = 0;
  ctx.lessonMatchMethod = "none";

  console.warn(
    `  [Stage 4] ⚠️  No curriculum lesson matched for ` +
      `"${subject}" / "${topicHint}". Pipeline will continue without KB.`
  );
};
