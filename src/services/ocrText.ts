/** Preserve deletions in raw OCR, but exclude them from active note content. */
export const activeOcrText = (text: string): string => {
  const result = text.replace(/<deleted>[\s\S]*?<\/deleted>/gi, " ");
  if (/<\/?deleted\b/i.test(result)) {
    throw new Error("OCR returned malformed crossed-out text markers");
  }
  return result
    .replace(/\[(?:crossed out(?: heading)?):[^\]]*\]/gi, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
};

/** A visual deletion review may only mark exact, unambiguous OCR phrases.
 * It cannot add facts, replace words, or delete an unrelated occurrence.
 */
export const markReviewedDeletions = (text: string, review: unknown): string => {
  if (!Array.isArray(review) || review.length > 20) throw new Error("Invalid visual deletion review");
  const lines = text.split("\n");
  const sourceLines = [...lines];
  for (const item of review) {
    if (!item || typeof item.line !== "string" || typeof item.text !== "string" || !item.text.trim() || item.text !== item.text.trim()) {
      throw new Error("Invalid visual deletion review");
    }
    const matches = sourceLines.map((line,index)=>({line,index})).filter(({line})=>activeOcrText(line).trim()===item.line.trim());
    if (matches.length !== 1) throw new Error("Visual deletion review did not match a unique OCR line");
    const {index} = matches[0];
    const line=lines[index];
    const protectedLine = line.replace(/<deleted>[\s\S]*?<\/deleted>/gi,match=>" ".repeat(match.length));
    const start = protectedLine.indexOf(item.text);
    if (start < 0 || protectedLine.indexOf(item.text,start+1) >= 0) throw new Error("Visual deletion review did not match a unique active phrase");
    lines[index] = line.slice(0,start)+"<deleted>"+line.slice(start,start+item.text.length)+"</deleted>"+line.slice(start+item.text.length);
  }
  return lines.join("\n");
};

/** Flag long repeated passages, including copies with fragmented OCR lines.
 * Do not delete text automatically: repetition can be intentional in an image.
 */
export const hasRepeatedOcrPassage = (text: string): boolean => {
  const compactLine = (line: string) => line.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const compact = compactLine(text);
  // A restarted heading followed by substantially the same content is a
  // duplicate even when the second reading splits words and reorders fragments.
  const headings = new Map<string, number>();
  let cursor = 0;
  for (const line of text.split(/\r?\n/)) {
    const heading = compactLine(line);
    const previous = headings.get(heading);
    if ((heading.length >= 8 || /^\d{1,3}$/.test(line.trim())) && heading.length <= 60 && !/[<>]/.test(line)) {
      if (previous !== undefined) {
        const first = compact.slice(previous, cursor);
        const second = compact.slice(cursor);
        if (first.length >= 200 && second.length >= first.length * .5 && second.length <= first.length * 1.8) {
          const grams = (value: string) => new Set(Array.from({length: Math.max(0,value.length-4)},(_,index)=>value.slice(index,index+5)));
          const original = grams(first), repeat = grams(second);
          let shared = 0;
          for (const gram of original) if (repeat.has(gram)) shared++;
          if (shared >= original.size * .7) return true;
        }
      } else headings.set(heading,cursor);
    }
    cursor += heading.length;
  }
  const width = 25;
  const seen = new Map<string, number>();
  const coveredStarts: number[] = [];
  let repeatedCharacters = 0;
  for (let index = 0; index + width <= compact.length; index++) {
    const passage = compact.slice(index, index + width);
    const previous = seen.get(passage);
    if (previous !== undefined && index - previous >= 150 && !coveredStarts.some(start => previous < start + width && previous + width > start)) {
      repeatedCharacters += width;
      coveredStarts.push(previous);
      // Multiple separated matches catch fragmented/reordered second copies,
      // while a single repeated heading or brief definition remains acceptable.
      if (repeatedCharacters >= 175 && repeatedCharacters * 2 >= compact.length * .25) return true;
    }
    if (previous === undefined) seen.set(passage, index);
  }
  return false;
};
