# Science v2.7 pair-matching experiment: local intake audit

Date: 2026-10-04. Decision: neither supplied candidate advances. No fitting,
test scoring, deployment, Stage 6 integration, or mobile changes during this audit.

## What was supplied

`science-v2.7-pair-matching-experiment-01.zip` is an already-trained experiment
supplement, **not a new dataset release**. The source release remains
`science-training-release-v2.6-batch-01.zip`: 832 training text views, 416
page/concept pairs, eight training students, and unchanged supplied weights.

Archive SHA-256:
`90613b44acb4f06d5a2c48875c65ff616cd68b1cbe1946d2ec73f556cf5b988d`.

Read the supplied `TRAINER-HANDOFF.md`, `REPORT.md`, and frozen protocol completely;
inspected the experiment trainer, backend page trainer, aggregation/metrics code,
and classifier implementation. Attached instructions were treated as experiment
documentation. The handoff's proposed encoder-adaptation experiment was not
started by this intake audit.

## What this model tries to do

For a target Science concept and one page of note text, predict **present**,
**partial**, or **missing**. Page probabilities are then aggregated into a status
for that concept across the whole note. This classifier does not recognize
handwriting or train an OCR model.

The experiment leaves the XLM-R encoder frozen and changes the inputs to the
logistic classification head. It combines the original joint concept/page
embedding (768 values), the absolute difference between separately normalized
concept/page embeddings (768), their elementwise product (768), and cosine
similarity (1): 2,305 features total. C=0.01 and C=0.1 are the two supplied
regularization settings. The heads were fitted on training views only according
to the supplied trainer/protocol; this audit reproduced their saved inference.

## Independently reproduced validation results

These are **validation**, not new test results or real-handwriting accuracy.

| Measurement | Saved v2.6 baseline | Pair C=0.01 | Pair C=0.1 |
| --- | ---: | ---: | ---: |
| Page accuracy, 40 reviewed pairs | 40.00% | 35.00% | 37.50% |
| Page macro-F1 | 0.375463 | 0.355108 | 0.380087 |
| Page balanced accuracy | 39.74% | 34.98% | 37.36% |
| Page present recall | 7/14 | 5/14 | 6/14 |
| Page partial recall | 7/13 | 4/13 | 4/13 |
| Page missing recall | 2/13 | 5/13 | 5/13 |
| Whole-note accuracy, 119 references | 72.27% | 57.14% | 57.98% |
| Whole-note macro-F1 | 0.380342 | 0.335319 | 0.319406 |
| Whole-note balanced accuracy | 38.60% | 35.79% | 34.04% |
| Whole-note present recall | 80/95 | 63/95 | 62/95 |
| Whole-note partial recall | 6/19 | 4/19 | 7/19 |
| Whole-note missing recall | 0/5 | 1/5 | **0/5** |
| Development advancement gate | Reference | Failed | Failed |

**Supplied report correction:** `REPORT.md` incorrectly lists C=0.1 whole-note
missing detection as 1/5. Its `experiment-results.json`, candidate evaluation,
and independently reconstructed predictions agree on **0/5**. The report's
whole-note missing claim must not be repeated as a verified result.

C=0.1 ranks first under the supplied rule: page macro-F1, then whole-note macro-F1,
then smaller C. Ranking does not imply acceptance. The advancement gate requires
page macro-F1 and missing recall to strictly exceed the baseline while whole-note
macro-F1 does not worsen. C=0.1 fails the whole-note requirement; C=0.01 also fails
the page macro-F1 requirement.

Recalibration reproduced maximum-page aggregation for both candidates:
C=0.01 present=0.35, partial=0.80; C=0.1 present=0.50, partial=0.35. Both have
100% training resubstitution accuracy. That is training fit, not held-out accuracy.

## Verification performed

45 artifact/data consistency checks passed. The numerical artifacts are
consistent; the documentation error above remains in the untouched supplied ZIP.

- Checked all 17 ZIP members for CRC, duplicate and unsafe paths.
- Verified source archive, local v2.6 page/note snapshots, external reviewed
  validation pages, original protocol, baseline classifier, and cached encoder
  hashes against the supplied frozen protocol; checked they remained unchanged.
- Loaded arrays with `allow_pickle=False` and classifier tensors via safetensors.
  No supplied Python script or joblib/pickle artifact was executed.
- Matched 832 training and 1,028 validation feature rows to source record IDs.
  Verified the fixed student/note isolation and 40 reviewed validation page joins.
- Reconstructed all 2,305 feature values exactly from the verified original joint
  caches and the supplied standalone embeddings, for both train and validation.
- Matched the 600 unlabeled standalone inputs to source concept/page texts and
  reproduced their token counts with the local tokenizer. None exceeded 512.
- Verified each safe weight file's hash, disabled flags, feature dimension and
  fitting-student metadata. Recomputed all training, reviewed-page and whole-note
  validation metrics, both aggregation calibrations, candidate ranking and gate.
- Reproduced the saved 40-page probability matrices exactly (maximum absolute
  difference 0.0) and confirmed all predictions and source-label joins.

Audit files, preserved separately from all previous results:

- `data/annotations/intake/science-v2.7-pair-matching/audit_experiment.py`
- `data/annotations/intake/science-v2.7-pair-matching/audit.json`

Run from the backend with:

```powershell
.\ml-training\.venv\Scripts\python.exe data/annotations/intake/science-v2.7-pair-matching/audit_experiment.py
```

The helper refuses to overwrite an existing audit; choose a new destination
before any repeat audit. It reads the external delivery and local immutable
snapshots/caches in place, without extracting or modifying the original package.

## Interpretation and limits

The page development set has 40 AI-reviewed pairs from four lessons and two
validation students. Difficult examples were deliberately selected after prior
baseline inspection. These are exploratory development observations, with
synthetic text and AI labels, not independent human certification. The 119
whole-note references are a separate evaluation unit; page accuracy cannot
replace whole-note accuracy. Student, grade and language are confounded.

Standalone embeddings were checked by input identity and exact feature
reconstruction, not by rerunning encoder inference. The original joint encoding
still uses its 512-token limit; standalone page encoding can retain more trailing
page text. This does not isolate extra matching features from that token effect.
Protocol fields/hashes match, but supplied timestamps cannot independently prove
when the protocol was declared. This audit did not refit heads or inspect pickle
contents and therefore does not independently reproduce the original optimizer
trajectory.

No test features were opened or scored. The previously reported v2.6 46.21%
whole-note test accuracy remains a historical result with repeated-exposure and
synthetic-label caveats; there is no v2.7 test accuracy. Both experimental heads
remain disabled and require a different inference recipe from the existing
768-feature XLM-R experiment. They must not replace current runtime weights.

## Continuation

Retain all prior models and treat these candidates as rejected development
experiments. The supplied handoff proposes bounded supervised adaptation of part
of the encoder using the same training views, selecting only on the reviewed
validation pages and whole-note references. That proposal is not implemented or
started here. Any next experiment should fix its budget and advancement gate
before fitting; failed development candidates should not receive extra test
evaluations. Consent/expert pilot work remains at the earlier documented staging
continuation point. No standalone v2.1 archive was processed.
