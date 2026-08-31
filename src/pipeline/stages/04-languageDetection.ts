import { LanguageDetectionOutput, PipelineContext } from "../types";

/**
 * Detects the script directly from cleaned OCR output. This is deterministic,
 * fast, and avoids an extra LLM call. English technical terms within Sinhala
 * notes are expected, so meaningful use of both scripts is classified as
 * Mixed rather than forcing one language.
 */
export const runLanguageDetection = (ctx: PipelineContext): void => {
  console.log("  [Stage 4] Language Detection...");

  const text = ctx.ocrCleaning?.cleanedText ?? ctx.rawOcrText ?? "";
  const sinhalaCharacters = (text.match(/[\u0D80-\u0DFF]/g) ?? []).length;
  const latinWords = (text.match(/[A-Za-z]{2,}/g) ?? []).length;

  let output: LanguageDetectionOutput;
  if (sinhalaCharacters >= 10 && latinWords >= 8) {
    output = { primaryLanguage: "Mixed", confidence: 90 };
  } else if (sinhalaCharacters >= 10) {
    output = { primaryLanguage: "Sinhala", confidence: 95 };
  } else if (latinWords >= 5) {
    output = { primaryLanguage: "English", confidence: 90 };
  } else {
    output = { primaryLanguage: "Unknown", confidence: 0 };
  }

  ctx.contentLanguage = output;
  console.log(`  [Stage 4] ${output.primaryLanguage} (${output.confidence}%)`);
};
