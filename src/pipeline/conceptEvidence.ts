import type { CurriculumConcept } from "../curriculum/types";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const termPattern = (value: string) => value.trim().split(/([\s_-]+|['’])/u).map(part =>
  /^[\s_-]+$/u.test(part) ? "[\\s_-]+" : /^[’']$/u.test(part) ? "['’]?" : escapeRegex(part)
).join("");

/** Match whole terms in original text, so evidence offsets stay correct. */
function keywordPattern(keyword: string) {
  const term = keyword.trim();
  const variants = [term];
  if (/\p{L}{3}$/u.test(term)) {
    variants.push(term + "s", term + "es");
    if (/s$/i.test(term) && term.length > 3) variants.push(term.slice(0, -1));
  }
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${variants.map(termPattern).join("|")})(?![\\p{L}\\p{N}_])`, "iu");
}

export function keywordEvidence(text: string, concept: CurriculumConcept): string | undefined {
  for (const keyword of concept.keywords) {
    if (!keyword.trim()) continue;
    const match = keywordPattern(keyword).exec(text);
    if (!match) continue;
    // An actual excerpt, without invented ellipses around it.
    return text.slice(Math.max(0, match.index - 40), Math.min(text.length, match.index + match[0].length + 100)).trim();
  }
  return undefined;
}

export interface SourceQuote { text: string; start: number }

/** Only accept a contiguous quote in text actually sent to the checker.
 * Whitespace differences are harmless; additions/omissions/ellipses are not. */
export function sourceQuotes(text: string, proposed: unknown): SourceQuote[] {
  if (typeof proposed !== "string") return [];
  const quote = proposed.trim().replace(/^["“]([\s\S]*)["”]$/u, "$1").trim();
  if (!quote || quote.length > 600) return [];
  const pattern = new RegExp(quote.split(/\s+/u).map(escapeRegex).join("\\s+"), "giu");
  return [...text.matchAll(pattern)].map(match => ({ text: match[0], start: match.index! }));
}

const normalizeWords = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function onlyNames(text: string, concept: CurriculumConcept): boolean {
  // A short equation may be meaningful without an English sentence.
  if ((concept.category === "formula" || concept.category === "calculation") && /[=≠≈<>≤≥]/u.test(text)) return false;
  let remainder = normalizeWords(text);
  // Some indicators are explanations themselves. Do not strip their predicate
  // and mistake a real answer for a bare heading merely because it is a keyword.
  const labels = concept.keywords.filter(keyword => keyword.trim().split(/\s+/u).length <= 3
    && !/\b(?:is|are|means|opposes|opposing|causes|produces|contains|absorbs|releases|converts|stores|transmits|equals)\b/iu.test(keyword));
  const terms = [concept.name, ...labels].map(normalizeWords).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const term of terms) {
    remainder = remainder.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(term)}(?:s|es)?(?![\\p{L}\\p{N}])`, "gu"), " ");
  }
  remainder = remainder.replace(/\b(?:the|a|an|and|or|of|is|are|was|were|topic|topics|chapter|lesson|definition|definitions|notes|on)\b/g, " ");
  return !remainder.replace(/[\s\d]+/g, "").trim();
}

const taskStart = /^(?:(?:homework|assignment|exercise|questions?|tasks?|learning objectives?|contents?|topics?)\s*[:–-]?\s*)?(?:define|describe|explain|state|list|name|discuss|draw|calculate|find|solve|identify|compare|differentiate|investigate|write|what|why|how|when|where|which|who)\b/iu;

/** Guard obvious task/heading-only evidence. Semantic review still decides
 * whether a grounded explanation covers the expected concept. */
export function hasSubstantiveEvidence(text: string, quote: SourceQuote, concept: CurriculumConcept): boolean {
  for (const line of quote.text.matchAll(/[^\r\n]+/gu)) {
    const candidate = line[0].trim();
    if (!candidate || candidate.includes("?") || onlyNames(candidate, concept)) continue;
    const position = quote.start + line.index!;
    const lineStart = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
    let prefix = text.slice(lineStart, position + line[0].length);
    // Questions can be followed by genuine answers on the same line.
    const answer = [...prefix.matchAll(/\b(?:(?:answer|ans)\s*[:.)]|a\s*:)\s*/giu)].pop();
    const questionEnd = prefix.lastIndexOf("?");
    if (answer) prefix = prefix.slice(answer.index! + answer[0].length);
    else if (questionEnd >= 0 && lineStart + questionEnd < position) prefix = prefix.slice(questionEnd + 1);
    prefix = prefix.replace(/^\s*(?:[-*•#]+\s*|\(?\d+[).:]\s*|[a-z][).]\s*|q\s*[:.)]\s*)*/iu, "").trim();
    if (!/^(?:homework|assignment|exercise|questions?|tasks?|contents?|topics?)\s*[:–-]/iu.test(prefix) && !taskStart.test(prefix)) return true;
  }
  return false;
}
