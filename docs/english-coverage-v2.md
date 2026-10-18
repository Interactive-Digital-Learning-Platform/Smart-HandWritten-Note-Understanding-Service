# English coverage model, version 2

Update: [the fresh human review is complete](english-coverage-v2-human-review-01.md):
24/30 correct (80%), macro-F1 0.80, with three false-complete suggestions.
The screening gate failed on complete precision (70% versus required 90%).
The preparation and pending-review wording below records the original freeze.

2026-10-06. A CPU-trained logistic-regression candidate for the same ten English
science concepts, with a portable JSON model and a local inference adapter.
The service's automatic assessment remains disabled for this experiment.

## Changes and evidence

V1's human review scored 23/30, including three false-complete suggestions.
V2 replaces whole-window word matching with local clause evidence, selected
relation and negation patterns, explicit watt/kilowatt conversion checks, and
checks for incorrect numeric products. The power rubric now states the
conversion requirement separately. These are finite lexical checks, not a
general scientific reasoning or contradiction detector.

The trained classifier uses 18 coverage and TF-IDF similarity features. Training
contains 41 original corrected English examples plus 30 new AI-author-labelled
contrast examples, across ten source groups. Each new concept contrast is grouped
with its existing augmentation source during cross-validation. No human-review
example is used as a fitting row, but its errors informed the features, rubrics,
and synthetic training design.

| Check | Learned model | Checklist rule |
| --- | ---: | ---: |
| Grouped training CV, 71 examples | 63/71 (88.73%), macro-F1 0.886473 | 55/71 (77.46%) |
| First human review, now development data | 30/30 | 26/30 |
| Fresh blind review, 30 new examples | Pending | Pending |

The selected regularization is C=1 from 0.1, 1, and 10. Each fold fits its own
TF-IDF vocabulary and scaler. Source-group separation reduces direct source
overlap, but rubric/feature authoring and C selection used development evidence.
The CV number is therefore a model-selection result, not independent test
accuracy. The old 30/30 is a regression check after addressing known errors,
not a claim of 100% accuracy. V1 and V2 CV scores also use different training
sets and should not be treated as a controlled improvement comparison.

Fit plus evaluation took 6.94 seconds, excluding imports and source admission
checks. The artifact is 1,000,507 bytes. Portable JSON inference matched sklearn
within 4.44e-16. All 46 focused v1/v2 and review-pipeline tests passed. The local
CLI smoke test correctly suggested partial for a note describing only asexual
reproduction, with the sexual-reproduction point unsupported.

## Fresh review handoff

Open [the Round 2 review](../ml-training/reviews/english-coverage-v2-review-2026-10-06/index.html)
in a browser, or use http://127.0.0.1:8878/ while the local server is running.
It has 30 shuffled synthetic examples, no displayed author labels or model
predictions, a draft checklist, four review choices, and optional comments.
Use **Unclear / checklist issue** with a reason when appropriate. Save the
completed file as `english-coverage-v2-human-review.json` and return it in chat.
The page was opened and verified at 0/30 reviewed; no judgments were entered.

The candidate, packet, and relevant inference/scoring source files were hashed
before the new review. The new examples have not been predicted or scored.
The evaluator rejects a different packet, model, or changed frozen source. It
excludes unclear examples transparently and never refits from review labels.
The author-labelled challenge file is kept separate from the blind page; do not
consult it while reviewing. As before, these examples are synthetic. They do not
establish accuracy on photographs, OCR errors, or actual student submissions.

Predeclared screening targets are accuracy >=80%, macro-F1 >=0.75, every class
recall >=70%, complete precision >=90%, and accuracy exceeding the checklist
rule. Passing a small diagnostic screen does not trigger automatic deployment.
Before broader use, collect real English student notes with independently
reviewed labels and check the entire OCR-to-coverage pipeline.

## Reproduction and scoring

Run from the service repository. Use a new output directory for every run.

```powershell
& ml-training/.venv/Scripts/python.exe -B ml-training/train_english_coverage_v2.py `
  --preparation data/annotations/datasets/science-reviewed-contrastive-combined-01 `
  --rubrics ml-training/rubrics/english-science-coverage-v2.json `
  --contrasts ml-training/data/english-coverage-v2-training-contrasts.json `
  --development-packet ml-training/reviews/english-coverage-review-2026-10-06/packet.json `
  --development-review ml-training/outputs/english-coverage-v1-human-review-01/submitted-human-review.json `
  --output ml-training/outputs/english-coverage-v2-reproduction-01

# Run only after the user completes and returns the new review.
& ml-training/.venv/Scripts/python.exe -B ml-training/evaluate_english_review_v2.py `
  --model ml-training/outputs/english-coverage-v2-2026-10-06/model.json `
  --packet ml-training/reviews/english-coverage-v2-review-2026-10-06/packet.json `
  --review C:/Users/DLK/Downloads/english-coverage-v2-human-review.json `
  --output ml-training/outputs/english-coverage-v2-human-review-01
```

Local inference uses `english_coverage_v2_cli.py --model <model.json>` with a
JSON object on stdin: `noteText`, `conceptId`, `language: "English"`, and
`scopeConfirmed: true`. It returns an uncalibrated `suggestedStatus`, evidence,
and `reviewRequired: true`, while `status` remains null. Without confirmed note
scope it returns no suggestion. Unsupported concepts/languages are rejected.
This adapter does not perform OCR or connect itself to the live service.

The model SHA-256 is
`594164b4e2217dd6e39a394badbd8c6f5e186776242049e51e2ca7c5ddb4b6d3`.
Detailed artifacts are in `ml-training/outputs/english-coverage-v2-2026-10-06/`;
the review freeze manifest is in
`ml-training/reviews/english-coverage-v2-review-2026-10-06/frozen-evaluation.json`.
