import Groq from "groq-sdk";
import axios from "axios";
import fs from "fs";
import path from "path";
import { config } from "../config/config";
import { Note } from "../models/Note";
import { LearningMaterial, MaterialType, IFlashcard, IDefinition, IMindMapNode } from "../models/LearningMaterial";

// ─── Groq client ────────────────────────────────────────────────────────────

const groq = new Groq({ apiKey: config.groq.apiKey });

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MaterialResult {
  type: MaterialType;
  success: boolean;
  error?: string;
}

export interface GenerateAllResult {
  noteId: string;
  results: MaterialResult[];
  succeeded: number;
  failed: number;
}

// ─── Groq helper: send prompt, get text back ────────────────────────────────

const askGroq = async (systemPrompt: string, userPrompt: string): Promise<string> => {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: config.groq.model,
        temperature: 0.3,
        max_tokens: 3000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const content = completion.choices[0]?.message?.content;

      if (!content || content.trim() === "") {
        throw new Error("Groq returned empty response");
      }

      return content.trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // Groq-specific empty-output error — retry immediately
      if (msg.includes("model output must contain") || msg.includes("empty")) {
        console.warn(`⚠️  Groq empty-output on attempt ${attempt}/${MAX_RETRIES} — retrying...`);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
      }

      // Rate limit — wait longer
      if (msg.includes("429") || msg.includes("rate")) {
        console.warn(`⚠️  Groq rate limited on attempt ${attempt} — waiting 20s...`);
        await new Promise(r => setTimeout(r, 20000));
        if (attempt < MAX_RETRIES) continue;
      }

      throw err; // Non-retryable
    }
  }

  throw new Error(`Groq failed after ${MAX_RETRIES} attempts`);
};

// JSON extraction — strips any markdown fences if present
const parseJson = <T>(raw: string): T => {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return JSON.parse(stripped) as T;
};

// ─── Context builder ────────────────────────────────────────────────────────

const buildContext = (subject: string, topic: string, gradeLevel: string, rawText: string) =>
  `Subject: ${subject} | Topic: ${topic} | Grade: ${gradeLevel}\n\nStudent's Notes:\n"""\n${rawText}\n"""`;

// ═══════════════════════════════════════════════════════════════════════════
// MATERIAL GENERATORS
// ═══════════════════════════════════════════════════════════════════════════

// ─── 1. Structured Notes ────────────────────────────────────────────────────

export const generateStructuredNotes = async (
  rawText: string,
  subject: string,
  topic: string,
  gradeLevel: string
): Promise<string> => {
  const system = `You are an expert educator for Sri Lanka's school curriculum.
Convert student notes into clean, well-structured markdown notes.
Use # for main heading, ## for subheadings, bullet points for details.
Expand thin notes with correct, curriculum-aligned content.
Do NOT add any explanation — output ONLY the markdown notes.`;

  const user = `${buildContext(subject, topic, gradeLevel, rawText)}

Convert these into well-structured markdown study notes.
Start with a # heading for the topic, then organize logically with sections and bullet points.`;

  return await askGroq(system, user);
};

// ─── 2. Key Definitions ─────────────────────────────────────────────────────

export const generateDefinitions = async (
  rawText: string,
  subject: string,
  topic: string,
  gradeLevel: string
): Promise<IDefinition[]> => {
  const system = `You are an expert educator for Sri Lanka's school curriculum.
Extract and define key terms from student notes.
Respond with ONLY a valid JSON array. No markdown, no explanation.`;

  const user = `${buildContext(subject, topic, gradeLevel, rawText)}

Extract ALL important terms and provide clear, exam-focused definitions.
Respond with ONLY this JSON format:
[
  { "term": "Photosynthesis", "definition": "The process by which plants use sunlight, water, and CO2 to produce glucose and oxygen." },
  { "term": "Chlorophyll", "definition": "The green pigment in plant cells that absorbs light energy for photosynthesis." }
]
Include at least 5 definitions. Be precise and Sri Lanka curriculum-aligned.`;

  const raw = await askGroq(system, user);
  const parsed = parseJson<IDefinition[]>(raw);
  if (!Array.isArray(parsed)) throw new Error("Definitions response is not an array");
  return parsed.filter(d => d.term && d.definition);
};

// ─── 3. Flashcards ──────────────────────────────────────────────────────────

export const generateFlashcards = async (
  rawText: string,
  subject: string,
  topic: string,
  gradeLevel: string
): Promise<IFlashcard[]> => {
  const system = `You are an expert educator for Sri Lanka's school curriculum.
Create effective study flashcards from student notes.
Respond with ONLY a valid JSON array. No markdown, no explanation.`;

  const user = `${buildContext(subject, topic, gradeLevel, rawText)}

Create 10–15 flashcards covering all key concepts including concepts missing from the notes.
Each flashcard: front = question, back = concise answer.
Respond with ONLY this JSON format:
[
  { "front": "What is the equation for photosynthesis?", "back": "6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂" },
  { "front": "Where does the light reaction occur?", "back": "In the thylakoid membranes of the chloroplast" }
]`;

  const raw = await askGroq(system, user);
  const parsed = parseJson<IFlashcard[]>(raw);
  if (!Array.isArray(parsed)) throw new Error("Flashcards response is not an array");
  return parsed.filter(f => f.front && f.back);
};

// ─── 4. Mind Map ────────────────────────────────────────────────────────────

export const generateMindMap = async (
  rawText: string,
  subject: string,
  topic: string,
  gradeLevel: string
): Promise<IMindMapNode> => {
  const system = `You are an expert educator for Sri Lanka's school curriculum.
Create a hierarchical mind map as a JSON tree structure.
Respond with ONLY a valid JSON object. No markdown, no explanation.`;

  const user = `${buildContext(subject, topic, gradeLevel, rawText)}

Create a mind map with the topic as the root node.
Each node has a "label" (string) and optional "children" (array of nodes).
Maximum 3 levels deep. Cover all key concepts comprehensively.
Respond with ONLY this JSON format:
{
  "label": "Photosynthesis",
  "children": [
    {
      "label": "Inputs",
      "children": [
        { "label": "Carbon Dioxide (CO₂)" },
        { "label": "Water (H₂O)" },
        { "label": "Light Energy" }
      ]
    },
    {
      "label": "Outputs",
      "children": [
        { "label": "Glucose (C₆H₁₂O₆)" },
        { "label": "Oxygen (O₂)" }
      ]
    }
  ]
}`;

  const raw = await askGroq(system, user);
  const parsed = parseJson<IMindMapNode>(raw);
  if (!parsed.label) throw new Error("Mind map root node missing label");
  return parsed;
};

// ─── 5. Revision Summary ────────────────────────────────────────────────────

export const generateRevisionSummary = async (
  rawText: string,
  subject: string,
  topic: string,
  gradeLevel: string
): Promise<string> => {
  const system = `You are an expert educator for Sri Lanka's school curriculum.
Write a concise, exam-focused revision summary in clear markdown.
Cover all essential concepts a student must know for the exam.
Do NOT add any explanation — output ONLY the revision summary markdown.`;

  const user = `${buildContext(subject, topic, gradeLevel, rawText)}

Write a compact revision summary (max 300 words) that covers:
1. The most important facts and definitions
2. Key equations or formulas (if applicable)
3. Common exam questions / points students must remember
Format: Use **bold** for key terms, short bullet points, numbered lists where appropriate.`;

  return await askGroq(system, user);
};

// ─── 6. Learning Points ─────────────────────────────────────────────────────

export const generateLearningPoints = async (
  rawText: string,
  subject: string,
  topic: string,
  gradeLevel: string
): Promise<string> => {
  const system = `You are an expert educator for Sri Lanka's school curriculum.
Create a clear numbered list of learning points from student notes.
Include both what the student has covered AND important gaps.
Do NOT add any explanation — output ONLY the numbered markdown list.`;

  const user = `${buildContext(subject, topic, gradeLevel, rawText)}

Generate 10–15 numbered learning points for this topic.
Format:
1. **Key point title** — brief explanation
2. **Another point** — brief explanation

Cover key concepts, include points from curriculum not in the student's notes (mark these with ⚠️ Gap).`;

  return await askGroq(system, user);
};

// ─── 7. Audio Script + Generation ──────────────────────────────────────────

/**
 * Generates an audio explanation script via Groq, then converts to MP3 using
 * the ElevenLabs API. Falls back gracefully if API key is not configured.
 */
export const generateAudio = async (
  rawText: string,
  subject: string,
  topic: string,
  gradeLevel: string,
  noteId: string
): Promise<string> => {
  // ── Step 1: Generate spoken script with Groq ──────────────────────────────
  const system = `You are a friendly, engaging teacher creating a podcast-style audio explanation
for a Sri Lankan secondary school student. Speak naturally and clearly.
Do NOT add markdown, headings, or bullet points — write as if you are speaking aloud.`;

  const user = `${buildContext(subject, topic, gradeLevel, rawText)}

Write a 2-minute spoken explanation of this topic for a student.
- Start with a warm greeting: "Hey! Let's go through [topic] together."
- Explain the key concepts clearly in simple language
- Mention any important gaps the student should study
- End with: "Keep studying and you'll get there!"
Write naturally as spoken words only — no bullet points or markdown.`;

  const script = await askGroq(system, user);

  // ── Step 2: Convert to audio via ElevenLabs ───────────────────────────────
  const audioDir = path.resolve("generated_audio");
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

  if (!config.elevenlabs.apiKey) {
    // Save the script as a text file fallback
    const scriptPath = path.join(audioDir, `audio-script-${noteId}.txt`);
    fs.writeFileSync(scriptPath, script, "utf-8");
    console.log(`📄 Audio script saved (no ElevenLabs key): ${scriptPath}`);
    return `/generated_audio/audio-script-${noteId}.txt`;
  }

  const VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // ElevenLabs "George" voice (v2)
  const audioPath = path.join(audioDir, `audio-${noteId}.mp3`);

  console.log(`🎧 Requesting audio from ElevenLabs for note: ${noteId}`);

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      text: script,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    },
    {
      headers: {
        "xi-api-key": config.elevenlabs.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      responseType: "arraybuffer",
      timeout: 90000, // 90s for audio generation
    }
  );

  fs.writeFileSync(audioPath, Buffer.from(response.data as ArrayBuffer));
  console.log(`🎧 Audio saved: ${audioPath}`);
  return `/generated_audio/audio-${noteId}.mp3`;
};

// ═══════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR — Generate all 7 materials for a note
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generates all 7 learning material types for a given note.
 * Each material is saved to the LearningMaterial collection.
 * Failures on individual materials are caught and reported — other types continue.
 *
 * @param noteId - MongoDB ObjectId string
 * @param types  - Optional subset of types to generate (defaults to all 7)
 */
export const generateMaterials = async (
  noteId: string,
  types?: MaterialType[]
): Promise<GenerateAllResult> => {
  // ── Fetch note with analysis ───────────────────────────────────────────────
  const note = await Note.findById(noteId);

  if (!note) throw new Error(`Note not found: ${noteId}`);
  if (!note.analysis) throw new Error("Note has no analysis. Run OCR + AI analysis first.");
  if (!note.rawText) throw new Error("Note has no extracted text.");

  const { subject, topic, gradeLevel } = note.analysis;
  const { rawText } = note;
  const userId = note.userId;

  const allTypes: MaterialType[] = types ?? [
    "structured_notes",
    "definitions",
    "flashcards",
    "mindmap",
    "revision_summary",
    "learning_points",
    "audio",
  ];

  const results: MaterialResult[] = [];

  console.log(`\n📚 Generating ${allTypes.length} material(s) for note: ${noteId}`);

  for (const type of allTypes) {
    try {
      console.log(`  ⚙️  Generating: ${type}...`);

      let updateData: Partial<{
        textContent: string;
        flashcards: IFlashcard[];
        definitions: IDefinition[];
        mindMap: IMindMapNode;
        audioUrl: string;
      }> = {};

      switch (type) {
        case "structured_notes": {
          const text = await generateStructuredNotes(rawText, subject, topic, gradeLevel);
          updateData = { textContent: text };
          break;
        }
        case "definitions": {
          const defs = await generateDefinitions(rawText, subject, topic, gradeLevel);
          updateData = { definitions: defs };
          break;
        }
        case "flashcards": {
          const cards = await generateFlashcards(rawText, subject, topic, gradeLevel);
          updateData = { flashcards: cards };
          break;
        }
        case "mindmap": {
          const map = await generateMindMap(rawText, subject, topic, gradeLevel);
          updateData = { mindMap: map };
          break;
        }
        case "revision_summary": {
          const text = await generateRevisionSummary(rawText, subject, topic, gradeLevel);
          updateData = { textContent: text };
          break;
        }
        case "learning_points": {
          const text = await generateLearningPoints(rawText, subject, topic, gradeLevel);
          updateData = { textContent: text };
          break;
        }
        case "audio": {
          const url = await generateAudio(rawText, subject, topic, gradeLevel, noteId);
          updateData = { audioUrl: url };
          break;
        }
      }

      // ── Upsert into MongoDB (unique per noteId + type) ──────────────────────
      await LearningMaterial.findOneAndUpdate(
        { noteId, type },
        {
          $set: {
            noteId,
            userId,
            type,
            generatedAt: new Date(),
            ...updateData,
          },
        },
        { upsert: true, returnDocument: "after" }
      );

      console.log(`  ✅ ${type} done`);
      results.push({ type, success: true });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ ${type} failed: ${errorMsg}`);
      results.push({ type, success: false, error: errorMsg });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n📚 Materials done — ${succeeded} succeeded, ${failed} failed\n`);

  return { noteId, results, succeeded, failed };
};
