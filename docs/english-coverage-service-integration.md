# Reviewer-assisted English coverage integration

The user's subsequent choice was to run the model on uploaded notes and display
it in the mobile app. [That automatic suggestion integration is now implemented](english-coverage-mobile-integration.md).
The document below describes the separate expert-review workflow.

Update 2026-10-07: MongoDB persistence is verified. The page now loads assigned,
consented English notes and reopens saved reviews. A durable synthetic demo is
running at http://127.0.0.1:8881/english-coverage/?preview=1 . The model remains
frozen and automatic assessment remains disabled.

The service now exposes the frozen V3 model through an authenticated reviewer
workspace at `/english-coverage/` and `/api/english-coverage`. A reviewer pastes
English OCR text, checks it against the original note, selects one of the ten
supported concepts, confirms scope, inspects the suggestion and evidence, and
explicitly saves a complete/partial/missing judgment. No choice is preselected.

The original text, text SHA-256, model SHA-256 and prediction are retained with
the reviewer identity. For assigned notes, the source task, pseudonymous note
group, and original OCR hash are also retained. The human label is stored separately in the
`EnglishCoverageReview` MongoDB collection. Only the creating reviewer may read
or confirm that record, and confirmation is atomic and one-time. A correction
or a judgment on a withheld suggestion requires a comment. Editing the text or
concept in the browser invalidates the displayed result and requires inference
again. Confirmations do not overwrite Note.analysis, scores, learning gaps, or
training labels, and are not silently added to a training dataset.

## Local preview and durable demo

```powershell
npm run preview:coverage

# Durable synthetic demo with a separate MongoDB collection:
npm run preview:coverage -- --port 8881 --mongo
```

Open http://127.0.0.1:8880/english-coverage/?preview=1 . This runs the same router
and real frozen model with an in-memory store, on loopback only. It uses a local
preview reviewer identity and needs no production credential or database.
Use synthetic example text. In default memory mode, records disappear when the
process stops. `--mongo` uses `english_coverage_demo_reviews`, separate from real
review records. Its synthetic assigned note can be loaded without copying text.
The page reports which storage mode is active. The
`preview=1` query only changes the UI; it does not bypass production API auth.
The demo always binds to loopback and never exposes real assigned student notes.
The new history dropdown restores pending or confirmed snapshots, including
after a page reload. Real MongoDB reconnect tests also verified persistence
after server-side connections close.

## Enable in a configured service

The feature is disabled by default. No local `.env` or deployed configuration
was changed during implementation. In a configured service set:

```dotenv
ENGLISH_COVERAGE_REVIEW_ENABLED=true
ANNOTATION_REVIEW_ENABLED=true
```

Use the existing expert-review identity/key configuration and its startup
validation requirements. The page accepts Expert ID and access key and sends
them via `X-Expert-Id` and `Authorization: Bearer ...`. It does not persist the
key in local storage. MongoDB must be available for durable review records.
The integration accepts pasted text or loads a note through the existing expert
assignment. It never authorizes access from a client-supplied user ID.

## Uploaded-note workflow

1. A note goes through the existing upload/OCR/analysis pipeline. If its research
   review consent is granted and eligible curriculum findings exist, the existing
   annotation collection service queues it for expert review.
2. An authenticated expert claims the English task in `/expert-annotation/`.
   The task view links to **Open English coverage review**. Credentials are not
   copied into the link; connect in the coverage workspace using the same expert
   identity and key.
3. The coverage page lists only assigned, non-quarantined English tasks with at
   least one of the model's supported concepts. It checks current Note consent,
   analyzed status, lesson identity and concept scope before returning OCR text.
4. Load the note, inspect/correct OCR against the original pages, confirm scope,
   request a model suggestion and save the reviewed label. OCR corrections stay
   in this snapshot rather than editing the source note.
5. Saved-review history allows the creating reviewer to reopen pending or
   confirmed snapshots. Source consent/assignment is checked on retrieval and
   confirmation. Changed OCR rejects a stale request or confirmation with 409.

Consent withdrawal removes linked coverage reviews through the existing
withdrawal hook. A withdrawal racing with creation removes the newly created
pending snapshot. Withdrawn or reassigned notes are unavailable through both
the source list and linked-review reads. The latest 50 reviews are listed per
reviewer, without returning all stored text in the history summary.

`ENGLISH_COVERAGE_PYTHON` may point to the Python executable. The default is
`ml-training/.venv/Scripts/python.exe` on Windows and
`ml-training/.venv/bin/python` elsewhere. Use Python 3.11 and install the pinned
packages in `ml-training/requirements-coverage.txt` into that environment.
The current workspace already has the required runtime. Deploy these assets
with the built TypeScript service:

- `models/english-coverage-v3.json` (portable weights/rubrics, about 1 MB).
- `ml-training/english_coverage_v3_cli.py`.
- `ml-training/src/smart_note_training/__init__.py`, `english_coverage.py`,
  and `english_coverage_v3.py`.
- `public/english-coverage/`.

The bridge checks model and inference file hashes, invokes Python without a
shell, passes note text through stdin, limits input to 20,000 characters, permits
at most two concurrent inference jobs, caps output, and times out after 20
seconds. It returns an explicit error if the model/runtime is unavailable; it
does not replace a failed prediction with a heuristic. Interpreter output and
note text are not exposed in errors. Git attributes preserve hashed file bytes.

## API

All routes require the enabled feature and the existing expert authentication.

| Method / path under `/api/english-coverage` | Purpose |
| --- | --- |
| `GET /concepts` | Supported concepts, checklist points and model identity |
| `GET /notes` | Eligible assigned-note summaries, without OCR text |
| `GET /notes/:taskId` | Load current redacted OCR text after access/consent checks |
| `GET /reviews` | Creating reviewer's recent snapshot summaries |
| `POST /reviews` | Infer and save a pending snapshot |
| `GET /reviews/:id` | Read the creating reviewer's snapshot |
| `POST /reviews/:id/confirm` | Save an explicit human judgment once |

Create body:

```json
{"noteText":"English OCR text...","conceptId":"sci-g10-col-001","language":"English","scopeConfirmed":true}
```

For a loaded assigned note, include `sourceTaskId` and `sourceTextSha256` from
`GET /notes/:taskId`. The server verifies both, limits the concept to the note's
eligible scope, rechecks access after inference and after storage, and retains
the reference separately from the submitted/corrected text hash.

Confirmation body:

```json
{"humanLabel":"partial","comment":"Sexual reproduction is not explained.","confirmed":true}
```

`present` is displayed as **Complete**. The raw model response still has
`status: null`, `reviewRequired: true`, uncalibrated scores and a potentially
withheld `suggestedStatus`. Only the separately stored `humanLabel` is confirmed.
The UI deliberately does not present scores as correctness probabilities.

## Verification and limits

`npm run build` passes. `npm run test:coverage` passes five tests covering input
and artifact checks, a real Python inference through HTTP, authentication,
reviewer isolation, explicit confirmation, correction reasons, immutable
snapshots, duplicate saves, an atomic-store race, the disabled feature, history
isolation, assigned-note access, stale OCR, out-of-scope concepts, revoked access,
and withdrawal during a save.
The existing `npm test` suite also passes all 47 tests.
The initial browser verification exercised synthetic text entry, concept/scope selection,
real inference, evidence rendering, explicit confirmation and the locked saved
state. The initial in-memory confirmation is labelled as a UI smoke test, not a
human evaluation example. On 2026-10-07 browser automation timed out; the updated
flow was verified through the actual HTTP API and database rather than claiming
a new visual browser check.
HTTP tests initially hit a sandbox loopback restriction; rerunning with local
network access succeeded. `node --check public/english-coverage/app.js` passes.
`npm run verify:coverage-storage` passed against the configured MongoDB using
uniquely named synthetic fixture collections. It verified reviewer isolation,
listing, pending/confirmed persistence across reconnects, competing confirmations,
original prediction retention, assigned-note loading, consent withdrawal,
changed OCR and quarantine rejection. Fixture collections were removed after
verification; existing records were not touched. Mongo uses a conditional
`findOneAndUpdate` on pending state for atomic confirmation.

The durable demo's direct HTTP check also passed: synthetic assigned note loaded,
real model invoked, pending review stored, explicit fixture judgment confirmed,
history listed and the snapshot reopened. The retained demo record is
`b22bbb53-7dea-4713-bfd6-94172f3e014c`, explicitly labelled in its text and comment
as an automated synthetic integration fixture rather than independent human
evaluation or training data.

Verification reports are saved in the workspace `tmp/` directory:
`english-coverage-mongo-verification.json` and
`english-coverage-durable-demo-verification-2026-10-07.json`.

The model scored 28/30 on Round 3 synthetic text, with two false-complete
suggestions and complete precision of 83.33%. Its gate still failed. This
integration is a review-required prototype, not validated automatic grading or
measured real handwriting/OCR accuracy. See
[the frozen evaluation](english-coverage-v3-human-review-01.md).
