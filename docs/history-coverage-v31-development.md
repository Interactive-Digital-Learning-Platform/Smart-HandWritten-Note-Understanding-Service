# History V3.1 development — 2026-10-14

History V3.1 is a separately trained experimental candidate. It improves handling of unanswered prompts and retains review safeguards. It has not been activated in the app; the live Science model remains unchanged.

## Changes and training provenance

The original 27 History V2 features are extended with two signals: whether the text contains only unanswered prompts, and the proportion of substantive assertions. Questions followed by actual explanatory answers are distinguished from prompt-only material. A targeted check caught a short answered question being misread as unfinished; V3.1 recognizes the relevant assertion verbs. These are finite lexical heuristics, not a complete English grammar or semantic checker.

Training uses 721 admitted corrected source examples, 16 AI-reviewed diagnostic examples (weight 4), the prior 12 AI-labelled diagnostic examples (weight 4), and 188 new prompt-only contrasts generated from concept names and full rubric requirements. Those prior 12 cases are now development/training cases. No validation/test page was fitted. Vocabulary, scaling and coefficients are fitted on these 937 training records. C = 1 was selected on 338 development-validation records, excluding the two previously flagged ambiguous labels.

Two safeguards supplement the trained classifier: non-Missing predictions on prompt-only material are withheld; raw Complete predictions with possible source-category reversals, matched negation, or a mismatch between a rubric's required year and its candidate evidence are withheld. A date mismatch is flagged for review, not independently historically adjudicated. Raw classifier outputs remain available. Withheld results are unlabelled and never counted as correct Partial/Missing predictions.

## Checks and results

The intermediate V3 matched 17/22 new AI diagnostic examples, compared with V2's 14/22 on exactly the same examples. That exposed full-keyword prompts and a wrong year falsely predicted Complete. Those 22 examples informed V3.1 policy development and are no longer a fresh independent check. V3.1 matches 20/22 final suggestions on that development set, with one withheld and no remaining false Complete suggestion. Both the original failure reports and intermediate model remain preserved.

After V3.1 was frozen, 18 additional AI-authored examples were scored across five targets spanning Grades 10 and 11. None of those 18 was used to fit, select or design the V3.1 policy. Results:

| Outcome against AI expectations | Count |
|---|---:|
| Exact final suggestion matches | 15/18 |
| Withheld for review | 1/18 |
| Other label mismatches | 2/18 |
| Incorrect Complete suggestions | 0/18 |

The two mismatches are complete paraphrases about British strategic interests and Colebrooke-Cameron reforms labelled Partial. A wrong-year example had raw Complete withheld for review; that was not counted as a Partial match. The new texts and expected labels are still synthetic and AI-authored; zero observed false Complete suggestions in 18 examples does not establish a general precision guarantee.

The 28 unambiguous submitted-review development cases still match. On the exposed 340-example synthetic regression set, raw agreement is 338/340 (99.41%), with three final suggestions withheld and one remaining false Complete suggestion. This regression score is not fresh human-reviewed or real-handwriting accuracy. A review notice alone does not establish readiness for reliable assessment.

## Verification

Training took 14.90 seconds. Portable JSON probabilities matched fitted scikit-learn output within 2.23e-16. Thirteen targeted checks passed, covering prompts versus answered questions, scoped reversal detection, negation, exact Unicode evidence spans, date concerns, abstention and input/artifact validation. The reviewer form's embedded JavaScript passed syntax validation. Model SHA-256: `d54f2fc02be34f911e6a4ac36ed0fc1c6fec9159b94698606326d12ca3f8f68e`.

Artifacts are in `ml-training/outputs/history-coverage-v3.1-2026-10-14/`: model, rubrics, protocol, development snapshot, evaluation, decisions, policy-development checks, new AI checks and an 18-example review packet. Older V1, V2 and intermediate V3 artifacts remain intact.

## Next review

`new-review.html` provides the 18 new texts with proposed criteria and no intended labels/model predictions. The reviewer chooses Human, Human with AI assistance or AI explicitly, reviews the labels, and downloads `history-v31-reviewed.json`. The JSON template is also available. These examples have already been AI-scored, but no human labels entered development. Independent subject review and clearer criteria are needed before integration; any subsequent tuning on those labels makes this packet development material too. Real photographed notes need their own OCR and full-note aggregation evaluation.
