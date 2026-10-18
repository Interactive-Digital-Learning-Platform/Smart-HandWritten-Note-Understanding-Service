# Science v2.4 batch 01 training results

Completed on 2026-10-03. The user explicitly authorized local model training.
No classifier deployment, live Stage 6 integration, or mobile edits were made.

## Dataset and experiment

Source: `../DATASETS/science-training-release-v2.4-batch-01.zip`.
SHA-256: `e9178d2bc45bf392760e18202763ed956b505d85f13c228d2dfeb1fd21aa9fd4`.

Archive paths/CRC, all release/source manifests, exact page joins and new evidence
offsets, paired weights, review eligibility, whole-note summaries, and fixed student
splits passed the existing importer and check-only protocol. An independent
comparison verified all 160 source texts and 812 note references unchanged from
v2.3, preserved earlier active labels, and an exact partition of 1,208 source views.

- Training: 432 active raw/corrected views, 216 page/concept pairs, eight students,
  and 91 concepts. Labels: 122 present, 104 partial, 206 missing.
- Excluded: 776 quarantined views. No automatic promotion or relabelling occurred.
- Whole-note references: 561 training, 119 validation, 132 test, from 55/12/13 notes
  and 8/2/2 students. No student overlap exists within the current split.
- Synthetic AI review remains accurately declared; no human certification added.

The frozen `FacebookAI/xlm-roberta-base` encoder was used with a weighted,
multinomial logistic regression classifier. Encoder weights were not fine-tuned.
Settings were fixed before test: maximum 512 tokens per concept/page pair, batch
size 2, classifier C=1.0, random state 42, supplied per-view sample weights, and
no additional class weighting. Only training students fitted the scaler/classifier.

Note aggregation scores every corrected page, takes maximum present probability,
then maximum partial probability, and otherwise returns missing. Validation chose
present threshold 0.35 and partial threshold 0.80 from the pre-existing grid.
Calibration used 72 validation references, excluding 47 high-priority references.
Only ONE eligible calibration reference was missing, so that threshold selection
has weak evidence for distinguishing absence. Test was scored once after calibration;
no settings were changed after seeing its scores and no held-out data were used to refit.

The GPU was an NVIDIA GeForce RTX 3050 Laptop GPU. Fitting and evaluation took
65 seconds using the cached encoder, with network/model downloads disabled.
Encoder revision: `e73636d4f797dec63c3081bb6ed5c7b0bb3f2089`.

## Recorded whole-note reference results

The comparison baseline below always predicts **present**, selected from training
note labels only (322 present, 154 partial, 85 missing). The runner's separately
named `majorityBaseline` uses weighted training PAGE targets and predicts partial;
it is not the training-note majority baseline shown here. Both are retained in
machine-readable outputs to avoid overstating performance against a weak baseline.

| Evaluation | Accuracy | Macro-F1 | Balanced accuracy |
| --- | ---: | ---: | ---: |
| Validation model, 119 references | 49.58% | 0.3766 | 37.64% |
| Validation training-note majority baseline | 58.82% | 0.2469 | 33.33% |
| Test model, 132 references | 49.24% | 0.3437 | 34.55% |
| Test training-note majority baseline | 58.33% | 0.2456 | 33.33% |

Test per-class recall: present 68.83% (53/77), partial 28.95% (11/38), missing
5.88% (1/17). The model's accuracy is below the training-note majority baseline;
macro-F1 is higher, but absence detection is poor. Training page accuracy is 100%
resubstitution only and must not be reported as held-out accuracy.

Test language slices: English 59.26% accuracy / 0.3987 macro-F1 (54 references),
Sinhala 42.31% / 0.3005 (78). The two test students also separate grade and language
(grade 11 English, grade 10 Sinhala), so these are descriptive slices, not evidence
isolating a language or grade effect. Seen-concept test accuracy is 51.61% across
62 references; unseen-concept accuracy is 47.14% across 70 references.

## Verified artifacts and export correction

Use the verified artifact directory:

`ml-training/outputs/science-v2.4-batch-01-xlmr-pages-2026-10-03-verified/`

It contains classifier.safetensors, classifier.joblib, metadata.json,
evaluation.json, note-predictions.jsonl, supplementary-evaluation.json,
run-details.json, export-repair.json, and artifact-verification.json.

An export check discovered that Fortran-order sklearn coefficients were serialized
with incorrect element order by the installed NumPy serializer. The page trainer
now converts all exported arrays to C-contiguous float32. A regression test checks
saved-weight probabilities against the fitted classifier. All 20 page-training
tests pass.

The same fitted classifier was re-exported to a NEW directory; the original output
was preserved for diagnosis. No classifier refitting or test rescoring was needed.
The original directory without the `-verified` suffix has an invalid safetensors
export; use the verified directory. Corrected weight SHA-256:
`f12022124d7a0bdadf45a8fb57b6a7299f97a7dc32bdc62b620078f0eaf09d72`.

Saved-weight probabilities match sklearn on training features with maximum
absolute difference `4.76837158203125e-07`; all argmax predictions match. The 251
saved validation/test predictions match their source IDs, labels, students, splits,
and recorded metrics. Metadata remains `enabledByDefault: false`.

Snapshots, audit/protocol JSON, full log, and reproducible execution/repair/verification
helpers are under ignored `data/annotations/intake/science-v2.4-batch-01/`.
Page snapshot SHA-256:
`4974813bec6fe4dbaa122c7229e30c8a923be5dfb30ef93784a71cd9b9ca2537`.
Note snapshot SHA-256:
`f0ac764b7c1115bdb404137b897f12983101b7cd3431a64a3edeb6cad2590e92`.

## Limits and continuation

This is a synthetic university-project experiment. Test students were used in
earlier v2 training experiments, so scores are exploratory and cannot establish
direct improvement over the original v2 split. Whole-note reference labels remain
inherited AI candidates; no reviewed held-out page targets exist. Only 91 of 322
concepts have active page supervision; 83 validation and 70 test concepts lack it.

The 512-token limit truncates 10/432 training views and 29/1,317 test page/concept
inputs, with no validation truncation (1,028 inputs). Maximum combined token counts
are 546 training and 565 test. Later experiments should consider complete-page
encoding, stronger regularization chosen using validation only, broader supervision,
and more reliable partial/missing validation labels. Preserve this experiment before
changing settings. Additional test-driven tuning would invalidate the current
selection protocol.

No mobile files or live runtime configuration changed. Source archives and all
pre-existing work were preserved; the standalone v2.1 ZIP was not opened.
