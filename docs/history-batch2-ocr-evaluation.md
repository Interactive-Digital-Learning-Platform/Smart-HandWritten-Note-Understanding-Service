# History batch 2 — intake, OCR correction and partial evaluation

19 October 2026. Notes-service scope only. No History training was performed.

The two new ZIPs contain 16 generated handwriting notebooks and 98 images,
covering Grade 10 units 2–9 (textbook chapters 1–4). All archive image byte
counts and SHA-256 values match their manifests. Viewer HTML was not executed.
Source topic profiles are authoring metadata; content plans are not OCR text.
The batch maps to 38 notebook/concept checks across 18 existing concepts.

## Current evaluation status

The user explicitly approved Groq OCR for all 98 new History images. The batch
stopped after repeated 429 rate limits on both keys, including a retry after
waiting for the shorter cooldown. There are 25 attempted pages: 11 usable and
14 failed; 73 remain unattempted. No whole notebook has every page OCR-successful,
so no whole-notebook OCR classification or overall accuracy is claimed.
Successful checkpoints are retained. No automatic retry is scheduled.

While OCR was unavailable, all five L02_F images were visually transcribed
locally, and assistant reference labels were saved before the notebook model
predictions:

| Concept | Assistant reference | Unchanged History V6 |
|---|---|---|
| Foreign literary sources | Partial | Missing |
| Critically checking sources | Partial (medium confidence) | Missing |
| Inscriptions | Partial | Partial |
| Coins | Missing | Missing |
| Ruins, art and antiquities | Complete | Complete |

This is agreement with an assistant review of one generated notebook, not
teacher-verified or general accuracy. The two Partial/Missing disagreements
need attention before training. Missing coin content is distinct from the
meaningful inscription evidence, even though both main topics were labelled
omitted in the authoring plan. A separate local page-only foreign-accounts
check also returned Missing against an assistant Partial reference.

## Notes-only OCR correction

The repetition detector incorrectly rejected a faithful 859-character
transcription of L02_F page05: its diagram boxes legitimately restate the prose.
The old generic overlap threshold treated this as a duplicate reading.

The validator now requires overlap consistent with a second reading of most
of a page. The separate restarted-heading check remains. Tests accept the
faithful summary chart and reject a second copy of that chart, fragmented or
reordered duplicate readings, leaked reasoning and malformed deletion markers.
No text is silently deleted, corrected or substituted for failed OCR. This
heuristic cannot prove that all repetition is image-grounded; partial duplicate
hallucinations may still require review.

Validation: TypeScript build, 26 focused OCR/provenance/cleaning tests, and all
11 compiled OCR tests inside the production Notes image passed. Docker tests
mock the provider and make no external requests. Rate limits prevented a full
live before/after OCR comparison. The Notes container is healthy (HTTP 200).

Image: `smart-notes-coverage:science-v35-history-v6-ict-v31-materials-v31-ocr-v2`.
Image ID: `sha256:37f51280f244f6c7876f5d2efa7ca71503fb172bfdb9f49b576099a75b989e24`.
Science V3.5, History V6 and ICT V3.1 artifact hashes remain unchanged.
The previous image without the `-ocr-v2` suffix is retained for rollback.

## Resume when Groq quota permits

The existing approval covers these same 98 History images; do not request it
again. From the Notes repository:

```powershell
node tmp/history-batch2-intake-2026-10-19/run-ocr.cjs 1
node tmp/history-batch2-intake-2026-10-19/evaluate.cjs
node tmp/history-batch2-intake-2026-10-19/report.cjs
```

The OCR runner retains prior attempts, records response diagnostics privately,
skips successful image-hash checkpoints and honors provider cooldowns. Keep
retries bounded; source-data folders and raw transcripts remain Git-ignored.
The evaluator uses the same integrity-checked inference bundle as Docker,
never truncates a notebook to fit the 20,000-character limit, and skips incomplete
OCR notebooks. The detailed report and reference records are under
`tmp/history-batch2-intake-2026-10-19/`. History V6 remains frozen at
`445f2986afecc521597d5ff82e69191bfe782e38ab42a099d49d5d4d8477f629`.
