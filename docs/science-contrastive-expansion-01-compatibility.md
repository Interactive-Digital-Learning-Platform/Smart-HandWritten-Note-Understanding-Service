# Contrastive Science expansion 01: backend preparation and check-only

2026-10-05. The attachments were read as documentation. The user then explicitly
authorized **backend preparation and tests/check-only**, with no training. No
existing files were edited; the implementation uses five new Python files and
this new report. Previous models, source ZIPs, labels, mobile files and dirty
work remain preserved.

## Result

**PASS: separately versioned immutable composite prepared and real check-only
verified.** No encoder model was loaded, no dataset classifier was fitted, no
validation/test prediction was made, and nothing was deployed.

Preparation directory:

`data/annotations/datasets/science-reviewed-contrastive-combined-01/`

Adjacent external anchor:

`data/annotations/datasets/science-reviewed-contrastive-combined-01.receipt.json`

The 15 preparation members are bound to manifest SHA256
`c41882355c289e3731c0964fdfa2c74b975532f42a0f221b859a616a3b2a2b6f`.
This is a local multi-snapshot preparation, not a rewritten dataset or portable
ZIP with model weights. Its source paths remain absolute and its original
packages, protected historical files, encoder and both fixed heads must remain
available at their verified locations.

| Quantity | Combined fitting pool |
| --- | ---: |
| Views / page-concept pairs | 840 / 420 |
| Concepts | 153 |
| Active note IDs / fitting students | 80 / 20 |
| Pair classes: present / partial / missing | 116 / 123 / 181 |
| Weighted totals: present / partial / missing | 116 / 246 / 181 |
| Total sample weight | 543 |
| Composite whole-note references | 872 (812 preserved + 60 new TRAIN-only) |
| Scope-eligible optional TRAIN diagnostic | 620 |
| Whole-note validation | 119, unchanged |
| Corrected validation page pairs | 40, unchanged |
| Raw validation page views | Same 40 pairs, separately reported |
| Future TEST scope denominator | 131, structural checks only; not evaluated |

The 80 active fitting note IDs comprise 20 original notes and 60 new concept-page
excerpts. No complete lesson notes were added. There are 12 new fictional
personas and 20 correlated contrast families, all TRAIN only.

## Integrity and compatibility evidence

| Check | Result and evidence |
| --- | --- |
| Original admission preserved | PASS. The original `load_package()` runs unchanged, including 720 reviewed views and exact partition of the 832 legacy source rows. Its source files remain byte-identical. |
| Augmentation archive | PASS. External receipt, exact 148-member coverage, CRC, all 147 manifest member hashes, manifest anchor, and every unpacked member's exact ZIP bytes. |
| New source lineage | PASS. Canonical sidecars, authored JSON content/hash, full corrected/raw text, frozen supplied concept definitions, textbook scope excerpts, profiles/families, ledger decisions, exact evidence offsets and OCR flags are joined. No fabricated legacy source label/hash is admitted. |
| Mixed versions | PASS. The two fit and two note-reference dataset versions are retained in original records and explicit per-row lineage indexes. Sources are read independently; original JSONL bytes are not rewritten. |
| Isolation and weights | PASS. New personas are disjoint from all original students. Pair, student and family groups are checked; same-target English/Sinhala families are conservatively linked. Supplied weights remain unchanged. No balancing/resampling is added. |
| Input features | PASS. The inherited exact concept prompt and full page text are the only encoder inputs. Labels, evidence, review/author intent, IDs and family metadata stay outside features. |
| Frozen evaluations and scope | PASS. All five original evaluation files, encoding recipe, scope policy and rubric are copied byte-for-byte. Original 812 reference records are retained unchanged; only 60 new training references are added through the composite index. `sci-g10-som-009` stays excluded. No prediction-dependent exclusions. |
| Tokenizer checks | PASS. Actual pinned offline tokenizer verifies all 120 new views, max 325 joint tokens, zero overflow or clipped evidence. Original ten over-length views/five pairs, two redundant clipped quotes and essential retained anchors retain their original checks. No TEST tokenization. |
| Baseline identity/export loading | PASS. Original v2.6 identity checks are inherited. The release-01 selected C=0.01 comparator's five artifact hashes, disabled metadata, source/encoder recipe, class order, original thresholds and safe tensor shapes/values are verified. No comparator prediction is made in check-only. |
| Execution boundary | PASS. Final real-package check-only ran with encoder loading, fitting and prediction APIs replaced by fail-fast guards. All guards passed; flags for training, encoder, validation prediction, TEST and deployment are false. |
| Tests | PASS. 113 selected tests passed; four legacy tests were deselected using the previous non-fitting test selection. Fits/predictions in the selected tests are mocks or fixture arrays, not dataset experiments. |

Augmentation ZIP SHA256:
`62bbb27e20cb2dc5fabf51f946720f746d108c7066f8900eb2e92060213d16ee`.
Augmentation manifest SHA256:
`5a5f4018002368b4b1ae2267d6c9647e0c633d480b652076d7cfba6bbe1e6e36`.
Parent ZIP SHA256:
`c222c968efac35966317d6d63c823182d8d204df7194136a13387937d66b7296`.
Release-01 selected safe weights SHA256:
`d400a1faeaf79682f1095ea3ec6e0c4791b20c531285d6a5729822a5c0e82642`.

The parent loader verifies 246 protected historical inputs; augmentation checks
verify its 233 protected inputs (these sets overlap). Final preservation evidence
also fingerprints all 327 existing tracked/non-ignored backend/mobile files.
No existing files are missing or changed. Backend status gains only the six new
implementation/test/report files; mobile status is identical.

## Preparation structure

```text
science-reviewed-contrastive-combined-01/
  manifest.json
  sources.json                       # immutable original snapshot references
  fit-lineage.jsonl                   # 840 source-row identities; not text features
  note-reference-lineage.jsonl        # 872 source-row identities
  grouping-policy.json               # identities + cross-language family edges
  evaluation-protocol.json            # new gate declared before candidate predictions
  encoding-recipe.json                # exact parent copy
  scope-policy.json                   # exact parent copy
  rubric.json                         # exact parent copy
  check-only.json
  evaluation/                        # five exact original evaluation files
science-reviewed-contrastive-combined-01.receipt.json
```

New implementation entry points:

- `ml-training/prepare_contrastive_release.py`: integrity/admission/tokenizer
  checks and fresh composite preparation only; no fitting branch.
- `ml-training/train_combined_pages.py`: explicit check-only, or a separately
  approved future validation-only run.
- `ml-training/src/smart_note_training/contrastive_release.py`: strict separate
  lineage, grouping, mixed-version preparation and reload checks.
- `ml-training/src/smart_note_training/contrastive_experiment.py`: separate CLI,
  frozen dual-baseline gate and bounded future runner; reuses the unchanged
  encoder/scaler/classifier/export routines.
- `ml-training/tests/test_contrastive_release.py`: new admission/tamper/isolation,
  immutable lineage, feature boundaries and guarded execution tests.

## Frozen later experiment

The later runner keeps frozen XLM-R (pinned revision, CUDA float16 mean pooling,
768 features), batch two, max length 512, C=0.01/0.1, seed 42, lbfgs limit 2,000,
unchanged sample weights to both scaler and classifier, max aggregation and the
original 16 threshold combinations. Selection remains whole-note validation
macro-F1, then balanced accuracy, then smaller C. Nonconvergence stops the run.

Both pinned comparators must be rescored using the exact same validation inputs,
scope masks and resolved encoding recipe, at their original thresholds. The
gate is frozen as:

1. Whole-note validation macro-F1 strictly improves over **both** fixed heads.
2. Corrected-page macro-F1 is no worse than **either** fixed head.
3. Corrected-page missing recall is no worse than **either** fixed head.

The future runner preserves class order and verifies safetensors probabilities
against fitted heads. New output/cache paths must be fresh. No automatic
validation refit, expanded grid, TEST encoding/scoring, deployment or subsequent
experiment exists in this path. A gate result never authorizes deployment.

**Implemented command for later separate approval; not executed:**

Run from `C:/Users/DLK/Desktop/RP_PROJECT_3/Smart-HandWritten-Note-Understanding-Service`:

```powershell
.\ml-training\.venv\Scripts\python.exe -B .\ml-training\train_combined_pages.py `
  --preparation '.\data\annotations\datasets\science-reviewed-contrastive-combined-01' `
  --max-length 512 --batch-size 2 `
  --classifier-c-grid 0.01 0.1 --aggregation-rules max `
  --embedding-cache-dir '.cache/science-reviewed-contrastive-combined-01-validation-only' `
  --output 'ml-training/outputs/science-reviewed-contrastive-combined-01-validation-only'
```

Executed check-only used the same settings and preparation with `--check-only`,
omitting model/output-cache arguments. All executed preparation, check-only and
test commands/results are recorded under ignored
`data/annotations/intake/science-contrastive-expansion-01-compatibility-2026-10-05/`.
The final check-only result is `check-only-final.json`; preservation is
`preservation.json`. Earlier test setup attempts encountered an inaccessible
default temporary folder, then Windows path-length limits; the successful test
run used a fresh short workspace directory. Those attempts ran no model fitting.
The tokenizer's inherited over-length diagnostic concerns untruncated counting,
not an encoder forward pass.

## Remaining limitations and stop point

- These are AI-authored/self-reviewed examples with intended labels visible,
  not blind review or independent human certification. Raw OCR is simulated;
  36 pairs differ only through injected heading errors. This cannot establish
  real-handwriting or realistic OCR quality.
- Only ten selected concepts gain all three classes. Coverage with all classes
  grows from 16/153 to 26/153; total fitting concept coverage remains 153/322.
- Related families are correlated. Exact-hash collision checks do not establish
  semantic/template independence. Future translations/descendants require
  explicit family edges and a new immutable version before any split.
- Maximum-page aggregation does not reliably combine complementary partial-page
  coverage. Whole-note labels remain independently supplied, not page maxima.
- Two validation students and the enriched, previously inspected 40-page set
  remain small/exposed. Historical test-student exposure prevents a fresh
  independent test-accuracy claim.
- No new candidate was trained or scored. Reviewing/expanding labels does not
  guarantee accuracy improvement. The actual future fitting/export result and
  advancement gate remain unmeasured.

Stop after this preparation and check-only. Training needs separate direct user
approval. No Stage 6 or mobile changes were made; no standalone v2.1 archive was
processed.
