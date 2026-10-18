# English concept coverage prototype

Current integration: [automatic model suggestions are connected to uploaded
notes and the mobile app](english-coverage-mobile-integration.md). The actual
note service and synthetic mobile demo are running locally.

[Reviewer-assisted service integration](english-coverage-service-integration.md)
is implemented, with assigned-note loading, saved-review history and verified
MongoDB persistence. The durable local demo uses a separate synthetic collection.

[The AI service-review ledger audit](english-coverage-ai-service-review-01.md)
reports 27/30 label agreement on synthetic OCR variants of training notes;
it is a development check rather than an independent human test.

Current candidate: [V3 scored 28/30 on Round 3](english-coverage-v3-human-review-01.md)
but failed the 90% complete-precision requirement (83.33%). It remains review-only.
Both earlier human reviews are development checks for this revision.

Previous candidate: [version 2 scored 24/30 on its fresh human review](english-coverage-v2-human-review-01.md)
and failed the required complete-precision screen.
The original artifacts and first review results below remain preserved.

Started 2026-10-06 under the user's English-only, two-day constraint. Any trained
ML model is acceptable, but useful accuracy is required. This is a new supervised
experiment, separate from the previous XLM-R and LoRA work. No existing files,
datasets, models, service behaviour or mobile behaviour were replaced.

Update: the completed human review has now been scored: **23/30 correct (76.67%),
macro-F1 0.773794**, with three partial notes incorrectly marked complete. See
[the human-review report](english-coverage-human-review-01.md). V1 remains disabled
for automatic assessment. The preparation account below records the original
experiment and review handoff; its pending-review wording is historical.

## What is implemented

- CPU-only TF-IDF word/character comparisons and 22 explicit rubric-coverage
  features, followed by a fitted three-class logistic-regression model.
- Ten draft concept rubrics: Benedict's test, Ohm's law, isotopes, sexual/asexual
  reproduction, reaction types, breathing mechanics, extrinsic semiconductors,
  heat-exchange calculations, chromatography, and electrical power.
- Sentence/window evidence across all submitted pages. Each required idea can
  find evidence on a different page; there is no maximum-page-status rule.
- Portable JSON weights, vocabulary, IDF, scaler and rubrics; no pickle required.
- Local JSON inference adapter. `present` is displayed as **complete**, relative
  to the named rubric. Scores are explicitly uncalibrated. Candidate lexical
  evidence is not described as verified scientific understanding.
- Unsupported concepts, non-English requests and empty input are rejected.
  Missing is never assigned when the submitted material's scope is unconfirmed.
  This experimental adapter always requires review and does not issue a live
  student-facing status.

## First run: facts and limits

Output: `ml-training/outputs/english-coverage-v1-2026-10-06/`.

The source contains 225 reviewed corrected English page/concept pairs overall;
**41** cover the ten selected concepts. These 41 examples span ten source student
groups and 35 notes: 13 present, 14 partial and 14 missing. All are synthetic and
AI-reviewed. Some targets have only a single synthetic training family.

Only corrected TRAIN pages were fitted. The existing raw/corrected pair weights
were combined on the corrected view (1 for present/missing, 2 for partial), so
duplicate views were not treated as independent observations. Existing strict
source admission and student/family split checks were reused unchanged.

Regularization C was selected from 0.1, 1 and 10 by leave-one-source-student-out
cross-validation entirely inside TRAIN. Each fold fitted its own TF-IDF and
scaler. The English augmentation families remain together within these groups.
No concept ID, target label, review rationale or annotated quote is a classifier
input. Rubrics were authored using curriculum definitions and TRAIN examples,
including their labels; **this makes the CV a development result, not an
independent assessment of the rubric-authoring process**. The same CV also
selected C, so its selected score is not a nested-CV estimate.

| Measurement | Result |
| --- | --- |
| Selected C | 0.1 |
| Grouped development accuracy | 35/41 = 85.37% |
| Grouped development macro-F1 | 0.854497 |
| Grouped recall, present / partial / missing | 12/13, 11/14, 12/14 |
| Training resubstitution accuracy | 36/41 = 87.80% |
| Fitting, grouped selection and evaluation time | 8.941 seconds (excludes imports/source admission) |
| Saved JSON model size | 941,804 bytes |
| Maximum reloaded probability difference | 2.22e-16 |

The existing English validation set covers **only one whole-note example** of
these ten concepts (partial), and **two pages** of that same concept (partial,
missing). All three decisions were correct, including the raw OCR page variants,
but these denominators cannot validate three-class accuracy. Do not report them
as evidence of a 100%-accurate model. They were historically exposed synthetic
validation examples. No original TEST examples were predicted or scored.

The predeclared validation screen failed for insufficient class coverage and
other unmet conditions. The model is **not approved for automatic assessment**.
The full evaluation retains all denominators, three-class confusion matrices,
constant and checklist baselines. Macro-F1 uses a fixed three-class denominator,
including classes absent from a slice. The CV report's training-majority reference
is a descriptive constant derived from all training labels, not a fold-fitted
baseline. Model CV predictions themselves are held out by group.

## Human review now ready

The user agreed to review 30 short examples. The packet is:

`ml-training/reviews/english-coverage-review-2026-10-06/index.html`

It opens directly in a browser without a server. A local-only preview is also
available at `http://127.0.0.1:8877/` while the preview process is running.

The packet contains new synthetic diagnostic examples across all ten concepts:
short explanations, paraphrases, complementary pages, omissions, related-topic
negatives, and misconceptions. They were authored after fitting, so this is a
deliberate diagnostic challenge rather than a randomly sampled test population.
The model and packet were hash-frozen before owner review. Neither the author's
labels nor model predictions are included in the review HTML or packet JSON.
No model scoring on these examples has been performed pending human review.

Review all 30, choose complete/partial/missing/unclear, explain any unclear choice,
enter initials, then save the completed review. Draft download and restore are
available, as is browser-local progress storage. Return the exported
`english-coverage-human-review.json` in the chat. Unclear examples are reported
separately and never silently given a label.

Human review provides owner-reviewed synthetic evidence, not independent teacher
certification or evidence about real handwriting. If these examples are later
used to change the model, they become development data and cannot remain a fresh
test. The next service-integration decision follows the reviewed error analysis.

## Commands

Run from the service root. Use a fresh output directory for every run.

```powershell
& ml-training/.venv/Scripts/python.exe ml-training/train_english_coverage.py `
  --preparation data/annotations/datasets/science-reviewed-contrastive-combined-01 `
  --rubrics ml-training/rubrics/english-science-coverage-v1.json `
  --output ml-training/outputs/english-coverage-new-run
```

Local inference accepts JSON with `noteText`, `conceptId`, `language: "English"`
and `scopeConfirmed: true` on stdin:

```powershell
Get-Content -Raw request.json | & ml-training/.venv/Scripts/python.exe `
  ml-training/english_coverage_cli.py `
  --model ml-training/outputs/english-coverage-v1-2026-10-06/model.json
```

After receiving the actual human review file (do not manufacture one):

```powershell
& ml-training/.venv/Scripts/python.exe ml-training/evaluate_english_review.py `
  --model ml-training/outputs/english-coverage-v1-2026-10-06/model.json `
  --packet ml-training/reviews/english-coverage-review-2026-10-06/packet.json `
  --review PATH-TO-COMPLETED-HUMAN-REVIEW.json `
  --output ml-training/outputs/english-coverage-v1-human-review-01
```

The scorer checks complete unique answers, matching concept IDs, unchanged packet
and model, and an explanation for unclear judgments. It reports the model,
unchanged rubric-rule baseline, all constant-class baselines, class metrics and
errors without fitting or deploying anything.

## Verification

21 focused tests pass. They cover cross-page evidence, exact quote offsets,
decimal preservation, word boundaries, scope/language handling, vocabulary
isolation, student/note/text leakage, unsafe model parameters, portable reload,
blind review packets and invalid/duplicate/incomplete review rejection. JavaScript
syntax passes. The actual inference CLI successfully loaded the saved artifact.
Browser rendering and next/previous navigation were verified without selecting
any human-review answers. No full service test run is claimed; live service code
was not modified.
