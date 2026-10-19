import test from "node:test";
import assert from "node:assert/strict";
import {
  getTextbookFilenameCandidates,
  getTextbookStorageSources,
  matchesTextbookFilename,
} from "./textbookFilename";

test("canonical textbook filenames match ordinary ingestion variants", () => {
  assert.equal(
    matchesTextbookFilename(
      "grade-10-science-text-book-6200ec8f089d4 (1).pdf",
      "grade-10-science-text-book-6200ec8f089d4.pdf"
    ),
    true
  );
});

test("Grade 11 Science registry names match the ingested part filenames", () => {
  assert.equal(
    matchesTextbookFilename(
      "science grade 11 part 1.pdf",
      "grade-11-science-part-1.pdf"
    ),
    true
  );
  assert.equal(
    matchesTextbookFilename(
      "science grade 11 part 2.pdf",
      "grade-11-science-part-2.pdf"
    ),
    true
  );
});

test("Grade 10 Science uses the verified v1 ingestion name without matching other grades", () => {
  const canonical = "grade-10-science-text-book-6200ec8f089d4.pdf";
  assert.ok(getTextbookFilenameCandidates(canonical).includes("grade-10-science-text-book-v1.pdf"));
  assert.equal(matchesTextbookFilename("grade-10-science-text-book-v1.pdf", canonical), true);
  assert.equal(matchesTextbookFilename("science grade 11 part 1.pdf", canonical), false);
});

test("the canonical History name accepts the legacy ingested typo", () => {
  assert.equal(
    matchesTextbookFilename(
      "histoy grade 10.pdf",
      "grade-10-history-text-book-64017cf286c01.pdf"
    ),
    true
  );
  assert.deepEqual(
    getTextbookFilenameCandidates("grade-11-history-text-book.pdf"),
    ["grade-11-history-text-book.pdf", "histoy grade 11.pdf"]
  );
  assert.equal(
    matchesTextbookFilename(
      "histoy grade 11.pdf",
      "grade-11-history-text-book.pdf"
    ),
    true
  );
});

test("unrelated textbooks remain outside a filename boundary", () => {
  assert.equal(
    matchesTextbookFilename(
      "grade-10-history-text-book-64017cf286c01.pdf",
      "grade-11-history-text-book.pdf"
    ),
    false
  );
});

test("Grade 11 ICT registry matches its uploaded textbook without matching Grade 10", () => {
  assert.equal(matchesTextbookFilename("ICT grade 11.pdf", "ICT G-11 E.pdf"), true);
  assert.equal(matchesTextbookFilename("ICT grade 10.pdf", "ICT G-11 E.pdf"), false);
});

test("Science Part 2 has a page-adjusted combined-textbook fallback", () => {
  assert.deepEqual(getTextbookStorageSources("grade-11-science-part-2.pdf"), [
    { filename: "grade-11-science-part-2.pdf", pageOffset: 0 },
    {
      filename: "grade-11-science-text-book-6200f72533f2f.pdf",
      pageOffset: 220,
    },
  ]);
});
