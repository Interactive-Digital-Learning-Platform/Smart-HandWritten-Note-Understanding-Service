# Train the existing model heads from uploaded student notes

This Notes-only offline workflow uses the AI lesson coverage findings already
saved by normal uploads. It does not call the AI again, change the upload flow,
or retrain inside a student's request. The current presentation model remains
active until a separately evaluated candidate is packaged for deployment.

The pipeline's general lesson coverage comes from semantic AI review. The
Science/History trained checker is separate. Exact concept IDs connect these
sources; a general AI finding can use broader criteria than the trained rubric.
AI findings are therefore weak labels, not automatically human-approved labels.

## Upload now

Use the normal app. Select English Science or History, the correct grade and
lesson, and enable **Optional research contribution** where permission applies.
Let analysis finish and review the OCR and findings. No extra training screen
or server restart is needed while uploading; the database already retains the
text, AI label, source and evidence for collection later.

Use different students' phrasing, different lessons within the supported model
catalog, and all three statuses. Twenty repeated copies do not add useful
independent examples. Uploading a note does not itself update model weights.

## Collect a batch after uploads

Run from the Notes backend directory in PowerShell:

```powershell
npm run model:collect-student-notes -- --since 2026-10-18T00:00:00+05:30 --output data/annotations/student-model/today-01
```

Choose a fresh output folder for each collection. This creates `dataset.json`,
its SHA-256 `manifest.json`, and a local `review.html`. Existing student records
are read only. Raw account IDs and image paths are excluded; a persistent local
HMAC key pseudonymizes upload/note IDs. Keep this private key out of Git and do
not delete it between batches. Common email, phone and student-ID strings are
redacted; this is not a guarantee of anonymous free text. Check for personal
information before sharing the dataset. Data lives under the existing ignored
`data/annotations/` directory and is excluded from the Docker image context.

The intake uses current granted consent, completed good-quality English OCR,
a confident lesson match, exact supported model concept IDs, semantic-AI source
and a direct supporting quote for complete/partial. It skips rule/fallback and
our own trained-model outputs, low-confidence findings and duplicate text/concept
pairs. Teacher confidence is an uncalibrated filter, not a probability of truth.
Missing examples require another grounded concept in the same note so a completely
wrong lesson cannot generate an entire batch of missing labels.

## Confirm a small evaluation set

Open `review.html`. It displays the extracted text, AI proposal and the **actual
model requirements** together. Correct the label if needed and confirm only rows
you personally reviewed. If OCR is wrong, correct/reanalyse the note in the app,
then collect a new batch; do not confirm a label against incorrect OCR.

Choose **Hold out this entire note** on examples from several different notes.
The trainer excludes every row in those notes and duplicate full texts from
fitting, even unconfirmed rows. Keep at least five confirmed examples per class
from at least three held-out note groups per subject for the deployment review.
Remaining labels can be left as AI proposals for training. Download
`student-note-reviewed-labels.json`; it is bound to this exact dataset hash.

The uploader is not necessarily the student author. This split guards against
same-upload/exact-text leakage, not all copied passages or author leakage. Held-out
scores describe agreement with these reviewed notes; they are not established
independent real-world student accuracy.

## Train a candidate (small CPU update)

```powershell
npm run model:train-student-notes -- --subject science --dataset data/annotations/student-model/today-01/dataset.json --reviews "C:/Users/DLK/Downloads/student-note-reviewed-labels.json" --output ml-training/outputs/science-student-candidate-01
```

Use `--subject history` and a fresh History output directory for History. The
existing Python environment is used. History requires the already installed
local MiniLM encoder. Neither command downloads models or sends notes to an API.
Run with `--check-only` and a fresh output to see readiness without fitting.
Reviews are optional for fitting but required for deployment evaluation.

Minimum fitting requirements per subject: 30 concept examples from five note
groups, with at least five examples per label. These are engineering intake
thresholds, not a guarantee of accuracy. The current small logistic heads are
updated with fixed feature extractors, existing scalers and an L2 penalty anchored
to the old parameters. AI-labelled examples receive weight 0.25 and explicitly
confirmed examples weight 1.0, with capped class balancing. The rubric, lexical
evidence rules, MiniLM encoder and complete-withholding policies are unchanged.
This can adapt the head to new notes; it does not teach new concepts, new rubric
criteria, OCR recognition or arbitrary synonyms outside those features.

The output is `candidate-model.json`, `report.json` and held-out predictions.
The report compares the current model and candidate on the same confirmed
held-out notes. It also checks the packaged presentation regression examples.
Deployment review requires macro-F1 at least 0.75 and no lower than the current
model, each class recall at least 0.60, no false complete suggestions in the reviewed
holdout, and unchanged presentation regression labels. Passing this small screen
does not certify general accuracy. A candidate can be trained while failing these
checks; `deploymentApproved` remains false.

There is no automatic promotion. The service pins model/source hashes. A reviewed
candidate needs the normal integrity manifest update, service tests and Docker
release packaging before the app can serve it. Keep the current image for rollback.
If insufficient new notes are available, use today's verified live presentation
model and describe the new batch as future improvement work.

If consent is later withdrawn, recollect the batch before training and discard
old local copies containing that note; previously exported files are offline
snapshots and cannot observe subsequent withdrawal automatically.

## Validation

Verified on 18 October 2026: seven intake tests and seven Python tests passed,
including a full Science candidate fit/reload and an actual History head update
with the local encoder and existing review policy. TypeScript compilation and
the review page's JavaScript syntax check passed. The intake for uploads created
on 18 October contained zero notes at verification time, so no new real-data
candidate was trained or deployed. Frozen Science and History SHA-256 values
remain unchanged. Synthetic test fixtures are not accuracy evidence.

```powershell
npm run test:student-model-batch
$env:TEMP = Join-Path (Get-Location) 'tmp'
$env:TMP = $env:TEMP
ml-training/.venv/Scripts/python.exe -m unittest discover -s ml-training/tests -p test_student_note_batch.py -v
npm run build
```
