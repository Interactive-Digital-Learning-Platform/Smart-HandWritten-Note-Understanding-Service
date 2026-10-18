# Bounded Science LoRA experiment 01: preparation only

Prepared 2026-10-05. Training has **not** been authorized or started by this preparation. No test scoring or deployment path exists. Existing mobile and service work is preserved; the implementation adds separate files.

## Frozen package and recipe

Preparation: `data/annotations/datasets/science-reviewed-contrastive-combined-01`.
Admission calls the existing immutable combined-package loader unchanged. It verifies receipts, source hashes, reviewed/excluded partition, supplied weights, student/family grouping, original concept definitions, scope masks and evaluation files. Fit remains 840 TRAIN views / 420 pairs / 153 concepts / 20 students. Weighted totals remain present=116, partial=246, missing=181, total=543. No new data or label adjudication is included.

The complete machine-readable recipe is in:

`data/annotations/intake/science-combined-lora-r4-final2-qv-01-preparation-2026-10-05/frozen-protocol.json`

That file pins the implementation hashes, source fingerprints, local encoder/tokenizer snapshot, runtime versions and GPU, baseline artifacts/saved decisions, evaluation protocol and complete recipe. Training rejects changed bindings and requires a matching successful preparation receipt.

| Setting | Frozen value |
| --- | --- |
| Base | Local pinned XLM-R base snapshot `e73636d4f797dec63c3081bb6ed5c7b0bb3f2089`; offline only |
| Adapters | Rank 4, alpha 8, scaling alpha/r=2; dropout .05; query/value in zero-based blocks 10 and 11 only |
| Initialization | A: Kaiming uniform with a=sqrt(5); B: zeros; FP32 |
| Head | FP32 Linear(768,3), Xavier uniform weights, zero bias; no head dropout or scaler |
| Class order | present, partial, missing |
| Pooling | Attention-mask mean over all joint tokens including non-padding special tokens; FP32 arithmetic |
| Tokenization | Exact existing concept prompt paired with the full stripped page; batch-longest padding, right truncation of second input only, maximum 512 |
| Precision | CUDA FP16 frozen base; FP32 adapters, pooling, head and CE; CUDA FP16 autocast; GradScaler with initial scale 65536, growth 2, backoff .5, interval 2000 |
| Base mode | Entire frozen base stays eval; only adapter dropout is enabled during training; eager attention; no gradient checkpointing |
| Loss | Unsmoothed three-class CE, multiplied by each unchanged supplied sample weight; summed and divided by total supplied weight over the entire effective batch of eight |
| Accumulation | Four microbatches of two; each contributes its numerator divided by the same eight-example weight sum; no independent microbatch normalization |
| Optimizer | AdamW; LR 1e-4; betas (.9,.999); eps 1e-8; weight decay .01 for A/B/head weights, zero for head bias; foreach/fused disabled; other PyTorch AdamW defaults pinned by runtime |
| Scheduler | Constant LR; no warmup |
| Gradient clipping | Global norm 1.0 after scaler unscale; nonfinite loss/gradient aborts, no automatic retry |
| Ordering | Seed 42; dedicated CPU Generator/torch.randperm, one complete permutation per epoch; no resampling or dropped rows |
| Budget | Three epochs, 105 updates each, exactly 315 planned updates; no extra updates/resume/retry |
| Selection | Final epoch only; no intermediate validation or checkpoint search |
| Caches | No frozen/adapted embedding or token-feature cache API; tokenize inputs on demand |

The FP32 pooling and learned adapters constitute a **new encoding recipe**. This is not a compatible substitute for a legacy frozen logistic-regression export. The new artifact remains disabled and Stage 6 incompatible.

## Evaluation remains unchanged

- Calibrate the existing 16 present/partial threshold combinations using the same eligible 119 validation whole-note references and maximum-page aggregation. Same tie-breaks.
- Score the same 40 corrected page/concept pairs by argmax. Score the corresponding raw pages separately.
- Preserve the existing exclusions, labels, slices, metric convention and complementary-page limitation.
- The formal gate still requires whole-note macro-F1 to improve over **both** v2.6 and release-01, with corrected-page macro-F1 and missing recall no worse than either.
- Compare the selected combined model as an additional reference; it does not add or change a gate condition.
- Fixed comparison scores are reproduced from the existing saved validation decisions under the identical protocol, then hash-pinned. No frozen feature caches are used by this path.
- No test tokenization, embeddings, predictions, metrics, selection or deployment. Benchmark provenance and historical exposure remain unchanged.

## Preparation verification

The preparation command loads the actual pinned base, checks the exact trainable names/count, verifies source tokenization and evidence retention, and performs a synthetic bilingual two-by-512-token forward/backward probe. It never constructs a fitting run or calls an optimizer step. Base gradients must remain absent.

An explicitly marked **untrained synthetic fixture**, with nonzero adapter B values, is saved as safetensors. Fresh adapter wrappers and a fresh head reload it against the same unchanged base; all tensors and probabilities must match. This fixture is not a trained candidate. Evaluation plumbing is exercised using fabricated probabilities, not candidate predictions on validation texts.

Checks: trainable 26,883 parameters (24,576 adapters; 2,307 head); GPU synthetic round-trip probability error 0; maximum microbatch forward/backward passed. Token audit: ten inherited over-length views/five pairs, maximum 546 tokens; two redundant clipped quote views; essential anchors retained. Augmentation maximum 325 tokens with no truncation. All 1,028 whole-validation page inputs fit, maximum 508. TEST text was not tokenized.

## Commands

Run from `C:/Users/DLK/Desktop/RP_PROJECT_3/Smart-HandWritten-Note-Understanding-Service`.

Preparation already executed:

```powershell
& ml-training/.venv/Scripts/python.exe -B ml-training/train_lora_pages.py `
  --prepare `
  --preparation data/annotations/datasets/science-reviewed-contrastive-combined-01 `
  --baseline-run ml-training/outputs/science-reviewed-contrastive-combined-01-validation-only `
  --report-dir data/annotations/intake/science-combined-lora-r4-final2-qv-01-preparation-2026-10-05
```

Later training command, **not executed**; requires a subsequent explicit user approval:

```powershell
& ml-training/.venv/Scripts/python.exe -B ml-training/train_lora_pages.py `
  --train `
  --protocol data/annotations/intake/science-combined-lora-r4-final2-qv-01-preparation-2026-10-05/frozen-protocol.json `
  --output ml-training/outputs/science-combined-lora-r4-final2-qv-01-validation-only `
  --run-dir data/annotations/intake/science-combined-lora-r4-final2-qv-01-validation-run-2026-10-05
```

Both output and run directories must be absent and remain separate from source/preparation directories. The runner refuses an existing location.

## Final training package, if later authorized

```text
science-combined-lora-r4-final2-qv-01-validation-only/
  frozen-run-protocol.json
  final-checkpoint/
    adapter-head.safetensors
    metadata.json
  evaluation.json
  whole-note-pages-validation-predictions.jsonl
  corrected-pages-validation-predictions.jsonl
  raw-pages-validation-predictions.jsonl
```

The separate fresh run directory holds epoch orders and per-update loss/LR logs. The immutable local base/tokenizer snapshot is referenced by hashes, not duplicated or modified. Before reporting results the runner reloads the final adapters/head and verifies all 1,108 validation-page probability vectors, argmax predictions and all 119 whole-note decisions. There is one candidate and no automatic follow-up experiment.
