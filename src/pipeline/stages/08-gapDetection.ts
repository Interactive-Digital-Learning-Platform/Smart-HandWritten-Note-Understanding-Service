// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Stage 8 — Explainable Gap Detection + Exam Readiness
// ═══════════════════════════════════════════════════════════════════════════
//
// Builds explainable learning gap reports from the concept matches.
// For each LEARNING OUTCOME in the lesson:
//   1. Check which required concepts were found vs missing
//   2. Assign achievement status: achieved / partially_achieved / not_achieved
//   3. Generate an evidence trail (what the student wrote vs what's missing)
//   4. Generate a textbook-referenced study recommendation via LLM
//
// Then computes EXAM READINESS from high-priority and frequently-tested gaps.
//
// Research Contribution:
//   - Improvement 3: Every gap is linked to a learning outcome + evidence
//   - Improvement 5: Exam readiness goes beyond simple completeness %
// ═══════════════════════════════════════════════════════════════════════════

import Groq from "groq-sdk";
import { config } from "../../config/config";
import {
  PipelineContext,
  ExplainableGap,
  OutcomeAssessment,
  ExamReadiness,
} from "../types";
import { LearningOutcome } from "../../curriculum/types";

const groq = new Groq({ apiKey: config.groq.apiKey });

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Maps concept weight to gap severity */
const weightToSeverity = (weight: number): "high" | "medium" | "low" => {
  if (weight >= 4) return "high";
  if (weight >= 3) return "medium";
  return "low";
};

/** Determines achievement status from found/total concept counts */
const determineStatus = (
  foundCount: number,
  totalCount: number
): "achieved" | "partially_achieved" | "not_achieved" => {
  if (totalCount === 0) return "achieved";
  const ratio = foundCount / totalCount;
  if (ratio >= 0.8) return "achieved";
  if (ratio >= 0.4) return "partially_achieved";
  return "not_achieved";
};

// ─── LLM: Generate study recommendations ──────────────────────────────────

/**
 * Generates study recommendations for each not_achieved / partially_achieved
 * outcome in a single batched LLM call.
 */
const generateRecommendations = async (
  subject: string,
  lessonName: string,
  textbookRef: string | undefined,
  gaps: Array<{
    outcomeDescription: string;
    missingConceptNames: string[];
  }>
): Promise<string[]> => {
  if (gaps.length === 0) return [];

  const gapList = gaps
    .map(
      (g, i) =>
        `  ${i + 1}. Outcome: "${g.outcomeDescription}"\n` +
        `     Missing: ${g.missingConceptNames.join(", ")}`
    )
    .join("\n");

  const prompt = `You are an expert ${subject} teacher helping a Sri Lankan O/L student.

The student is studying: "${lessonName}"
${textbookRef ? `Official Textbook Reference: ${textbookRef}` : ""}

For each learning gap below, write ONE concise, actionable study recommendation (1–2 sentences).
Mention specific study actions (e.g., "Draw the diagram", "Memorize the equation", "Review the table") and reference the textbook/chapter pages.

IMPORTANT CITATION RULES:
1. ONLY reference page numbers within the chapter page range specified in the Textbook Reference above (e.g., Book Pages 1–22 / PDF Pages 15–36).
2. Never invent or cite page numbers outside this chapter's range.
3. Format page references clearly, e.g.: "Refer to Book Page X (PDF Page Y)" or "Review pages in Unit ${lessonName}".

Gaps:
${gapList}

Respond ONLY with a JSON array of strings, one per gap:
["recommendation for gap 1", "recommendation for gap 2", ...]`;


  try {
    const completion = await groq.chat.completions.create({
      model: config.groq.model,
      temperature: 0.3,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    let raw = completion.choices[0]?.message?.content?.trim() ?? "[]";
    raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const jsonMatch = stripped.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : stripped;

    const parsed = JSON.parse(jsonStr);

    if (Array.isArray(parsed)) {
      return parsed.map((r) =>
        typeof r === "string"
          ? r.trim()
          : "Review this concept in your textbook."
      );
    }
  } catch (err) {
    console.warn(
      `  [Stage 8] ⚠️  Recommendation generation failed:`,
      err instanceof Error ? err.message : err
    );
  }

  return gaps.map(
    (g) => `Review the following concepts in your ${subject} textbook: ${g.missingConceptNames.join(", ")}.`
  );
};

// ─── Exam Readiness Calculation ───────────────────────────────────────────

const calculateExamReadiness = (
  ctx: PipelineContext
): ExamReadiness => {
  const matches = ctx.conceptMatches ?? [];

  // High priority = weight 4 or 5
  const highPriorityConcepts = matches.filter((m) => m.concept.weight >= 4);
  const highPriorityFound = highPriorityConcepts.filter((m) => m.found);
  const highPriorityCoverage =
    highPriorityConcepts.length > 0
      ? Math.round((highPriorityFound.length / highPriorityConcepts.length) * 100)
      : 100;

  // Frequently examined concepts that are missing
  const frequentlyExaminedMissing = matches
    .filter((m) => !m.found && m.concept.isFrequentlyTested)
    .map((m) => m.concept.name);

  // Rating logic
  let rating: ExamReadiness["rating"];
  let revisionPriority: ExamReadiness["revisionPriority"];
  let estimatedScoreRange: string;

  if (
    highPriorityCoverage >= 90 &&
    frequentlyExaminedMissing.length === 0
  ) {
    rating = "Excellent";
    revisionPriority = "Low";
    estimatedScoreRange = "85–100%";
  } else if (
    highPriorityCoverage >= 75 &&
    frequentlyExaminedMissing.length <= 2
  ) {
    rating = "Good";
    revisionPriority = "Medium";
    estimatedScoreRange = "65–85%";
  } else if (highPriorityCoverage >= 50) {
    rating = "Needs Work";
    revisionPriority = "High";
    estimatedScoreRange = "40–65%";
  } else {
    rating = "At Risk";
    revisionPriority = "Critical";
    estimatedScoreRange = "Below 40%";
  }

  return {
    rating,
    highPriorityConceptsCoverage: highPriorityCoverage,
    frequentlyExaminedMissing,
    revisionPriority,
    estimatedScoreRange,
  };
};

// ─── Stage Runner ──────────────────────────────────────────────────────────

export const runGapDetection = async (ctx: PipelineContext): Promise<void> => {
  console.log(`  [Stage 8] Explainable Gap Detection...`);

  if (!ctx.matchedLesson || !ctx.conceptMatches) {
    // No lesson matched — skip curriculum-based gap detection
    ctx.explainableGaps = [];
    ctx.outcomeAssessments = [];
    ctx.strengthAreas = [];
    console.warn(`  [Stage 8] ⚠️  No lesson/concepts — gap detection skipped`);
    return;
  }

  const lesson = ctx.matchedLesson;
  const matches = ctx.conceptMatches;

  // Build a quick lookup: conceptId → ConceptMatch
  const matchMap = new Map(matches.map((m) => [m.concept.id, m]));

  // ── Assess each learning outcome ──────────────────────────────────────
  const outcomeAssessments: OutcomeAssessment[] = [];
  const gapsNeedingRecommendations: Array<{
    outcomeDescription: string;
    missingConceptNames: string[];
    index: number;
  }> = [];

  for (const outcome of lesson.learningOutcomes) {
    const requiredMatches = outcome.requiredConcepts
      .map((cid) => matchMap.get(cid))
      .filter((m): m is NonNullable<typeof m> => m !== undefined);

    const foundCount = requiredMatches.filter((m) => m.found).length;
    const totalCount = requiredMatches.length;
    const status = determineStatus(foundCount, totalCount);

    const missingConceptNames = requiredMatches
      .filter((m) => !m.found)
      .map((m) => m.concept.name);

    let evidence: string;
    if (status === "achieved") {
      evidence = `Student demonstrated understanding of all ${totalCount} required concept(s).`;
    } else if (status === "partially_achieved") {
      evidence = `Student covered ${foundCount} of ${totalCount} required concept(s). Missing: ${missingConceptNames.join(", ")}.`;
    } else {
      evidence = `No evidence found for this learning outcome in the student's notes. Required: ${missingConceptNames.join(", ")}.`;
    }

    const assessment: OutcomeAssessment = {
      outcome,
      status,
      foundConceptCount: foundCount,
      totalConceptCount: totalCount,
      missingConceptNames,
      evidence,
    };

    outcomeAssessments.push(assessment);

    if (status !== "achieved" && missingConceptNames.length > 0) {
      gapsNeedingRecommendations.push({
        outcomeDescription: outcome.description,
        missingConceptNames,
        index: outcomeAssessments.length - 1,
      });
    }
  }

  // ── Generate study recommendations for gaps ───────────────────────────
  const recommendations = await generateRecommendations(
    lesson.subject,
    lesson.lessonName,
    lesson.textbookReference,
    gapsNeedingRecommendations
  );

  // ── Build explainable gap objects ─────────────────────────────────────
  const explainableGaps: ExplainableGap[] = [];

  for (let i = 0; i < gapsNeedingRecommendations.length; i++) {
    const { outcomeDescription, index } = gapsNeedingRecommendations[i];
    const assessment = outcomeAssessments[index];
    const outcome = assessment.outcome as LearningOutcome;

    // Build missing concept details
    const missingDetails = outcome.requiredConcepts
      .map((cid) => matchMap.get(cid))
      .filter((m): m is NonNullable<typeof m> => m !== undefined && !m.found)
      .map((m) => ({
        id: m.concept.id,
        name: m.concept.name,
        weight: m.concept.weight,
        severity: weightToSeverity(m.concept.weight),
        category: m.concept.category,
      }));

    explainableGaps.push({
      learningOutcome: {
        id: outcome.id,
        description: outcomeDescription,
      },
      status: assessment.status,
      evidence: assessment.evidence,
      missingConcepts: missingDetails,
      recommendation: recommendations[i] ?? `Review ${assessment.missingConceptNames.join(", ")} in your textbook.`,
    });
  }

  // ── Identify strength areas (achieved outcomes) ───────────────────────
  const strengthAreas = outcomeAssessments
    .filter((a) => a.status === "achieved")
    .map((a) => a.outcome.description);

  // ── Calculate exam readiness ──────────────────────────────────────────
  const examReadiness = calculateExamReadiness(ctx);

  // ── Write to context ──────────────────────────────────────────────────
  ctx.outcomeAssessments = outcomeAssessments;
  ctx.explainableGaps = explainableGaps;
  ctx.strengthAreas = strengthAreas;
  ctx.examReadiness = examReadiness;

  const notAchieved = outcomeAssessments.filter(
    (a) => a.status === "not_achieved"
  ).length;
  const partial = outcomeAssessments.filter(
    (a) => a.status === "partially_achieved"
  ).length;
  const achieved = outcomeAssessments.filter(
    (a) => a.status === "achieved"
  ).length;

  console.log(
    `  [Stage 8] ✅ Outcomes: ${achieved} achieved, ${partial} partial, ${notAchieved} not achieved`
  );
  console.log(
    `  [Stage 8]    Exam Readiness: ${examReadiness.rating} | ` +
      `High-priority coverage: ${examReadiness.highPriorityConceptsCoverage}% | ` +
      `Frequently examined missing: ${examReadiness.frequentlyExaminedMissing.length}`
  );
};
