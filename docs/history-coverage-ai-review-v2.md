# History AI review and V2 candidate — 2026-10-14

The supplied `history-coverage-ai-reviewed.json` contains all 30 packet labels, with the original IDs, concepts, criteria and text unchanged. Its annotation metadata explicitly identifies an AI reviewer, says labels are not independently human-validated, and explains that `humanLabel` is a compatibility field. Intake preserves the uploaded bytes and records one syntax repair: a missing closing quote after the reviewer name. The submitted `synthetic: false` conflicts with known packet provenance; the normalized development review retains `synthetic: true` without modifying the user's original file. Source SHA-256: `25208bf9af48e2c6c2b4a17ad9c001bf47df4ba9933b45317903278a3840ef72`.

V1 agreement with the submitted AI labels was 22/30 (73.33%), macro F1 0.738889; Complete precision was 8/11 (72.73%). The same three incorrect classification/negation cases were falsely labelled Complete. Excluding two cases explicitly recommended for adjudication gives 21/28 (75%). These are scores against AI labels on previously exposed synthetic development examples, not human accuracy.

## V2 changes

- Revise the source classification, chronicle and archaeological preservation rubrics to represent the reviewed requirements and common wording more directly.
- Add five features to the original 22: question fraction, declared keyword lists, possible source-category reversal, negation of a matched requirement, and formatted numeric token count. These are lexical signals, not universal fact verification.
- Fit the original 721 admitted corrected training examples plus 16 reviewed diagnostic examples with weight 4. No validation page was added to training.
- Apply the reviewed labels to relevant validation examples, excluding both ambiguous cases. Select C on 338 development-validation records; C = 1. The prior test set is reused only as an exposed synthetic regression set.
- Withhold a raw Complete suggestion when possible reversal/negation concerns exist. A withheld result is unlabelled and review-required; it is not counted as a successful Partial prediction.

The two unresolved cases are `hist-note-089-p001-hist-g11-l02-c04-corrected` (whether the political consequences are sufficiently implicit) and `hist-note-097-p001-hist-g11-l03-c01-corrected` (whether substantive revival examples count as Partial without chronology/political transition). The latter was the only submitted label change among dataset validation examples; it was excluded rather than silently overriding the original dataset.

## Results and interpretation

| Set | Raw agreement | Withheld | Remaining false Complete suggestions |
|---|---:|---:|---:|
| 28 unambiguous AI-review development cases | 28/28 | 0 | 0 |
| 338 synthetic validation-development cases | 337/338 | 1 | 1 |
| 340 previously exposed synthetic test regression cases | 337/340 | 3 | 2 |

Sixteen review cases were directly fitted and the rubrics/features were revised using the review. Therefore 28/28 is development agreement, not new independent accuracy. Withholding excluded three actual Complete cases on the exposed test set; the policy has a practical cost and does not eliminate every false Complete.

After V2 was frozen, 12 new AI-authored diagnostic paraphrase/prompt/negation examples were scored. Only 9/12 final suggestions matched AI expectations. One complete source-classification paraphrase was predicted Partial. One unanswered source-classification prompt was falsely predicted Complete. Another unanswered chronicle checklist had raw Complete withheld for review, which was not scored as a Missing match. This fresh diagnostic check is still synthetic and AI-labelled, and these observed failures become development cases if used in subsequent changes.

V2 remains **experimental and disabled for app integration**. The live Science model was not replaced. Independent History review, clarification of the two ambiguous criteria, richer unconnected prompts/paraphrases, and fresh independently authored examples remain necessary before a practical readiness claim.

## Verification and artifacts

Training finished in 16.38 seconds. Portable JSON inference matched scikit-learn probabilities within 2.23e-16; evidence and concern quotes matched exact source offsets throughout evaluation. Four targeted checks passed for scoped relation concerns, negation/correction distinction, Unicode evidence offsets, abstention, invalid input/artifact rejection and training/validation provenance. Artifact SHA-256: `f2ac10df411856d37acb041362127b60412ab26a587cdaebf23fedfe53064c08`.

Review intake: `ml-training/outputs/history-ai-review-01-2026-10-14/` contains original bytes, normalized AI labels, audit and V1 decisions. V2 artifacts: `ml-training/outputs/history-coverage-v2-2026-10-14/` contains model, rubrics, protocol, evaluation, decisions and new diagnostic checks. Original V1 files remain intact. Reproduction scripts: `import_history_review.py`, `train_history_coverage_v2.py`, `evaluate_history_v2_challenges.py`; output directories must be fresh.
