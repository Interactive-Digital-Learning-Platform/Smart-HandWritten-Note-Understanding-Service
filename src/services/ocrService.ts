import fs from "fs";
import path from "path";
import Groq from "groq-sdk";
import { config } from "../config/config";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface OcrResult {
  success: boolean;
  text: string;
  confidence?: number;
  error?: string;
}

// ─── OCR Service ───────────────────────────────────────────────────────────

const groq = new Groq({
  apiKey: config.groq.apiKey,
});

/**
 * Extracts text from a handwritten note image using Llama 3.2 Vision on Groq.
 *
 * This replaces the previous TrOCR implementation which is no longer available.
 * Groq Vision is significantly faster and better at understanding context
 * in handwritten notes.
 *
 * @param imagePath - Absolute path to the uploaded image file
 * @returns OcrResult with the extracted text or an error message
 */
export const extractTextFromImage = async (
  imagePath: string
): Promise<OcrResult> => {
  if (!config.groq.apiKey) {
    return {
      success: false,
      text: "",
      error: "Groq API key is not configured. Set GROQ_API_KEY in .env",
    };
  }

  try {
    let absolutePath = imagePath;
    if (!fs.existsSync(absolutePath)) {
      const stripped = imagePath.replace(/^[/\\]+/, "");
      const resolved = path.resolve(process.cwd(), stripped);
      if (fs.existsSync(resolved)) {
        absolutePath = resolved;
      } else {
        return {
          success: false,
          text: "",
          error: `Image file not found at path: ${imagePath}`,
        };
      }
    }

    // Read image and convert to base64
    const imageBuffer = fs.readFileSync(absolutePath);
    const base64Image = imageBuffer.toString("base64");
    const mimeType = path.extname(absolutePath).toLowerCase() === ".png" ? "image/png" : "image/jpeg";

    console.log(`🔍 OCR via Groq Vision for: ${path.basename(absolutePath)}`);

    // qwen/qwen3.6-27b is currently the only vision-capable model available
    // on this Groq account. Llama 3.2 vision models have been decommissioned.
    // Add new models here as they become available.
    const VISION_MODELS = [
      "qwen/qwen3.6-27b",
    ];

    // Per-request timeout: 25 seconds. Without this the Groq SDK can hang
    // indefinitely when the server is over capacity but doesn't immediately close
    // the connection.
    const REQUEST_TIMEOUT_MS = 25_000;

    let extractedText = "";
    let lastError: any = null;

    for (const model of VISION_MODELS) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (attempt > 1 || model !== VISION_MODELS[0]) {
            console.log(`🔄 OCR model ${model} (attempt ${attempt}/3)...`);
          }

          // Wrap each API call with a timeout so we never hang indefinitely
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

          try {
            const chatCompletion = await groq.chat.completions.create(
              {
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "Exhaustively transcribe ALL text from this handwritten note image. Include every single word, title, header, sub-header, bullet point, numbered list, marginal note, equation, formula, definition, and diagram label. Do not omit, summarize, skip, or truncate any content. If there are diagrams or drawings, describe them in brackets like [Diagram: Description of process]. Return ONLY the full transcription text from top to bottom.",
                      },
                      {
                        type: "image_url",
                        image_url: {
                          url: `data:${mimeType};base64,${base64Image}`,
                        },
                      },
                    ],
                  },
                ],
                model,
                temperature: 0.1,
                max_tokens: 4096,
              },
              { signal: controller.signal }
            );

            let rawContent = chatCompletion.choices[0]?.message?.content?.trim() || "";
            // Strip Qwen <think>...</think> reasoning blocks if present
            rawContent = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
            extractedText = rawContent;
          } finally {
            clearTimeout(timeoutId);
          }

          if (extractedText) break;

        } catch (err: any) {
          lastError = err;
          const status = err?.status || err?.statusCode;
          const msg = err?.message || String(err);

          console.warn(`⚠️ Groq OCR model ${model} attempt ${attempt} failed: ${status || "Timeout/Error"} ${msg}`);

          if (err.name === "AbortError" || msg.includes("aborted")) {
            console.warn(`⚠️ Groq OCR model ${model} request timed out (${REQUEST_TIMEOUT_MS / 1000}s)`);
          }

          if (status === 503 || status === 429 || msg.includes("over capacity") || msg.includes("rate limit")) {
            // Exponential backoff for rate limit / capacity: wait 2s, 4s, 6s... then retry
            const backoffMs = attempt * 2500;
            console.log(`⏳ Groq rate limit/capacity hit. Waiting ${backoffMs / 1000}s before retry...`);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
          } else if (status === 500) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
          } else {
            // Non-retryable error
            break;
          }
        }
      }
      if (extractedText) break;
    }

    if (!extractedText) {
      const isCapacity = lastError?.status === 503 ||
        lastError?.name === "AbortError" ||
        String(lastError?.message).includes("over capacity") ||
        String(lastError?.message).includes("aborted");

      const userMessage = isCapacity
        ? "The AI vision service is currently at capacity. Please try again in a few minutes."
        : `OCR failed: ${lastError?.message || "Groq Vision was unavailable or returned empty text"}`;

      return { success: false, text: "", error: userMessage };
    }

    console.log(`✅ OCR successful via Groq. Extracted ${extractedText.length} characters.`);

    return {
      success: true,
      text: extractedText,
    };
  } catch (err: any) {
    console.error("❌ Groq OCR error:", err);
    return {
      success: false,
      text: "",
      error: `OCR failed: ${err.message || "Unknown error"}`,
    };
  }
};
