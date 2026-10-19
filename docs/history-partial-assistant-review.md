# History Partial review — 18 October 2026

**Superseded:** the candidate discussed below remains an archived experiment.
The subsequent [History V6 release](history-v6-grounded-release.md) resolves its
release-blocking regressions and includes explicit AI-reviewed training replay.
Refer to that report for the current model. The historical results below remain
unchanged for auditability.

The assistant completed the requested review of all 50 reserved History cases,
including the 30 displayed in the review page. The 13 underlying complete
transcripts, exact concept requirements and supplied error ledgers were checked.
This is an **assistant development review**, not human confirmation. The original
214 AI proposals and human-confirmation fields remain unchanged.

Twenty proposed labels were corrected in a separate, source-bound audit:

- 15 Missing → Partial: substantive coverage was present even though a required
  detail, date, explanation or second idea was absent.
- 5 Complete → Partial: required information was incomplete or contradicted.
  The fifth correction was added on a second audit pass: a note describes moving
  between capitals but also claims Dambadeniya, Yapahuwa and Kurunegala were one
  city. Revision 1 is preserved; revision 2 is the final audit.

The reviewed distribution is 3 Complete, 29 Partial and 18 Missing. Each positive
review retains exact transcript quotes, offsets, a rationale and the source hash.
Prehistoric information is not automatically evidence of protohistoric features.
An absent 125,000-year date does not erase otherwise meaningful habitation and
survival coverage, but prevents Complete where that date is required.

## Model change and measured limits

The best candidate updates the existing History coverage checker using the same
frozen MiniLM encoder and 94 concept rubrics. A small shared linear head learns
coverage of each required point. Complete requires all points; meaningful support
for only part of a concept gives Partial. This is an offline candidate version of
the History checker, not an additional deployed service.

Features distinguish names, periods, numbers, assertions, questions and required
clauses. Exact candidate quotations remain available. A suspicious OCR year is
flagged for checking rather than silently corrected. Relevant sweeping claims
such as all named capitals being one city withhold Complete for review; this
does not automatically classify the claim as false or count abstention as Partial.

The selected head fits public rubric contrasts, original training-only replay and
164 weak AI-labelled new notebook cases. None of the 50 audited notebook texts
were fitted into **this selected candidate**. They were exposed during development
and model selection, so their results are not independent accuracy.

| Reviewed label | Current V5.1 | Selected candidate |
| --- | ---: | ---: |
| Complete | 3/3 | 3/3 |
| Partial | 5/29 | 23/29 |
| Missing | 18/18 | 16/18 |
| All matching suggestions | 26/50 | 42/50 |

On these 50 cases, incorrect Complete suggestions fall from 7 to 0, with 2
candidate suggestions withheld. Withheld suggestions count as nonmatches.
Four Partial cases still become Missing; two Missing cases become Partial.
These are unresolved model errors, not evidence that the audit should be changed.

All 12 packaged presentation checks pass. The older exposed 24-case human-review
development set improves from 22 to 24 matching suggestions. However:

| Older synthetic check | V5.1 | Candidate |
| --- | ---: | ---: |
| Test examples | 330/340 | 309/340 |
| Validation examples | 328/338 | 316/338 |

The candidate produces 7 incorrect Complete suggestions in the older test set
and 3 in validation. Related information is sometimes mistaken for a required
fact. A fresh, small assistant-authored post-fit check gives 17/18 matching outputs;
an unrelated reminder about bringing a history book is incorrectly Partial.
These checks are synthetic text checks, not real handwritten-note accuracy or an
OCR evaluation. None of these scores establish production reliability.

**Do not promote this candidate yet.** The app's History V5.1 pins, production
bundle and Science model remain unchanged. The Partial improvement is substantial,
but publishing this candidate would regress other History behavior. Further work
must reduce related-topic false positives while preserving the Partial gains.
There is no additional human-review request blocking this work.

An exploratory concept-head version did fit the corrected 50 labels as explicitly
AI-reviewed training examples. It reached only 35/50 training/development matches
and was rejected. Those fitted results are never reported as held-out accuracy.
Other exploratory candidates are also not active or approved for publication.

## Artifacts and verification

Selected frozen candidate and all evaluation reports:
`ml-training/outputs/history-partial-reviewed-candidate-2026-10-18/`.

- `model.json`: SHA-256
  `3d8a1cf30e6864a5dcee6ab96c921dd0b6bf591778c0f6f857875db9362630d2`.
- `adjudication.json`: final assistant audit, revision 2.
- `decisions.json`: all 50 notes, audit decisions, baseline and candidate outputs.
- `report.json`, `legacy-regressions.json`, `fresh-checks.json`, `regression.json`:
  results and exact failures.
- `protocol.json` and `source/`: model, dataset, audit, training-snapshot and source
  hashes with frozen source copies. `runtimeChanged` is false.
- `assistant-review-results.html`: readable review results; no human-confirmation
  checkboxes are selected or fabricated.

The selected training snapshot is preserved in
`ml-training/outputs/history-coverage-v5.3-point-support-2026-10-18-05/`.
Source dataset SHA-256 remains
`5fe60e3fb4006ee8319a4276e6cf3f0ef29ea7e46801d283858badd30ea50dc1`.

33 targeted Python checks passed, covering aggregation, numerical and period
support, names, OCR review, exact quotations, review provenance, invalid model
parameters, training separation, existing review policy and archive integrity.
All changes are within the Notes service repository. No other member's function,
mobile sign-in code, runtime model pin or student record was changed.
