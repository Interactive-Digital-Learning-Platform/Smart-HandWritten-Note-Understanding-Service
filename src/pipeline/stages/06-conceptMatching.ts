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

import { config } from "../../config/config";
import { groqPool } from "../../services/groqPool";
import { PipelineContext, ConceptMatch, ConceptStatus } from "../types";
import { CurriculumConcept } from "../../curriculum/types";
import {
  probabilitiesForDecision,
  shouldReviewConcept,
  statusToLegacyFound,
} from "../conceptPrediction";

interface SemanticMatchResult {
  status: ConceptStatus;
  confidence: number;
  evidence?: string;
}

// ─── Step 1: Keyword Matching ─────────────────────────────────────────────

/**
 * Normalizes text for matching by collapsing whitespace and punctuation.
 */
const normalizeTerm = (t: string): string =>
  t.toLowerCase().replace(/['’]/g, "").replace(/[-_]/g, " ").trim();

/**
 * Performs case-insensitive keyword search with stemming, plural, and word-boundary support.
 * Returns the matched keyword and a surrounding evidence snippet.
 */
const keywordMatch = (
  text: string,
  concept: CurriculumConcept
): { found: boolean; keyword?: string; evidence?: string } => {
  const textLower = text.toLowerCase();
  const textNormalized = normalizeTerm(text);

  for (const keyword of concept.keywords) {
    const kwLower = keyword.toLowerCase().trim();
    if (!kwLower) continue;

    const kwNormalized = normalizeTerm(kwLower);

    // 1. Exact substring check in raw lower and normalized text
    let idx = textLower.indexOf(kwLower);
    if (idx === -1) {
      idx = textNormalized.indexOf(kwNormalized);
    }

    // 2. Plural / Singular variations
    if (idx === -1) {
      // Check if keyword + "s" or "es" exists
      const plural1 = kwLower + "s";
      const plural2 = kwLower + "es";
      idx = textLower.indexOf(plural1);
      if (idx === -1) idx = textLower.indexOf(plural2);

      // If keyword already ends in "s", check singular
      if (idx === -1 && kwLower.endsWith("s") && kwLower.length > 3) {
        const singular = kwLower.slice(0, -1);
        idx = textLower.indexOf(singular);
      }
    }

    // 3. Word boundary regex for short terms (>= 3 chars)
    if (idx === -1 && kwLower.length >= 3) {
      const escaped = kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "i");
      const match = regex.exec(text);
      if (match) {
        idx = match.index;
      }
    }

    if (idx !== -1) {
      // Extract a surrounding evidence snippet around the match
      const start = Math.max(0, idx - 40);
      const end = Math.min(text.length, idx + kwLower.length + 60);
      const evidence = `"...${text.slice(start, end).replace(/\s+/g, " ").trim()}..."`;

      return { found: true, keyword, evidence };
    }
  }

  return { found: false };
};

// ─── Step 2: Semantic Matching (batch LLM with Full Multi-Page Context) ────

/**
 * For concepts that weren't found by keyword matching, ask the LLM
 * whether they appear in the student's text using different wording or summaries.
 *
 * We pass the full multi-page text (up to 30,000 chars) so no pages are cut off.
 */
const semanticMatchBatch = async (
  text: string,
  unmatchedConcepts: CurriculumConcept[]
): Promise<Map<string, SemanticMatchResult>> => {
  const result = new Map<string, SemanticMatchResult>();

  if (unmatchedConcepts.length === 0) return result;

  // Use full multi-page text up to 30,000 characters
  const fullTextContext = text.slice(0, 30000);

  const conceptList = unmatchedConcepts
    .map(
      (c, i) =>
        `  ${i + 1}. Concept: "${c.name}" [Category: ${c.category || "concept"}, Priority: ${c.weight || 3}/5]\n     Key indicator terms: ${c.keywords.slice(0, 5).join(", ")}`
    )
    .join("\n\n");

  const prompt = `You are an expert pedagogical evaluator analyzing a student's multi-page handwritten notes.

Your task is to determine whether each syllabus concept below is DISCUSSED, MENTIONED, DEFINED, CALCULATED, or DRAWN anywhere in the student's notes (including student shorthand, paraphrasing, diagrams, or partial summaries).

STUDENT'S HANDWRITTEN NOTES:
\"\"\"
${fullTextContext}
\"\"\"

SYLLABUS CONCEPTS TO CHECK:
${conceptList}

INSTRUCTIONS:
1. Carefully inspect the entire text for each concept.
2. Use "present" when the note clearly communicates the concept, a correct explanation, calculation, example, or identifiable diagram.
3. Use "partial" when the concept is only named, incompletely explained, fragmented, or ambiguously represented.
4. Use "missing" only when there is no evidence of the concept.
5. Give confidence from 0 to 1 and include a brief direct quote for present or partial evidence.

Respond ONLY with a valid JSON array matching this exact format:
[
  { "index": 1, "status": "present", "confidence": 0.9, "evidence": "...quote from note..." },
  { "index": 2, "status": "partial", "confidence": 0.7, "evidence": "...quote from note..." },
  { "index": 3, "status": "missing", "confidence": 0.8, "evidence": "" }
]`;

  try {
    const completion = await groqPool.createChatCompletion({
      model: config.groq.model,
      temperature: 0.1,
      max_tokens: 3000,
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
      status?: ConceptStatus;
      confidence?: number;
      /** Accepted temporarily for older cached/prompt responses. */
      found?: boolean;
      evidence?: string;
    }> = JSON.parse(jsonStr);

    for (const entry of parsed) {
      const concept = unmatchedConcepts[entry.index - 1];
      if (concept) {
        const status: ConceptStatus =
          entry.status === "present" ||
          entry.status === "partial" ||
          entry.status === "missing"
            ? entry.status
            : entry.found
              ? "present"
              : "missing";
        const defaultConfidence =
          status === "present" ? 0.75 : status === "partial" ? 0.7 : 0.65;
        const confidence =
          typeof entry.confidence === "number"
            ? Math.min(1, Math.max(0, entry.confidence))
            : defaultConfidence;
        result.set(concept.id, {
          status,
          confidence,
          evidence:
            status !== "missing" && entry.evidence
              ? `"${entry.evidence.slice(0, 120).trim()}"`
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
        status: "present",
        probabilities: probabilitiesForDecision("present", 1),
        found: true,
        matchConfidence: 1.0,
        decisionConfidence: 1.0,
        matchMethod: "keyword",
        source: "rule",
        needsReview: false,
        evidence: km.evidence,
      });
    } else {
      // Mark as not-found for now; will be re-checked via semantic
      notFoundByKeyword.push(concept);
      matches.push({
        concept,
        status: "missing",
        probabilities: probabilitiesForDecision("missing", 0.4),
        found: false,
        matchConfidence: 0,
        // This is deliberately moderate: keyword absence alone cannot prove
        // that a student did not write the concept in another wording.
        decisionConfidence: 0.4,
        matchMethod: "not_found",
        source: "fallback",
        needsReview: true,
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
      if (m.status === "missing") {
        const semantic = semanticResults.get(m.concept.id);
        if (semantic) {
          const found = statusToLegacyFound(semantic.status);
          matches[i] = {
            ...m,
            status: semantic.status,
            probabilities: probabilitiesForDecision(
              semantic.status,
              semantic.confidence
            ),
            found,
            matchConfidence: found ? semantic.confidence : 0,
            decisionConfidence: semantic.confidence,
            matchMethod: semantic.status === "missing" ? "not_found" : "semantic",
            source: "semantic_llm",
            needsReview: shouldReviewConcept(
              semantic.status,
              semantic.confidence
            ),
            evidence: semantic.evidence,
          };
        }
      }
    }
  }

  // Confidence reflects both matching evidence and input reliability. Poor
  // handwriting must reduce certainty for both positive and negative findings.
  const ocrScore = ctx.ocrCleaning?.confidenceScore;
  const inputReliability = typeof ocrScore === "number"
    ? Math.max(0.45, Math.min(1, ocrScore / 100))
    : 0.8;
  for (const match of matches) {
    match.decisionConfidence = Math.round(
      Math.min(1, match.decisionConfidence * inputReliability) * 100
    ) / 100;
    match.found = statusToLegacyFound(match.status);
    match.probabilities = probabilitiesForDecision(
      match.status,
      match.decisionConfidence
    );
    match.needsReview = shouldReviewConcept(
      match.status,
      match.decisionConfidence,
      ctx.ocrCleaning?.lowQualityWarning === true
    );
  }

  const presentCount = matches.filter((m) => m.status === "present").length;
  const partialCount = matches.filter((m) => m.status === "partial").length;
  const totalFound = presentCount + partialCount;
  console.log(
    `  [Stage 6] ✅ Present: ${presentCount}, partial: ${partialCount}, ` +
      `missing: ${concepts.length - totalFound} ` +
      `(keyword: ${keywordFound}, semantic coverage: ${totalFound - keywordFound})`
  );

  ctx.conceptMatches = matches;
};
