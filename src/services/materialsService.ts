import Groq from "groq-sdk";
import axios from "axios";
import fs from "fs";
import path from "path";
import { config } from "../config/config";
import { Note } from "../models/Note";
import { LearningMaterial, MaterialType, IFlashcard, IDefinition, IMindMapNode } from "../models/LearningMaterial";
import { findLesson, isCurriculumLoaded } from "../curriculum/index";
import { CurriculumLesson } from "../curriculum/types";

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

const parseJson = <T>(raw: string): T => {
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const stripped = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const jsonMatch = stripped.match(/[\{\[][\s\S]*[\}\]]/);
  const jsonStr = jsonMatch ? jsonMatch[0] : stripped;

  return JSON.parse(jsonStr) as T;
};

// ─── Context builders ───────────────────────────────────────────────────────

import { qdrantService } from "./qdrantService";

// ─── Context builders ───────────────────────────────────────────────────────

const buildContext = (subject: string, topic: string, gradeLevel: string, rawText: string) =>
  `Subject: ${subject} | Topic: ${topic} | Grade: ${gradeLevel}\n\nStudent's Notes:\n"""\n${rawText}\n"""`;

/**
 * Looks up the matching curriculum from the ingested PDF knowledge base (Qdrant)
 * and the static curriculum KB, formatting its content as a structured text block
 * that can be injected into an AI prompt.
 */
const buildCurriculumContext = async (
  subject: string,
  topic: string,
  gradeLevel: string,
  rawText?: string
): Promise<string | null> => {
  const lines: string[] = [];

  // ── 1. Fetch official ingested PDF textbook passages from Qdrant ────────
  try {
    const textbookCtx = await qdrantService.getCurriculumTextbookContext(
      subject,
      topic,
      rawText
    );

    if (textbookCtx.isAvailable && textbookCtx.passages.length > 0) {
      lines.push(`=== Official Ingested Textbook Knowledge Base ===`);
      if (textbookCtx.textbookReference) {
        lines.push(`Source Textbook: ${textbookCtx.textbookReference}`);
      }
      lines.push("\nRelevant Textbook Passages:");
      textbookCtx.passages.forEach((p, idx) => {
        lines.push(
          `--- [Passage ${idx + 1} | ${p.filename} (Page ${p.pages.join(", ") || p.page_start || "?"})] ---\n${p.text}`
        );
      });
      lines.push("");
    }
  } catch (err) {
    console.warn("⚠️ Error retrieving textbook passages for material generation:", err);
  }

  // ── 2. Supplement with static curriculum knowledge if loaded ────────────
  if (isCurriculumLoaded()) {
    const grade = parseInt(gradeLevel, 10);
    const searchResult = findLesson(subject, topic, isNaN(grade) ? undefined : grade);

    if (searchResult) {
      const lesson: CurriculumLesson = searchResult.lesson;
      lines.push(`=== Curriculum Syllabus: ${lesson.subject} G${lesson.grade} — ${lesson.lessonName} ===`);
      lines.push(`Unit: ${lesson.unit}`);
      if (lesson.textbookReference) {
        lines.push(`Syllabus Reference: ${lesson.textbookReference}`);
      }
      lines.push("");

      // Learning Outcomes
      if (lesson.learningOutcomes.length > 0) {
        lines.push("Learning Outcomes:");
        lesson.learningOutcomes.forEach((lo, i) => {
          lines.push(`  ${i + 1}. ${lo.description}`);
        });
        lines.push("");
      }

      // Required Concepts
      if (lesson.concepts.length > 0) {
        lines.push("Required Concepts (weight 5=critical → 1=supplementary):");
        const sorted = [...lesson.concepts].sort((a, b) => b.weight - a.weight);
        sorted.forEach((c) => {
          const examFlag = c.isFrequentlyTested ? " ⭐ exam favourite" : "";
          lines.push(`  • [${c.category}] ${c.name} (weight ${c.weight}${examFlag})`);
        });
        lines.push("");
      }

      // Key Definitions
      if (lesson.definitions.length > 0) {
        lines.push("Key Definitions:");
        lesson.definitions.forEach((d) => {
          lines.push(`  ${d.term}: ${d.definition}`);
        });
        lines.push("");
      }

      // Formulae
      if (lesson.formulae.length > 0) {
        lines.push("Important Formulae / Equations:");
        lesson.formulae.forEach((f) => lines.push(`  • ${f}`));
        lines.push("");
      }

      // Expected Diagrams
      if (lesson.expectedDiagrams.length > 0) {
        lines.push("Diagrams Students Should Know:");
        lesson.expectedDiagrams.forEach((d) => lines.push(`  • ${d}`));
        lines.push("");
      }
    }
  }

  return lines.length > 0 ? lines.join("\n") : null;
};

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
  const curriculumContext = await buildCurriculumContext(subject, topic, gradeLevel, rawText);


  if (curriculumContext) {
    // ── Curriculum-enriched path ─────────────────────────────────────────
    const system = `You are an expert educator for Sri Lanka's school curriculum.
You have been given TWO sources of information:
  1. The student's own handwritten notes (extracted via OCR)
  2. The official curriculum knowledge base for this lesson

Your task: Synthesise BOTH sources into a single, comprehensive, well-structured set of markdown study notes.
Rules:
  - Use # for the main topic heading, ## for major sections, ### for sub-sections.
  - Incorporate ALL required concepts from the curriculum (especially weight 4–5 and ⭐ exam favourites).
  - Preserve correct facts from the student's notes and silently fix any errors.
  - Include all key definitions, formulae, and diagram descriptions from the curriculum.
  - Clearly separate sections so the student can navigate the notes easily.
  - Do NOT add any preamble or explanation — output ONLY the markdown notes.`;

    const user = `${buildContext(subject, topic, gradeLevel, rawText)}

---

${curriculumContext}

---

Using BOTH the student's notes above AND the curriculum knowledge base, generate comprehensive, well-structured markdown study notes for this topic.
Start with a # heading for the topic. Organise logically by section (matching the learning outcomes where possible). Use bullet points, bold key terms, and include formulae in code blocks where appropriate.`;

    return await askGroq(system, user);
  } else {
    // ── Fallback: student notes only ────────────────────────────────────
    const system = `You are an expert educator for Sri Lanka's school curriculum.
Convert student notes into clean, well-structured markdown notes.
Use # for main heading, ## for subheadings, bullet points for details.
Expand thin notes with correct, curriculum-aligned content.
Do NOT add any explanation — output ONLY the markdown notes.`;

    const user = `${buildContext(subject, topic, gradeLevel, rawText)}

Convert these into well-structured markdown study notes.
Start with a # heading for the topic, then organize logically with sections and bullet points.`;

    return await askGroq(system, user);
  }
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

// ─── Override type (used by the pipeline stage before DB save) ──────────────

export interface NoteDataOverride {
  rawText: string;
  subject: string;
  topic: string;
  gradeLevel: string;
  userId: string;
}

// ─── Active Generations Concurrency Set ─────────────────────────────────────
const activeGenerations = new Set<string>();

/**
 * Generates learning material types for a given note.
 * Each material is saved to the LearningMaterial collection.
 * Failures on individual materials are caught and reported — other types continue.
 *
 * @param noteId   - MongoDB ObjectId string
 * @param types    - Optional subset of types to generate (defaults to all 7)
 * @param override - Optional in-memory note data (used by pipeline Stage 9 before note.analysis is persisted)
 */
export const generateMaterials = async (
  noteId: string,
  types?: MaterialType[],
  override?: NoteDataOverride
): Promise<GenerateAllResult> => {
  if (activeGenerations.has(noteId)) {
    console.log(`ℹ️ Material generation already in progress for note ${noteId}, skipping duplicate call.`);
    return { noteId, results: [], succeeded: 0, failed: 0 };
  }

  activeGenerations.add(noteId);

  try {
    // ── Fetch note with analysis (or use pipeline override) ──────────────────
    let subject: string;
    let topic: string;
    let gradeLevel: string;
    let rawText: string;
    let userId: string;

    if (override) {
      // Called from pipeline Stage 9 — note.analysis not yet written to DB
      ({ subject, topic, gradeLevel, rawText, userId } = override);
    } else {
      const note = await Note.findById(noteId);
      if (!note) throw new Error(`Note not found: ${noteId}`);
      if (!note.analysis) throw new Error("Note has no analysis. Run OCR + AI analysis first.");
      if (!note.rawText) throw new Error("Note has no extracted text.");
      subject = note.analysis.subject;
      topic = note.analysis.topic;
      gradeLevel = note.analysis.gradeLevel;
      rawText = note.rawText;
      userId = note.userId;
    }

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
  } finally {
    activeGenerations.delete(noteId);
  }
};
