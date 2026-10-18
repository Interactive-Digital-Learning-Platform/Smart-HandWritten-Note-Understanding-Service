import { createHash } from "node:crypto";
import type { CachedOcrInput, OcrExtractionOutput } from "./types";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const ocrIdentity = (text: string, pages: string[]) => ({ textSha256: hash(text), imagesSha256: hash(JSON.stringify(pages)) });
export const UNKNOWN_OCR_WARNING = "OCR page quality is unknown for this reused text; read the uploaded pages again before relying on the trained concept check.";
const isOcrWarning = (warning: string) => /^(?:OCR\b|Low OCR confidence:|Low image quality detected)/i.test(warning);
const uniqueWarnings = (warnings: unknown): string[] => Array.isArray(warnings)
  ? [...new Set(warnings.filter((warning): warning is string => typeof warning === "string" && isOcrWarning(warning)))] : [];

/** Server-side cache input, never accepted from a student's request body. */
export function cachedOcrInput(note: {
  rawOcrText?: string; rawText?: string;
  analysis?: { ocrPageSummary?: OcrExtractionOutput; ocrConfidence?: number; ocrLowQualityWarning?: boolean; qualityWarnings?: string[] };
}, refreshOcr = false): { rawOcrText?: string; cachedOcr?: CachedOcrInput } {
  if (refreshOcr) return {};
  const text = note.rawOcrText?.trim() ? note.rawOcrText : note.rawText;
  if (!text?.trim()) return {};
  return { rawOcrText: text, cachedOcr: {
    extraction: note.analysis?.ocrPageSummary,
    confidenceScore: note.analysis?.ocrConfidence,
    lowQualityWarning: note.analysis?.ocrLowQualityWarning,
    warnings: uniqueWarnings(note.analysis?.qualityWarnings),
  } };
}

function validCounts(summary: OcrExtractionOutput | undefined, expectedPages: number): summary is OcrExtractionOutput & { extractedPages: number; failedPages: number } {
  return !!summary && Number.isInteger(summary.totalPages) && summary.totalPages === expectedPages && expectedPages > 0
    && Number.isInteger(summary.extractedPages) && Number.isInteger(summary.failedPages)
    && summary.extractedPages! > 0 && summary.failedPages! >= 0
    && summary.extractedPages! + summary.failedPages! === summary.totalPages;
}

export function completeOcrPages(summary: OcrExtractionOutput | undefined, expectedPages: number) {
  return validCounts(summary, expectedPages) && summary.qualityState !== "unknown" && summary.failedPages === 0;
}

/** Retain genuine page counts, including legacy server-owned summaries. New
 * snapshots also bind those counts to the exact text and ordered image URLs. */
export function restoreOcrSummary(text: string, pages: string[], cached?: CachedOcrInput): OcrExtractionOutput {
  const identity = ocrIdentity(text, pages);
  const previous = cached?.extraction;
  const warnings = uniqueWarnings([...uniqueWarnings(previous?.warnings), ...uniqueWarnings(cached?.warnings)]);
  const fingerprintsMatch = !previous?.textSha256 && !previous?.imagesSha256
    || previous?.textSha256 === identity.textSha256 && previous?.imagesSha256 === identity.imagesSha256;
  const countsKnown = validCounts(previous, pages.length) && fingerprintsMatch;
  // A retained page-failure warning cannot be erased by a contradictory zero.
  const contradictoryWarning = previous?.failedPages === 0 && warnings.some(warning => /^OCR (?:could not read [1-9]|page \d+ was excluded)/i.test(warning));
  const known = countsKnown && previous?.qualityState !== "unknown" && !contradictoryWarning;
  if (countsKnown && previous.failedPages > 0) {
    warnings.push(`OCR could not read ${previous.failedPages} of ${pages.length} uploaded page(s); coverage may be incomplete.`);
  }
  if (!known) warnings.push(UNKNOWN_OCR_WARNING);
  return {
    totalPages: pages.length,
    ...(countsKnown ? { extractedPages: previous.extractedPages, failedPages: previous.failedPages } : {}),
    source: "cached", qualityState: known ? "known" : "unknown", ...identity,
    warnings: [...new Set(warnings)],
    ...(previous?.readability ? { readability: {
      confidenceScore: previous.readability.confidenceScore,
      lowQualityWarning: previous.readability.lowQualityWarning,
    } } : {}),
  };
}
