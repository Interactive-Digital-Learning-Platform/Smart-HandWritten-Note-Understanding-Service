# Science v2.2 intake audit

Audited on 2026-10-02 using the archive contents, CSV/JSONL records, and current
Python importer/trainer. This audit did not run training or change source labels.

Source: `../DATASETS/science-training-release-v2.2.zip`

SHA-256: `75a088507f2892e879f48c215e9dac8518699513e80a3593630863f895415b04`

## Composition and structural checks

- 181 archive files; CRC checks pass; no duplicate, unsafe, or encrypted paths.
- 80 synthetic Science notes, 772 pages, 12 synthetic students.
- All 160 raw/corrected source text files are unchanged from the previously
  evaluated v2 release. This is revised training supervision, not additional notes.
- 812 note labels: 469 present, 224 partial, 119 missing.
- 1,208 page training rows: 440 present, 164 partial, 604 missing.
- These are corrected/raw views of 604 unique page/concept pairs from 302 source
  annotations. Of the 604 view pairs, 383 contain identical text.
- All 160 text-manifest hashes/sizes and both workbook hashes match.
- Metadata, student mapping, provenance, labels, and page-example joins match.
- All page-example text and hashes match the declared source pages; CSV and JSONL
  fields agree; sample weights match the supplied policy.
- All non-missing note evidence quotes and offsets match their declared pages.
- All 80 coverage summaries match concept weights within four-decimal rounding.
- The declared provenance remains synthetic, AI-reviewed, owner-approved, and
  not independently human-certified. 350 note labels retain high review priority.

## Split and supervision limitations

The new split has 8/2/2 students and 55/12/13 notes in train/validation/test.
There is no student overlap or exact corrected-page overlap inside these splits.
All 322 note-level concepts occur in the training notes. However, actual page
training supervises only 226 concepts: 33 test concepts and 42 validation concepts
have no page-supervision examples. The supplied zero-unseen-concepts claim refers
to note-level annotations, not the page examples used to fit the classifier.

Six students changed split relative to the previously evaluated v2 release. Both
current test students (`syn-g10-si-002`, `syn-g11-en-001`) previously belonged to
v2 training; both former v2 test students now belong to training. A newly fitted
classifier can respect the new split, but this is not a fresh untouched benchmark
across the experiment history. Scores from the changed splits cannot be treated
as a direct measure of improvement over the original v2 scores. An independent
real-note holdout is still required.

## Page labels requiring review

The 604 missing rows are derived from a different page of a source annotation
with positive evidence. Choosing a different page does not establish that the
concept is absent from that page. A keyword screen flagged four corrected pages;
manual inspection found direct concept evidence in two of them.

| Note / page | Concept | Corrected / raw row IDs | Finding |
| --- | --- | --- | --- |
| note-0042 / 4 | Moment of a Force | page-example-00494 / 00496 | Labelled missing, but the page explains moment direction, uses Fd, and computes 4 x 0.5 = 2 N m. Direct concept evidence. |
| note-0059 / 1 | Pressure as Force per Unit Area | page-example-00762 / 00764 | Labelled missing, but the page gives p=F/A, units, and a numerical pressure calculation. Direct concept evidence. |
| note-0012 / 2 | Simple Permanent Tissues | page-example-00186 / 00188 | Mentions parenchyma and the meaning of simple tissues. Review whether this is partial coverage. |
| note-0036 / 2 | Movement and Locomotion | page-example-00450 / 00452 | The term occurs in an unfilled observation prompt; missing may be correct. This is a review flag, not a confirmed error. |

A keyword screen cannot establish that all remaining negative pages are correct,
especially for Sinhala paraphrases. Review the negative-page derivation before
treating these labels as supervised targets. Keep any corrections in a new
versioned artifact with reviewer provenance; preserve the supplied archive.

## Compatibility and next step

The current importer expects the old `weighted_coverage` column, replaces supplied
keywords with concept names, and emits note-level records. The current trainer
fits one label per pooled note and does not consume the new page rows or their
sample weights. Running it unchanged would fail or train a different task from
the release's intended page classification followed by note aggregation.

Before the next experiment, resolve or quarantine suspect negative labels in a
separate reviewed artifact, adapt intake/training to page examples and supplied
concept metadata, keep paired text views together, and calibrate note aggregation
on validation students only. Report synthetic-only performance and preserve the
disabled deployment state. No real-data release or live model deployment resulted
from this audit. The standalone v2.1 ZIP was not opened or processed.

Machine-readable findings and the reproducible audit helper are under the ignored
`data/annotations/intake/science-v2.2/` directory.
