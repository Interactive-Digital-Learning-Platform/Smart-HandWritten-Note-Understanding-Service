import type { IFlashcard, IStudyVisual } from "../models/LearningMaterial";

const text = (value: unknown, max: number): string =>
  typeof value === "string" && value.trim().length <= max ? value.trim() : "";
const normalized = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const headingKey = (value: string) => normalized(value.replace(/^#+\s*/, "").replace(/[*_`]/g, ""));

/** If the provider omits illustrations, turn an explicit labelled list from the
 * student's source into comparison panels. No generated facts or measurements. */
export function sourceListVisual(markdown: string, source: string): IStudyVisual[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const headings = markdown.split("\n").filter(line => /^#{1,6}\s/.test(line));
  const words = (value: string) => new Set(normalized(value).split(/[^\p{L}]+/u).filter(word => word.length > 2 && !["the", "and", "for", "with", "from"].includes(word)));
  const related = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));
  for (let start = 1; start < lines.length; start++) {
    if (!/^\s*1[.)]\s+/.test(lines[start])) continue;
    let end = start;
    while (end + 1 < lines.length && end - start < 5 && /^\s*\d{1,2}[.)]\s+/.test(lines[end + 1])) end++;
    if (end === start) continue;
    let previous = start - 1;
    while (previous >= 0 && !lines[previous].trim()) previous--;
    const title = lines[previous]?.trim().replace(/:$/, "");
    if (!title || title.length > 100 || /^\s*\d{1,2}[.)]\s+/.test(title)) continue;
    const keys = words(title);
    if (keys.size < 2) continue;
    const items = lines.slice(start, end + 1).map(line => {
      const match = line.replace(/^\s*\d{1,2}[.)]\s+/, "").match(/^([^:]{3,80}):\s*(.{5,240})$/);
      return match ? { label: match[1].trim(), detail: match[2].trim() } : null;
    });
    if (items.some(item => !item)) continue;
    const validItems = items as {label:string;detail:string}[];
    const matches = headings.map(heading => {
      const headingWords = words(heading);
      const titleHits = [...keys].filter(word => [...headingWords].some(other => related(word, other))).length;
      const labelHits = validItems.filter(item => [...words(item.label)].some(word =>
        ![...keys].some(titleWord => related(word, titleWord)) && [...headingWords].some(other => related(word, other)))).length;
      return { heading, score: titleHits >= 2 || (titleHits >= 1 && labelHits >= 2) ? titleHits * 2 + labelHits : 0 };
    }).sort((a,b) => b.score - a.score);
    if (!matches[0]?.score) continue;
    return [{ type: "comparison", title: title.charAt(0).toUpperCase() + title.slice(1).toLowerCase(),
      afterHeading: matches[0].heading.replace(/^#+\s*/, "").trim(),
      caption: "Compare these labelled points from your uploaded notes.",
      sourceQuote: lines.slice(start, end + 1).join("\n"), items: items as {label:string;detail:string}[] }];
  }
  return [];
}

// Generated prose must not load arbitrary images, links or HTML from model output.
export function cleanStudyMarkdown(value: string): string {
  return value.replace(/\{\{visuals?:[^}]*\}\}/gi, "")
    .replace(/!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])?/g, "")
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<(?!\!--)[^>]+>/g, "").trim();
}

/** Bad optional visuals are omitted; the readable lesson remains usable. Numeric
 * charts require verbatim evidence for every value and label, never invented data. */
export function validateStudyGuide(value: unknown, source: string): { textContent: string; visuals: IStudyVisual[] } {
  const item = value as any;
  if (!item || typeof item.markdown !== "string" || item.markdown.trim().length < 100 || item.markdown.length > 35000) {
    throw new Error("The study guide did not contain a readable lesson.");
  }
  let textContent = cleanStudyMarkdown(item.markdown);
  const visible = textContent.replace(/<!--[\s\S]*?-->/g, "").trim();
  if (visible.length < 100 || (visible.match(/\p{L}/gu)?.length ?? 0) < 40) throw new Error("The study guide did not contain a readable lesson.");
  const headings = new Set<string>();
  let fence: string | undefined;
  for (const line of textContent.split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
      continue;
    }
    if (!fence && /^#{1,6}\s/.test(line)) headings.add(headingKey(line));
  }
  const visuals: IStudyVisual[] = [];
  for (const candidate of Array.isArray(item.visuals) ? item.visuals.slice(0, 3) : []) {
    const title = text(candidate?.title, 120), caption = text(candidate?.caption, 400);
    const afterHeading = text(candidate?.afterHeading, 180), sourceQuote = text(candidate?.sourceQuote, 1600);
    if (!title || !caption || !headings.has(headingKey(afterHeading)) || sourceQuote.length < 20 ||
      !normalized(source).includes(normalized(sourceQuote))) continue;
    const base = { title, caption, afterHeading, sourceQuote };
    if (["flow", "timeline", "comparison"].includes(candidate.type)) {
      if (!Array.isArray(candidate.items) || candidate.items.length < 2 || candidate.items.length > 6) continue;
      const items = candidate.items.map((entry: any) => ({ label: text(entry?.label, 100), detail: text(entry?.detail, 240) }));
      if (items.some((entry: any) => !entry.label || !entry.detail)) continue;
      const type = candidate.type === "flow" && items.every((entry: { label: string }) => /^\d{4}(?:\s*[–‑-]\s*\d{2,4})?$/.test(entry.label)) ? "timeline" : candidate.type;
      visuals.push({ ...base, type, items });
    } else if (candidate.type === "bar") {
      const unit = text(candidate.unit, 50);
      if (!unit || !Array.isArray(candidate.data) || candidate.data.length < 2 || candidate.data.length > 6) continue;
      const data = candidate.data.map((entry: any) => ({ label: text(entry?.label, 80), value: entry?.value }));
      const matchesObservation = (entry: { label: string; value: number }) => {
        if (!entry.label || !Number.isFinite(entry.value) || entry.value < 0) return false;
        // Check the whole category and its own value/unit together. A minus sign
        // is never treated as a separator; one category cannot borrow another's unit.
        const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped(entry.label)}\\s*(?:[:=|]\\s*)?(-?\\d+(?:\\.\\d+)?)\\s*${escaped(unit)}(?=$|[^\\p{L}\\p{N}_/^])`, "giu");
        const matches = [...sourceQuote.matchAll(pattern)];
        return matches.length === 1 && Number(matches[0][1]) === entry.value;
      };
      if (!data.every(matchesObservation) || new Set(data.map((entry: any) => normalized(entry.label))).size !== data.length || data.every((entry: any) => entry.value === 0)) continue;
      visuals.push({ ...base, type: "bar", unit, data });
    }
  }
  // A model can end with an empty "Visuals"/"Summary" heading even with a normal
  // stop. Keep it only when a validated illustration actually belongs there.
  let trailing: RegExpMatchArray | null;
  while ((trailing = textContent.match(/(?:^|\n)(#{1,6}\s+[^\n]+)\s*$/)) &&
    !visuals.some(visual => headingKey(visual.afterHeading) === headingKey(trailing![1]))) {
    textContent = textContent.slice(0, trailing.index).trim();
  }
  return { textContent, visuals };
}

export function validateFlashcards(value: unknown, source?: string): IFlashcard[] {
  if (!Array.isArray(value)) throw new Error("Flashcards response is not an array");
  const seen = new Set<string>();
  const cards: IFlashcard[] = [];
  for (const item of value) {
    const front = text(item?.front, 240), back = text(item?.back, 500);
    const key = normalized(front).replace(/[^\p{L}\p{N}]/gu, "");
    if (!front || !back || !key || seen.has(key) || normalized(front) === normalized(back)) continue;
    const sourceQuote = text(item.sourceQuote, 900);
    if (source !== undefined && (sourceQuote.length < 20 || !normalized(source).includes(normalized(sourceQuote)))) continue;
    seen.add(key);
    let hint = text(item.hint, 180), explanation = text(item.explanation, 300);
    if (back.length >= 3 && new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped(normalized(back))}(?=$|[^\\p{L}\\p{N}])`, "u").test(normalized(hint))) hint = "";
    if (normalized(explanation) === normalized(back)) explanation = "";
    const kind = ["recall", "explain", "apply", "compare"].includes(item.kind) ? item.kind : undefined;
    cards.push({ front, back, ...(hint ? { hint } : {}), ...(explanation ? { explanation } : {}), ...(kind ? { kind } : {}), ...(sourceQuote ? { sourceQuote } : {}) });
    if (cards.length === 12) break;
  }
  if (cards.length < 3) throw new Error("Not enough usable flashcards. Please try generating again.");
  return cards;
}
