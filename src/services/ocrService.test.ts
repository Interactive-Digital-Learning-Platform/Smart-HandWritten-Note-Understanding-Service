import test from "node:test";
import assert from "node:assert/strict";
import { validateOcrPageText } from "./ocrService";

test("OCR page validation accepts a normal handwritten transcription", () => {
  const result = validateOcrPageText(
    "1.6 Minerals\nCalcium: bones and teeth\nIron: haemoglobin"
  );
  assert.equal(result.valid, true);
});

test("OCR page validation rejects implausibly long single-page output", () => {
  const result = validateOcrPageText("hallucinated textbook content ".repeat(600));
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /characters for one handwritten page/);
});

test("OCR page validation rejects leaked model reasoning", () => {
  const result = validateOcrPageText(
    "<think>I should explain the lesson before transcribing it.</think>"
  );
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /model reasoning/);
});
