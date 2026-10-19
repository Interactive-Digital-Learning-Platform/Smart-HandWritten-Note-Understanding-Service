# Manual History coverage in the application

The History V6.2 candidate is connected to the main note service and the mobile
note screen as an explicitly requested text check. It is not an automatic
pipeline stage. Existing Science coverage checks are unchanged.

See [the current model report](history-paraphrases-v62.md) for the short-paraphrase
update and remaining limitations. Previously saved checks require a rerun when
their model hash is stale.

On an analyzed History note, `HistoryCoverageCard` starts with that note's OCR
text. The student chooses Grade 10/11 and one proposed concept, reviews/edits the
text, confirms that it is English and the selected concept is expected, then
requests a suggestion. The card displays Complete, Partial, Missing, or a
withheld suggestion with semantic candidate passages and evidence concerns.
Changing the text, grade, concept, or source snapshot clears the prior result
and confirmation; abandoned requests cannot populate a newer snapshot.

The transient `/suggestions` endpoint processes submitted text. Normal note
screens also use owned-note saved-check routes: reviewed text and coverage
results are saved separately from the original OCR and analysis. Neither flow
awards a grade, updates learning profiles or creates training annotations.
Crossed-out text in valid deletion markers is excluded; malformed markers stop
the check. Real handwritten History uploads have not been evaluated. Concept IDs
are selected explicitly because no reviewed mapping to live curriculum IDs has
been established.

## Main service contract

Enable the optional route with `HISTORY_COVERAGE_REVIEW_ENABLED=true`. It defaults
to disabled when absent, and the example deployment configuration sets it false.
It is enabled in this machine's local `.env` for the integration demo.

- `GET /api/history-coverage/concepts`: 94 proposed concepts with grade and points.
- `POST /api/history-coverage/suggestions`: `{text, conceptId, language:"English", scopeConfirmed:true}`.
- `GET /api/history-coverage/notes/:noteId/check`: restore a saved check.
- `POST /api/history-coverage/notes/:noteId/check`: start a bounded saved check.

Responses use the normal `{success,data}` envelope. Review responses explicitly
declare experimental/manual mode, review required, analyzed text, text hash,
model hash and Unicode code-point offset units. Mobile Zod validation rejects
misaligned quotes, unsupported automatic-assessment contracts, calibrated-score
claims and inconsistent withheld labels. The API limits text to 20,000 code
points, runs one check at a time, rate-limits calls, and returns a bounded generic
failure when the model is unavailable. It reuses the persistent CPU worker and
frozen artifact. The [V6 update](history-v6-grounded-release.md) replaces the
classification head and adds passage-support features using the same frozen
encoder and rubrics. Saved results from older model hashes can be rechecked.

These routes use the existing Notes Clerk verification; saved-note routes also
require note ownership. This authenticates the student but does not make a
model suggestion teacher-confirmed. The feature flag does not promote this
candidate to autonomous grading.

The local artifact, encoder files, pinned Python environment and frozen protocol
sources must be packaged before deployment to another machine. This work
verifies a local integration, not a production deployment or Android build.

## Working local mobile demo

Open `http://127.0.0.1:8082/notes/history-model-demo`. It offers synthetic Complete,
Partial, Missing and OCR-error examples and calls the actual main service.
The Notes home screen also links to this route. The same card is mounted in the
normal note-detail screen when the selected or analyzed subject is History.

Current status after self-review on 2026-10-15: the existing Docker `api_gateway`
is running on port 8080. The temporary gateway is stopped. Expo has been restarted
using its saved LAN gateway configuration (`http://192.168.1.20:8080`) and normal
watch mode, without the process-only localhost override. Both local and LAN
gateway concept requests returned 200 from Nginx; the normal note-service health
route also returned 200. This does not establish native phone testing.

To reproduce the normal demo, start the main backend with the History flag,
start the existing Docker gateway, and run Expo web on port 8082 with its normal
gateway configuration. The earlier restricted fallback is retained in
`Deployment-Infrastructure/dev-notes-gateway.cjs` for local testing when Docker
is unavailable: it binds only 127.0.0.1, permits only History review routes, and
rejects private-note routes and foreign origins. Do not run it alongside Docker
on 8080. Its earlier localhost-only Expo override was temporary and did not edit
the saved LAN configuration.

## Verification

- Main service build and mobile `tsc --noEmit`: passed.
- History API route test: passed (scope/language/size/deletions/disabled mode,
  request isolation, generic failure and recovery).
- Initial integration: four History and four existing Science mobile schema tests
  passed. Self-review expanded History coverage to seven tests; all still pass.
- All 12 synthetic notes sent through the main service, then through the gateway:
  full predictions match the prior standalone baseline, including scores,
  quotes, offsets and review flags. No model fitting or OCR provider calls.
- Mobile web UI exercised Complete, Partial, Missing, and a withheld year error.
  Editing the note cleared the displayed suggestion and reset confirmation.
- Browser testing found the checkbox's web state was missing from accessibility
  output; an explicit `aria-checked` alias was added for React Native Web. The
  final browser run confirmed `aria-checked=true`, an accessibility checked value
  of 1, and a live Complete response. Screenshot:
  `tmp/history-mobile-integration/mobile-result.jpg`.

The restricted fallback gateway smoke checks returned 404 for the private-note
endpoint and 403 for a foreign origin. Automatic approval review rejected its
initial wider-interface launch, so only the loopback version was used. It has
now been stopped in favor of the user's existing Docker gateway.

Raw synthetic integration results are saved under
`tmp/history-mobile-integration/direct-api-check.json` and
`tmp/history-mobile-integration/gateway-api-check.json`. Four real API responses
are mirrored as mobile test fixtures; the demo itself performs live inference
and does not display those saved predictions. Reproduce API comparisons with
`npx ts-node src/scripts/verify-history-mobile-api.ts` (or `--direct`).

The result remains 9/9 AI-expected typed matches and 2/3 noisy-text matches plus
one withheld suggestion. This is repeated synthetic regression evidence, not a
new independent accuracy estimate or validation of handwriting recognition.

## Docker restoration and self-review

The final Docker regression report is
`tmp/history-mobile-integration/gateway-api-check-docker.json`; all 12 full
predictions match the original baseline. The verification checks the Nginx
server header and absence of the temporary gateway header. Reproduce with
`npx ts-node src/scripts/verify-history-mobile-api.ts --docker`.

The review strengthened the mobile contract to bind a response to the submitted
active text and selected concept, verify success envelopes, align concern quotes
as well as point quotes, and validate model hashes and requirement identities.
The demo now restores its original text, concept and unchecked confirmation even
when the currently active example is selected again after edits. New regression
tests cover the response-contract cases; browser checks cover demo reset.

An initially suspected Nginx timeout problem was ruled out by reviewing the
entire configuration: the notes location already inherits 300-second read/send
timeouts. The unnecessary trial override was removed; Nginx configuration is
unchanged from before this review and passed `nginx -t` after reload.

Final self-review: 19 automated tests plus both TypeScript builds passed. The
reviewed mobile client displayed all four outcomes through Docker, concept
search/selection worked for Grade 10, and reselecting an active demo reset the
original text and scope confirmation. See `history-self-review.md` for fixes,
verification details and remaining limits. Docker UI screenshot:
`tmp/history-mobile-integration/mobile-docker-review.jpg`.
