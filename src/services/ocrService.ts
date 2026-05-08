import axios, { AxiosError } from "axios";
import fs from "fs";
import path from "path";
import { config } from "../config/config";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface OcrResult {
  success: boolean;
  text: string;
  confidence?: number;
  error?: string;
}

// ─── HuggingFace response shapes ───────────────────────────────────────────

interface HFTextResult {
  generated_text: string;
}

interface HFLoadingResponse {
  error: string;
  estimated_time: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Wait for a given number of milliseconds (used during HF model warm-up)
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── OCR Service ───────────────────────────────────────────────────────────

/**
 * Extracts text from a handwritten note image using Microsoft TrOCR
 * via the Hugging Face Inference API.
 *
 * The HuggingFace free tier may return a "model loading" response on the
 * first call. This function automatically retries up to 3 times with a
 * delay equal to the server's estimated_time.
 *
 * @param imagePath - Absolute path to the uploaded image file
 * @returns OcrResult with the extracted text or an error message
 */
export const extractTextFromImage = async (
  imagePath: string
): Promise<OcrResult> => {
  if (!config.huggingFace.apiKey) {
    return {
      success: false,
      text: "",
      error:
        "Hugging Face API key is not configured. Set HUGGINGFACE_API_KEY in .env",
    };
  }

  // Resolve the absolute path
  const absolutePath = path.isAbsolute(imagePath)
    ? imagePath
    : path.resolve(imagePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      success: false,
      text: "",
      error: `Image file not found at path: ${absolutePath}`,
    };
  }

  const imageBuffer = fs.readFileSync(absolutePath);

  const HF_API_URL = `https://api-inference.huggingface.co/models/${config.huggingFace.ocrModel}`;

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `🔍 OCR attempt ${attempt}/${MAX_RETRIES} for: ${path.basename(absolutePath)}`
      );

      const response = await axios.post<HFTextResult[] | HFLoadingResponse>(
        HF_API_URL,
        imageBuffer,
        {
          headers: {
            Authorization: `Bearer ${config.huggingFace.apiKey}`,
            "Content-Type": "application/octet-stream",
          },
          timeout: 60000, // 60 second timeout for large images
        }
      );

      const data = response.data;

      // ── Check if the model is still loading ────────────────────────────
      if (!Array.isArray(data) && "estimated_time" in data) {
        const waitTime = (data.estimated_time + 5) * 1000;
        console.log(
          `⏳ Model is loading. Waiting ${Math.round(waitTime / 1000)}s before retry...`
        );
        await sleep(waitTime);
        continue;
      }

      // ── Successful response ─────────────────────────────────────────────
      if (Array.isArray(data) && data.length > 0) {
        const extractedText = data
          .map((r) => r.generated_text)
          .join("\n")
          .trim();

        if (!extractedText) {
          return {
            success: false,
            text: "",
            error:
              "OCR completed but no text was detected. The image may be too blurry or the handwriting unclear.",
          };
        }

        console.log(
          `✅ OCR successful. Extracted ${extractedText.length} characters.`
        );

        return {
          success: true,
          text: extractedText,
        };
      }

      return {
        success: false,
        text: "",
        error: "Unexpected response format from OCR API",
      };
    } catch (err) {
      const error = err as AxiosError;

      // ── Rate limit ──────────────────────────────────────────────────────
      if (error.response?.status === 429) {
        console.warn("⚠️ Rate limited by HuggingFace. Waiting 30 seconds...");
        await sleep(30000);
        continue;
      }

      // ── Auth error ──────────────────────────────────────────────────────
      if (error.response?.status === 401) {
        return {
          success: false,
          text: "",
          error: "Invalid HuggingFace API key. Check your HUGGINGFACE_API_KEY.",
        };
      }

      // ── Model not found ─────────────────────────────────────────────────
      if (error.response?.status === 404) {
        return {
          success: false,
          text: "",
          error: `OCR model not found: ${config.huggingFace.ocrModel}`,
        };
      }

      // ── Last attempt — return the error ─────────────────────────────────
      if (attempt === MAX_RETRIES) {
        const message =
          error.response?.data && typeof error.response.data === "object"
            ? JSON.stringify(error.response.data)
            : error.message;

        return {
          success: false,
          text: "",
          error: `OCR failed after ${MAX_RETRIES} attempts: ${message}`,
        };
      }

      console.warn(`⚠️ OCR attempt ${attempt} failed: ${error.message}. Retrying...`);
      await sleep(3000);
    }
  }

  return {
    success: false,
    text: "",
    error: "OCR failed: maximum retries exceeded",
  };
};
