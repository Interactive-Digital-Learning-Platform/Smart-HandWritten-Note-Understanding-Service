# Science v2.6 batch 01 training results

Completed 2026-10-04, continuing the user's selected local validation/training
workflow. The supplied handoff was read completely and used as guidance, not as
authority for unrelated actions. No deployment or mobile code change was made.

## Verified intake

Source: `C:/Users/DLK/Desktop/annotations/outputs/01a0b35a-0472-7970-be36-7b8d55391c86/science-training-release-v2.6-batch-01.zip`.
SHA-256: `aaf2c6689e5897953caa1fde0eb89bb732823feb335083b909138171f109d6ad`.

Reviewed the staged helper diff and applied only its two version-compatibility
changes to the current importer, preserving every existing guard and trainer/export
change. Import and check-only passed: paths/CRC, release/source hashes, source-page
joins, evidence offsets, summaries, student splits, review provenance, pairing
weights and explicit quarantine exclusion were verified.

New snapshots match the provided immutable snapshots byte for byte:

- Page snapshot SHA-256: `78acf1c1ce033fa1bdfbe0f0805241a1a8127fe6f03326060e99549693929d2d`.
- Note snapshot SHA-256: `6a4032ea73f04392ee29deb818b4e2d1614864db28ecd933526d87b847d75cde`.

Independent comparison against v2.5 confirmed all 160 source text files, all 812
whole-note references, all 119 validation reviews, concept summaries, metadata,
and student mappings unchanged. Previous active and remaining quarantined records
were preserved exactly. Review ledgers agree with active records.

| Supervision | v2.5 | v2.6 batch 01 |
| --- | ---: | ---: |
| Active page/concept pairs | 216 | 416 |
| Active raw/corrected views | 432 | 832 |
| Present / partial / missing pairs | 61 / 52 / 103 | 109 / 126 / 181 |
| Concepts with any active label | 91 | 169 |
| Remaining quarantined pairs | 388 | 230 |

316 formerly quarantined views were promoted after review, with 116 view labels
changed (58 pairs). 84 new views represent 42 previously unpaired source-page
combinations. All original records remain accounted for; new IDs are disjoint.
161 concepts have explanatory present/partial supervision; eight have only negative
examples. The data remain synthetic and AI-reviewed, not human-certified.

All 26 page-training tests pass. Five freshly constructed tampered releases were
rejected after regenerating valid manifests: fabricated evidence, evidence on a
missing label, incorrect pair weight, a held-out split, and a ledger label mismatch.

## Experiment protocol

Same predeclared search as v2.5: C = 0.003, 0.01, 0.03, 0.1, 1; aggregation =
maximum page probability or per-class mean of the two highest page probabilities;
present/partial thresholds = 0.35, 0.50, 0.65, 0.80. Each of ten C/rule candidates
searched sixteen threshold pairs. Selection used validation macro-F1, then balanced
accuracy, then smaller C and simpler maximum aggregation. All 119 directly
AI-reviewed validation references were eligible (95 present, 19 partial, 5 missing).

Only eight training students fitted the scaler and weighted logistic regression.
XLM-R stayed frozen. Paired view weights sum to 1 for present/missing and 2 for
partial; no extra partial class weighting was added. Maximum length 512, batch 2,
random state 42, and the same cached encoder revision were retained. Training,
validation, and test students are distinct within this run. Existing test exposure
from earlier experiments persists.

Selected on validation: **C=0.1, maximum-page aggregation, present threshold 0.35,
partial threshold 0.80**. Test was scored once for that selection. No setting was
changed after inspecting the test, and no validation/test students were used to
refit. The complete ten-candidate table is saved in evaluation.json.

| C | Aggregation | Validation accuracy | Validation macro-F1 |
| ---: | --- | ---: | ---: |
| 0.003 | maximum | 56.30% | 0.3389 |
| 0.003 | top-two mean | 29.41% | 0.3170 |
| 0.01 | maximum | 63.03% | 0.3766 |
| 0.01 | top-two mean | 57.98% | 0.3502 |
| 0.03 | maximum | 69.75% | 0.3556 |
| 0.03 | top-two mean | 65.55% | 0.3633 |
| 0.1 | maximum | 72.27% | 0.3803 |
| 0.1 | top-two mean | 68.07% | 0.3681 |
| 1 | maximum | 68.07% | 0.3770 |
| 1 | top-two mean | 69.75% | 0.3770 |

## Results

The majority baseline predicts present, selected from training NOTE labels only.
All comparison rows below use the same current 132 test references; this is a
descriptive comparison on an already exposed synthetic benchmark.

| Test result | Accuracy | Macro-F1 | Balanced accuracy |
| --- | ---: | ---: | ---: |
| v2.4 | 49.24% | 0.3437 | 34.55% |
| v2.5 | 43.18% | 0.3475 | 35.23% |
| v2.6 batch 01 | 46.21% | 0.2506 | 27.74% |
| Training-note majority baseline | 58.33% | 0.2456 | 33.33% |

Test accuracy increased 3.03 percentage points from v2.5, but macro-F1 declined
0.0969 and balanced accuracy declined 7.49 points. This is **not an overall
improvement**: macro-F1 is barely above the majority baseline, balanced accuracy is
below it, and test recall is present 75.32% (58/77), partial 7.89% (3/38), missing
0% (0/17). More present labels match, while partial and missing detection worsens.

Validation accuracy is 72.27%, macro-F1 0.3803, balanced accuracy 38.60%; zero of
five missing references are detected. The validation majority baseline is 79.83%
accuracy and macro-F1 0.2960. Training PAGE resubstitution is 98.56% accuracy /
0.9853 macro-F1; it is not held-out evaluation and differs from the final whole-note
task. Train/test whole-note references remain inherited AI candidates; validation
references are directly AI-reviewed. Neither is independently human-certified.

English test accuracy is 48.15%, macro-F1 0.2899 (54 references); Sinhala is 44.87%,
0.2260 (78). Grade/language coincide with the two test students, so these do not
isolate language or grade effects. Seen-concept test accuracy is 43.04% across 79
references; unseen-concept accuracy is 50.94% across 53. These slices are descriptive.

## Artifact and verification

Artifact: `ml-training/outputs/science-v2.6-batch-01-xlmr-pages-2026-10-04/`.
It contains classifier.safetensors, classifier.joblib, metadata.json, evaluation.json,
note-predictions.jsonl, run-details.json, and artifact-verification.json. The frozen
encoder revision is `e73636d4f797dec63c3081bb6ed5c7b0bb3f2089`; fitting/evaluation
took 53.22 seconds on the cached RTX 3050 Laptop GPU, with downloads disabled.

Weight SHA-256: `bb2672f6fde79d019a47ab55200eb9d3ab971617dad69da9be1e061415f7bfbb`.
The export matches sklearn probabilities exactly for cached training features in
the measured environment; all argmax predictions match. All 251 saved validation/
test predictions match source IDs, students, splits, labels, and recorded metrics.
Metadata remains `enabledByDefault: false`. No live Stage 6 integration was made.

Snapshots, audit, five negative-test archives, training log, reproduction/verification
helpers, and the aggregation diagnostic are under ignored
`data/annotations/intake/science-v2.6-batch-01/`. Provided files outside the workspace
were only read. All older archives, artifacts, and pre-existing work were preserved.
The standalone v2.1 ZIP was not opened or processed.

## Interpretation and continuation

Expansion adds reviewed supervision on the same 80 notes and eight training
students, rather than adding new independent student styles. Full coverage remains
incomplete: 169/322 concepts have any page supervision, 161 have explanatory
supervision, 59 validation and 53 test concepts lack active page supervision.
460 quarantined views remain excluded. The 512-token window truncates 10/832
training inputs and 29/1,317 test inputs; no validation input is truncated.

A training-only diagnostic found 15 note/concept groups with inherited whole-note
`present` references and multiple reviewed `partial` pages, with no reviewed
`present` page. For example, note-0057's natural/artificial propagation target has
partial pages 2 and 3. This can reflect complementary coverage across pages or
an incorrect inherited whole-note reference. Maximum-page aggregation cannot
explicitly combine complementary explanations. This diagnostic does not prove the
cause of poor test scores, and the pages/references were not relabelled.

The next architecture experiment should check alignment between page supervision
and whole-note decisions using reviewed training/validation examples. Continue
training-pair review, add reliable missing calibration examples, and preserve the
student separation. Select any new approach on validation only; do not tune to the
current test errors. Historical exposure, five missing validation examples and
inherited test labels limit conclusions. Real-note collection remains a future
generalization check, not a prerequisite for the university synthetic experiment.
