# History V3.2: fresh review and image-test preparation

Prepared 2026-10-15. Candidate SHA-256: `51fd4d45c2294e373f4fb435fa5898b22e77842953cb0c823d4d05829ba44ae2`.

## Ready now: 24-example subject review

Open `ml-training/outputs/history-v32-unscored-review-2026-10-15/review.html` in a browser. Enter the reviewer name and review type, read each proposed criterion and note, then select Complete, Partial, Missing or Needs clarification. Explain unclear criteria in the comments. Download `history-v32-reviewed.json` and return it for scoring against the frozen candidate.

The packet covers eight targets from eight lessons: four Grade 10 targets (pre-state leadership, rulers/administration, scientific observation, ancient cities) and four Grade 11 targets (British strategic interests, Colebrooke-Cameron reforms, plantation economy, World War I causes). There are 12 examples per grade. The new prose is synthetic and was screened against exact prior source and diagnostic texts. It is not a naturally sampled classroom corpus; a passed exact-duplicate screen does not establish independence of wording/templates or semantic novelty.

No model scoring, intended labels, fitting or inference occurs in this packet builder. Labels remain empty. Reviewer metadata distinguishes Human, Human with AI assistance and AI. Independent human review is an explicit personal declaration, not inferred from a name. A clarification decision remains unlabelled and is reported separately, rather than forcing an uncertain label. Source requirements remain unchanged in the packet; comments can challenge them.

Preserve V3.2 until scoring this packet. For evaluation, verify packet content and candidate/source hashes, report agreement over all adjudicable records, withheld predictions separately, correct/false Complete counts and complete-answer recall. Report unresolved criteria separately. Do not silently remove model abstentions from the denominator. Any subsequent revision using these examples makes them development material.

## Pending: actual handwritten-image check

No real History images were supplied with this preparation. No handwriting/OCR results are claimed. `image-test-manifest.json` in the same directory has six unfilled fixture slots. It is a collection/checklist template, not a populated dataset or a completed experiment.

For each real image test:

1. Choose a real English History note, the relevant proposed concept and the pages that are actually in scope. Record whether the text is genuinely handwritten or copied from a prepared synthetic script. A handwritten copy of a scripted example is still a scripted fixture.
2. Have the reviewer transcribe the visible active text and assess its coverage against the criterion before model output is shown. Keep crossed-out text excluded and preserve genuine conceptual errors. Record uncertainty separately.
3. Run the service OCR on the authorized image and preserve both raw output and cleaned active text. Compare them with the reference transcription. Check names, years, negation, page order and deletions that affect the target.
4. Run the frozen History candidate separately on the reference transcription and on the OCR text, with the same concept scope. This isolates classifier errors from OCR-induced errors. Save model/source hashes, exact text, prediction, review concerns and evidence quote offsets.
5. For multi-page notes, evaluate the complete submitted scope separately. The training task is page-level coverage; two partially covered pages can jointly complete a concept. Do not label a student as lacking knowledge merely because a page omits it.
6. Record success/failure and source of disagreement. Synthetic text review, scripted handwriting OCR, naturally occurring handwritten notes and normal app integration are distinct checks.

History inference is not enabled in the normal app flow yet. The currently running coverage bridge uses the Science artifact. A History note processed through that bridge cannot be counted as an end-to-end History model test. The OCR-plus-offline-History check above is preparatory; app integration additionally needs verified curriculum-ID mappings, versioned artifact routing, evidence offset conversion and appropriate mobile wording, followed by real API/UI verification.

When images and labels are available, fill the manifest and run the test. No production configuration or active model was changed by this preparation.
