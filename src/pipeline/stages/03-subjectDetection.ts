// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Stage 3 — Subject Detection
// ═══════════════════════════════════════════════════════════════════════════
//
// Uses the LLM to identify the academic subject, grade level, and a rough
// topic hint from the cleaned OCR text.
//
// This is a SPECIALIZED single-task LLM call — it only identifies the
// subject and grade. The lesson matching happens in Stage 4.
//
// Research Contribution: Separates "what is this about?" from the combined
// analysis call, improving accuracy for each task (Improvement 9).
// ═══════════════════════════════════════════════════════════════════════════

import Groq from "groq-sdk";
import { config } from "../../config/config";
import { PipelineContext, SubjectDetectionOutput } from "../types";
import { getAllSubjects } from "../../curriculum";

const groq = new Groq({ apiKey: config.groq.apiKey });

// ─── Prompt ────────────────────────────────────────────────────────────────

const buildPrompt = (text: string, availableSubjects: string[]): string => `
You are an expert at identifying academic subjects and lesson topics in Sri Lankan G.C.E. O/L student notes.

The available subjects in our curriculum database are:
${availableSubjects.map((s) => `  - ${s}`).join("\n")}

Analyze the following student notes and identify:
1. The academic subject (MUST be one from the list above, e.g. "Science", "Biology", "Chemistry", "Physics", "Mathematics", etc.)
2. The grade level (10 or 11, or 0 if unclear; infer 10 or 11 if topic is standard O/L syllabus)
3. The specific topic / lesson title being studied. If the notes contain a heading or title (such as "Chemical Basis of life", "Photosynthesis", "The Periodic Table", etc.), use that exact title/topic name (1–6 words).
4. Your confidence in the subject identification (0–100)

STUDENT NOTES:
"""
${text.slice(0, 1500)}
"""

Respond ONLY with this JSON (no markdown, no explanation):
{
  "subject": "Science",
  "grade": 10,
  "topicHint": "Chemical Basis of Life",
  "confidence": 95,
  "rawGradeText": ""
}

Rules:
- subject must match one of the available subjects above, or "Unknown"
- grade: 10, 11, or 0 (infer 10 or 11 based on standard O/L syllabus)
- topicHint: the lesson title or primary topic from the notes (1–6 words)
- confidence: 0–100, how certain you are about the subject and topic
- rawGradeText: the exact text in the notes that indicated the grade (or "")`;

// ─── Stage Runner ──────────────────────────────────────────────────────────

export const runSubjectDetection = async (
  ctx: PipelineContext
): Promise<void> => {
  console.log(`  [Stage 3] Subject Detection...`);

  const textToAnalyze =
    ctx.ocrCleaning?.cleanedText ?? ctx.rawOcrText ?? "";

  if (!textToAnalyze || textToAnalyze.trim().length < 10) {
    throw new Error("Stage 3 requires cleaned OCR text of at least 10 characters");
  }

  // Get available subjects from the KB so LLM only picks from known subjects
  let availableSubjects: string[];
  try {
    availableSubjects = getAllSubjects();
  } catch {
    // KB might not be loaded in test scenarios — use defaults
    availableSubjects = ["Biology", "Physics", "Chemistry", "Mathematics"];
  }

  let output: SubjectDetectionOutput;

  try {
    const completion = await groq.chat.completions.create({
      model: config.groq.model,
      temperature: 0.1,
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: buildPrompt(textToAnalyze, availableSubjects),
        },
      ],
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

    // Validate subject is in our KB (case-insensitive)
    let subject = "Unknown";
    if (typeof parsed.subject === "string" && parsed.subject.trim()) {
      const match = availableSubjects.find(
        (s) => s.toLowerCase() === parsed.subject.trim().toLowerCase()
      );
      if (match) {
        subject = match;
      }
    }

    const grade =
      typeof parsed.grade === "number" && [10, 11].includes(parsed.grade)
        ? parsed.grade
        : 0;

    output = {
      subject,
      grade,
      topicHint:
        typeof parsed.topicHint === "string" && parsed.topicHint.trim()
          ? parsed.topicHint.trim()
          : "Unknown Topic",
      confidence:
        typeof parsed.confidence === "number"
          ? Math.min(100, Math.max(0, parsed.confidence))
          : 50,
      rawGradeText:
        typeof parsed.rawGradeText === "string" ? parsed.rawGradeText : "",
    };
  } catch (err) {
    // Fallback: unknown subject
    console.warn(
      `  [Stage 3] ⚠️  LLM subject detection failed:`,
      err instanceof Error ? err.message : err
    );
    output = {
      subject: "Unknown",
      grade: 0,
      topicHint: "Unknown Topic",
      confidence: 0,
      rawGradeText: "",
    };
  }

  ctx.subjectDetection = output;

  console.log(
    `  [Stage 3] ✅ Subject: ${output.subject}, Grade: ${output.grade || "?"}, ` +
      `Topic Hint: "${output.topicHint}", Confidence: ${output.confidence}%`
  );
};
