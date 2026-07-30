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

    // Read image and convert to base64
    const imageBuffer = fs.readFileSync(absolutePath);
    const base64Image = imageBuffer.toString("base64");
    const mimeType = path.extname(absolutePath).toLowerCase() === ".png" ? "image/png" : "image/jpeg";

    console.log(`🔍 OCR via Groq Vision for: ${path.basename(absolutePath)}`);

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please perform OCR on this handwritten note. Transcribe all text exactly as written. If there are diagrams or math, describe them briefly in brackets like [Diagram: Photosynthesis process]. Return ONLY the transcription.",
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
      model: "qwen/qwen3.6-27b", // Only vision model available on this Groq account
      temperature: 0.1, // Low temperature for higher accuracy in transcription
      max_tokens: 1024,
    });

    const extractedText = chatCompletion.choices[0]?.message?.content?.trim() || "";

    if (!extractedText) {
      return {
        success: false,
        text: "",
        error: "Groq Vision returned empty text",
      };
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
