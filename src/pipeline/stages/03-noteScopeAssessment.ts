import { config } from "../../config/config";
import { groqPool } from "../../services/groqPool";
import { NoteScopeOutput, PipelineContext } from "../types";

const VALID_SCOPES: NoteScopeOutput["scope"][] = [
  "complete_lesson_note",
  "partial_lesson_note",
  "revision_summary",
  "exercise_or_worksheet",
  "diagram_or_formula_sheet",
  "unknown",
];

const buildPrompt = (text: string, pageCount: number): string => `
Classify the scope of this Grade 10/11 student's handwritten upload. This is
used only to avoid treating a short or specialised upload as a complete lesson
or as proof of what the student does not understand.

Pages uploaded: ${pageCount}
Text extracted from the upload:
"""
${text.slice(0, 4500)}
"""

Choose exactly one scope:
- complete_lesson_note: a reasonably complete explanation of one lesson/topic
- partial_lesson_note: one section/page of a wider lesson
- revision_summary: condensed recall/revision points across a topic
- exercise_or_worksheet: mainly questions, answers, calculations, or activities
- diagram_or_formula_sheet: mainly labelled diagrams, equations, tables, or formulae
- unknown: insufficient OCR evidence to classify responsibly

Respond ONLY with valid JSON:
{
  "scope": "partial_lesson_note",
  "confidence": 82,
  "rationale": "One page covers only a subsection of the lesson."
}

Rules:
- Do not infer that a student lacks knowledge from this classification.
- If uncertain, choose unknown or partial_lesson_note rather than complete_lesson_note.
- confidence must be an integer from 0 to 100.
`;

/** Stage 3: determine the upload scope before interpreting omissions. */
export const runNoteScopeAssessment = async (ctx: PipelineContext): Promise<void> => {
  console.log("  [Stage 3] Note Scope Assessment...");

  const text = ctx.ocrCleaning?.cleanedText ?? ctx.rawOcrText ?? "";
  const pageCount = ctx.imageUrls?.length || 1;

  if (text.trim().length < 20) {
    ctx.noteScope = {
      scope: "unknown",
      confidence: 0,
      rationale: "The extracted text is too short to determine whether this upload represents a complete lesson.",
    };
    return;
  }

  try {
    const completion = await groqPool.createChatCompletion({
      model: config.groq.model,
      temperature: 0.1,
      max_tokens: 500,
      messages: [{ role: "user", content: buildPrompt(text, pageCount) }],
    });

    let raw = completion.choices[0]?.message?.content?.trim() ?? "";
    raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    const scope = VALID_SCOPES.includes(parsed.scope)
      ? parsed.scope as NoteScopeOutput["scope"]
      : "unknown";

    ctx.noteScope = {
      scope,
      confidence: typeof parsed.confidence === "number"
        ? Math.min(100, Math.max(0, Math.round(parsed.confidence)))
        : 50,
      rationale: typeof parsed.rationale === "string" && parsed.rationale.trim()
        ? parsed.rationale.trim()
        : "The upload was classified from its extracted structure and content.",
    };
  } catch (error) {
    // Conservative fallback: never treat a failed classification as complete.
    ctx.noteScope = {
      scope: "unknown",
      confidence: 0,
      rationale: "The note scope could not be classified, so coverage findings should be interpreted cautiously.",
    };
    console.warn("  [Stage 3] Note scope assessment failed:", error instanceof Error ? error.message : error);
  }

  console.log(`  [Stage 3] ${ctx.noteScope.scope} (${ctx.noteScope.confidence}%): ${ctx.noteScope.rationale}`);
};
