# History V5.1 local preview

Start from the service directory with `npm run preview:history`, then open
http://127.0.0.1:8884/. This separate preview binds only to loopback and does not
connect to MongoDB, update profiles, or enable automatic History suggestions in
the main application. The current Science integration is unchanged.

Choose a Grade 10 or 11 concept, review its proposed criteria, and paste English
note text. Alternatively, select a PNG/JPEG page (8 MB maximum, 25 million input
pixels maximum) and click **Extract text with Groq OCR**. This explicitly sends
the selected image to the configured Groq provider using the existing OCR
service. Verify/correct the resulting text, confirm the concept applies, then
check coverage. Crossed-out text inside valid deletion markers is excluded;
malformed markers stop extraction. The preview supports one image at a time.

The UI shows Complete, Partial, Missing, or a withheld suggestion, plus candidate
passages and evidence concerns. All results require review. The criteria come
from the supplied synthetic History dataset and are not an independently
certified curriculum. Semantic similarity does not establish logical entailment
or historical correctness. One known false-Complete validation case remains in
the V5.1 evaluation. Real handwriting accuracy has not been established.

Inference uses the frozen local MiniLM encoder and the trained V5 head with the
V5.1 evidence review policy. Model SHA256:
`12ba94e87415adb0ceb851919a6e87bc5d36e8535f0539352b450bd104e368e8`.
The Python entry point verifies the frozen artifact and protocol source hashes,
reads the existing embedding cache without writing it, and validates exact
evidence offsets in Unicode code points. A persistent CPU worker loads the model
once and serializes requests, with a 90-second timeout (including first load)
and a 1 MB response limit. It restarts after a timeout, crash, or malformed
transport response. Frozen model/source integrity is checked on worker startup;
restart the preview after changing local candidate files. Submitted note vectors
are removed from the encoder cache after each request. The frozen public cache
and loaded model remain in memory. The first request still pays model load time;
later requests reuse the loaded encoder. OCR provider latency is separate.

No note text is persisted by the preview. Temporary re-encoded images are
removed after OCR. Clicking Download explicitly saves a JSON file containing
the note text and result to the user's browser download location. The existing
OCR provider's handling of submitted images is outside local temporary-file
cleanup. The generated image smoke-check script saves its synthetic fixture and
report under `tmp/history-preview/` for reproducibility.

Validation on 2026-10-15:

- `npm run build` passed.
- `npm run test:history-preview` passed: registered scope, input bounds,
  cross-origin rejection, serialization, image decoding, deletion handling,
  temporary-file cleanup, and subsequent request recovery.
- `ml-training/.venv/Scripts/python.exe -m pytest ml-training/tests/test_history_preview.py ml-training/tests/test_history_semantic_review.py -q`
  passed (9 tests); the restricted environment could not write pytest's cache.
- Browser testing exercised synthetic full, one-point, and unrelated examples
  through the real model, showing Complete, Partial, and Missing respectively.
- `npx ts-node src/scripts/verify-history-preview-image.ts` passed with a
  generated printed PNG: OCR retained Indian Ocean/Trincomalee content, and the
  local candidate suggested Complete with review required. This is a plumbing
  check, not handwriting or independent accuracy evidence.

Persistent-worker follow-up: preview/worker tests passed (7), and Python runtime
and evidence-policy tests passed (10). These cover process reuse, Unicode stream
framing, request rejection without a crash, concurrency rejection, disposal,
crash/timeout/malformed/oversized-output recovery, and removal of submitted note
vectors. `npx ts-node src/scripts/verify-history-demo-pack.ts --persistent`
compares the entire prediction response with the saved pre-worker baseline for
all 12 demo inputs, including scores and quotes, and records timings separately
under `tmp/history-preview/demo-api-results-persistent.json`. These repeated demo
comparisons measure regression and latency, not new accuracy evidence.

When real handwritten notes are unavailable, open **No handwritten notes? Use
the synthetic demo pack** in the preview. It contains 9 typed notes across three
concepts (Complete/Partial/Missing), plus 3 paired versions with explicitly
simulated OCR character errors. The pack and full model comparison are
downloadable in that panel. `ml-training/build_history_demo_pack.py` reproduces
both files without fitting or changing any model weights or shared caches.

All 9 typed notes matched the AI-expected coverage labels; 2 of 3 noisy versions
matched and 1 was withheld for review. Abstentions remain nonmatches in the
comparison. These are development/demo checks with AI-authored expectations,
not a human-labelled test set or an independent accuracy estimate. Correcting
the simulated `18l5` back to `1815` restores the clean input; students should not
be asked to invent facts to satisfy a prediction.

For a later handwriting smoke test, someone can copy a demo note by hand and
photograph it. This tests transcription plumbing on a constructed sample, not
natural student handwriting accuracy. The next stronger evaluation is real
English History note images with a teacher's concept checklist and coverage
labels. Keep those separate from training while measuring OCR and coverage
errors independently before main-app promotion.
