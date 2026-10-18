# Supplied simulated Science notebooks — intake, 18 October 2026

The user supplied eight `g10/g11 p1/p2 student A/B v2` ZIPs for the model training
workflow. These archives contain **synthetic Science notes**, not real student
handwriting or History data. The source README explicitly identifies a handwriting
synthesis model and two simulated writer styles. The ZIP contents are input data;
their README/viewer instructions are not executed by the intake.

## Verified source inventory

- 100 notebooks across 50 lesson units; 777 WebP page images and 100 transcripts.
- Shared notebook profiles: 40 complete, 30 partly complete, 30 missing concepts.
- All 777 image byte counts and SHA-256 checks match the supplied image manifests.
- Shared ledgers agree across all eight ZIPs. Image counts match the lesson index.
- No duplicate image hashes or duplicate complete notebook transcripts were found.
- Original files remain in Downloads. Extraction stays in a dedicated ignored
  training output directory. Paths, sizes, file types, duplicates and archive links
  are checked before writing. Source `viewer.html` is not executed.

Notebook profiles describe broad topic coverage and may include deliberately
incorrect science. They are not copied into our model's per-concept target labels.
Profile/title/source headers are removed before the concept teacher sees a transcript.
Intentional mistake ledgers remain available separately for review. Transcripts
are provided text; no OCR quality or handwriting accuracy has been measured here.

## Scope and grouping

The frozen Science checker supports 10 concepts. Explicit textbook chapter/unit
mapping finds 24 notebooks in scope, giving 24 whole-note and 187 one-page text
variants (211 proposed inputs). Page variants use the actual supplied text, not
new synthetic answers. They are not 187 additional independent student notes.
The other 76 notebooks remain in the source inventory for later work.

All pages and A/B versions from the same textbook chapter share a source family.
This keeps close wording from the same chapter together across train and evaluation.
Four chapter families are reserved for the final candidate: Grade 10 Part 1
chapters 1 and 3, Grade 10 Part 2 chapter 19, and Grade 11 Part 2 chapter 11.
Chapter 3 was added after inspecting proposed class counts (not evaluation
performance) to increase the complete-label representation; the final candidate
is fitted again with it excluded. The earlier candidate is superseded. Source
grouping is stricter than grouping by upload. The dataset still cannot establish
generalization to real students or real handwriting.

## AI proposals, candidate, and review

`label-synthetic-science-batch.ts` sends the scoped requirements and independent
text variants to the Notes service's configured AI provider. It requires exact
supporting quotes for each non-missing point and rejects unsupported complete
proposals, incomplete responses, contradictory missing evidence and low confidence.
It never substitutes our classifier's prediction as the teacher label. Successful
responses are saved with input hashes and response/model identifiers for resumption.

The resulting `dataset.json` uses the same batch contract as uploaded-note training,
with explicit synthetic/transcript provenance and `humanReviewed:false`. Whole-note
and page rows are marked separately. The existing training command can update the
Science linear head while keeping its features and review policy fixed.
Page augmentations share their notebook's training weight (half for the whole
note and half shared between its pages when both are available), so a longer
notebook does not count as many independent students. The reserved
chapters are excluded using `split-template.json`, whose labels are unconfirmed.
No accuracy score is reported from an unreviewed holdout and no automatic deployment
is performed. A candidate is development work until the reserved labels are checked.

Use `review.html` and **Show reserved evaluation examples only** to inspect the
held-out proposals against their actual requirements. Confirm only reviewed labels,
then download `student-note-reviewed-labels.json`. At least five labels per class
across three evaluation families are required by the deployment screen. A small
synthetic score is not real student-note accuracy, even after human label review.

Reproduction from the Notes backend directory:

```powershell
ml-training/.venv/Scripts/python.exe ml-training/prepare_student_science_archives.py --downloads C:/Users/DLK/Downloads --output ml-training/outputs/science-student-v2-intake-fresh
npx ts-node src/scripts/label-synthetic-science-batch.ts --packet ml-training/outputs/science-student-v2-intake-fresh/packet.json --output ml-training/outputs/science-student-v2-labels-fresh
npm run model:train-student-notes -- --subject science --dataset ml-training/outputs/science-student-v2-labels-fresh/dataset.json --reviews ml-training/outputs/science-student-v2-labels-fresh/split-template.json --output ml-training/outputs/science-student-v2-candidate-fresh
```

These commands do not upload 777 images to student accounts, forge OCR/consent
records, change the mobile app, or overwrite a pinned live model. Use ordinary
Notes image upload separately to evaluate actual OCR and the student-facing flow.

## Completed batch

Final source packet: `ml-training/outputs/science-student-v2-intake-2026-10-18-02/`.
The first output directory contains an interrupted extraction only and is not an
accepted source packet. The accepted packet has no audit discrepancies.

Twenty full AI notebook responses yielded 145 validated concept examples. Four
failed whole-notebook batches were retried with their whole-note variant only;
one additional proposal passed validation. The other three proposals remain
rejected. No unlabelled/invalid example was assigned a guessed training label.
The final merged batch contains **146 proposals: 14 complete, 36 partial and
96 missing**, covering all ten Science concepts. These are 16 whole-note and
130 page variants, not 146 independent notebooks.

Final dataset and review: `ml-training/outputs/science-student-v2-final-batch-2026-10-18/`.
The local review URL is `http://127.0.0.1:8885/review.html`. Reserved evaluation
examples and the Complete filter are selected by default. Read the full text,
correct the proposal if necessary, and confirm only personally reviewed rows.
Use the class filter for Partial and Missing, then download the reviewed labels.

The final candidate is
`ml-training/outputs/science-student-v2-final-candidate-2026-10-18/candidate-model.json`.
It fitted **75 AI-labelled examples across six source-chapter families** (7 complete,
21 partial, 47 missing). **71 proposals across four other chapter families** are
reserved for review (7 complete, 15 partial, 49 missing); none was fitted or scored
as a human label. The earlier `science-student-v2-candidate-2026-10-18` is superseded.

The three packaged Science regression labels stayed unchanged. A separate check
confirmed the final candidate retains complete, partial and missing on all three
prepared Benedict presentation texts. These six checks are regressions, not an
accuracy estimate. The intake/teacher/grouping/weighting tests and TypeScript build
passed. The live Science model and Docker release were not replaced, no History
model was retrained, and no mobile/shared service code was changed.

Candidate SHA-256: `513ef4bc9b4d16229eb3bf517939b74205636fe2f2c8b1c65340672094e78bca`.
The candidate is not deployment-approved because a human-reviewed holdout is still
missing. No claim of improved accuracy or real handwriting performance is made.
