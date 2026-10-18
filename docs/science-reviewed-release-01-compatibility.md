# Reviewed Science release 01: trainer compatibility implementation

2026-10-04. The user explicitly authorized backend compatibility changes and
check-only/tests, with no training. The attached implementation prompt was first
read as documentation; implementation began after that direct authorization.

## Result

**PASS for the reviewed package's offline Python workflow.** The real-package
check-only command passes. All 64 selected tests pass; four legacy tests outside
this non-fitting selection were deselected. No actual classifier fitting,
encoder loading, validation/test prediction, test tokenization, deployment,
Stage 6 changes, or mobile changes occurred. Test predictions/fits are synthetic
spies or mock heads, not models fitted on this dataset.

| Requirement | Result | Evidence |
| --- | --- | --- |
| Candidate-aware admission | PASS | External ZIP receipt, exact membership/bytes, canonical sidecar, source lineage, semantic ledger, reason/evidence offsets and OCR flags verified. Semantic status is preserved; legacy admission is unchanged. |
| Shared scope masks | PASS | One scope mask is used for calibration, all primary metrics, every slice and every baseline. No extra labelReviewPriority exclusion. Denominators: validation 119, optional TRAIN 560, future TEST 131 (structural check only). |
| Separate validation page units | PASS | 40 corrected pairs are primary; the same 40 raw views are secondary. Their students remain held out. Their page targets are distinct from whole-note targets. |
| Frozen encoding/cache recipe | PASS | Offline local revision and all five encoder/tokenizer file hashes verified; exact prompt and 768-feature recipe enforced. Cache keys bind IDs/order, source/text/prompt and full recipe/runtime/precision. CPU fallback requires an explicit flag and a distinct recipe. |
| Bounded experiment | PASS | Exactly C=0.01/0.1, seed 42, lbfgs max 2000 iterations, batch two, supplied scaler/head weights, no added balancing, fixed max aggregation and 16 threshold combinations. Nonconvergence stops the run. |
| Fixed baseline and gate | PASS | Four baseline artifact hashes, revision, fit students, head/scaler shape/class order and original thresholds verified. Future rescoring uses the same features/masks; no historical score substitution. A gate never authorizes deployment. |
| Truncation admission | PASS | Actual tokenizer reproduced ten over-length TRAIN views/five pairs, max 546 tokens and two clipped redundant quotes. Reviewed essential anchors remain retained. No source text/evidence was cropped or relabeled. |
| Tests and execution boundaries | PASS | 64 selected tests; check-only cannot load the encoder/fit/predict, and mocked future execution never encodes TEST. Tensor export round trip, class order, convergence failure, masks, tampering and fresh output checks are covered. |

## Verified counts and identity

- Fitting: **720 views / 360 page-concept pairs**, 153 concepts, 20 notes, eight
  TRAIN students. These are correlated raw/corrected views, not independent notes.
- Pair classes: present 96, partial 103, missing 161. View classes: 192/206/322.
- Per-view weights: partial 1.0; present/missing 0.5. Weighted totals:
  present 96, partial 206, missing 161; **total 463**.
- Excluded: 112 views (108 legacy admission failures, four scope-conflicted
  views). Fit plus exclusions account for all 832 source view IDs exactly once.
- Student overlap with held-out splits: zero. Reviewed validation pages remain
  entirely outside fitting.
- Receipt/ZIP SHA256:
  `c222c968efac35966317d6d63c823182d8d204df7194136a13387937d66b7296`.
- Package manifest SHA256:
  `80652b407be14d5ff168a88906cdb5a2e4235ae6ce304fa1c18261bc8b54f45b`.
- All 26 members (25 hashed by the manifest, manifest anchored by the receipt),
  unpacked copy, 246 protected historical inputs and linked source copies pass.
- XLM-R revision: `e73636d4f797dec63c3081bb6ed5c7b0bb3f2089`.
  Encoder weight SHA256:
  `6fd4797bc397c3b8b55d6bb5740366b57e6a3ce91c04c77f22aafc0c128e6feb`.
- Baseline: `science-v2.6-batch-01-xlmr-pages-2026-10-04`, safe head SHA256
  `bb2672f6fde79d019a47ab55200eb9d3ab971617dad69da9be1e061415f7bfbb`.
  Original thresholds stay present=0.35, partial=0.80.

## Implementation

- `ml-training/src/smart_note_training/reviewed_release.py`: strict package,
  receipt, provenance, review/evidence, source/split, external identity, scope
  and tokenizer checks. It admits semantic status only in the verified package.
- `ml-training/src/smart_note_training/reviewed_experiment.py`: recipe-specific
  encoder/cache, validation-only scoring, fixed baseline comparison, bounded
  head selection, convergence/export gates and disabled artifacts.
- `ml-training/src/smart_note_training/train_pages.py`: a small dispatch adds
  `--evaluation-protocol`, `--release-zip`, and `--allow-cpu-fallback`; the legacy
  path and existing importer behavior remain intact.
- `ml-training/tests/test_reviewed_package.py`: focused fixture/mock tests.

Fresh check-only evidence is under ignored
`data/annotations/intake/science-reviewed-release-01-compatibility-2026-10-04/`:
`check-only.json`, `check-only.stderr.log`, `command.json`, `preservation.json`. The tokenizer's
over-length diagnostic in stderr concerns untruncated counting, not a model
forward pass; the checked encoding truncates only the second input to 512.

Before/after fingerprints monitored 578 existing files. 576 remain byte-identical;
the two authorized changes are the trainer's added dispatch and a handoff append.
Removing only the added dispatch reproduces the exact original trainer SHA256;
the handoff's original bytes remain an intact prefix. The four new files are the
two modules, focused tests and this report. Mobile Git status is unchanged. Final
receipt/member checks confirm the package and unpacked copy remain byte-identical.

## Scope treatment

`sci-g10-som-009` remains unresolved and excluded from fitting/scoring.
Original reference bytes and labels are preserved. The exclusion IDs are
`cand-0016-009` (TRAIN) and `cand-0015-009` (TEST); none in validation. All other
concepts, including those without page supervision, remain in primary scoring.
Scores on a future 131-reference test are not directly comparable to historical
132-reference totals; fixed baselines use the same mask.

## Remaining limitations

- Max-page aggregation is a declared surrogate, not a semantic union of
  complementary partial pages. Whole-note ground truth is never derived from
  page maxima.
- Synthetic notes and AI-reviewed labels are not independently human certified.
  Reviewing labels does not promise better accuracy.
- The 40-page development set was deliberately enriched and previously examined;
  two held-out validation students cannot establish broad generalization.
- TEST students were used in earlier training and previous test scores were
  inspected. No fresh independent test claim is permitted.
- First-window truncation remains a limitation for future longer inputs.
  Current validation checks find zero over-length/clipped evidence among 80
  reviewed page views and zero over-length among 1,028 whole-note page inputs.
- Actual fitting and the real trained-head export parity check have not run.
  This turn verifies compatibility and tests the implemented gates with fixtures.
- Backend Stage 6 remains its existing keyword/LLM workflow. New offline
  artifacts explicitly retain `enabledByDefault=false` and `stage6Compatible=false`.

## Runnable command after explicit training approval

Run from the backend directory. Both output/cache paths must be fresh. This
command is implemented but **was not executed**; the executed version added
`--check-only` and omitted output/cache arguments.

```powershell
.\ml-training\.venv\Scripts\python.exe -B .\ml-training\train_pages.py `
  --pages 'C:\Users\DLK\Desktop\annotations\workspace\science\science-reviewed-training-release-01\reviewed-training-views.jsonl' `
  --notes 'C:\Users\DLK\Desktop\annotations\workspace\science\science-reviewed-training-release-01\evaluation\note-references.jsonl' `
  --evaluation-protocol 'C:\Users\DLK\Desktop\annotations\workspace\science\science-reviewed-training-release-01\evaluation-protocol.json' `
  --release-zip 'C:\Users\DLK\Desktop\annotations\data\science\science-reviewed-training-release-01.zip' `
  --max-length 512 --batch-size 2 `
  --classifier-c-grid 0.01 0.1 --aggregation-rules max `
  --embedding-cache-dir '.cache/science-reviewed-release-01-validation-only' `
  --output 'ml-training/outputs/science-reviewed-release-01-validation-only'
```

The experiment fits TRAIN only, selects using whole-note validation macro-F1,
balanced accuracy and smaller C; evaluates corrected/raw pages separately;
re-scores the fixed baseline at its original thresholds; checks the declared
advancement gate; exports verified safe weights; and stops without any TEST
embedding/prediction/scoring or deployment, even if the gate passes.

Tests executed:

```powershell
.\ml-training\.venv\Scripts\python.exe -B -m pytest -q -p no:cacheprovider `
  ml-training/tests/test_reviewed_package.py ml-training/tests/test_page_training.py `
  -k 'not loader_preserves_page_weights and not weighted_duplicate_views and not exported_fortran and not protocol_rejects and not protocol_accepts'
```
