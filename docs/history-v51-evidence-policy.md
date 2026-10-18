# History V5.1 evidence review — 2026-10-15

V5.1 adds a conservative evidence review policy to the frozen V5 semantic-core candidate. It does not retrain the encoder or linear head. Raw scores, raw predicted labels, weights, vocabulary, rubrics and feature scaling remain unchanged. The candidate is still offline and experimental; no app activation or production routing was changed.

## Audited causes and policy

Four false Complete suggestions in the exposed synthetic test regression set had two recurring causes:

- For downfall of Polonnaruwa and Buddhist revival/schooling, the strongest semantic candidate for a required explanation was the concept heading itself. Topic similarity was mistaken for substantive support.
- For Kandyan annexation and the 1972 constitution, the semantic candidate omitted the required year or concerned a different period. The existing date check examined a different lexical quote and missed the gap in the semantic evidence.

Across all 94 rubrics, the new policy flags a semantic passage that is only a registered concept title. It also flags an explicitly required four-digit calendar year absent from the semantic passage used for that requirement. The latter is a review signal, not a verdict about the entire note or a general date-language parser. A correct explanation with a year stated elsewhere or spelled in words can require manual review. Topic-title recognition is finite and does not cover every possible heading form.

If the raw classifier says Complete and either signal is present, the final suggestion is withheld. It is never forced to Partial or Missing. The exact semantic passage, offsets, requirement and reason are recorded for review. The raw classifier may still be wrong even when this safeguard prevents displaying Complete.

## Before/after checks

| Set | V5 final false Complete | V5.1 final false Complete | V5/V5.1 final matches | V5/V5.1 withheld |
|---|---:|---:|---:|---:|
| Exposed synthetic test (340) | 4 | 0 | 330 → 330 | 3 → 7 |
| Exposed synthetic validation (338) | 5 | 1 | 328 → 328 | 1 → 5 |
| Exposed submitted human review (24) | 0 | 0 | 22 → 22 | 2 → 2 |
| Earlier new-topic AI check (20) | 0 | 0 | 18 → 18 | 2 → 2 |

Arrows show V5 counts followed by V5.1 counts. Overall exact matches did not increase: the unsafe suggestions became review cases. All previously correct Complete suggestions were retained in these comparisons. Complete recall is unchanged: 81/84 on the exposed test, 86/87 on validation, 8/8 on the human-review development comparison and 6/6 on the 20-example AI set.

One validation false Complete remains (`hist-note-129-p001-hist-g11-l07-c03-corrected`): a related statement about the French Revolution is accepted for a more specific causal requirement. Similarity plus heading/date checks does not establish logical entailment. Do not claim that all false Complete errors have been eliminated.

## New post-policy checks

Ten additional AI-authored examples were created and scored after the policy was frozen; none was fitted or used to design this policy. They include complete explanations, heading-only support, related material, missing dates and neighbouring constitutional periods. Both versions match 7/10 AI expectations. V5 makes three final false Complete suggestions; V5.1 withholds all three and retains all five expected Complete answers. Its three abstentions remain non-matches, not successful Partial/Missing classifications. These small synthetic checks are not independent teacher-labelled or real-handwriting accuracy.

## Verification and artifacts

Raw labels and scores were compared across all four before/after sets and are identical. Exact evidence offsets were checked. Seven targeted tests passed for heading versus explanation, required dates, unchanged learned parameters, all four audited abstentions and unchanged Complete recall. No probability threshold was tuned.

Model artifact SHA-256: `12ba94e87415adb0ceb851919a6e87bc5d36e8535f0539352b450bd104e368e8`. The new version is `history-coverage-v5.1-review-policy-2026-10-15`; its head parameters remain identical to V5's. Artifacts live in `ml-training/outputs/history-coverage-v5.1-review-policy-2026-10-15/`, including the parent/source hashes, model, per-set decisions, evaluation and `new-ai-evidence-checks.json`. Original candidate files and review results remain intact.

Scripts: `build_history_v51_policy.py`, `check_history_v51_policy.py`, `check_history_v51_fresh.py`. Runtime policy: `src/smart_note_training/history_semantic_review.py` under `ml-training/`. The encoder/runtime requirements remain those recorded for V5.

The next practical evaluation needs fresh subject review and real English handwritten-note images with reference transcriptions and concept scope. Real-image OCR, whole-note aggregation and verified live History curriculum mappings remain pending. V5.1 is a safer review-required candidate; it is not an authoritative grader.
