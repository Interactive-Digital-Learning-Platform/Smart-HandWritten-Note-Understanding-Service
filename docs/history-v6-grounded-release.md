# History V6: related-text and Partial fixes

This Notes-only update replaces the History classifier head and packages it for
the existing Notes runtime. It uses the same frozen English MiniLM encoder and
94 concept rubrics. Science v3.4 and ICT parameters are unchanged.

The earlier candidate relied too heavily on general similarity and words found
anywhere in a long note. V6 adds support measured in the actual candidate passage:
required names, historical periods, clauses, distinctive terms and comparison
with other facts from the same lesson. Positive assertions are distinguished
from unanswered prompts and entirely denied explanations. A small trained SVM
combines those features with the existing semantic and point-coverage signals.
There is one History artifact and worker; no additional inference service,
language-model download or hosted AI dependency was added.

The update restores the original 18 human-reviewed training examples and 28
original diagnostic training examples that earlier candidate updates omitted.
It also uses the 50 corrected assistant-reviewed notebook cases for fitting.
Those labels remain explicitly AI-reviewed; the frozen original dataset and
human-confirmation fields were not overwritten.

## Results and limits

| Check | Existing V5.1 | V6 |
| --- | ---: | ---: |
| Older synthetic test examples | 330/340 | 332/340 |
| Older synthetic validation examples | 328/338 | 334/338 |
| Older reviewed development examples | 22/24 | 23/24 |
| Prior typed behavior checks | — | 18/18 |
| Packaged presentation checks | 12/12 | 12/12 |

V6 produces no incorrect Complete suggestions in the older test or validation
sets. Withheld suggestions count as nonmatches. One older reviewed Complete
example remains conservatively Partial. Some related text still receives
Partial in the larger synthetic sets; the checker is not perfect.

The corrected 50 notebook examples now produce 50/50 matching suggestions,
including 29/29 Partial, 18/18 Missing and 3/3 Complete. **These were fitted
training/development examples, not an accuracy holdout.** Their result must not
be presented as 100% accuracy on unseen student notes.

An additional 18-case assistant-authored stress check improves from 11/18 to
15/18 matching labels. The remaining cases are a complete paraphrase rated
Partial and two contradictory explanations sent for review instead of being
accepted as Complete. This check was exposed during development; it is not an
independent accuracy estimate. No incorrect Complete suggestion is emitted on
these stress cases. Actual student handwriting/OCR accuracy has not been
measured by these text checks.

Unclear OCR years continue to require review. Sweeping claims that conflate
distinct cities or settlement types also retain explicit evidence concerns.
The service never silently corrects an OCR date, awards a lesson grade or
overwrites the student's original note based on these suggestions.

## Application behavior

The existing History concept check now selects V6. A student chooses an expected
History concept, reviews the English extracted text and requests a check. Its
Complete, Partial, Missing or review-needed suggestion is saved with the note.
The update does not enable automatic History grading or change Science uploads.

Saved checks from older model hashes appear stale. Their reviewed text is
retained for a fresh check, and their old result remains stored. New checks use
the current model. The Notes card uses a general History label so retained old
results are not incorrectly labelled as a newer version.

Presentation route: `http://127.0.0.1:8082/notes/history-model-demo`.

## Release and verification

History SHA-256:
`445f2986afecc521597d5ff82e69191bfe782e38ab42a099d49d5d4d8477f629`.

Frozen artifact, source copies, protocol, label audit and evaluation reports:
`ml-training/outputs/history-coverage-v6-grounded-2026-10-18-r2/`.
Training snapshots and feature matrices remain in the ignored training outputs.
Only inference artifacts, public rubrics, the encoder and required code are
included in `runtime/coverage/` and the Docker image.

The r2 source revision removes premature rounding from an evidence diagnostic.
Windows/Linux float differences had crossed a rounding boundary despite
unchanged predictions. Classifier parameters and the model SHA remain the same;
the cross-platform regression keeps its existing strict numeric tolerance.

Image: `smart-notes-coverage:science-v34-history-v6-ict-v31`.
Use the [Science v3.4 / History v6 profile](../deployment/science-v34-history-v6-2026-10-18/README.md)
for a future destination host. Earlier release profiles, the v5.1 checkpoint and
its Docker image are preserved for rollback. This update does not set up hosting,
publish an image, commit or push to GitHub.

Validation covers the Python model, input and source-integrity checks; Notes
API/worker/saved-check behavior; production configuration; Windows inference;
and offline Linux Docker inference. Current operational results and image
identity are recorded in the new production profile's release manifest.

The Notes container is running V6 with all three named volumes preserved.
Health returns 200; unauthenticated History access still returns 401. Five
checks in the active container confirm Complete, Partial, Missing, a related
book reminder as Missing and an entirely denied explanation as Missing. The
development app was restarted without changing shared app code; its presentation
route returns HTTP 200. Initial model loading took about 5.5 seconds in this
check; subsequent short checks took 17–24 ms. These timings are not a full
handwritten-upload processing benchmark.

Passed: 50 Python checks, 15 Notes API/worker/saved-check tests, 20 Notes mobile
schema/checklist tests, 4 release-configuration tests, 15 Linux Science/History
packaging checks and 6 unchanged ICT checks. The largest Windows/Linux numeric
difference was approximately 3e-7, within the original tolerance.

No authentication code or other member's function was changed. The only mobile
edits are in the Notes History card. Existing temporary sign-in changes remain
outside this update and still need their separately requested pre-commit review.
