import fs from "fs";
import path from "path";
import { config } from "../config/config";
import { groqPool } from "./groqPool";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface OcrResult {
  success: boolean;
  text: string;
  confidence?: number;
  error?: string;
}

const MAX_REASONABLE_PAGE_CHARACTERS = 2_200;

export const validateOcrPageText = (
  text: string
): { valid: boolean; reason?: string } => {
  const trimmed = text.trim();
  if (!trimmed) return { valid: false, reason: "OCR returned empty text" };
  if (/<\/?think>/i.test(trimmed)) {
    return { valid: false, reason: "OCR returned model reasoning instead of only transcription" };
  }
  if (trimmed.length > MAX_REASONABLE_PAGE_CHARACTERS) {
    return {
      valid: false,
      reason: `OCR returned ${trimmed.length} characters for one handwritten page (limit ${MAX_REASONABLE_PAGE_CHARACTERS})`,
    };
  }
  return { valid: true };
};

const parseRetryAfterMs = (message: string): number | undefined => {
  const minutesAndSeconds = message.match(
    /try again in\s+(\d+)m(?:(\d+(?:\.\d+)?)s)?/i
  );
  if (minutesAndSeconds) {
    return (
      Number.parseInt(minutesAndSeconds[1], 10) * 60_000 +
      Number.parseFloat(minutesAndSeconds[2] || "0") * 1_000
    );
  }
  const seconds = message.match(/try again in\s+(\d+(?:\.\d+)?)s/i);
  return seconds ? Number.parseFloat(seconds[1]) * 1_000 : undefined;
};

// ─── OCR Service ───────────────────────────────────────────────────────────

/**
 * Extracts text from a handwritten note image using Llama 3.2 / Qwen Vision on Groq.
 *
 * Automatically rotates across available Groq pool keys.
 *
 * @param imagePath - Absolute path to the uploaded image file
 * @returns OcrResult with the extracted text or an error message
 */
export const extractTextFromImage = async (
  imagePath: string
): Promise<OcrResult> => {
  if (!config.groq.apiKey && config.groq.apiKeys.length === 0) {
    return {
      success: false,
      text: "",
      error: "Groq API key is not configured. Set GROQ_API_KEY or GROQ_API_KEYS in .env",
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
    let lastFailureKind: "rate_limit" | "capacity" | "other" = "other";
    let retryAfterMs = 0;

    for (const model of VISION_MODELS) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const poolStatus = groqPool.getStatus();
        if (poolStatus.totalKeys > 0 && poolStatus.healthyKeys === 0) {
          lastFailureKind = "rate_limit";
          retryAfterMs = Math.max(
            retryAfterMs,
            ...poolStatus.cooldowns.map(
              (cooldown) => cooldown.cooldownSecondsRemaining * 1_000
            )
          );
          break;
        }
        const { client, keyIndex, maskedKey } = groqPool.getNextClient();

        try {
          if (attempt > 1 || model !== VISION_MODELS[0]) {
            console.log(`🔄 OCR model ${model} via Key #${keyIndex + 1} (${maskedKey}) (attempt ${attempt}/3)...`);
          }

          // Wrap each API call with a timeout so we never hang indefinitely
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

          try {
            const chatCompletion = await client.chat.completions.create(
              {
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "Act only as an OCR transcription engine. Transcribe the text that is visibly written in this image from top to bottom, including headings, bullets, equations, corrections, marginal notes, and visible diagram labels. Preserve the exact original language and script (including Sinhala); never translate or romanize it. Never infer, explain, expand, complete, or continue the educational content. Never add textbook knowledge that is not visibly written. Use [illegible] for unreadable text. Return only the transcription.",
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
                // A handwritten page in this workflow is normally well below
                // 600 output tokens. Keeping this bounded reduces quota use
                // and limits the blast radius of a hallucinated continuation.
                max_tokens: 600,
              },
              { signal: controller.signal }
            );

            const choice = chatCompletion.choices[0];
            let rawContent = choice?.message?.content?.trim() || "";
            // Strip Qwen <think>...</think> reasoning blocks if present
            rawContent = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
            if (choice?.finish_reason === "length") {
              lastError = new Error(
                "OCR output reached the token limit and may contain a hallucinated continuation"
              );
              extractedText = "";
              console.warn("⚠️ Rejected OCR output that reached the token limit");
              continue;
            }
            const validation = validateOcrPageText(rawContent);
            if (!validation.valid) {
              lastError = new Error(validation.reason);
              extractedText = "";
              console.warn(`⚠️ Rejected suspicious OCR output: ${validation.reason}`);
              continue;
            }
            extractedText = rawContent;
          } finally {
            clearTimeout(timeoutId);
          }

          if (extractedText) break;

        } catch (err: any) {
          lastError = err;
          const status = err?.status || err?.statusCode;
          const msg = err?.message || String(err);

          console.warn(
            `⚠️ Groq OCR model ${model} on Key #${keyIndex + 1} attempt ${attempt} failed (${status || "timeout/error"})`
          );

          if (err.name === "AbortError" || msg.includes("aborted")) {
            lastFailureKind = "capacity";
            console.warn(`⚠️ Groq OCR model ${model} request timed out (${REQUEST_TIMEOUT_MS / 1000}s)`);
          }

          if (status === 503 || status === 429 || msg.includes("over capacity") || msg.includes("rate limit")) {
            lastFailureKind = status === 429 || msg.includes("rate limit")
              ? "rate_limit"
              : "capacity";
            const providerRetryMs = parseRetryAfterMs(msg);
            const cooldownMs = Math.max(20_000, providerRetryMs ?? 0);
            retryAfterMs = Math.max(retryAfterMs, cooldownMs);
            groqPool.markCooldown(keyIndex, cooldownMs);
            const backoffMs = attempt * 1500;
            console.log(`⏳ Groq rate limit/capacity hit on Key #${keyIndex + 1}. Switching/waiting ${backoffMs / 1000}s before retry...`);
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

      const userMessage = lastFailureKind === "rate_limit"
        ? `The AI vision service is rate limited. Retry after approximately ${Math.max(
            1,
            Math.ceil(retryAfterMs / 60_000)
          )} minute(s).`
        : isCapacity || lastFailureKind === "capacity"
          ? "The AI vision service is currently at capacity. Please try again in a few minutes."
          : "OCR failed because the vision provider was unavailable or returned unusable text.";

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
