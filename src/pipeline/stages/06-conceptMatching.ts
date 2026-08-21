// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Stage 6 — Concept Matching
// ═══════════════════════════════════════════════════════════════════════════
//
// Matches the student's cleaned OCR text against every required concept
// in the matched curriculum lesson using a hybrid approach:
//
//   Step 1 — Keyword Matching (deterministic):
//     For each concept's keywords[], check if any keyword appears in the
//     cleaned text (case-insensitive). This is fast and fully explainable.
//
//   Step 2 — Semantic Matching (LLM-assisted, for borderline cases):
//     Concepts that were NOT found by keyword matching are sent to the LLM
//     in a single batch call: "Which of these concepts does the student's
//     notes discuss, even if different words were used?"
//
//   Result: Each concept gets a ConceptMatch with found/not_found,
//           matchMethod, matchConfidence, and an evidence snippet.
//
// Research Contribution: Implements the deterministic concept matching
// algorithm from Improvement 2. LLM only fills in what deterministic
// matching cannot (semantic paraphrasing).
// ═══════════════════════════════════════════════════════════════════════════

import Groq from "groq-sdk";
import { config } from "../../config/config";
import { PipelineContext, ConceptMatch } from "../types";
import { CurriculumConcept } from "../../curriculum/types";

const groq = new Groq({ apiKey: config.groq.apiKey });

// ─── Step 1: Keyword Matching ─────────────────────────────────────────────

/**
 * Performs case-insensitive keyword search.
 * Returns the matched keyword and a surrounding evidence snippet.
 */
const keywordMatch = (
  text: string,
  concept: CurriculumConcept
): { found: boolean; keyword?: string; evidence?: string } => {
  const textLower = text.toLowerCase();

  for (const keyword of concept.keywords) {
    const kwLower = keyword.toLowerCase();
    const idx = textLower.indexOf(kwLower);

    if (idx !== -1) {
      // Extract a 100-char evidence snippet around the match
      const start = Math.max(0, idx - 40);
      const end = Math.min(text.length, idx + kwLower.length + 60);
      const evidence = `"...${text.slice(start, end).trim()}..."`;

      return { found: true, keyword, evidence };
    }
  }

  return { found: false };
};

// ─── Step 2: Semantic Matching (batch LLM) ───────────────────────────────

/**
 * For concepts that weren't found by keyword matching, ask the LLM
 * whether they appear in the student's text using different wording.
 *
 * We batch all unmatched concepts into a single LLM call to minimize
 * API calls and latency.
 */
const semanticMatchBatch = async (
  text: string,
  unmatchedConcepts: CurriculumConcept[]
): Promise<Map<string, { found: boolean; evidence?: string }>> => {
  const result = new Map<string, { found: boolean; evidence?: string }>();

  if (unmatchedConcepts.length === 0) return result;

  const conceptList = unmatchedConcepts
    .map(
      (c, i) =>
        `  ${i + 1}. "${c.name}" (keywords: ${c.keywords.slice(0, 3).join(", ")})`
    )
    .join("\n");

  const prompt = `You are analyzing a student's handwritten notes to check if specific concepts are discussed.

The student's notes say:
"""
${text.slice(0, 2000)}
"""

For each concept below, determine if the student's notes DISCUSS or REFERENCE the concept,
even if they use different words or incomplete descriptions.

Concepts to check:
${conceptList}

Respond ONLY with a JSON array (no markdown, no explanation).
Each element: { "index": 1, "found": true, "evidence": "...brief quote from notes..." }
If not found: { "index": 1, "found": false, "evidence": "" }
Return one entry per concept, all ${unmatchedConcepts.length} concepts:`;

  try {
    const completion = await groq.chat.completions.create({
      model: config.groq.model,
      temperature: 0.1,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    let raw = completion.choices[0]?.message?.content?.trim() ?? "[]";
    raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const jsonMatch = stripped.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : stripped;

    const parsed: Array<{
      index: number;
      found: boolean;
      evidence: string;
    }> = JSON.parse(jsonStr);

    for (const entry of parsed) {
      const concept = unmatchedConcepts[entry.index - 1];
      if (concept) {
        result.set(concept.id, {
          found: Boolean(entry.found),
          evidence:
            entry.found && entry.evidence
              ? `"${entry.evidence.slice(0, 100)}"`
              : undefined,
        });
      }
    }
  } catch (err) {
    console.warn(
      `  [Stage 6] ⚠️  Semantic batch matching failed:`,
      err instanceof Error ? err.message : err
    );
    // All unmatched remain as not_found
  }

  return result;
};

// ─── Stage Runner ──────────────────────────────────────────────────────────

export const runConceptMatching = async (
  ctx: PipelineContext
): Promise<void> => {
  console.log(`  [Stage 6] Concept Matching...`);

  if (!ctx.matchedLesson) {
    // No lesson matched — skip concept matching
    ctx.conceptMatches = [];
    console.warn(
      `  [Stage 6] ⚠️  No matched lesson — concept matching skipped`
    );
    return;
  }

  const text = ctx.ocrCleaning?.cleanedText ?? ctx.rawOcrText ?? "";
  const concepts = ctx.matchedLesson.concepts;
  const matches: ConceptMatch[] = [];
  const notFoundByKeyword: CurriculumConcept[] = [];

  // ── Step 1: Keyword matching for all concepts ─────────────────────────
  for (const concept of concepts) {
    const km = keywordMatch(text, concept);

    if (km.found) {
      matches.push({
        concept,
        found: true,
        matchConfidence: 1.0,
        matchMethod: "keyword",
        evidence: km.evidence,
      });
    } else {
      // Mark as not-found for now; will be re-checked via semantic
      notFoundByKeyword.push(concept);
      matches.push({
        concept,
        found: false,
        matchConfidence: 0,
        matchMethod: "not_found",
      });
    }
  }

  const keywordFound = matches.filter((m) => m.found).length;
  console.log(
    `  [Stage 6] Keyword matching: ${keywordFound}/${concepts.length} found`
  );

  // ── Step 2: Semantic matching for not-found concepts ──────────────────
  if (notFoundByKeyword.length > 0) {
    console.log(
      `  [Stage 6] Semantic check for ${notFoundByKeyword.length} unmatched concepts...`
    );

    const semanticResults = await semanticMatchBatch(text, notFoundByKeyword);

    // Update the matches array with semantic results
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (!m.found) {
        const semantic = semanticResults.get(m.concept.id);
        if (semantic?.found) {
          matches[i] = {
            ...m,
            found: true,
            matchConfidence: 0.75, // Lower confidence than keyword match
            matchMethod: "semantic",
            evidence: semantic.evidence,
          };
        }
      }
    }
  }

  const totalFound = matches.filter((m) => m.found).length;
  console.log(
    `  [Stage 6] ✅ Total found: ${totalFound}/${concepts.length} concepts ` +
      `(keyword: ${keywordFound}, semantic: ${totalFound - keywordFound})`
  );

  ctx.conceptMatches = matches;
};
