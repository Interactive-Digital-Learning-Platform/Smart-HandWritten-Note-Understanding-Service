# Evaluation protocol: Smart Handwritten Note Understanding

## What is being evaluated

This service is a curriculum-grounded decision pipeline, not a newly trained
machine-learning model. OCR and LLM components are used as services inside the
pipeline. Therefore, precision, recall, F1, accuracy, and a confusion matrix
evaluate the correctness of the pipeline's **concept-present / concept-missing
decisions** against an independently prepared reference annotation. They are
not training or model-accuracy claims.

The system must never infer that a concept absent from one note is a learning
deficit. The product records it as `not_found_in_note`; a support need is only
confirmed when the student selects **I need help with this**.

## Dataset rules

1. Include real, consented Grade 10/11 handwritten notes, with no names or
   personal identifiers in filenames or annotations.
2. Include multiple subjects, both Grade 10 and Grade 11, clear and difficult
   handwriting, one-page and multi-page notes, and Sinhala, English, and mixed
   language notes.
3. Evaluate lesson coverage only for notes independently labelled
   `complete_lesson_note`. Evaluate partial notes as note coverage, not as a
   complete lesson.
4. For each curriculum concept, record one of `present`, `partial`, or
   `missing`, plus a short evidence location or explanation.
5. Two independent research annotators should label a subset of notes. Report
   their agreement and resolve disagreements before producing the final gold
   reference. These annotators are research participants only; they are not a
   teacher feature in the app.

## Metric rules

`present` is the positive class and `missing` is the negative class.

- Precision, recall, F1, accuracy, weighted agreement, and the confusion
  matrix use only concepts labelled `present` or `missing`.
- `partial` concepts are excluded from those binary metrics and reported as a
  separate count. Treating partial coverage as fully present would inflate the
  result and is not permitted.
- Curriculum weights are used only for weighted agreement. They do not replace
  the unweighted confusion matrix.
- Report sample size, number of eligible concepts, number of partial concepts,
  subject/grade distribution, and confidence intervals where sample size
  permits. Do not use a three-note pilot as a final performance claim.

## Product usefulness evaluation

In addition to decision correctness, report student-facing outcomes:

- percentage of findings students mark `understood` or `needs_help`;
- percentage of `needs_help` findings for which a remediation material was
  generated;
- later, after Quiz service integration, diagnostic completion and improvement
  between first attempt and retry.

These are practical usefulness measures. They must not be presented as proof
that the system has diagnosed a student from a note alone.

## Reproducing the benchmark

Prepare `data/benchmarks/ground_truth.json` using the rules above, then run:

```bash
npm run eval:benchmarks
```

The runner compares keyword-only, semantic-only, and the proposed hybrid
pipeline under the same input notes and reference labels. Its output must be
reviewed together with dataset size and the limitations described here.
