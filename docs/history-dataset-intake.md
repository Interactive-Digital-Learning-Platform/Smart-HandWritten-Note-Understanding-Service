# History dataset intake — 2026-10-14

The supplied `history_grades_10_11_full_dataset.zip` was inspected and its declarative data staged under `ml-training/outputs/history-dataset-intake-2026-10-14/`. Bundled Python authoring and validation scripts were not executed. Archive SHA-256: `cb0d9aa8017ae108b4b308f829ad5186f62029998883cb61de89b4439b679227`.

## Verified corpus

| Item | Count |
|---|---:|
| Grade 10/11 lessons | 18 |
| Proposed History concepts | 94 |
| Fictional students | 18 |
| Notes / pages | 140 / 280 |
| Unique page-concept labels | 1,401 |
| Raw/corrected paired rows | 2,802 |
| Whole-note reference labels | 716 |
| Present / partial / missing page labels | 357 / 351 / 693 |
| Train / validation / test page targets | 721 / 340 / 340 |
| Train / validation / test students | 12 / 3 / 3 |

The intake audit passed manifest file hashes, page text/file hashes, evidence offsets, pairing/label consistency, registry student assignment, group/family split isolation, training eligibility and page-review-ledger identity checks. It found no exact corrected-page duplicates across splits and no cross-split corrected-page pair above a five-word Jaccard threshold of 0.70. This limited lexical screen does not rule out paraphrase/template leakage.

The original records are preserved in `source/`. `corrected-page-examples.jsonl` contains one corrected row per page-concept target; it retains original split, provenance and sampleWeight rather than silently claiming raw/corrected views are independent examples or overriding training admission. It is staged source data, not a direct replacement for the live model's training input.

## Compatibility and interpretation

The dataset is English synthetic typed text with simulated OCR and AI self-reviewed labels. Its source references and historical facts have not been independently verified during intake; the source textbooks are not included in the ZIP. The included registry is explicitly a curriculum proposal. It covers selected concepts across all 18 lessons, not all textbook content.

The current app classifier has Science rubrics only. It cannot recognize these 94 History targets merely by loading this ZIP. A History experiment needs concept criteria converted into explicit model rubrics, training-format conversion and verified live curriculum ID mappings. Page labels and whole-note references describe different units: neither should be substituted for the other, especially where two partial pages jointly cover a complete concept.

For the next experiment, retain the predefined student splits, fit vocabulary/scaling/weights only on admitted training records, choose settings on validation, and reserve test for the final synthetic check. Raw/corrected paired views must stay in the same split and their weights handled consistently. A separate History teacher review and real uploaded-note check are needed to assess practical accuracy. Do not import the AI labels as human expert reviews or replace V3.1 before evaluating a History candidate.

Audit implementation: `ml-training/audit_history_archive.py`. Machine-readable result: `ml-training/outputs/history-dataset-intake-2026-10-14/audit.json`. No model training or live model replacement was performed during intake.
