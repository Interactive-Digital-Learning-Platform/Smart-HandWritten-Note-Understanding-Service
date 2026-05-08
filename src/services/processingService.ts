import path from "path";
import { Note, INote } from "../models/Note";
import { extractTextFromImage } from "./ocrService";
import { analyzeNoteContent } from "./analysisService";
import { generateMaterials } from "./materialsService";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProcessingResult {
  success: boolean;
  noteId: string;
  rawText?: string;
  analysis?: INote["analysis"];
  materialsGenerated?: number;
  error?: string;
}

// ─── Helper: resolve image file path from imageUrl ─────────────────────────

/**
 * Converts a stored imageUrl like "/uploads/note-123.jpg"
 * into an absolute file system path.
 */
const resolveImagePath = (imageUrl: string): string => {
  const relativePart = imageUrl.startsWith("/")
    ? imageUrl.slice(1)
    : imageUrl;
  return path.resolve(relativePart);
};

// ─── Step 1: OCR ────────────────────────────────────────────────────────────

const runOcr = async (note: INote): Promise<string> => {
  console.log(`📷 [Step 1/2] OCR — note: ${note._id}`);
  const imagePath = resolveImagePath(note.imageUrl);
  const result = await extractTextFromImage(imagePath);

  if (!result.success || !result.text) {
    throw new Error(result.error || "OCR returned empty text");
  }

  console.log(`✅ OCR done — ${result.text.length} chars extracted`);
  return result.text;
};

// ─── Step 2: AI Analysis ────────────────────────────────────────────────────

const runAnalysis = async (
  note: INote,
  rawText: string
): Promise<INote["analysis"]> => {
  console.log(`🤖 [Step 2/2] AI Analysis — note: ${note._id}`);
  const result = await analyzeNoteContent(rawText);

  if (!result.success || !result.analysis) {
    throw new Error(result.error || "AI analysis returned no result");
  }

  console.log(
    `✅ Analysis done — ${result.analysis.subject} / ${result.analysis.topic} ` +
      `(${result.analysis.overallCompleteness}% complete, ` +
      `${result.analysis.learningGaps.length} gaps)`
  );

  return result.analysis;
};

// ─── Main Pipeline ──────────────────────────────────────────────────────────

/**
 * Full processing pipeline for a handwritten note:
 *   Step 1 — OCR  (Microsoft TrOCR via HuggingFace)
 *   Step 2 — AI Analysis  (Groq — subject, topic, gaps, completeness)
 *
 * Runs asynchronously and updates the Note document in MongoDB at each step.
 * The mobile app polls GET /api/notes/:id to track status.
 *
 * Status transitions: uploaded → processing → analyzed | failed
 *
 * @param noteId - MongoDB ObjectId string of the note to process
 */
export const processNote = async (
  noteId: string
): Promise<ProcessingResult> => {
  let note: INote | null = null;

  try {
    // ── Fetch & validate ────────────────────────────────────────────────────
    note = await Note.findById(noteId);

    if (!note) {
      return { success: false, noteId, error: "Note not found" };
    }

    if (note.status === "processing") {
      return {
        success: false,
        noteId,
        error: "Note is already being processed. Please wait.",
      };
    }

    if (note.status === "analyzed") {
      return {
        success: true,
        noteId,
        rawText: note.rawText,
        analysis: note.analysis,
      };
    }

    // ── Mark as processing ──────────────────────────────────────────────────
    note.status = "processing";
    await note.save();

    console.log(`\n${"─".repeat(50)}`);
    console.log(`🔄 Pipeline started`);
    console.log(`   Note ID : ${noteId}`);
    console.log(`   Title   : ${note.title}`);
    console.log(`   Image   : ${note.imageUrl}`);
    console.log(`${"─".repeat(50)}`);

    // ── Step 1: OCR ─────────────────────────────────────────────────────────
    const rawText = await runOcr(note);
    note.rawText = rawText;
    await note.save();

    // ── Step 2: AI Analysis ─────────────────────────────────────────────────
    const analysis = await runAnalysis(note, rawText);
    note.analysis = analysis;
    note.status = "analyzed";
    await note.save();

    // ── Step 3: Generate All Learning Materials ──────────────────────────────
    console.log(`📚 [Step 3/3] Generating learning materials...`);
    let materialsGenerated = 0;
    try {
      const matResult = await generateMaterials(noteId);
      materialsGenerated = matResult.succeeded;
    } catch (matErr) {
      // Material generation failures do NOT fail the whole pipeline
      console.warn(`⚠️  Materials generation had errors (non-fatal):`, matErr);
    }

    console.log(`\n✅ Pipeline complete for note: ${noteId}`);
    console.log(`${"─".repeat(50)}\n`);

    return { success: true, noteId, rawText, analysis, materialsGenerated };

  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown processing error";

    console.error(`\n❌ Pipeline failed for note ${noteId}: ${message}\n`);

    if (note) {
      note.status = "failed";
      note.errorMessage = message;
      await note.save();
    }

    return { success: false, noteId, error: message };
  }
};
