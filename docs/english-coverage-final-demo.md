# English concept coverage: demo and acceptance report

Date: 2026-10-08. Status: working review-required prototype; acceptance checks found remaining limitations.

## What the service does

An uploaded English note image goes through OCR, deterministic cleaning, lesson identification, and the trained V3 classifier. Its complete/partial/missing suggestions and supporting passages are saved on the note and displayed in the mobile app's **Trained model suggestions** card. “Missing” means not found in this submitted text, not that a student does not understand it.

The trained component is supervised multinomial logistic regression using 18 rubric and word/character TF-IDF features. OCR and other service stages use external models; they are separate from this trained classifier. Training used 71 examples (41 original corrected/reviewed examples plus 30 AI-authored contrasts). The frozen model supports 10 concept rubrics; eight currently have verified live curriculum mappings.

## Today's image-upload checks

Three new printed English PNGs, explicitly labelled SYNTHETIC DEMO, were submitted to the same multipart `POST /api/notes/upload-and-process` endpoint used by the app. All three pages were extracted successfully. These are functional examples, not independent handwriting accuracy measurements. They were not used to retrain the model.

| Input | Expected Benedict coverage | Actual model result | Outcome |
|---|---|---|---|
| Reagent, heating, and positive colour/precipitate result | Complete | Partial after retry | Failed: result evidence not matched |
| Reagent only | Partial | Partial | Passed |
| Protein notes with no Benedict procedure | Missing | Missing | Passed |

The complete example initially produced an unavailable model check after the 20-second model timeout. Retrying normal analysis with the saved image OCR returned Partial. The correctly extracted result text was: “A positive result changes blue to green, yellow, / orange or a brick-red precipitate.” The model marked the result requirement unsupported. This is a false negative on an AI-authored, AI-reviewed example; the precise feature-level cause has not been isolated. Do not replace this case with a specially worded example and claim all checks passed.

Evidence quote offsets matched the stored OCR text for all final predictions. The original three-page uploaded note had already produced a verified Complete suggestion for Benedict; its separate OCR verification is documented in `english-coverage-ocr-fix.md`.

## Demo links

Run the note backend on 8004, the existing Docker Nginx gateway on 8080, and Expo web on 8082. The local mobile gateway address on this machine is currently `http://192.168.1.20:8080`.

- Existing uploaded complete example: http://127.0.0.1:8082/notes/6ac5f2c4ea7b94f750d7db9e
- New synthetic partial example: http://127.0.0.1:8082/notes/6ac7904101a089d5d26cc7f5
- New synthetic missing example: http://127.0.0.1:8082/notes/6ac7907201a089d5d26cc7f6
- Retained complete-answer failure: http://127.0.0.1:8082/notes/6ac7901e01a089d5d26cc7f3

Open the trained-model card and select **Check evidence**. Explain the required reagent, heating and result points. Keep the “Review required” notice visible. The synthetic notes use a separate demo identity and may not appear in the signed-in user's Notes list; direct links are provided. No existing student note was overwritten by this test.

The complete (existing upload), partial and missing cards were verified in the mobile web UI, through the restored gateway. The partial card's expanded evidence correctly showed the reagent passage and missing heating/result passages. Screenshots are saved for all three labels. The older lesson checker lower on the partial screen simultaneously called Benedict “adequately covered” and “Learning outcome verified.” These statements come from a separate legacy checker and conflict with the trained-model card. This is a remaining presentation/integration issue, not evidence that the classifier returned Complete.

## Evaluation claims and limits

The owner-reviewed fresh 30-example synthetic-text round scored 28/30 (93.33%) overall and macro F1 0.932660. Complete precision was only 10/12 (83.33%), below the declared 90% gate. Two incorrect relations were confidently labelled complete. This supports a review-required prototype, not autonomous grading or a claim of 93.33% accuracy on real handwritten uploads. Earlier development examples and AI-reviewed overlapping annotations are not independent test sets.

Today's two expected-label matches out of three are a tiny functional check, not a new accuracy estimate. Printed pages do not establish handwriting robustness. The model remains frozen at SHA-256 `d40a0ddae2d4b356dea986308a600bcd4817424f601877265e2ac21c8b3ccfac`.

## Artifacts and next priorities

The workspace `tmp/coverage-image-demo/` directory contains the three PNG inputs, full `results.json` including the failed first attempt and retry, and the partial-screen screenshot. Scripts `tmp/coverage-image-demo.cjs` and `tmp/retry-coverage-demo.cjs` reproduce the test approach; rerunning the first creates new synthetic notes and incurs OCR calls.

Before calling the demo final: reconcile the legacy checker wording with model suggestions, investigate the missed result relation using separate development examples, and investigate cold-start timeout reliability. Any change to the frozen model or feature code needs a versioned artifact and fresh held-out evaluation; retain this discovered failure as a regression case rather than treating it as an unseen test afterward.

## Follow-up repairs — 2026-10-09

The legacy strengths section now says **Topics Detected by the Lesson Checker**, **Topic detected**, and **Understanding not verified**. It explicitly explains that mentioning a topic does not establish complete/correct coverage and directs readers to the trained-model evidence. Removed the unsupported “Learning outcome verified” and “Concept adequately covered” badges.

The Python inference deadline is now bounded at 60 seconds instead of 20 seconds; the concurrency and output-size limits remain in place. Its timeout message no longer incorrectly blames the length of a short note. This mitigates cold-start delays; it is not proof that timeouts cannot recur.

The complete-answer false negative was traced to the frozen result rubric's contextPatterns: Benedict, reducing sugar or glucose must occur in the selected local evidence span. The valid result statement falls outside a span containing those terms. A characterization test preserves the original failure and confirms that an explicitly contextualized result is classified Complete. This test is development evidence, not a fresh accuracy test. No student text was rewritten and no output was forced to Complete. The classifier limitation remains unresolved pending a versioned context-feature change and broader evaluation against unrelated neighbouring test results.

Backend compilation and mobile TypeScript checks passed. Real-model bridge tests cover the known failure, explicit-context comparison, Unicode offsets and authenticated review workflow. Original evaluation figures and artifact hashes remain unchanged.

## V3.1 context correction — 2026-10-09

The context limitation above is now corrected for bounded Benedict procedures by a separately versioned V3.1 inference artifact. Original V3 files remain intact. Learned weights are unchanged; the inference features now allow a result statement to use an earlier explicit reagent action within 450 characters and four line breaks. This extra context applies only to the Benedict result point. Blank lines, page boundaries, colon headings, competing food tests and negative statements stop the added context. All evidence quotes remain exact slices of the submitted text.

Validation: 24 Python checks passed, including section/page boundaries, unrelated tests, negation, exact offsets and partial/missing examples. All 7 real-model bridge/HTTP tests passed. Comparison with 71 training examples and the previous 30-example review found no label changes. This is regression evidence, not independent V3.1 evaluation; it does not transfer the original held-out claim to the new version or resolve V3's known false-complete errors.

The previously failing note `6ac7901e01a089d5d26cc7f3` was reprocessed through the normal API using its saved image OCR. It now returns `present` (Suggested complete), model version `english-coverage-v3.1-context-2026-10-09`, with valid evidence offsets. The original failed result is retained in `tmp/coverage-image-demo/results.json`; the new verification is `tmp/coverage-image-demo/v31-live.json`. V3.1 does not silently update older saved predictions: their recorded versions remain accurate until reanalysis. The mobile card distinguishes v3.1 from v3.
