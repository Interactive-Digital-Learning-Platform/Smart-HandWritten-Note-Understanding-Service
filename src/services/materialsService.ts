import axios from "axios";
import fs from "fs";
import path from "path";
import { config } from "../config/config";
import { groqPool } from "./groqPool";
import { Note } from "../models/Note";
import { LearningMaterial, MaterialType, IFlashcard, IDefinition, IMindMapNode } from "../models/LearningMaterial";
import { findLesson, isCurriculumLoaded } from "../curriculum/index";
import { CurriculumLesson } from "../curriculum/types";

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

export interface GenerateMaterialsOptions {
  /** Concepts the student explicitly confirmed they need help with. */
  targetConcepts?: string[];
}

// ─── Groq helper: send prompt, get text back with pool rotation ──────────────

const askGroq = async (
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> => {
  const completion = await groqPool.createChatCompletion({
    model: config.groq.model,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 3500,
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

const buildContext = (subject: string, topic: string, gradeLevel: string, rawText: string, contentLanguage: string = "English") => {
  const safeText =
    rawText.length > 3500
      ? `${rawText.slice(0, 3500)}\n[...note content truncated for brevity...]`
      : rawText;
  const languageInstruction = contentLanguage === "Sinhala"
    ? "Write explanations in Sinhala. Keep standard scientific terms in English where that is clearer."
    : contentLanguage === "Mixed"
    ? "Write explanations mainly in Sinhala while retaining familiar English scientific terms."
    : "Write explanations in English.";
  return `Subject: ${subject} | Topic: ${topic} | Grade: ${gradeLevel}\nResponse language: ${contentLanguage}. ${languageInstruction}\n\nStudent's Notes:\n"""\n${safeText}\n"""`;
};

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
      lines.push("\nRelevant Textbook Passages (Excerpts):");
      textbookCtx.passages.slice(0, 3).forEach((p, idx) => {
        const snippet = p.text.length > 800 ? `${p.text.slice(0, 800)}...` : p.text;
        lines.push(
          `--- [Passage ${idx + 1} | ${p.filename} (Page ${p.pages.join(", ") || p.page_start || "?"})] ---\n${snippet}`
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

// ─── 1. Structured Notes (Complete Personalized Note with Gap Annotations) ──

export const generateStructuredNotes = async (
  rawText: string,
  subject: string,
  topic: string,
  gradeLevel: string,
  foundConcepts: string[] = [],
  missingConcepts: string[] = [],
  explainableGaps: any[] = [],
  contentLanguage: string = "English"
): Promise<string> => {
  const curriculumContext = await buildCurriculumContext(subject, topic, gradeLevel, rawText);

  const gapsSummary = explainableGaps.length > 0
    ? explainableGaps.map((g, i) =>
        `${i + 1}. Outcome ID: [${g.outcomeId || `gap-${i + 1}`}] — "${g.outcomeDescription}"\n` +
        `   Missing concepts: ${(g.missingConcepts || []).map((c: any) => typeof c === "string" ? c : c.name).join(", ")}\n` +
        `   Study Recommendation: ${g.recommendation || "Review core textbook principles."}`
      ).join("\n")
    : missingConcepts.length > 0
    ? missingConcepts.map((c, i) => `${i + 1}. Missing concept: ${c}`).join("\n")
    : "No major critical gaps detected.";

  const coveredSummary = foundConcepts.length > 0
    ? foundConcepts.join(", ")
    : "Basic introductory concepts found in note.";

  const system = `You are a master educator for Sri Lanka's school curriculum (${gradeLevel} ${subject}).
Your task is to generate a COMPLETE, HIGHLY STRUCTURED, AND AUTHORITATIVE LESSON NOTE for the topic "${topic}".

This note must serve as the student's complete textbook-grade lesson study material, synthesizing both:
  1. What the student already wrote in their handwritten notes
  2. The official curriculum knowledge base and textbook specifications, completing all missing areas.

CRITICAL FORMATTING AND HIGHLIGHTING RULES:
1. Title: Start with \`# ${topic}\` followed by a concise 2-sentence lesson overview.
2. Section Headings: Organize the entire lesson into logical numbered sections (\`## 1. ...\`, \`## 2. ...\`).
3. Explicit Highlighting:
   - For facts/concepts that WERE ALREADY COVERED in the student's handwritten notes:
     Use this exact callout format:
     > 📝 **From Your Handwritten Notes:** [Accurate synthesis of what the student noted down, preserving their correct ideas and fixing any minor OCR/factual mistakes]
   
   - For concepts/outcomes that WERE MISSING from the student's notes (Learning Gaps):
     You MUST create dedicated remediation subsections with this exact anchor comment and callout format:
     ### ⚠️ Remediated Learning Gap: [Outcome Description or Concept Name]
     <!-- anchor:gap-[outcomeId] -->
     > ⚠️ **Focused Support Area:** [Provide an in-depth, crystal-clear explanation of the concept the student asked for help with, including complete theoretical explanations, step-by-step mathematical derivations/calculations if applicable, and real-world examples]

   - For Key Definitions:
     > 💡 **Key Definition:** **[Term]**: [Clear, exam-focused definition from the textbook]

   - For Equations & Formulas:
     Put formulas in markdown code blocks with clear label and variable definitions (e.g. where $v$ = final velocity, $u$ = initial velocity...).

   - For Textbook Citations:
     > 📖 **Textbook Reference:** [Unit name / Chapter pages matching curriculum]

4. Completeness: Do not leave out any curriculum requirement. The student must be able to use this note as their sole, complete revision reference.
5. Tone: Inspiring, highly structured, clean, and academically precise.
6. Output: Output ONLY the markdown notes. Do NOT include conversational preambles or greeting messages.`;

  const user = `${buildContext(subject, topic, gradeLevel, rawText, contentLanguage)}

---
${curriculumContext || "Official Sri Lankan Curriculum Standards"}
---

STUDENT'S CONFIRMED SUPPORT AREAS:
• Concepts covered in notes:
  ${coveredSummary}

• Concepts the student asked for help with:
${gapsSummary}

Generate the complete, gap-annotated structured lesson note following the rules above.`;

  return await askGroq(system, user, { maxTokens: 2500 });
};

// ─── 2. Key Definitions ─────────────────────────────────────────────────────

export const generateDefinitions = async (
  rawText: string,
  subject: string,
  topic: string,
  gradeLevel: string,
  missingConcepts: string[] = [],
  contentLanguage: string = "English"
): Promise<IDefinition[]> => {
  const system = `You are an expert educator for Sri Lanka's school curriculum.
Extract and define key terms from the lesson for student revision.
Respond with ONLY a valid JSON array. No markdown, no explanation.`;

  const missingHint = missingConcepts.length > 0
    ? `\nMake sure to include definitions for these concepts the student asked for help with: ${missingConcepts.join(", ")}.`
    : "";

  const user = `${buildContext(subject, topic, gradeLevel, rawText, contentLanguage)}
${missingHint}

Extract ALL important terms (at least 6-8 terms) and provide clear, exam-focused definitions.
Respond with ONLY this JSON format:
[
  { "term": "Photosynthesis", "definition": "The process by which plants use sunlight, water, and CO2 to produce glucose and oxygen." },
  { "term": "Chlorophyll", "definition": "The green pigment in plant cells that absorbs light energy for photosynthesis." }
]
Be precise and Sri Lanka curriculum-aligned.`;

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
  gradeLevel: string,
  missingConcepts: string[] = [],
  contentLanguage: string = "English"
): Promise<IFlashcard[]> => {
  const system = `You are an expert educator for Sri Lanka's school curriculum.
Create effective study flashcards from the lesson.
Prioritize concepts that students commonly find difficult or were missing in their handwritten notes.
Respond with ONLY a valid JSON array. No markdown, no explanation.`;

  const missingHint = missingConcepts.length > 0
    ? `\nPRIORITY: The student asked for help with: ${missingConcepts.join(", ")}. Ensure at least half the flashcards directly practise these concepts.`
    : "";

  const user = `${buildContext(subject, topic, gradeLevel, rawText, contentLanguage)}
${missingHint}

Create 10–15 flashcards covering all key concepts of this topic.
Each flashcard: front = question / prompt, back = concise, accurate answer.
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
  gradeLevel: string,
  contentLanguage: string = "English"
): Promise<IMindMapNode> => {
  const system = `You are an expert educator for Sri Lanka's school curriculum.
Create a comprehensive hierarchical mind map covering the complete lesson as a JSON tree structure.
Respond with ONLY a valid JSON object. No markdown, no explanation.`;

  const user = `${buildContext(subject, topic, gradeLevel, rawText, contentLanguage)}

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
  gradeLevel: string,
  contentLanguage: string = "English"
): Promise<string> => {
  const system = `You are an expert educator for Sri Lanka's school curriculum.
Write a concise, exam-focused revision summary in clear markdown.
Cover all essential concepts a student must know for the exam.
Do NOT add any explanation — output ONLY the revision summary markdown.`;

  const user = `${buildContext(subject, topic, gradeLevel, rawText, contentLanguage)}

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
  gradeLevel: string,
  missingConcepts: string[] = [],
  contentLanguage: string = "English"
): Promise<string> => {
  const system = `You are an expert educator for Sri Lanka's school curriculum.
Create a clear numbered list of learning points from student notes and syllabus.
Explicitly distinguish points covered in notes vs points that were missing.
Do NOT add any explanation — output ONLY the numbered markdown list.`;

  const missingHint = missingConcepts.length > 0
    ? `\nMark points relating to concepts the student asked for help with as '⚠️ Focus area': ${missingConcepts.join(", ")}.`
    : "";

  const user = `${buildContext(subject, topic, gradeLevel, rawText, contentLanguage)}
${missingHint}

Generate 10–15 numbered learning points for this topic.
Format:
1. **Key point title** — brief explanation
2. **Another point** — brief explanation (mark with ⚠️ Gap if it covers missing content)`;

  return await askGroq(system, user);
};

// ─── 7. Audio Script + Generation ──────────────────────────────────────────

export const generateAudio = async (
  rawText: string,
  subject: string,
  topic: string,
  gradeLevel: string,
  noteId: string,
  missingConcepts: string[] = [],
  contentLanguage: string = "English"
): Promise<string> => {
  const system = `You are a friendly, engaging teacher creating a podcast-style audio explanation
for a Sri Lankan secondary school student. Speak naturally and clearly.
Do NOT add markdown, headings, or bullet points — write as if you are speaking aloud.`;

  const missingHint = missingConcepts.length > 0
    ? `Focus on the concepts the student asked for help with: ${missingConcepts.join(", ")}, and give a clear spoken explanation to help them remember.`
    : "";

  const user = `${buildContext(subject, topic, gradeLevel, rawText, contentLanguage)}
${missingHint}

Write a 2-minute spoken explanation of this topic for a student.
- Start with a warm greeting: "Hey! Let's go through [topic] together."
- Explain the key concepts clearly in simple language
- Address the concepts the student asked for help with clearly
- End with encouraging advice: "Keep studying and you'll get there!"
Write naturally as spoken words only — no bullet points or markdown.`;

  const script = await askGroq(system, user);

  // ── Convert to audio via ElevenLabs ───────────────────────────────────────
  const audioDir = path.resolve("generated_audio");
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

  if (!config.elevenlabs.apiKey) {
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
      timeout: 90000,
    }
  );

  fs.writeFileSync(audioPath, Buffer.from(response.data as ArrayBuffer));
  console.log(`🎧 Audio saved: ${audioPath}`);
  return `/generated_audio/audio-${noteId}.mp3`;
};

// ═══════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR — Generate personalized materials for a note
// ═══════════════════════════════════════════════════════════════════════════

export interface NoteDataOverride {
  rawText: string;
  subject: string;
  topic: string;
  gradeLevel: string;
  userId: string;
  foundConcepts?: string[];
  missingConcepts?: string[];
  explainableGaps?: any[];
  contentLanguage?: "Sinhala" | "English" | "Mixed" | "Unknown";
}

const activeGenerations = new Set<string>();

/**
 * Generates personalized learning material types for a given note.
 * Each material is saved to the LearningMaterial collection with gap metadata.
 */
export const generateMaterials = async (
  noteId: string,
  types?: MaterialType[],
  override?: NoteDataOverride,
  options?: GenerateMaterialsOptions
): Promise<GenerateAllResult> => {
  if (activeGenerations.has(noteId)) {
    console.log(`ℹ️ Material generation already in progress for note ${noteId}, skipping duplicate call.`);
    return { noteId, results: [], succeeded: 0, failed: 0 };
  }

  activeGenerations.add(noteId);

  try {
    let subject: string;
    let topic: string;
    let gradeLevel: string;
    let rawText: string;
    let userId: string;
    let foundConcepts: string[] = [];
    let missingConcepts: string[] = [];
    let explainableGaps: any[] = [];
    let contentLanguage = "English";

    if (override) {
      ({ subject, topic, gradeLevel, rawText, userId } = override);
      foundConcepts = override.foundConcepts || [];
      missingConcepts = options?.targetConcepts ?? (override.missingConcepts || []);
      explainableGaps = override.explainableGaps || [];
      contentLanguage = override.contentLanguage || "English";
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
      foundConcepts = note.analysis.keyConcepts || [];
      missingConcepts = options?.targetConcepts ?? (note.analysis.missingConcepts || []);
      explainableGaps = note.analysis.explainableGaps || [];
      contentLanguage = note.analysis.contentLanguage?.primaryLanguage || "English";
    }

    // When material generation follows a student "needs help" response, pass
    // only their confirmed support areas into prompts and targeted metadata.
    if (options?.targetConcepts) {
      const targets = new Set(options.targetConcepts.map((name) => name.toLowerCase()));
      explainableGaps = explainableGaps
        .map((gap) => ({
          ...gap,
          missingConcepts: (gap.missingConcepts || []).filter((concept: any) =>
            targets.has((typeof concept === "string" ? concept : concept.name).toLowerCase())
          ),
        }))
        .filter((gap) => gap.missingConcepts.length > 0);
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

    console.log(`\n📚 Generating ${allTypes.length} personalized material(s) for note: ${noteId}`);

    for (const type of allTypes) {
      try {
        console.log(`  ⚙️  Generating: ${type}...`);

        let updateData: Partial<{
          textContent: string;
          flashcards: IFlashcard[];
          definitions: IDefinition[];
          mindMap: IMindMapNode;
          audioUrl: string;
          targetedGaps: string[];
          estimatedMinutes: number;
          purposeDescription: string;
        }> = {
          targetedGaps: missingConcepts,
        };

        switch (type) {
          case "structured_notes": {
            const text = await generateStructuredNotes(
              rawText,
              subject,
              topic,
              gradeLevel,
              foundConcepts,
              missingConcepts,
              explainableGaps,
              contentLanguage
            );
            updateData = {
              ...updateData,
              textContent: text,
              estimatedMinutes: 4,
              purposeDescription: "Complete synthesized lesson note with your handwriting + official textbook knowledge & highlighted gap remediations",
            };
            break;
          }
          case "definitions": {
            const defs = await generateDefinitions(rawText, subject, topic, gradeLevel, missingConcepts, contentLanguage);
            updateData = {
              ...updateData,
              definitions: defs,
              estimatedMinutes: 2,
              purposeDescription: "Official textbook definitions for core curriculum terms",
            };
            break;
          }
          case "flashcards": {
            const cards = await generateFlashcards(rawText, subject, topic, gradeLevel, missingConcepts, contentLanguage);
            updateData = {
              ...updateData,
              flashcards: cards,
              estimatedMinutes: 3,
              purposeDescription: "Active recall practice cards prioritizing your identified learning gaps",
            };
            break;
          }
          case "mindmap": {
            const map = await generateMindMap(rawText, subject, topic, gradeLevel, contentLanguage);
            updateData = {
              ...updateData,
              mindMap: map,
              estimatedMinutes: 2,
              purposeDescription: "Hierarchical visual concept tree showing the full lesson structure",
            };
            break;
          }
          case "revision_summary": {
            const text = await generateRevisionSummary(rawText, subject, topic, gradeLevel, contentLanguage);
            updateData = {
              ...updateData,
              textContent: text,
              estimatedMinutes: 2,
              purposeDescription: "Concise exam-focused revision summary",
            };
            break;
          }
          case "learning_points": {
            const text = await generateLearningPoints(rawText, subject, topic, gradeLevel, missingConcepts, contentLanguage);
            updateData = {
              ...updateData,
              textContent: text,
              estimatedMinutes: 2,
              purposeDescription: "Numbered curriculum checklist highlighting what you covered vs gaps",
            };
            break;
          }
          case "audio": {
            const url = await generateAudio(rawText, subject, topic, gradeLevel, noteId, missingConcepts, contentLanguage);
            updateData = {
              ...updateData,
              audioUrl: url,
              estimatedMinutes: 2,
              purposeDescription: "Conversational audio lesson addressing your notes and explaining your gaps",
            };
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

