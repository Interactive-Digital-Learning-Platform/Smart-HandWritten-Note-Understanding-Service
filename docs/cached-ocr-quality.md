# Cached OCR quality — 16 October 2026

Reanalysis previously reused saved text without carrying its page-extraction
summary into the pipeline. The Science trained-model gate treated a missing
failed-page count as zero. A new text-readability assessment could also clear
an earlier warning without reading the photos again.

Pipeline 2.1.2 carries server-saved page counts, OCR-specific warnings and
readability into cached extraction. Missing or inconsistent page counts become
explicitly unknown, with no fabricated extracted/failed counts. The automatic
Science model requires a complete page summary and usable text. Ordinary
coverage analysis remains available with quality warnings; trained suggestions
remain separate from its score.

New summaries bind quality to the exact raw text and ordered image URLs using
SHA-256. Changed text, page identity or ordering invalidates that summary.
Valid older server-saved counts without hashes remain supported; they are not
retroactively proof of image/text identity. An explicit unknown state or a
contradictory failed-page warning cannot become known simply by reusing text.
This does not detect image bytes overwritten at an unchanged URL.

Re-reading cached text retains earlier low-quality flags and uses the lower of
valid saved/new readability scores. A fresh OCR request bypasses saved text and
provenance, so new image extraction can replace old warnings. Blank OCR output
is a failed page. Repeated warnings are deduplicated.

The Notes screen displays “Check your note photos” for unknown page quality.
Its action opens the existing photo viewer. Existing failed-page and low-quality
warnings remain visible. No other member's service, shared auth/configuration,
model artifact, student score or existing note was modified for verification.

## Verification

- Backend TypeScript build and mobile TypeScript check passed.
- `npm run test:ocr-provenance`: 11 regression tests passed on Windows and as
  compiled tests inside the rebuilt Linux container. Includes repeated
  reanalysis, Mongoose serialization/hydration, fingerprint mismatches,
  unknown/inconsistent counts, cached readability, fresh OCR and service wiring.
- Existing backend suite: 72 distinct tests passed. Six local HTTP tests were
  initially blocked by sandbox EACCES; the seven-test security group passed
  with local networking enabled.
- Five trained Science pipeline tests passed, including real frozen-model
  predictions and safe skip gates.
- 35 focused Notes mobile tests passed.
- Rebuilt container: 15 frozen Science/History prediction regressions passed.
  This is regression testing, not an accuracy estimate.
- A clearly labeled synthetic note verified real MongoDB persistence and the
  signed-in app warning/photo action at 390×844. It was removed afterward.
  Existing notes were not reprocessed and no paid AI calls were made.
- Notes Docker is healthy; direct/proxied health and app return 200. Anonymous
  Notes requests still return 401. Existing uploads/audio volumes were retained.

Evidence: `../output/notes-ocr-cache-2026-10-16` in the shared workspace.
