import { config } from "../config/config";
import { groqPool } from "./groqPool";
import { IAnalysis, ILearningGap } from "../models/Note";

// Response types.

export interface AnalysisResult {
  success: boolean;
  analysis?: IAnalysis;
  error?: string;
}

// Groq response before validation.
interface RawAnalysis {
  subject?: unknown;
  topic?: unknown;
  gradeLevel?: unknown;
  keyConcepts?: unknown;
  strengthAreas?: unknown;
  missingConcepts?: unknown;
  learningGaps?: unknown;
  overallCompleteness?: unknown;
}

// Instructions sent to Groq.

const SYSTEM_PROMPT = `You are an expert educational analyst specializing in Sri Lanka's 
secondary school curriculum (O/L and A/L levels). You deeply understand subjects like 
Biology, Physics, Chemistry, Mathematics, Combined Science, History, Geography, 
Commerce, and ICT as taught in Sri Lankan government and private schools.

Your job is to analyze handwritten student notes (after OCR extraction), assess their 
quality and completeness, and identify learning gaps — concepts the student has missed 
or explained poorly compared to what the Sri Lankan curriculum expects them to know.

You always respond with ONLY a valid JSON object, no markdown fences, no explanation text.`;

// Builds the prompt from the note text.

const buildAnalysisPrompt = (rawText: string): string => `
Analyze the following student notes extracted via OCR from a handwritten page.

EXTRACTED NOTES TEXT:
"""
${rawText}
"""

Respond with ONLY a valid JSON object in EXACTLY this structure (no extra fields, no markdown):
{
  "subject": "The academic subject (e.g., Biology, Physics, Mathematics)",
  "topic": "The specific topic within the subject (e.g., Photosynthesis, Newton's Laws)",
  "gradeLevel": "Estimated Sri Lanka grade level (e.g., Grade 10, Grade 11 O/L, Grade 12 A/L)",
  "keyConcepts": [
    "List of key concepts that ARE clearly present in the notes"
  ],
  "strengthAreas": [
    "Specific areas where the student's notes show clear understanding"
  ],
  "missingConcepts": [
    "Important concepts for this topic in the SL curriculum that are ABSENT from these notes"
  ],
  "learningGaps": [
    {
      "concept": "Name of the missing or poorly explained concept",
      "severity": "high",
      "suggestion": "Specific, actionable advice for this student to understand this concept"
    }
  ],
  "overallCompleteness": 65
}

Severity rules:
- "high"   = critical concept missing (would cause exam failure)
- "medium" = important gap (affects understanding but not critical)
- "low"    = minor gap (supplementary knowledge)

overallCompleteness is an integer 0–100 representing how complete these notes are 
relative to full curriculum coverage of this topic.

If the OCR text is very short or unclear, still give your best analysis based on 
what you can detect.`;

// Reads JSON even when it is inside a code block.
const extractJson = (content: string): RawAnalysis => {
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const stripped = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : stripped;

  return JSON.parse(jsonStr) as RawAnalysis;
};

// Checks and cleans the Groq response.
const validateAnalysis = (raw: RawAnalysis): IAnalysis => {
  const safeString = (v: unknown, fallback: string) =>
    typeof v === "string" && v.trim() ? v.trim() : fallback;

  const safeStringArray = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];

  const safeNumber = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return isNaN(n) ? fallback : Math.min(100, Math.max(0, Math.round(n)));
  };

  const safeGaps = (v: unknown): ILearningGap[] => {
    if (!Array.isArray(v)) return [];
    return v
      .filter((g) => g && typeof g === "object")
      .map((g: Record<string, unknown>) => ({
        concept: safeString(g.concept, "Unknown concept"),
        severity: (["low", "medium", "high"].includes(g.severity as string)
          ? g.severity
          : "medium") as "low" | "medium" | "high",
        suggestion: safeString(g.suggestion, "Review this concept in your textbook."),
      }));
  };

  return {
    subject: safeString(raw.subject, "Unknown Subject"),
    topic: safeString(raw.topic, "Unknown Topic"),
    gradeLevel: safeString(raw.gradeLevel, "Unknown Grade"),
    keyConcepts: safeStringArray(raw.keyConcepts),
    strengthAreas: safeStringArray(raw.strengthAreas),
    missingConcepts: safeStringArray(raw.missingConcepts),
    learningGaps: safeGaps(raw.learningGaps),
    overallCompleteness: safeNumber(raw.overallCompleteness, 0),
    analyzedAt: new Date(),
  };
};

// Sends the OCR text to Groq and returns the note analysis.
export const analyzeNoteContent = async (
  rawText: string
): Promise<AnalysisResult> => {
  if (!config.groq.apiKey) {
    return {
      success: false,
      error: "Groq API key not configured. Set GROQ_API_KEY in .env",
    };
  }

  if (!rawText || rawText.trim().length < 10) {
    return {
      success: false,
      error:
        "OCR text is too short to analyze. The image may be blank or unclear.",
    };
  }

  try {
    const completion = await groqPool.createChatCompletion({
      model: config.groq.model,
      temperature: 0.2,
      max_tokens: 2048,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildAnalysisPrompt(rawText) },
      ],
    });

    const content = completion.choices[0]?.message?.content;

    if (!content || content.trim() === "") {
      throw new Error("model output must contain text — Groq returned empty response");
    }

    console.log(`📋 Groq raw response length: ${content.length} chars`);

    const raw = extractJson(content);
    const analysis = validateAnalysis(raw);

    console.log(
      `✅ Analysis complete — Subject: ${analysis.subject}, Topic: ${analysis.topic}, ` +
        `Completeness: ${analysis.overallCompleteness}%, Gaps: ${analysis.learningGaps.length}`
    );

    return { success: true, analysis };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Groq analysis failed: ${message}`);
    return {
      success: false,
      error: `AI analysis failed: ${message}`,
    };
  }
};
