# English coverage version 3

Update: [Round 3 is complete](english-coverage-v3-human-review-01.md): 28/30 correct
(93.33%), macro-F1 0.932660. Two false-complete suggestions passed the safeguard;
complete precision was 83.33%, so the screening gate failed. The pending-review
wording below records the original preparation and freeze.

2026-10-06. V3 is trained and frozen for Round 3 review. It remains a CPU-only
logistic-regression prototype covering ten English science concepts, with a
separate evidence safeguard. Automatic service assessment remains disabled.

## What changed

Carrier evidence must occur in a clause about the matching semiconductor type;
the neighbouring type cannot supply its carrier words. Breathing pressure and
volume features require directional relationships. Chromatography features
check selected attraction relationships. Heat loss/gain paraphrases and English
possessives are handled more consistently. These are finite patterns and remain
vulnerable to unfamiliar wording and unhandled incorrect explanations.

The model uses the same 71 training rows, weights and source groups as V2:
41 original examples and 30 AI-author-labelled contrasts. Neither human review
is used as a fitting row, but both reviews informed feature development. C was
selected using grouped training CV from 0.1, 1 and 10; the selected value is 0.1.
Each fold fits its own TF-IDF vocabulary and scaler.

A separate policy withholds a raw **complete** suggestion when a required point
has incomplete lexical evidence or a concern is flagged. It does not relabel
the note partial. The API retains `rawModelStatus`, returns a null suggestion
when withheld, and always requires review. A null suggestion is not a fourth
trained class. Model accuracy and policy coverage are reported separately.

## Development results, not independent accuracy

| Check | Raw model | Fixed rule |
| --- | ---: | ---: |
| Grouped training CV | 64/71 (90.14%), macro-F1 0.902669 | 58/71 (81.69%) |
| First human review, now development | 29/30 | 24/30 |
| Second human review, now development | 29/30 | 27/30 |
| New Round 3 human review | Pending | Pending |

The old reviews total 58/60 correct, with one raw false-complete prediction.
The policy withholds that suggestion and one correct complete suggestion:
58/60 receive suggestions, with 57 correct among those 58. All 17 remaining
complete suggestions agree with the old labels. These numbers are development
checks after seeing the errors, not a fresh estimate of accuracy or a guarantee.

The remaining raw false-complete case is a reversed Benedict-test result
(`v2-review-002`). It is withheld because a required reagent point under-matches,
not because the model reliably understands the reversed result. This is an
incidental success of the safeguard. The correct semiconductor case
`challenge-019` is withheld by a concern pattern, and correct chromatography
case `challenge-025` is classified partial. These limitations are retained in
the frozen candidate rather than hidden by relabelling examples.

V3's CV uses the same rows as V2's 63/71 result, but the one-example difference
is small and both are development estimates. It does not establish a reliable
generalization gain. Neither human review measures handwriting/OCR quality.

Fitting and evaluation took 6.05 seconds excluding imports. The model artifact
is 1,005,588 bytes, and portable inference matches sklearn within 2.23e-16.
Verification: the 65-test combined suite passed, followed by all six v3 review
tests after adding a policy-denominator test: 66 distinct focused tests pass.
Tests cover relations, paraphrases, exact evidence offsets, portable inference,
scope restrictions, blinded packets, frozen input rejection, and abstention
accounting. No live-service files were changed by this iteration.

## Round 3

The user confirmed that real notes/reference answers are not currently available
and requested new text examples. [Open the new blind review](../ml-training/reviews/english-coverage-v3-review-2026-10-06/index.html),
or use http://127.0.0.1:8879/ while the local server is running. Save the completed
review as **english-coverage-v3-human-review.json** and return it in chat.
No judgments were entered by the agent; the page was verified at 0/30.

There are 30 new synthetic passages with no exact text duplicate in the 71-row
training snapshot or either older packet. They reuse familiar concept and
error families, including close paraphrases. This is a diagnostic test of those
families, not an independent population sample or a broad domain benchmark.
Author labels and model predictions are hidden. The model has not been run
on these examples. Model, packet and inference/scoring sources are hashed.

V3's predeclared screen explicitly applies complete precision to **suggestions
after the safeguard**: at least 90%, with at least five complete suggestions and
80% suggestion coverage. Raw classifier accuracy must reach 80%, macro-F1 0.75,
every class recall 70%, and accuracy must beat the fixed rule. This is a different
policy-aware screen from V2's raw-classifier screen; do not describe it as V2
passing. The evaluator also retains raw complete precision and raw errors.
Passing will not automatically deploy the candidate.

## Commands and artifacts

Run from the service repository. Outputs must be fresh directories.

```powershell
& ml-training/.venv/Scripts/python.exe -B ml-training/train_english_coverage_v3.py `
  --output ml-training/outputs/english-coverage-v3-reproduction-01

# Only after the completed Round 3 review is returned:
& ml-training/.venv/Scripts/python.exe -B ml-training/evaluate_english_review_v3.py `
  --model ml-training/outputs/english-coverage-v3-2026-10-06/model.json `
  --packet ml-training/reviews/english-coverage-v3-review-2026-10-06/packet.json `
  --review C:/Users/DLK/Downloads/english-coverage-v3-human-review.json `
  --output ml-training/outputs/english-coverage-v3-human-review-01
```

The JSON stdin adapter is `ml-training/english_coverage_v3_cli.py --model <path>`.
Input fields remain `noteText`, `conceptId`, `language: "English"` and
`scopeConfirmed: true`. Unsupported concepts/languages are rejected. Without
confirmed scope no suggestion is issued. `status` remains null in all cases.

Detailed training and development decisions:
`ml-training/outputs/english-coverage-v3-2026-10-06/`.
Model SHA-256:
`d40a0ddae2d4b356dea986308a600bcd4817424f601877265e2ac21c8b3ccfac`.
The review freeze manifest is in
`ml-training/reviews/english-coverage-v3-review-2026-10-06/frozen-evaluation.json`.
