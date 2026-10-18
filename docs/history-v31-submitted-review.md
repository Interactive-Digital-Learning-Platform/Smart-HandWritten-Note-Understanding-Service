# History V3.1 submitted review — 2026-10-15

The returned `history-v31-reviewed-anura.json` contains all 18 expected examples. IDs, note texts, concept names, IDs and criteria match the original packet exactly. All labels are valid. The file declares reviewer name `anura`, reviewer type `Human Reviewer`, independent human review and hidden intended labels/model outputs. These are recorded as reviewer declarations; reviewer identity, qualifications and review independence were not externally verified. This differs from the prior packet, which explicitly declared an AI reviewer.

## Frozen evaluation

The model and inference-source hashes were checked against the original V3.1 protocol, and predictions matched the previously frozen output exactly. No fitting, feature revision, criterion change or app activation occurred. The returned labels were not added to training. Source-file SHA-256: `7ffab3871e80693db4df5d501597bb6493e42a88526c5155452f77a0dfa920f4`; model SHA-256: `d54f2fc02be34f911e6a4ac36ed0fc1c6fec9159b94698606326d12ca3f8f68e`.

| Outcome | Count |
|---|---:|
| Exact final suggestion agreement | 15/18 (83.33%) |
| Final suggestions withheld | 1/18 |
| Complete answers labelled Partial | 2/5 complete answers |
| Correct final Complete suggestions | 3/3 |
| Complete-answer recall | 3/5 (60%) |
| Correct Partial suggestions | 7/8 partial answers (one withheld) |
| Correct Missing suggestions | 5/5 |

Among the 17 non-withheld suggestions, 15 agree with the review (88.24%). This excludes an abstention and must not be reported as overall accuracy. The raw classifier makes four Complete predictions, of which three agree with the reviewer; its 75% raw Complete precision improves to 3/3 among final Complete suggestions because the date safeguard withholds the incorrect one. Zero observed final false Complete suggestions in three final Complete predictions does not establish a reliable precision guarantee.

Final confusion matrix: rows are reviewed Complete/Partial/Missing; columns are final Complete/Partial/Missing/Withheld.

| Reviewed label | Complete | Partial | Missing | Withheld |
|---|---:|---:|---:|---:|
| Complete | 3 | 2 | 0 | 0 |
| Partial | 0 | 7 | 0 | 1 |
| Missing | 0 | 0 | 5 | 0 |

## Remaining issues

- `history-v31-fresh-10`: complete British strategic interests explanation is labelled Partial.
- `history-v31-fresh-13`: complete Colebrooke-Cameron reforms explanation is labelled Partial.
- `history-v31-fresh-18`: a wrong-year answer is correctly reviewed as Partial, but the classifier's raw Complete is withheld rather than converted to Partial. The safeguard prevents the final incorrect Complete label; it does not solve the underlying classification.

The submitted labels all agree with prior AI expectations. These texts were not used to fit or select V3.1 or to design its policy, but had already been diagnostically scored by AI. They are only 18 synthetic typed texts across five of the 94 proposed targets. This is a small submitted-review evaluation, not a demonstration of broad History accuracy or handwriting/OCR performance. The review does not justify app activation yet. Readiness-screen percentages recorded in the report are diagnostic comparisons, not newly pre-registered benchmark criteria.

The next revision should improve recognition of complete Grade 11 paraphrases while preserving the prompt, negation and date checks. If these labels or examples guide that revision, treat them as development material thereafter and evaluate the revised model on fresh examples. Preserve this frozen V3.1 result for comparison.

## Saved artifacts

`ml-training/outputs/history-v31-submitted-review-2026-10-15/` contains the exact original submission, `evaluation.json`, and `decisions.json` with predictions, comments and evidence. Scoring script: `ml-training/evaluate_history_v31_review.py`. Six targeted validation checks cover unchanged packet acceptance, content/criterion tampering, invalid labels, duplicate IDs and contradictory reviewer provenance. Evidence and concern spans were validated during scoring.
