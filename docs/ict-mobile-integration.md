# ICT model integration - 2026-10-15

ICT V3.1 now runs through the notes backend and the shared mobile/web app. An analyzed ICT note shows a concept-review card using its extracted text. A student selects Grade 10 or 11 and an expected concept, corrects the English text, confirms scope, and requests a suggestion. This is an on-demand review check; it does not automatically grade the uploaded note or change marks, learning materials, or the student profile.

The scope remains the same 10 reviewed theory concepts, not the full syllabus. The classifier, encoder, criteria and review policy retain their frozen hashes. No retraining took place. The model SHA-256 is `df42a138824f57fec3339ecb973f643cebf8899d7eaba902d5adfb40d4a3b74b`.

## Use in the app

Open an analyzed note whose subject is ICT or Information Technology. Choose a concept in the new ICT card, check the OCR text, confirm that the concept is expected, and press **Check ICT coverage**. The card offers seven Grade 10 concepts and three Grade 11 concepts. **View textbook reference** opens a bounded, scrollable excerpt panel; it can be hidden again.

The Notes home screen also links to **Try ICT model examples**. The demo route is `http://127.0.0.1:8082/notes/ict-model-demo` on this workstation. Its six synthetic texts exercise Complete, Partial, Missing, a raw-Partial RAM/ROM conflict that is withheld, a Complete DNS answer and a raw-Complete email conflict that is withheld. These examples reuse exposed development material and establish integration behavior, not independent accuracy.

Predictions always retain `status: null`, `reviewRequired: true` and uncalibrated scores. The UI displays only the optional suggestion; it never substitutes the raw model label for a withheld result. Candidate passages and concern quotes are checked against Unicode code-point offsets. Text/concept/grade changes clear old results and require confirmation again; aborted or stale responses cannot replace a newer check.

## Backend and verified sources

```text
GET  /api/ict-coverage/concepts
POST /api/ict-coverage/suggestions
GET  /api/ict-coverage/concepts/:conceptId/reference
```

The POST body is `{text, conceptId, language: "English", scopeConfirmed: true}`. Unsupported concepts/language, malformed deletion markers and text outside the 1-20,000 code-point limit are rejected. Deleted text is excluded before inference. One bounded persistent worker handles ICT requests, validates model identity, and restarts after transport failure. Errors do not expose private note text or internal model paths. Responses use `Cache-Control: no-store`.

Local `.env` now enables `ICT_COVERAGE_REVIEW_ENABLED=true`; `.env.example` defaults it off. The host backend was restarted on port 8004. The mobile app still reaches that backend through the existing gateway on 8080. The local inference path uses the existing Python environment; Docker uses its bundled CPU environment. `ICT_COVERAGE_PYTHON` can override the interpreter.

The textbook endpoint filters Qdrant by both reviewed PDF page numbers and the verified job ID, then validates returned job IDs, filenames and page numbers. It excludes the preserved corrupted uploads:

| Grade | Verified job | PDF SHA-256 |
| --- | --- | --- |
| 10 | `3fa953c7-3d14-4612-9bed-b3887cf1a624` | `0562035a2b8201df08e0917e70e37d834c77be2662283a8a878acc444db9a4e5` |
| 11 | `f5110037-6100-45ac-b3b6-ae6baded7ea9` | `9d9c1a102b4e077916dd7f9a89381c6de96d0c57f75bef868e258ff33959e029` |

Reference retrieval is separate from model inference. The model compares note text with frozen reviewed requirements; it does not generate its decision from a live textbook query. These reviewed concepts use pilot unit IDs, not an approved automatic mapping to the whole live ICT curriculum. The broader existing note-analysis/retrieval pipeline is unchanged.

## Packaging and verification

The inference-only runtime bundle now contains 30 files, including all three models and the shared MiniLM encoder. It excludes training datasets, the human-review packet, credentials and uploaded notes. The original release file's ingestion/deployment flags describe the earlier freeze stage and remain unchanged; current rollout evidence is recorded separately.

The new image is `smart-notes-coverage:science-v31-history-v51-ict-v31`, Docker image ID `sha256:fd693f273144f97fb8a546fbc534b08a40b68ef2a9598ca2373f41c4cde08756`. The compose backend was updated on loopback port 8005 with existing volumes preserved. Its local Qdrant URL now uses `host.docker.internal`; set `COVERAGE_QDRANT_URL` for a different deployment host.

| Check | Result |
| --- | --- |
| Windows backend and mobile TypeScript checks | Passed |
| Backend ICT/History API and shared-worker tests | 9 passed |
| Mobile contracts: ICT / History / Science | 10 / 7 / 4 passed |
| Portable runtime integrity tests | 4 passed |
| Original local ICT service bridge | 6/6 matched |
| Portable Windows ICT bundle | 6/6 matched |
| Mobile gateway: ICT predictions / verified references | 6/6 and 10/10 |
| Docker with network disabled: Science / History / ICT | 3/3, 12/12, 6/6 |
| Running Docker backend: ICT predictions / references | 6/6 and 10/10 |
| Browser: all six example outcomes, grade picker, reference loading, edit invalidation | Passed |

Cross-platform ICT prediction fields matched exactly apart from numeric differences up to `1.1920928955078125e-7`, within the declared absolute/relative tolerance. The Science/History regression maximum difference was `2.980232238769531e-7`. Source model hashes are unchanged. The first check loads the model; subsequent short-note checks reuse it.

Evidence: `packaging/ict-integration-report.json`, `packaging/ict-verification.json`, mobile `assets/data/ictCoverageDemoResponses.json`, and workspace `output/ict-integration/ict-app-demo.png`. The demo and uploaded-note screen use the same React Native card. Browser checks used Expo Web; a new physical-device upload/OCR-to-ICT-card run and real handwritten ICT accuracy were not validated in this integration pass.

Repeat the live gateway check from the backend repository:

```powershell
$env:ICT_VERIFY_URL = 'http://127.0.0.1:8080/api/notes/api'
npm run verify:ict-integration -- --http
```

For the running container, use `http://127.0.0.1:8005/api`. For offline checks, run `node dist/scripts/verify-ict-integration.js`; set both `COVERAGE_BUNDLE_DIR` and `COVERAGE_PYTHON` when testing the portable bundle on Windows. See `docs/coverage-deployment.md` for Docker commands.
