# Standalone model training

This project trains the concept-status classifier directly from an immutable
released annotation dataset. It does not invoke handwriting OCR, Groq, Qdrant,
MongoDB, or the note-processing pipeline.

The model uses a frozen `FacebookAI/xlm-roberta-base` encoder with a
class-weighted multinomial logistic-regression head. Short notes can use one
context window. Long notes can use `page_mean_max`, which embeds every marked
page and concatenates the mean and maximum page representations. Evaluation can
use a separate `evaluationGroupId` (student/author identity), so all notes from
one author stay in the same fold.

Run tests from the service root:

```powershell
npm run model:xlmr:test
```

Train dataset v1:

```powershell
npm run model:xlmr:train -- `
  --dataset data/annotations/datasets/concepts-science-history-2026-08-v1/concept-annotations.jsonl `
  --output ml-training/outputs/concepts-science-history-2026-08-v1-xlmr-v1 `
  --nomic-baseline data/models/concept-classifier/concepts-science-history-2026-08-v1-nomic-linear-v1/model.json
```

Verify and convert the Science v2 release ZIP without modifying it:

```powershell
npm run model:xlmr:import-release -- `
  --release ../science-training-release-v2.zip `
  --output data/annotations/datasets/concepts-science-synthetic-2026-09-v2/concept-annotations.jsonl
```

Train the selected page-aware v2 experiment:

```powershell
npm run model:xlmr:train -- `
  --dataset data/annotations/datasets/concepts-science-synthetic-2026-09-v2/concept-annotations.jsonl `
  --output ml-training/outputs/concepts-science-synthetic-2026-09-v2-xlmr-page-v3 `
  --document-pooling page_mean_max `
  --max-length 256 `
  --batch-size 4 `
  --classifier-c 0.003 `
  --class-weight moderate
```

The embedding cache and prototype artifacts are excluded from Git. A final model
is promoted into the service only after its held-out, per-class results pass the
deployment gates.

## Dataset v1 architecture comparison

Both models were evaluated with leave-one-note-group-out cross-validation on the
same 181 reviewed labels from 10 independent notes.

| Model | Accuracy | Balanced accuracy | Macro-F1 | Present recall | Partial recall | Missing recall |
|---|---:|---:|---:|---:|---:|---:|
| Nomic + linear head | 0.834 | 0.700 | 0.690 | 0.400 | 0.818 | 0.882 |
| Frozen XLM-R + linear head | 0.939 | 0.810 | 0.840 | 0.533 | 0.909 | 0.986 |

XLM-R is the current leading architecture. It remains a prototype because the v1
dataset has only 15 present labels, 22 partial labels, 10 note groups, and English
content only. The final deployment decision must be made after dataset v2 and an
untouched held-out test set.

## Synthetic Science v2 result

The replacement release has 812 AI-reviewed/owner-approved labels from 80
synthetic notes and 12 synthetic student identities. It is not independently
human-certified. Student-grouped evaluation is therefore stricter than note-level
evaluation but is still not evidence of performance on real handwriting.

| Evaluation | Accuracy | Balanced accuracy | Macro-F1 |
|---|---:|---:|---:|
| Leave-one-student-out XLM-R | 0.541 | 0.427 | 0.435 |
| Leave-one-student-out majority | 0.578 | 0.333 | 0.244 |
| Fixed held-out test XLM-R | 0.579 | 0.445 | 0.449 |
| Fixed held-out test majority | 0.587 | 0.333 | 0.247 |

The page-aware representation improves substantially over the first-window v2
experiment (grouped macro-F1 0.351), but partial/missing recall remains weak and
raw accuracy does not beat the majority baseline. The artifact stays disabled.
The JavaScript Nomic v2 baseline was not completed because local ONNX embedding
did not finish its first batch in a practical time, even with a 384-token cap.
