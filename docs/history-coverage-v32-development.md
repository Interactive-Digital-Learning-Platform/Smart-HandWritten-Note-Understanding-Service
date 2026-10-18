# History V3.2 development — 2026-10-15

History V3.2 addresses the two complete Grade 11 answers missed in the submitted V3.1 review. It remains an offline experimental candidate. History suggestions were not enabled in the app, and the live Science model was not replaced.

## Cause and correction

The original automatically tokenized requirements demanded incidental or inflected words as separate evidence groups: `valued`, `island`, `strategically`, `important`, `especially`, `established`, `reshaped`. Correct alternatives such as “Sri Lanka,” “valuable,” “strategic importance,” “establishing” and “reshaping” reduced lexical coverage. The complete British strategic interests answer received only 0.625 for each facet; the complete reforms answer received 0.5 for the councils/divisions facet.

Two rubrics now group equivalent expressions and keep the major required components: Britain's interest in Sri Lanka's sea-route location; Trincomalee's naval-security role around India; reforms in 1833 restructuring colonial government; and councils plus administrative divisions. Incidental words are no longer independent requirements. The numerical year remains required. These are draft lexical equivalences, not universal semantic adjudication.

The architecture remains 29 rubric/TF-IDF/prompt features plus scaled multinomial logistic regression. V3.1 inference and review safeguards are unchanged. Training uses 955 records: 721 original admitted corrected examples, 16 earlier AI-reviewed contrasts, 12 prior AI diagnostic examples, 188 generated prompt contrasts, and the 18 submitted human-review examples (weight 4). C = 1 was selected on the same 338 development-validation examples, with the two earlier ambiguous labels excluded.

The 18 submitted review texts are now training/development material for V3.2. Their original V3.1 result of 15/18 (83.33%) is preserved exactly and remains a result for V3.1; it is not replaced by the new development score. The submission declares a human reviewer; identity, qualifications and independence were not externally verified.

## Results

| Set | V3.1 | V3.2 | Interpretation |
|---|---:|---:|---|
| Submitted 18-example review | 15/18 | 18/18 | V3.2 fitted these labels; development only |
| Same 24 new AI-authored examples | 17/24 | 23/24 | New diagnostic comparison, not independent human accuracy |

The 24 new examples were written and scored after V3.2 was frozen and were not fitted or used for selection. They span six proposed targets across Grades 10 and 11, including complete/partial paraphrases, unanswered prompts, source-category reversals, negation and an incorrect date. Neither version made a final false Complete suggestion in this small check. V3.2 fixes the additional complete paraphrases and keeps one-facet answers Partial.

One mismatch remains: “In 1933 the reforms reorganised British colonial administration. They created councils and revised administrative boundaries.” The AI expectation is Partial because some content is correct but the year is wrong. V3.2 returns Missing, with an explicit possible-date-mismatch concern. That is still a classification failure. It was retained, not relabelled or subsequently fitted into this candidate.

On the exposed synthetic test regression set, V3.2 raw agreement remains 338/340 (99.41%); one final false Complete remains and three suggestions are withheld. The earlier 28 unambiguous AI-review development labels still match. Such regression/development results do not establish reliable accuracy over all 94 targets or real handwriting.

## Verification and next use

Training took 16.15 seconds. Portable model probabilities agreed with fitted scikit-learn output within 3.34e-16. Quotes and concern offsets were checked across regression scoring and the new diagnostic comparison. Targeted checks verify the two reviewed fixes, one-facet retention, prompt/negation/date safeguards, and preservation of the original artifact and review score.

Model SHA-256: `51fd4d45c2294e373f4fb435fa5898b22e77842953cb0c823d4d05829ba44ae2`. Artifacts are in `ml-training/outputs/history-coverage-v3.2-2026-10-15/`: model, rubrics, protocol, development snapshot, evaluation, decisions and `new-paraphrase-checks.json`. Reproduction scripts: `history_grade11_rubrics.py`, `train_history_coverage_v32.py`, `check_history_v32.py`. Original files remain intact.

V3.2 is the improved candidate for a broader, fresh subject review and real uploaded-note test. It is not automatically promoted from a small AI diagnostic score. The missing-versus-partial error, live curriculum mappings, and page-to-whole-note behavior remain to be addressed or evaluated before History app integration.
