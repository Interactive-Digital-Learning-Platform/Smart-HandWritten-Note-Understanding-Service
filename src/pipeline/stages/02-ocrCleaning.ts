// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Stage 2 — OCR Cleaning & Normalization
// ═══════════════════════════════════════════════════════════════════════════
//
// Takes the raw OCR output and:
//   1. Fixes common OCR errors (stray characters, line-break issues)
//   2. Normalizes punctuation and whitespace
//   3. Estimates a legibility/confidence score via LLM
//   4. Flags very low quality images for re-upload warnings
//
// Research Contribution: Implements the "OCR Cleaning" stage from the
// proposed Hybrid AI Architecture (Improvement 9).
// ═══════════════════════════════════════════════════════════════════════════

import { config } from "../../config/config";
import { groqPool } from "../../services/groqPool";
import { PipelineContext, OcrCleaningOutput } from "../types";

// ─── Rule-based pre-cleaning ───────────────────────────────────────────────

/**
 * Applies deterministic text-normalization rules to fix the most
 * common OCR artifacts before passing to the LLM cleaner.
 */
const precleanText = (raw: string): string => {
  return raw
    // Normalize Windows/Mac line endings to Unix
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Collapse 3+ consecutive blank lines to 2
    .replace(/\n{3,}/g, "\n\n")
    // Remove stray isolated punctuation noise
    .replace(/^\s*[|_\-~`^•]\s*$/gm, "")
    // Normalize common OCR confusion: l→1 in obvious digit context
    .replace(/\b[lI](?=\d)/g, "1")
    // Collapse excessive spaces within a line
    .replace(/[ \t]{2,}/g, " ")
    // Trim whitespace per line
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
};

// ─── LLM Cleaning + Confidence Score ──────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert OCR post-processor and educational text cleaner.
You receive text extracted from handwritten student notes (including multi-page notes).
Your job is to:
1. Fix obvious OCR errors (garbled characters, typo artifacts, broken formatting)
2. PRESERVE 100% OF ALL CONTENT — do NOT summarize, shorten, remove, or abbreviate any sentence, definition, header, or bullet point!
3. Keep all subject-specific terms, formulas, equations, page dividers (e.g. "--- Page X ---"), and diagrams intact
4. Estimate how legible the original handwriting was on a scale of 0–100

Respond with ONLY a valid JSON object, no markdown fences, no explanation:
{
  "cleanedText": "The exact full corrected text here...",
  "confidenceScore": 85,
  "lowQualityWarning": false,
  "qualityNote": "Handwriting is clear and well-structured"
}

Rules:
- CRITICAL: "cleanedText" MUST contain the COMPLETE text without cutting off any paragraph or section.
- confidenceScore: 0=unreadable, 50=poor, 75=acceptable, 90=good, 100=perfect
- lowQualityWarning: true if confidenceScore < 50
- qualityNote: one sentence about handwriting quality`;

export const runOcrCleaning = async (ctx: PipelineContext): Promise<void> => {
  console.log(`  [Stage 2] OCR Cleaning...`);

  if (!ctx.rawOcrText) {
    throw new Error("Stage 2 requires rawOcrText from Stage 1");
  }

  // ── Step 1: Rule-based pre-cleaning ───────────────────────────────────
  const precleaned = precleanText(ctx.rawOcrText);

  // ── Step 2: LLM-assisted deep cleaning ────────────────────────────────
  let output: OcrCleaningOutput;

  try {
    const isLargeText = precleaned.length > 3500;
    const textSample = isLargeText ? precleaned.slice(0, 3000) : precleaned;

    const completion = await groqPool.createChatCompletion({
      model: config.groq.model,
      temperature: 0.1,
      max_tokens: 2048,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Clean and assess the following OCR text extracted from a student's handwritten notes:\n\n"""\n${textSample}\n"""`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = JSON.parse(stripped);

    output = {
      cleanedText:
        isLargeText
          ? precleaned
          : typeof parsed.cleanedText === "string" && parsed.cleanedText.trim()
          ? parsed.cleanedText.trim()
          : precleaned, // Fallback to pre-cleaned
      confidenceScore:
        typeof parsed.confidenceScore === "number"
          ? Math.min(100, Math.max(0, Math.round(parsed.confidenceScore)))
          : 75,
      lowQualityWarning:
        typeof parsed.lowQualityWarning === "boolean"
          ? parsed.lowQualityWarning
          : false,
      qualityNote:
        typeof parsed.qualityNote === "string" ? parsed.qualityNote : undefined,
    };
  } catch (err) {
    // Fallback: use pre-cleaned text with a neutral confidence score
    console.warn(
      `  [Stage 2] ⚠️  LLM cleaning failed, using rule-based output:`,
      err instanceof Error ? err.message : err
    );
    output = {
      cleanedText: precleaned,
      confidenceScore: 70,
      lowQualityWarning: false,
      qualityNote: "OCR cleaning used fallback (rule-based only)",
    };
  }

  // Do not rely solely on an LLM-provided boolean. The numeric score is the
  // pipeline's deterministic quality gate: below 60, coverage findings should
  // be treated as tentative and the student should be asked to recapture.
  if (output.confidenceScore < 60) {
    output.lowQualityWarning = true;
    output.qualityNote = output.qualityNote || "The extracted handwriting is difficult to read.";
  }

  ctx.ocrCleaning = output;
  if (output.lowQualityWarning) {
    ctx.qualityWarnings = [
      ...(ctx.qualityWarnings ?? []),
      "Low OCR confidence: recapture this note in better lighting before relying on coverage findings.",
    ];
  }

  console.log(
    `  [Stage 2] ✅ Cleaned (${output.cleanedText.length} chars, ` +
      `confidence: ${output.confidenceScore}%` +
      (output.lowQualityWarning ? " ⚠️ LOW QUALITY" : "") +
      `)`
  );
};
