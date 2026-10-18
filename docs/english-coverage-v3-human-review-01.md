# Version 3: Round 3 human-review result

2026-10-06. Sumithra completed all 30 examples. All review schema, packet,
model and inference-source integrity checks passed. No examples were unclear
or excluded. The returned review was preserved byte-for-byte. No model fitting
or human-label changes were performed.

**Raw accuracy: 28/30 (93.33%). Macro-F1: 0.932660. The predeclared screening
gate failed because complete-suggestion precision was 83.33%, below 90%.**

| Human label | Predicted complete | Predicted partial | Predicted missing | Correct |
| --- | ---: | ---: | ---: | ---: |
| Complete | 10 | 0 | 0 | 10/10 |
| Partial | 2 | 8 | 0 | 8/10 |
| Missing | 0 | 0 | 10 | 10/10 |

The evidence safeguard withheld **zero** suggestions. Its accuracy and complete
precision therefore equal the raw model's on this packet: ten of twelve complete
suggestions were correct. It did not catch either false-complete prediction.
Both examples had full lexical point coverage and no detected concern; this
demonstrates the limit of using the same evidence representation for a safeguard.

The fixed-rule baseline scored 27/30 (90%), macro-F1 0.899522. It made the same
two false-complete errors and one additional missing-to-partial error. The
classifier's measured advantage over rules is only one example on this packet.

Six of seven screening checks passed: raw accuracy >=80%, macro-F1 >=0.75,
each class recall >=70%, suggestion coverage >=80%, at least five complete
suggestions, and raw accuracy above the rule. The required complete-suggestion
precision >=90% failed. Automatic deployment remains disabled.

## The two errors

1. **v3-review-002, Benedict test: partial → complete.** The procedure correctly
   mentions reagent and heating, but says brick-red means sugar is absent and
   blue means sugar is present. The result matcher finds the right words without
   checking the interpretation's direction. Complete score: 0.955961.
2. **v3-review-014, reaction types: partial → complete.** Combination and
   decomposition are correct, but single and double displacement are swapped.
   Both definitions occur in the same sentence, allowing each type to borrow the
   other's matching words. Complete score: 0.956904.

These scores are uncalibrated, not correctness probabilities. Both mistakes
scored above 0.95, so a simple 0.90 or 0.95 score cutoff would not remove them.
A new cutoff chosen after examining this packet would require fresh validation.

## Interpretation and practical scope

The frozen candidate classified most of this new diagnostic packet correctly.
That supports retaining it as a candidate for a reviewer-assisted prototype.
It does not justify an automatic student-facing claim that a concept is complete
and scientifically correct. The remaining weakness is relation correctness,
not training runtime or model size. Every suggestion should continue to require
review, with its supporting text available for inspection.

This packet contains synthetic English text, including close paraphrases of
known concept/error families. It is not a random population sample and does not
measure actual handwriting/OCR accuracy. V2's 80% and V3's 93.33% were measured
on different packets and cannot establish a controlled 13.33-point improvement.
Do not describe this as 93.33% overall service accuracy.

Potential feature fixes would need to associate test outcomes with presence or
absence and bind each reaction name to its own process. If this packet informs
those changes, it becomes development data. Given the user's two-day constraint,
keep this candidate frozen while deciding the service's review-required workflow;
do not silently change its weights or claim patched-example results as a new test.

## Artifacts and integrity

- [Evaluation and screening checks](../ml-training/outputs/english-coverage-v3-human-review-01/evaluation.json)
- [All predictions and evidence](../ml-training/outputs/english-coverage-v3-human-review-01/decisions.json)
- [Two-error analysis](../ml-training/outputs/english-coverage-v3-human-review-01/error-analysis.json)
- [Preserved submitted review](../ml-training/outputs/english-coverage-v3-human-review-01/submitted-human-review.json)

Model SHA-256:
`d40a0ddae2d4b356dea986308a600bcd4817424f601877265e2ac21c8b3ccfac`.
Review SHA-256:
`406d1a2ac19f53136cfbc2d6b13d93cea282d1f7e37c61330f7b2a6e29b195e1`.
Packet content SHA-256:
`686f4579606bbf6ff4150fa54bff4f60f0227cf8d2537e9f6398e7b0584888e8`.

The frozen evaluator completed successfully using the command in
[the V3 preparation report](english-coverage-v3.md). This turn added only result
artifacts and documentation. The 66 previously passing focused tests were not
rerun because inference, training and evaluation code did not change.
