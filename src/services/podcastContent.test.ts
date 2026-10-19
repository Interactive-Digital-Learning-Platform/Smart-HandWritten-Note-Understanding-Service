import assert from "node:assert/strict";
import { test, mock } from "node:test";
import fs from "node:fs";
import axios from "axios";
import { validatePodcastScript, podcastTranscriptCues, decodeTimedPodcast } from "./podcastContent";
import { LearningMaterial } from "../models/LearningMaterial";
import { generateAudio } from "./materialsService";
import { groqPool } from "./groqPool";
import { qdrantService } from "./qdrantService";
import { config } from "../config/config";

const script = Array.from({ length: 15 }, () => "Friction acts between surfaces and opposes relative motion between them.").join(" ");
const alignment = (text: string) => ({ characters: Array.from(text), character_start_times_seconds: Array.from(text, (_, i) => i * 0.04), character_end_times_seconds: Array.from(text, (_, i) => i * 0.04 + 0.03) });
const timedResponse = (text: string) => ({ audio_base64: Buffer.from("ID3synthetic audio fixture").toString("base64"), alignment: alignment(text) });

test("provider character timings become word cues at original Unicode/paragraph offsets", () => {
  const text = "Heat CO₂.\n\nAdd 😀 water.";
  const cues = podcastTranscriptCues(text, alignment(text));
  assert.deepEqual(cues.map(cue => text.slice(cue.startOffset, cue.endOffset)), ["Heat", "CO₂.", "Add", "😀", "water."]);
  assert.equal(cues[0].start, 0);
  assert.equal(cues[3].endOffset - cues[3].startOffset, 2);
  assert.equal(cues[4].start, Array.from(text.slice(0, cues[4].startOffset)).length * 0.04);
});

test("missing, mismatched, non-finite and reversed alignments cannot publish falsely synced text", () => {
  const original = alignment("Hello world.");
  for (const invalid of [null, {}, { ...original, characters: Array.from("Other words.") },
    { ...original, character_start_times_seconds: [NaN, ...original.character_start_times_seconds.slice(1)] },
    { ...original, character_end_times_seconds: [-1, ...original.character_end_times_seconds.slice(1)] },
    { ...original, character_start_times_seconds: [5, ...original.character_start_times_seconds.slice(1)] }]) {
    assert.throws(() => podcastTranscriptCues("Hello world.", invalid), /usable transcript timings/);
  }
  assert.throws(() => decodeTimedPodcast({ audio_base64: "not-base64!", alignment: original }, "Hello world."), /audio recording/);
});

test("timed transcript metadata survives the existing owned-material schema", async () => {
  const text = "Hello world.";
  const material = new LearningMaterial({ noteId: "507f1f77bcf86cd799439011", userId: "synthetic", type: "audio", audioUrl: "/generated_audio/fixture.mp3", textContent: text, transcriptCues: podcastTranscriptCues(text, alignment(text)) });
  await material.validate();
  assert.equal(material.toObject().transcriptCues?.length, 2);
  assert.equal(material.toObject().transcriptCues?.[1].startOffset, 6);
});

test("a readable podcast retains paragraph breaks; malformed or overlong narration fails before TTS", () => {
  const content = validatePodcastScript(`# Lesson\n\n**Listen carefully.**\n\n${script}`);
  assert.ok(content.textContent.startsWith("Lesson\n\nListen carefully."));
  assert.equal(content.estimatedMinutes, 1);
  for (const bad of ["Too short", "word ".repeat(501), script + " <script>alert(1)</script>", script + " [pause for music]", script + " https://invalid.test"]) {
    assert.throws(() => validatePodcastScript(bad), /unsuitable/);
  }
});

test("recordings and script-only versions both return the actual narrated transcript without real provider calls", async () => {
  const originalKey = config.elevenlabs.apiKey;
  const files: Array<{ path: string; data: unknown }> = [];
  let ttsCalls = 0;
  const reference = "Friction acts between surfaces and opposes relative motion between them.";
  const retrieval = mock.method(qdrantService, "getCurriculumTextbookContext", async (_subject: string, _topic: string, _text: string, grade: number) => {
    assert.equal(grade, 10);
    return { isAvailable: true, textbookReference: "Test textbook", passages: [{ text: reference, filename: "science.pdf", pages: [12] }] } as any;
  });
  const groq = mock.method(groqPool, "createChatCompletion", async (request: any) => {
    assert.match(request.messages[0].content, /not repeat an error/);
    assert.ok(request.messages[1].content.includes(reference));
    assert.match(request.messages[1].content, /recall question/);
    return { choices: [{ finish_reason: "stop", message: { content: script } }] } as any;
  });
  const writes = mock.method(fs, "writeFileSync", (file: any, data: any) => { files.push({ path: String(file), data }); });
  const tts = mock.method(axios, "post", async (url: any, payload: any, options: any) => {
    ttsCalls++;
    assert.equal(payload.text, script); assert.equal(options.timeout, 90000);
    assert.match(url, /\/with-timestamps\?output_format=mp3_44100_128$/);
    assert.equal(options.responseType, "json");
    return { data: timedResponse(script), headers: { "content-type": "application/json" } } as any;
  });
  try {
    config.elevenlabs.apiKey = "";
    const text = await generateAudio("A synthetic note", "Science", "Friction", "Grade 10", "podcast-text-fixture");
    assert.equal(text.textContent, script); assert.match(text.audioUrl, /\.txt$/);
    assert.equal(ttsCalls, 0); assert.equal(files[0].data, script);
    config.elevenlabs.apiKey = "synthetic-test-key-never-sent";
    const recording = await generateAudio("A synthetic note", "Science", "Friction", "Grade 10", "podcast-audio-fixture");
    assert.equal(recording.textContent, script); assert.match(recording.audioUrl, /\.mp3$/);
    assert.equal(ttsCalls, 1); assert.equal(files.length, 2);
    assert.equal(recording.transcriptCues.length, 150);
    assert.equal(text.transcriptCues.length, 0);
  } finally {
    config.elevenlabs.apiKey = originalKey;
    for (const mocked of [retrieval, groq, writes, tts]) mocked.mock.restore();
  }
});

test("empty or non-audio speech responses do not save a broken recording", async () => {
  const originalKey = config.elevenlabs.apiKey;
  const retrieval = mock.method(qdrantService, "getCurriculumTextbookContext", async () => ({ isAvailable: false, passages: [] }) as any);
  const groq = mock.method(groqPool, "createChatCompletion", async () => ({ choices: [{ finish_reason: "stop", message: { content: script } }] }) as any);
  let writes = 0;
  const save = mock.method(fs, "writeFileSync", () => { writes++; });
  const tts = mock.method(axios, "post", async () => ({ data: Buffer.alloc(0), headers: { "content-type": "audio/mpeg" } }) as any);
  try {
    config.elevenlabs.apiKey = "synthetic-test-key-never-sent";
    await assert.rejects(generateAudio("Synthetic", "Science", "Friction", "10", "fixture-empty"), /did not return an audio/);
    tts.mock.mockImplementation(async () => ({ data: Buffer.from('{"error":"busy"}'), headers: { "content-type": "application/json" } }) as any);
    await assert.rejects(generateAudio("Synthetic", "Science", "Friction", "10", "fixture-json"), /did not return an audio/);
    assert.equal(writes, 0);
  } finally {
    config.elevenlabs.apiKey = originalKey;
    for (const mocked of [retrieval, groq, save, tts]) mocked.mock.restore();
  }
});
