import path from "path";
import fs from "fs";
import { PipelineContext } from "../types";
import { extractTextFromImage } from "../../services/ocrService";
import { config } from "../../config/config";
import { ocrIdentity, restoreOcrSummary } from "../ocrProvenance";

/**
 * Resolves the image URL (which may be a relative upload path like
 * "/uploads/file.jpg", a full HTTP URL, or an absolute filesystem path) to an absolute path
 * that can be read by ocrService.
 */
const resolveImagePath = (imageUrl: string): string => {
  if (!imageUrl) return "";

  if (fs.existsSync(imageUrl)) {
    return imageUrl;
  }

  let cleanPath = imageUrl;
  if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
    try {
      const urlObj = new URL(cleanPath);
      cleanPath = urlObj.pathname;
    } catch {
      // ignore
    }
  }

  // Strip leading slashes/backslashes so path.resolve resolves relative to process.cwd()
  const stripped = cleanPath.replace(/^[/\\]+/, "");
  if (/^uploads[/\\]/i.test(stripped)) {
    return path.resolve(config.uploads.uploadDir, path.basename(stripped));
  }
  return path.resolve(process.cwd(), stripped);
};

/**
 * Stage 01: OCR Extraction for single or multi-page notes.
 *
 * Runs Groq Vision OCR on each page image in sequence, adding clear
 * page demarcations ("--- Page X ---") so downstream stages understand
 * the structure of multi-page handwritten notes.
 */
export const runOcrExtraction = async (
  ctx: PipelineContext
): Promise<void> => {
  const pages = ctx.imageUrls && ctx.imageUrls.length > 0
    ? ctx.imageUrls
    : [ctx.imageUrl];
  if (ctx.rawOcrText && ctx.rawOcrText.trim().length > 0) {
    ctx.ocrExtraction = restoreOcrSummary(ctx.rawOcrText, pages, ctx.cachedOcr);
    ctx.qualityWarnings = [...new Set([...(ctx.qualityWarnings ?? []), ...(ctx.ocrExtraction.warnings ?? [])])];
    console.log(
      `  [Stage 1] ⚡ Pre-extracted OCR text provided (${ctx.rawOcrText.length} chars), skipping vision OCR`
    );
    return;
  }

  // Fresh image extraction replaces cached quality, including its readability.
  ctx.cachedOcr = undefined;
  ctx.ocrExtraction = undefined;

  console.log(
    `  [Stage 1] OCR Extraction — note: ${ctx.noteId} (${pages.length} page(s))`
  );

  const pageTexts: Array<{ pageNumber: number; text: string }> = [];
  let failedPages = 0;
  const pageErrors: string[] = [];

  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    const rawUrl = pages[i];
    const imagePath = resolveImagePath(rawUrl);

    // Inter-page pacing delay (1.2s) to prevent Groq API rate limit spikes
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 1200));
    }

    console.log(`  [Stage 1] 📄 OCR Page ${pageNum}/${pages.length} (${path.basename(imagePath)})`);
    await ctx.reportProgress?.({ stage: "ocr_extraction", currentPage: pageNum });
    let result = await extractTextFromImage(imagePath);

    if (!result.success && /rate limited/i.test(result.error ?? "")) {
      throw new Error(result.error);
    }

    // Retry page once if initial attempt failed
    if (!result.success) {
      console.warn(`  [Stage 1] 🔄 Retrying page ${pageNum} after error: ${result.error}`);
      await new Promise((r) => setTimeout(r, 2000));
      result = await extractTextFromImage(imagePath);
    }

    if (result.success && result.text?.trim()) {
      pageTexts.push({ pageNumber: pageNum, text: result.text.trim() });
    } else {
      console.warn(`  [Stage 1] ⚠️ Page ${pageNum} OCR failed after retries: ${result.error}`);
      failedPages++;
      if (result.error) pageErrors.push(result.error);
    }
  }

  if (pageTexts.length === 0) {
    throw new Error(
      `OCR failed on all ${pages.length} page(s) of note ${ctx.noteId}. ${pageErrors[pageErrors.length - 1] || ""}`.trim()
    );
  }

  const sortedLengths = pageTexts
    .map((page) => page.text.length)
    .sort((left, right) => left - right);
  const medianLength = sortedLengths[Math.floor(sortedLengths.length / 2)] || 0;
  const relativeOutlierLimit = Math.max(3_500, medianLength * 5);
  const acceptedPages = pageTexts.filter((page) => {
    if (pageTexts.length < 3 || page.text.length <= relativeOutlierLimit) {
      return true;
    }
    failedPages++;
    ctx.qualityWarnings = [
      ...(ctx.qualityWarnings ?? []),
      `OCR page ${page.pageNumber} was excluded because its ${page.text.length}-character transcription was an extreme cross-page outlier (median ${medianLength}).`,
    ];
    console.warn(
      `  [Stage 1] ⚠️ Excluding suspicious OCR Page ${page.pageNumber}: ${page.text.length} characters vs median ${medianLength}`
    );
    return false;
  });
  if (acceptedPages.length === 0) {
    throw new Error(`OCR quality checks rejected every page of note ${ctx.noteId}`);
  }
  const combinedText = acceptedPages
    .map((page) =>
      pages.length > 1
        ? `--- Page ${page.pageNumber} ---\n${page.text}`
        : page.text
    )
    .join("\n\n");
  ctx.rawOcrText = combinedText;
  ctx.ocrExtraction = {
    totalPages: pages.length,
    extractedPages: acceptedPages.length,
    failedPages,
    qualityState: "known",
    source: "vision",
    ...ocrIdentity(combinedText, pages),
  };
  if (failedPages > 0) {
    ctx.qualityWarnings = [
      ...(ctx.qualityWarnings ?? []),
      `OCR could not read ${failedPages} of ${pages.length} uploaded page(s); coverage may be incomplete.`,
    ];
  }

  ctx.ocrExtraction.warnings = [...(ctx.qualityWarnings ?? [])];

  console.log(
    `  [Stage 1] ✅ OCR complete across ${acceptedPages.length}/${pages.length} pages — ` +
      `${combinedText.length} total chars extracted` +
      (failedPages > 0 ? ` (${failedPages} page(s) failed)` : "")
  );
};
