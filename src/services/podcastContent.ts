import { IAudioTranscriptCue } from "../models/LearningMaterial";

/** Keep the same readable script for narration and the student's transcript. */
export function validatePodcastScript(value: string): { textContent: string; estimatedMinutes: number } {
  const textContent = value.replace(/\r\n/g, "\n")
    .replace(/^```(?:text)?\s*\n?|\n?```$/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^[ \t]*[-*•]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n").trim();
  const wordCount = textContent.split(/\s+/).filter(Boolean).length;
  if (wordCount < 120 || wordCount > 500 || textContent.length > 6500 ||
      /<\/?[a-z][^>]*>|https?:\/\/|\[(?:pause|music|sound|sfx)[^\]]*\]/i.test(textContent)) {
    throw new Error("The podcast script was incomplete or unsuitable for narration. Please try again.");
  }
  return { textContent, estimatedMinutes: Math.max(1, Math.round(wordCount / 135)) };
}

/** Use original-text alignment only: normalized speech can spell numbers out and
 * cannot safely index the student's displayed script. Offsets use JS UTF-16. */
export function podcastTranscriptCues(script: string, value: unknown): IAudioTranscriptCue[] {
  const alignment = value as any;
  const chars = alignment?.characters;
  const starts = alignment?.character_start_times_seconds;
  const ends = alignment?.character_end_times_seconds;
  const invalid = () => new Error("The recording did not include usable transcript timings. Please try again.");
  if (!Array.isArray(chars) || !Array.isArray(starts) || !Array.isArray(ends) ||
      !chars.length || chars.length > 10000 || chars.length !== starts.length || chars.length !== ends.length ||
      chars.some(char => typeof char !== "string" || !char.length || char.length > 4) || chars.join("") !== script) throw invalid();
  let offset = 0;
  const offsets: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (!Number.isFinite(starts[i]) || !Number.isFinite(ends[i]) || starts[i] < 0 || ends[i] < starts[i] || ends[i] > 3600 || (i > 0 && starts[i] < starts[i - 1])) throw invalid();
    offsets.push(offset); offset += chars[i].length;
  }
  let index = 0;
  const cues: IAudioTranscriptCue[] = [];
  for (const match of script.matchAll(/\S+/gu)) {
    const startOffset = match.index;
    const endOffset = startOffset + match[0].length;
    while (index < chars.length && offsets[index] + chars[index].length <= startOffset) index++;
    const start = starts[index];
    let end = ends[index];
    while (index + 1 < chars.length && offsets[index + 1] < endOffset) { index++; end = Math.max(end, ends[index]); }
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw invalid();
    cues.push({ start, end, startOffset, endOffset });
  }
  if (!cues.length || cues.length > 500) throw invalid();
  return cues;
}

export function decodeTimedPodcast(value: unknown, script: string): { bytes: Buffer; transcriptCues: IAudioTranscriptCue[] } {
  const response = value as any;
  if (typeof response?.audio_base64 !== "string" || !response.audio_base64.length || response.audio_base64.length > 28_000_000 ||
      response.audio_base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(response.audio_base64)) {
    throw new Error("The speech provider did not return an audio recording. Please try again.");
  }
  const bytes = Buffer.from(response.audio_base64, "base64");
  if (!(bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) {
    throw new Error("The speech provider did not return an audio recording. Please try again.");
  }
  return { bytes, transcriptCues: podcastTranscriptCues(script, response.alignment) };
}
