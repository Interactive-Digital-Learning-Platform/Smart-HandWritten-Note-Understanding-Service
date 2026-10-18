# Version 2: fresh human-review result

Reviewed by Sumithra on 2026-10-06. All 30 answers passed packet and schema
validation; none were marked unclear. The frozen model, packet and inference
source hashes matched. The submitted file was copied byte-for-byte into the
evaluation output. No fitting or changes to reviewer labels were performed.

**Result: 24/30 correct (80%), macro-F1 0.80. The predeclared screening gate
failed because complete precision was 70%, below the required 90%.**

| Human label | Correct | Predicted complete | Predicted partial | Predicted missing |
| --- | ---: | ---: | ---: | ---: |
| Complete | 7/10 | 7 | 3 | 0 |
| Partial | 7/10 | 3 | 7 | 0 |
| Missing | 10/10 | 0 | 0 | 10 |

The fixed checklist rule scored 22/30 (73.33%), macro-F1 0.742346. The learned
model exceeded it by two examples overall, but made three false-complete
suggestions compared with two for the rule. Overall accuracy alone therefore
does not establish that the learned model is preferable for every use.

Four screening criteria passed: accuracy >=80%, macro-F1 >=0.75, each class
recall >=70%, and accuracy above the rule. Complete precision >=90% failed:
only seven of ten complete suggestions were correct. Automatic deployment
remains disabled and the adapter continues to require review.

## Errors

| Example | Human → model | Observed failure |
| --- | --- | --- |
| v2-review-020, semiconductors | Partial → complete | Reversed n-type/p-type majority carriers accepted because adjacent clauses contain both carrier terms. |
| v2-review-026, chromatography | Partial → complete | Incorrect same-attraction/same-speed explanation accepted as the separation mechanism. |
| v2-review-017, breathing | Partial → complete | An expiration-only note incorrectly credited with sufficient inspiration coverage. |
| v2-review-016, breathing | Complete → partial | Correct pressure/volume paraphrases under-match the lexical patterns. |
| v2-review-022, heat exchange | Complete → partial | Correct “heat loss equals ... heat gain” wording under-matches the exchange point. |
| v2-review-001, Benedict's test | Complete → partial | Reagent point under-matches the valid procedure using “Benedict's reagent” and pear juice. |

The three false-complete cases had complete scores of 0.8652, 0.7636, and 0.6745.
Two false-partial cases had partial scores above 0.95. These are uncalibrated
model scores; high scores do not establish correctness. A confidence threshold
chosen after seeing this review would need separate validation.

## What this supports

This is evidence that the small classifier can distinguish the three labels
on some new English synthetic examples, and identifies specific failures in
relationship matching and paraphrase coverage. It is not reliable enough to
automatically tell a student that a concept is complete under our declared
screen. The perfect missing-class result concerns only these ten examples;
it is not a general guarantee.

V1 scored 23/30 on a different packet. V2's 24/30 does not establish a controlled
3.33-point improvement. This fresh review is more informative than V2's 30/30
on the first packet, whose errors informed development. Neither review measures
real handwriting recognition, OCR errors, or a random sample of student work.

The most directly supported next work is to distinguish opposite relationships
within individual required points, handle ordinary paraphrases, and prevent
unsupported required points from producing an unqualified complete result.
Those changes should be evaluated separately from the learned classifier and
compared against the fixed-rule baseline. These reviewed cases would then
become development checks; they must not be reused as an independent accuracy
claim. A further review should include real English notes and their OCR text.
For the current candidate, a reviewer-facing suggestion tool is the supported
deployment scope; automatic student-facing grading is not yet justified.

## Artifacts and integrity

- [Evaluation metrics](../ml-training/outputs/english-coverage-v2-human-review-01/evaluation.json)
- [All decisions and matched evidence](../ml-training/outputs/english-coverage-v2-human-review-01/decisions.json)
- [Six-error analysis](../ml-training/outputs/english-coverage-v2-human-review-01/error-analysis.json)
- [Preserved submitted review](../ml-training/outputs/english-coverage-v2-human-review-01/submitted-human-review.json)

Model SHA-256:
`594164b4e2217dd6e39a394badbd8c6f5e186776242049e51e2ca7c5ddb4b6d3`.
Submitted review SHA-256:
`67a6d742bbed294e5230c08cb3f96188f7ec8a47879b09a3fd4d3e968b8cb986`.
Packet content SHA-256:
`89e57356ecc5d3e3474cda61c87e3481b0e5a0de30f3f02a3764e261e82358e8`.

The frozen evaluator ran successfully against the returned file using the
command documented in [the V2 report](english-coverage-v2.md). Prior focused
verification comprised 46 passing tests. This evaluation changed only result
artifacts and reports, so no model retraining or service changes were needed.
