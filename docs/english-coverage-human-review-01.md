# English coverage: first human-reviewed challenge

Scored 2026-10-06 against the completed review supplied by the user. All 30
answers were valid and none were unclear. The model and review packet matched
the hashes frozen before review. No fitting, threshold adjustment, relabelling,
rubric change or service deployment occurred during this evaluation.

## Result

| Method | Correct | Accuracy | Macro-F1 |
| --- | ---: | ---: | ---: |
| Frozen coverage logistic regression | 23/30 | 76.67% | 0.773794 |
| Frozen checklist rule | 21/30 | 70.00% | 0.697848 |
| Always partial, best constant on this challenge | 11/30 | 36.67% | 0.178862 |

The best constant is a descriptive challenge baseline, not a training-derived
majority selection. The model's advantage over the rule is two examples on this
small set; it does not establish a robust population-level improvement.

| Reviewed class | Correctly detected | Recall | Precision |
| --- | ---: | ---: | ---: |
| Complete (`present`) | 7/9 | 77.78% | 70.00% |
| Partial | 8/11 | 72.73% | 66.67% |
| Missing | 8/10 | 80.00% | 100.00% |

Rows are reviewed labels, columns are model decisions:

| Actual / predicted | Complete | Partial | Missing |
| --- | ---: | ---: | ---: |
| Complete | 7 | 2 | 0 |
| Partial | 3 | 8 | 0 |
| Missing | 0 | 2 | 8 |

The 100% missing precision means eight of eight missing predictions were correct
on this set; it is not a guarantee for future notes. The earlier 85.37% grouped
training-CV result remains a development result on a different population and
must not be substituted for this human-reviewed score.

## Seven errors

| Example | Concept | Human label | Model | Diagnostic finding |
| --- | --- | --- | --- | --- |
| 011 | Sexual and asexual reproduction | Partial | Complete | "Without fusion of gametes" in the asexual explanation satisfies the positive sexual phrase groups. Negation counting elsewhere does not prevent the wrong point match. |
| 002 | Benedict test | Partial | Complete | The required heating procedure is absent. A half-matched heat point and other strong features still allow complete. |
| 008 | Isotopes | Partial | Complete | A wrong electron-based explanation of mass is accepted. Neutron and mass words in adjacent statements incorrectly satisfy the required relationship. |
| 003 | Benedict test | Missing | Partial | A bare Benedict heading is combined with a neighbouring iodine procedure, producing false reagent evidence. |
| 024 | Heat-exchange calculations | Missing | Partial | Shared heat/unit vocabulary from a Q=mL explanation is mistaken for meaningful Q=mcΔT coverage. |
| 001 | Benedict test | Complete | Partial | All checklist points have lexical matches, but learned probabilities narrowly favour partial (0.499 versus 0.489). |
| 022 | Heat-exchange calculations | Complete | Partial | A correct worked example with all checklist matches narrowly favours partial (0.510 versus 0.482). |

The first three errors are false assurances of completeness. The latent-heat
error has a maximum model score of about 0.879, so simply requiring a high score
does not establish reliability. Scores remain uncalibrated.

## Human rubric correction

The reviewer changed example 028 (electrical power) from the author's complete
label to partial because the displayed checklist explicitly requires
`1 kW = 1000 W`, which the note omits. The human label was used unchanged; the
model also predicted partial.

This exposes a specification problem in the prototype: the units rubric text
bundles watts and the kilowatt conversion, while its matching groups can be
satisfied by watt/power terms alone. That partial prediction therefore does not
prove the model checked the conversion. The next rubric version should represent
each required idea separately and align training labels with the same scope.

## Decision and next development priorities

**Do not enable v1 for automatic complete/partial/missing judgments.** The model
exceeds the simple rule on this diagnostic, but misses the predeclared 80%
accuracy target and gives three false-complete decisions. There are only nine
complete examples, and the set is synthetic rather than real OCR output.

Priorities for a separate version are:

1. Keep headings separate from explanatory evidence; require a target-specific
   relationship rather than co-occurring words from adjacent statements.
2. Distinguish affirmed from negated evidence at the required-idea level.
3. Represent bundled rubric requirements individually, especially units and
   required procedure steps. Do not infer correctness from coverage alone.
4. Add reviewed training contrasts for wrong scientific relationships and
   correct nearby concepts. Preserve correct self-corrections as positives.
5. Evaluate the next frozen candidate on new reviewed examples. Once these 30
   errors guide changes, this set is a development/regression benchmark.

These directions come from the reviewed errors, not from an established claim
that a more complex model or longer fitting would solve them. Direct integration
is postponed on measured accuracy grounds; the local review-only inference
adapter remains available.

## Evidence and reproducibility

Output directory: `ml-training/outputs/english-coverage-v1-human-review-01/`.
It contains `evaluation.json`, `decisions.json`, `error-analysis.json`, and a
byte-identical `submitted-human-review.json`. The original Downloads file was
only read. Confusion counts were independently recomputed from saved decisions.

Model SHA-256: `8b666274de509f79be2aa4153b8fdba95a6ed4bf85b7bf40e73bc333eb108260`.
Review SHA-256: `5769909cd3b86c854d244f29fd569e99b3f4a702adf60475f02c5bc78d55fe92`.

This is an owner-supplied human review of AI-authored synthetic challenge notes
with model predictions hidden in the packet. It is not independent teacher
certification, a random population sample, or real-handwriting accuracy. Results
are not directly comparable to the earlier RoBERTa benchmarks with different
examples, scopes and label distributions.
