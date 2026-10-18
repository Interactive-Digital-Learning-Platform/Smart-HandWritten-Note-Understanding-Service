# Science v2.5 validation and training results

Completed 2026-10-03 after the user explicitly selected **Validate and train locally**.
Attached handoff instructions were treated as supplied guidance; authorization came
from the user's reply. No deployment or mobile change was made.

## Intake and review provenance

Source: `C:/Users/DLK/Desktop/annotations/outputs/01a0b35a-0472-7970-be36-7b8d55391c86/science-training-release-v2.5.zip`.
SHA-256: `d2187edaef4aee81d70e19fe9c2644d7ed0ad98c43e7c3024bec45680e9b18be`.

The handoff was read completely. The small staged importer delta was reviewed
against the current backend and applied additively. The current trainer and its
contiguous-weight export fix were preserved. Import checked archive paths/CRC,
complete manifest/source hashes, note summaries, exact page joins, paired sample
weights and eligibility, student separation, and the complete validation review
ledger including corrected/raw evidence offsets and whole-note absence checks.

New local snapshots match the supplied immutable snapshots byte for byte:

- Pages: 432 views, SHA-256 `c7a553f1bd3df5dcdf54c0ff67f6c7a137a0bc3a99330de9a6e843294e49041d`.
- Notes: 812 references, SHA-256 `7e56707f06da77e11cc95ae05c3e482a08ba3bea8bb612b9d49399b1a1cd06c2`.

Independent comparison confirmed 160 source texts, all 432 active training views,
776 quarantine views, 561 training references, 132 test references, and student
splits unchanged from v2.4. All 812 text/concept feature inputs remain unchanged.
Validation has 119 direct AI-reviewed references: 95 present, 19 partial, 5 missing.
47 validation labels changed. Training/test whole-note references remain inherited
AI candidates. None of the dataset is independently human-certified.

Nine tampered-ledger cases were rejected after updating their manifest hashes,
testing semantic guards rather than merely failing checksum validation: missing
and duplicate review entries, false human certification, wrong student, wrong
concept, wrong text hash, wrong evidence quote, unchecked raw text, and unchecked
whole-note absence. All 26 page-training tests passed, including regression tests
for export layout, aggregation, and validation-only candidate selection.

## Selection protocol and fitted artifact

Only eight training students fitted the frozen XLM-R / weighted logistic regression
head and scaler. Active training remains 216 page/concept pairs across 91 concepts,
represented as 432 raw/corrected views. Quarantine stayed excluded. The pretrained
encoder was not fine-tuned or downloaded. Maximum length 512, batch size 2, random
state 42, supplied pairing weights, and no additional class weighting were retained.

Predeclared candidate search:

- Classifier C: 0.003, 0.01, 0.03, 0.1, 1.
- Aggregation: per-class maximum page probability, or per-class mean of the two
  highest page probabilities (a single-page note uses its single page).
- Thresholds: 0.35, 0.50, 0.65, 0.80 for present and partial, with present priority.
- Criterion: validation macro-F1, then balanced accuracy. Ties prefer smaller C
  and maximum-page aggregation; threshold ties prefer the larger threshold sum.

All 119 reviewed validation labels were used. Ten C/aggregation candidates each
searched 16 threshold combinations. No current test input was scored until the
selected configuration was fixed. Test was scored once for that selected model;
settings were not changed afterwards and held-out students were not used to refit.
The test benchmark was already exposed in v2 and v2.4 experiments, so this does
not restore an untouched evaluation.

Selected: **C=0.01, maximum-page aggregation, present threshold 0.35, partial 0.80**.

| C | Aggregation | Validation accuracy | Validation macro-F1 |
| ---: | --- | ---: | ---: |
| 0.003 | maximum | 46.22% | 0.2896 |
| 0.003 | top-two mean | 42.02% | 0.2766 |
| 0.01 | maximum | 56.30% | 0.3348 |
| 0.01 | top-two mean | 52.10% | 0.3161 |
| 0.03 | maximum | 56.30% | 0.3233 |
| 0.03 | top-two mean | 52.94% | 0.3113 |
| 0.1 | maximum | 53.78% | 0.3088 |
| 0.1 | top-two mean | 51.26% | 0.3007 |
| 1 | maximum | 54.62% | 0.3161 |
| 1 | top-two mean | 51.26% | 0.3007 |

## Results and interpretation

The training-note majority baseline always predicts present, based only on training
reference labels. The weighted-page baseline is separately retained and predicts
partial; it is not the baseline in this table.

| Evaluation | Accuracy | Macro-F1 | Balanced accuracy |
| --- | ---: | ---: | ---: |
| v2.5 validation, 119 reviewed references | 56.30% | 0.3348 | 34.74% |
| v2.5 validation training-note majority baseline | 79.83% | 0.2960 | 33.33% |
| v2.5 test, 132 inherited references | 43.18% | 0.3475 | 35.23% |
| v2.4 on the same test references | 49.24% | 0.3437 | 34.55% |
| Test training-note majority baseline | 58.33% | 0.2456 | 33.33% |

Test accuracy fell by 6.06 percentage points relative to v2.4. Macro-F1 increased
by only 0.0038; this does not establish a meaningful improvement. Test recall:
present 55.84% (43/77), partial 26.32% (10/38), missing 23.53% (4/17). Missing
recall increased from 1/17, with reduced present and partial recall. The selected
model detects zero of the five missing validation references. Those five provide
limited calibration evidence, and test targets have not received the validation
review repair. Accuracy remains below the training-note majority baseline.

English test accuracy is 55.56% / macro-F1 0.3385 (54 references); Sinhala is
34.62% / 0.2911 (78). Grade and language are confounded with the two test students;
these are descriptive slices. Training PAGE resubstitution accuracy is 90.51% /
macro-F1 0.9002; this is not a held-out page score and is not the same task/units
as the whole-note test results. No reviewed page holdout exists.

Old and new validation scores cannot be compared directly because 47 labels
changed. v2.4/v2.5 test results above use identical references and are descriptive
comparisons on an already exposed synthetic benchmark. They do not establish
real-handwriting generalization or direct improvement over the original v2 split.

## Files, verification, and continuation

Artifact: `ml-training/outputs/science-v2.5-xlmr-pages-2026-10-03/`.
It contains classifier.safetensors, classifier.joblib, metadata.json, evaluation.json,
note-predictions.jsonl, run-details.json, and artifact-verification.json. Candidate
scores and per-split review provenance are included in evaluation.json. The exact
encoder revision and environment versions are recorded in run-details.json.
Fitting/evaluation took 171.86 seconds on the cached RTX 3050 Laptop GPU.

Weight SHA-256: `02d5304a7a7004ae5e71f638e0f4afa166761326968b4dbe7b0983a8f3d318aa`.
Saved-weight probabilities match the fitted classifier with max difference
`2.086162567138672e-07`; all training argmax predictions match. The 251 saved
validation/test predictions match source IDs, students, labels, splits, and metrics.
Metadata remains disabled. No synthetic classifier is connected to Stage 6.

Intake snapshots, audit/protocol checks, negative test archives, complete log, and
reproduction/verification helpers are under ignored `data/annotations/intake/science-v2.5/`.
Source files outside the workspace were only read. All older archives/artifacts
and pre-existing backend/mobile changes were preserved. The standalone v2.1 ZIP
was not opened or processed.

The active supervision still covers only 91/322 concepts, with 83 validation and
70 test concepts lacking page supervision. The unchanged 512-token limit truncates
10/432 training views and 29/1,317 test inputs; no validation input is truncated.

Next data work should expand reviewed training examples, especially partial
explanations, misconceptions and related-concept negatives, while maintaining
student separation. Calibration needs more reliable missing examples. A blind
review of remaining evaluation references or a separately documented new benchmark
would improve interpretation; do not tune against current test failures. Any new
experiment should preserve this result and select settings using validation only.
Synthetic data remains permitted for the university prototype; real notes are a
future generalization check, not a prerequisite imposed on this experiment.
