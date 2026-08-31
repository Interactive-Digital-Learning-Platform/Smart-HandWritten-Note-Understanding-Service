# Concept-status classifier training

The learned component is a three-class classifier for curriculum concept coverage:
`present`, `partial`, or `missing`.

It is deliberately hybrid:

- the frozen `nomic-ai/nomic-embed-text-v1.5` transformer produces semantic
  features locally;
- a class-weighted multinomial logistic-regression head is trained on reviewed
  project annotations;
- the existing deterministic and curriculum-grounded pipeline remains the live
  production path until the learned head passes deployment gates.

Training never calls Groq. The released dataset manifest is checked by SHA-256,
and embeddings are cached beside the privacy-restricted dataset.

## Train the current baseline

```powershell
npm run model:train -- `
  --dataset data/annotations/datasets/concepts-science-history-2026-08-v1/concept-annotations.jsonl
```

Evaluation uses leave-one-note-group-out cross-validation. Every concept belonging
to a held-out handwritten note is excluded from that fold's training data. This is
essential because a random concept-row split would leak the same note text into
both training and testing.

The produced model artifact is disabled by default. Enabling it in the live
pipeline requires a larger, more representative dataset, stronger review quality,
and acceptable held-out per-class recall—especially for `present` and `partial`.

## Version 1 baseline result

Dataset `concepts-science-history-2026-08-v1` contains 181 labels from 10
independent notes. Its class distribution is 15 present, 22 partial, and 144
missing. Leave-one-note-group-out evaluation produced:

- accuracy: `0.834`
- balanced accuracy: `0.700`
- macro-F1: `0.690`
- present recall: `0.400`
- partial recall: `0.818`
- missing recall: `0.882`
- majority-baseline macro-F1: `0.295`

This is evidence that the learned representation has useful signal, but it is not
a deployment result. Present labels occur in only two of the ten notes, Science
dominates the dataset, all labels have only single review, and all samples are
English. The artifact therefore remains disabled by default.
