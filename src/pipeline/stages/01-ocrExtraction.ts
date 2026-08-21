import path from "path";
import fs from "fs";
import { PipelineContext } from "../types";
import { extractTextFromImage } from "../../services/ocrService";

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
  if (ctx.rawOcrText && ctx.rawOcrText.trim().length > 0) {
    console.log(
      `  [Stage 1] ⚡ Pre-extracted OCR text provided (${ctx.rawOcrText.length} chars), skipping vision OCR`
    );
    return;
  }

  const pages = ctx.imageUrls && ctx.imageUrls.length > 0
    ? ctx.imageUrls
    : [ctx.imageUrl];


  console.log(
    `  [Stage 1] OCR Extraction — note: ${ctx.noteId} (${pages.length} page(s))`
  );

  const pageTexts: string[] = [];
  let failedPages = 0;

  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    const rawUrl = pages[i];
    const imagePath = resolveImagePath(rawUrl);

    // Inter-page pacing delay (1.2s) to prevent Groq API rate limit spikes
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 1200));
    }

    console.log(`  [Stage 1] 📄 OCR Page ${pageNum}/${pages.length} (${path.basename(imagePath)})`);
    let result = await extractTextFromImage(imagePath);

    // Retry page once if initial attempt failed
    if (!result.success) {
      console.warn(`  [Stage 1] 🔄 Retrying page ${pageNum} after error: ${result.error}`);
      await new Promise((r) => setTimeout(r, 2000));
      result = await extractTextFromImage(imagePath);
    }

    if (result.success && result.text) {
      if (pages.length > 1) {
        pageTexts.push(`--- Page ${pageNum} ---\n${result.text.trim()}`);
      } else {
        pageTexts.push(result.text.trim());
      }
    } else {
      console.warn(`  [Stage 1] ⚠️ Page ${pageNum} OCR failed after retries: ${result.error}`);
      failedPages++;
    }
  }

  if (pageTexts.length === 0) {
    throw new Error(
      `OCR failed on all ${pages.length} page(s) of note ${ctx.noteId}`
    );
  }

  const combinedText = pageTexts.join("\n\n");
  ctx.rawOcrText = combinedText;

  console.log(
    `  [Stage 1] ✅ OCR complete across ${pageTexts.length}/${pages.length} pages — ` +
      `${combinedText.length} total chars extracted` +
      (failedPages > 0 ? ` (${failedPages} page(s) failed)` : "")
  );
};
