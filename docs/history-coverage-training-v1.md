# History coverage candidate — 2026-10-14

A separate English History logistic-regression candidate was trained locally in 17.13 seconds. It covers the 94 proposed concept targets supplied with the dataset. The live Science V3.1 classifier was not replaced and History suggestions have not been enabled in the app.

## Method

The model uses 22 rubric coverage and word/character TF-IDF similarity features, a standard scaler and multinomial logistic regression. The 85 newer concept criteria supply two explicit facets each. Nine retained pilot concepts were decomposed into draft requirements for this experiment. Requirement tokens become lexical phrase groups; this is an experimental lexical representation, not educator-approved semantic adjudication. Only concept criteria and note text enter feature extraction, not review comments, evidence annotations or intended labels.

Use one corrected example per page/concept, with unit weight equivalent to the total weight of the two supplied paired half-weight views. Fit vocabulary, IDF, scaler and classifier on the 721 admitted train examples from 12 fictional students. Choose C from 0.01, 0.1, 1 and 10 on 340 validation examples from three different students; selected C = 1. Evaluate once on 340 test examples from three other students. A secondary simulated-raw test uses paired views of the same test examples and is not a separate independent sample. Page judgements are not whole-note judgements.

## Supplied synthetic split results

| Measure | Result |
|---|---:|
| Corrected test agreement with AI labels | 337/340 (99.12%) |
| Corrected test macro F1 | 0.990207 |
| Complete precision | 96.55% |
| Complete / partial / missing recall | 100% / 98.81% / 98.84% |
| Majority-baseline accuracy | 50.59% |
| Fixed lexical-rule baseline accuracy | 95.88% |
| Validation accuracy | 99.41% |
| Simulated-raw test accuracy | 99.12% |

One partial and two missing examples were predicted Complete. Portable JSON inference agreed with the fitted scikit-learn probabilities to within 2.23e-16, and quoted evidence offsets were checked during evaluation. Artifact size is 1,038,343 bytes. SHA-256: `c847bbeb6bd8cc18b3f0b910df75f519180af29d95287527209526640efd3c35`.

## New diagnostic failures

After the artifact was frozen, 16 new AI-authored paraphrase/heading/incorrect-relation/negation examples were scored against the supplied proposed criteria. Only 9/16 matched the AI's expected labels. These expectations are diagnostic, not independently verified historical ground truth. Three examples expected Partial were labelled Complete:

- A source-classification answer swapped literary documents and archaeological physical remains.
- A chronicle answer denied authorship and later continuation while retaining the expected words.
- A preservation answer explicitly advised against protecting archaeological remains.

The failed cases were retained in `diagnostic-challenges.json`. None was fitted into this candidate. A high score on reusable synthetic templates does not establish practical semantic correctness. This candidate is **not ready for app integration**. Its numerical synthetic checks pass the predeclared thresholds, but independent review is absent and these diagnostic failures undermine readiness. Future tuning on these cases makes them development examples; the original synthetic test is also now exposed for subsequent candidates.

## Review and next development

A 30-example reviewer packet contains the 16 diagnostic examples plus 14 varied Grade 11 validation examples. `human-review.html` provides a local form and downloads `history-coverage-human-review.json`; `human-review-template.json` is the equivalent editable JSON. Intended labels and model predictions are omitted. The proposed criteria themselves require subject review. These already-scored examples are development material, not a new blind generalization benchmark even if a human labels them without seeing model outputs.

Review those labels/criteria before the next feature revision, add paraphrase and incorrect-relation contrasts, and obtain fresh independently authored human-labelled examples for final evaluation. Verify mappings to the service curriculum before integrating a candidate. The supplied complete-note references need a separate aggregation evaluation; this run trains page coverage only.

All artifacts: `ml-training/outputs/history-coverage-v1-2026-10-14/` (`model.json`, `rubrics.json`, `protocol.json`, `evaluation.json`, `decisions.json`, `diagnostic-challenges.json`, and reviewer files). Reproduction: `ml-training/train_history_coverage.py`, `ml-training/evaluate_history_challenges.py`, `ml-training/build_history_review.py`. The training command requires a fresh output directory to preserve existing experiments.
