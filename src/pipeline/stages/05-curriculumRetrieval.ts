// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Stage 5 — Curriculum Retrieval
// ═══════════════════════════════════════════════════════════════════════════
//
// Validates that the matched lesson is loaded into the context and ready
// for the algorithmic stages. If no lesson was matched in Stage 4, this
// stage marks the context so downstream stages can handle it gracefully.
//
// This is a lightweight validation/preparation stage.
// ═══════════════════════════════════════════════════════════════════════════

import { PipelineContext } from "../types";
import { getLessonById } from "../../curriculum";

export const runCurriculumRetrieval = async (
  ctx: PipelineContext
): Promise<void> => {
  console.log(`  [Stage 5] Curriculum Retrieval...`);

  // If Stage 4 didn't match, we skip — downstream stages handle missing lesson
  if (!ctx.matchedLessonId) {
    console.warn(
      `  [Stage 5] ⚠️  No lesson to retrieve — pipeline will proceed without curriculum context`
    );
    return;
  }

  // Verify the lesson is accessible (it may already be loaded in ctx.matchedLesson)
  if (!ctx.matchedLesson) {
    const lesson = getLessonById(ctx.matchedLessonId);
    if (!lesson) {
      console.error(
        `  [Stage 5] ❌ Lesson "${ctx.matchedLessonId}" not found in KB — clearing match`
      );
      ctx.matchedLessonId = undefined;
      ctx.matchedLesson = undefined;
      return;
    }
    ctx.matchedLesson = lesson;
  }

  const lesson = ctx.matchedLesson;

  console.log(
    `  [Stage 5] ✅ Lesson ready: "${lesson.lessonName}" — ` +
      `${lesson.concepts.length} concepts, ${lesson.learningOutcomes.length} LOs`
  );
};
