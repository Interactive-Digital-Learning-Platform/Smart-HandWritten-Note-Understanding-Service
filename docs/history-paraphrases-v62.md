# History V6.2: short source explanations

19 October 2026. Notes-service-only update of the existing History model.

The two exposed V6.1 failures now return raw and displayed **Partial**:

- “Travellers from abroad wrote about Sri Lanka's history and society. These accounts can help us understand the island's past.”
- “A historian should analyse information from several accounts before selecting the most credible evidence about a past event.”

The model's three existing RBF SVM heads were refitted. The encoder, 94 concept
rubrics, 37 features, scaler, point model and review policy are unchanged. There
is no string-based result override, extra classifier or external AI request.
The update retains 25% of V6.1's head weights and 75% of the replayed refit.

## Training and evaluation

Training replayed the original 2,185 rows and V6.1's 17 additions, adding 29
assistant-authored short explanations and contrasting reminders, denials and
unrelated passages. The two old failures are explicitly included as fitted,
exposed examples. No new human or teacher labels were obtained.

The first candidate misclassified a new denial. The second includes additional
denial contrasts; its selection used the exposed development checks. The twelve
additional typed probes are excluded from fitting, but are now exposed to model
selection and are not an independent student-accuracy holdout.

| Check | V6.1 | V6.2 |
|---|---:|---:|
| Human-reviewed development | 23/24 | 23/24 |
| Older synthetic test | 333/340 | 333/340 |
| Older synthetic validation | 334/338 | 334/338 |
| Previous typed checks | 18/18 | 18/18 |
| Presentation fixtures | 12/12 | 12/12 |
| Assistant-reviewed development | 50/50 | 50/50 |
| Related-text challenges | 15/18 | 15/18 |
| Exposed V6.1 short/negative probes | 6/8 | 8/8 |
| Earlier image-reference checks | 6/6 | 6/6 |

No previously correct result was lost in the six older regression sets. All
twelve additional paraphrase/negative probes match their assistant references.
No incorrect Complete suggestion appeared in these checks. The image checks
include fitted examples and overlapping notebooks; they are not six independent
student samples.

This remains an experimental coverage aid. Three of the 29 authored training
contrasts still mismatch (two other very terse foreign-account descriptions
and one denial); the three older related-text challenges still withhold results.
Passing the targeted checks does not establish real-student accuracy or support
every possible paraphrase. The 98-page OCR batch remains incomplete after the
earlier provider rate limit.

## Runtime

Model SHA-256:
`7e24afeafe9505f6ac82444d16a8c85aefe484a0fa6d673dc3207366bd7ed3a7`.
The stable bundle filename remains `history-coverage-v6.json`. Catalog and
model metadata identify V6.2. Science V3.5 and ICT V3.1 artifacts are unchanged.

The same owned-note History check uses this model. Rerun a saved check after
reviewing its text and concept; checks from the older hash are marked stale.
Original OCR, note records and lesson scores are not rewritten. Automatic
History grading remains disabled.

Image: `smart-notes-coverage:science-v35-history-v62-ict-v31-materials-v31-ocr-v2`.
Rollback image: `smart-notes-coverage:science-v35-history-v61-ict-v31-materials-v31-ocr-v2`.
Use the V6.1 deployment manifest for its immutable image ID. No external hosting,
commit or push was performed.

Reproduction: `fix_history_paraphrases_v62.py`,
`check_history_paraphrases_v62.py`, `activate_history_paraphrases_v62.py` and
`verify_history_paraphrases_container.cjs` under `ml-training/`. Training,
evaluation, protocol, inference source snapshots, activation backup and Linux
service results are retained under the Git-ignored
`ml-training/outputs/history-coverage-v6.2-paraphrases-2026-10-19/` directory.

Validation: TypeScript build; 34 focused Python model/provenance/bundle tests;
15 Notes History API/worker tests; 15 offline Linux prediction fixtures; and
26 targeted checks through the container's HistoryCoverageReviewService.
These tests perform no note-record writes or provider requests.
