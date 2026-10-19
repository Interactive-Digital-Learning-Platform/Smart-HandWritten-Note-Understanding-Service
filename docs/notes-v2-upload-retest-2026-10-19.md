# Notes upload retest against local v2

19 October 2026. Scope: Notes backend and its local test/deployment helpers.
Other members' application functions and model weights are unchanged.

## Fixes

- An explicitly selected lesson now retrieves textbook passages in its own
  subject/grade/chapter scope instead of returning before retrieval. A failed
  retrieval preserves the selected lesson and supplies a readable warning.
- OCR output consisting only of unreadable placeholders or deleted text is
  rejected. Cached placeholder-only text also aborts before concept matching.
  A blank/unreadable page cannot be published as a zero-coverage lesson.
- OCR retries use smaller whole-page images after a failed first attempt.
  The page is not cropped and the repetition/length/deletion guards stay active.
  This addresses a live History case where identical image retries repeatedly
  returned a second fragmented copy of the page. A smaller-resolution probe
  recovered the actual transcription.
- Short materials run before a long guide from the same queued request. The
  request acknowledgement and durable job/lease behavior are preserved.
- A single omitted, short or incorrectly cited guide section gets one focused
  repair attempt. It must still pass the original source/length/completeness
  checks, including the friction guard; otherwise no falsely complete guide is
  published. Accepted sections are not regenerated during that repair.
- Groq key cooldowns are scoped to the model. Exhausting the vision model does
  not hide a usable key for a text model. Known all-key model quota failures are
  remembered until the provider retry window, avoiding repeated failed requests
  for every guide section. Ordinary text fallback uses the existing GPT-OSS
  models and no longer consumes the vision model's quota.
- Known vision-quota failures produce a safe retry estimate in the note's
  student-facing error message. The estimate uses the earliest recovering key,
  including when the final attempt exhausted the last healthy key. Raw provider
  details remain in server diagnostics rather than the student response.

The original test fixture's SVG text rendered blank in the fontless container.
The test now uses PNGs rendered with a real Windows font and checks recognizable
words and readability before accepting OCR success. This was a fixture issue;
no font dependency was added to the production Notes container.

## Test scope

The user explicitly approved these synthetic Science/History page images and
relevant textbook excerpts going to the existing Groq provider. The test uses
production Notes/material routes, upload storage, MongoDB, Groq OCR/analysis,
local-v2 textbook retrieval and packaged models. Its temporary loopback server
uses production JWT-verification middleware with signed test tokens and a
unique test owner. The running server's Clerk authentication is unchanged.
The browser tool could not access the app tab, so this does not validate the
mobile UI or the actual Clerk sign-in flow.

Science uses the automatic English coverage model. History uses the existing
explicit saved model-check endpoint; ordinary History concept findings still
come from semantic analysis. This test does not enable automatic History model
grading or change either model's accuracy policy.

The Science guide check requires all 25 lesson checklist concepts, their saved
coverage labels, per-section coverage metadata and substantive explanations.
The test also checks generated flashcards for both subjects, material job
terminal states, ownership and cleanup of the test notes/images/materials.
Synthetic printed images exercise image OCR; they do not measure real
handwriting accuracy or model accuracy on unseen student notes.

## Reproduce

From the Notes repository on Windows, create the approved synthetic PNGs:

```powershell
& ./deployment/kb-v2-local/render-fixtures.ps1
docker cp deployment/kb-v2-local/verify-upload.cjs smart-handwritten-note-understanding-service-notes-coverage-1:/app/verify-notes-upload-v2.cjs
docker cp tmp/kb-v2-local/fixtures smart-handwritten-note-understanding-service-notes-coverage-1:/tmp/notes-v2-fixtures
```

After authorizing the external Groq test, run:

```powershell
docker exec -e NOTES_LIVE_TEST=synthetic-images-and-textbook-excerpts -e NOTES_FIXTURE_IMAGE_DIR=/tmp/notes-v2-fixtures smart-handwritten-note-understanding-service-notes-coverage-1 node /app/verify-notes-upload-v2.cjs
```

Local-only checks remain available with `NOTES_LOCAL_TEST=1`; that branch never
starts OCR/AI generation. Reports live under `/tmp/notes-v2-upload-report.json`
and `/tmp/notes-v2-upload-local-report.json` inside the container. Generated
synthetic content is saved separately under `/tmp/notes-v2-*-private.json` for
review. Keep diagnostics out of committed student datasets.

Regression checks: 161 default Notes tests passed, including selected-lesson
grounding, unreadable-text rejection and retry-image dimensions. The Docker
build, 34 material tests and all 15 offline Science/History model fixtures passed.
Final provider-specific tests were repeated after the final retry-estimate fix.
All 35 compiled provider/material checks also passed in the final container,
as did local-only upload/ownership/cleanup and v2 readiness/chapter coverage.

## Results and remaining external limit

The initial fresh Science image run completed OCR, local-v2 retrieval, analysis
and the automatic trained-model check. The model suggested complete Benedict
test coverage. The History image caused repeated transcriptions; an approved
smaller-image probe returned the correct 370-character transcription. Both
configured vision keys later returned HTTP 429 with long retry windows.

To finish checking the other components without repeatedly spending vision
quota, a clearly labelled run used the same synthetic strings as provided text.
It uploaded the PNGs through the real route, recorded `provided_text` provenance
on its own test records, then exercised analysis, models, material routes and
storage. This is a **component run, not a fresh-image OCR success claim**.

| Component result | Science | History |
| --- | --- | --- |
| Text-based analysis | 20 seconds | 8 seconds |
| Bounded v2 passages | 6 | 6 |
| Trained-model result | Automatic Benedict check: complete suggestion | Explicit saved Sources check: present suggestion |
| Full lesson guide | 5,891 words, all 25 checklist concepts | Not requested in this run |
| Flashcards | 5 | 6 |

The guide's checklist labels and per-section coverage metadata matched the
saved findings for every concept. No illustrative graph was invented (zero
optional visuals in this sample). Source identifiers and generated-content
contracts passed; this is not a measurement of factual or model accuracy.
The Science material batch took 487 seconds under the live provider limits;
the note was already analyzed while generation continued. The final scheduler
makes short materials available before that long guide.

The final fresh History attempt remained blocked by vision HTTP 429. Its note
reached `failed` promptly and exposed a safe retry message; no endless polling,
unhandled frontend provider error, or false zero-coverage success was claimed.
All test-owned notes/images/materials/profiles were removed. Original student
records and model weights are preserved.

The final fresh-image end-to-end pass is **still unverified** until Groq vision
quota is available. No new provider, account or paid plan was configured. The
live account model inventory offered no alternative active vision model, so
text-only models were not substituted for OCR. Existing analyzed notes and
local model inference remain usable independently of new-image OCR capacity.
