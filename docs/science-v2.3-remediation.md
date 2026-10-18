# Science v2.3 remediation and trainer handoff

Prepared on 2026-10-02. No model training or deployment was started.

## Outcome and limitations

The v2.2 page-generation assumptions are not accepted as reviewed supervision.
54 page/concept pairs were directly reviewed against their whole page, including
raw/corrected differences, across all eight fixed training students. This produces
108 eligible views: 34 present, 34 partial, 40 missing. 38 view labels changed.
The remaining 1,100 views (positive and negative) are quarantined, preserved and
excluded by the new importer. This is a limited experiment subset, NOT complete
review of all page candidates and NOT an accuracy improvement claim.

All 80 notes and 160 text files are byte-identical to v2.2. All 812 whole-note
labels are retained as inherited synthetic AI candidates. The pressure evidence
for cand-0059-001 was moved from unrelated hydrometer content on page 9 to the
p=F/A example on page 1, with exact quote offsets. No human-review certification
was added. Prior spreadsheets/reports remain under legacy-v2.2 in the new ZIP.

The active subset covers only 23 concepts; validation has 104 concepts without
active page supervision and test has 116. This loss of coverage is explicitly
reported, rather than treating unreviewed targets as established labels. More
page review is needed before a full-curriculum accuracy experiment.

The split remains v2.2's 8/2/2 students and 55/12/13 notes. Both test students
were earlier v2 training students. The next experiment is exploratory; its
scores cannot establish improvement over the original v2 held-out benchmark.

## Added backend entry points

The existing importer, trainer, deployment settings, mobile code and uncommitted
work are not overwritten. The new page workflow is opt-in through separate files:

- ml-training/import_page_release.py
- ml-training/train_pages.py
- ml-training/src/smart_note_training/page_release.py
- ml-training/src/smart_note_training/train_pages.py
- ml-training/tests/test_page_training.py

The importer checks ZIP paths/CRC, full release and source-text hashes, metadata,
student splits, exact page joins, CSV/JSONL/review ledger agreement, paired labels,
paired weights and review eligibility. It exports separate immutable page and
whole-note reference snapshots with official keywords and learning outcomes.

Per-view sample weights are used in scaler and classifier fitting. Corrected/raw
views jointly have weight 1 for present/missing and 2 for partial, even when text
is identical. No additional default class weighting doubles the partial weight.

Only training students fit the classifier. Each validation/test concept is
scored against every corrected page. Whole-note aggregation uses the maximum
present score, then maximum partial score, otherwise missing. Thresholds are
chosen using validation references only, excluding high-priority references.
Test is scored once after calibration. Exported weights are not refit on test.

Evaluation distinguishes training page resubstitution from note-reference scores;
there are no reviewed page holdouts, so no held-out page score is claimed. Note
scores include seen/unseen concept, grade and language slices. Outputs stay
disabled by default and are not connected to Stage 6. Long pages currently use
the frozen encoder's first max-length window; this limit is recorded in output.

## Commands (PowerShell, repository root)

The verified release is:

`C:/Users/DLK/Desktop/annotations/outputs/01a0b35a-0472-7970-be36-7b8d55391c86/science-training-release-v2.3.zip`

The verified snapshots are outside the archive under the same parent directory:

`science-v2.3-training-snapshots/page-annotations.jsonl`

`science-v2.3-training-snapshots/note-references.jsonl`

Validation without model fitting or downloading:

```powershell
& ml-training/.venv/Scripts/python.exe ml-training/train_pages.py `
  --pages "C:/Users/DLK/Desktop/annotations/outputs/01a0b35a-0472-7970-be36-7b8d55391c86/science-v2.3-training-snapshots/page-annotations.jsonl" `
  --notes "C:/Users/DLK/Desktop/annotations/outputs/01a0b35a-0472-7970-be36-7b8d55391c86/science-v2.3-training-snapshots/note-references.jsonl" `
  --check-only
```

To create different new snapshots:

```powershell
& ml-training/.venv/Scripts/python.exe ml-training/import_page_release.py `
  --release "C:/Users/DLK/Desktop/annotations/outputs/01a0b35a-0472-7970-be36-7b8d55391c86/science-training-release-v2.3.zip" `
  --pages-output "data/annotations/datasets/science-v2.3/page-annotations.jsonl" `
  --notes-output "data/annotations/datasets/science-v2.3/note-references.jsonl"
```

For a later limited-supervision experiment, replace --check-only with --output
pointing to a new directory. Run comparable baselines on exactly this fixed split
and disclose synthetic reference quality and limited concept coverage. Do not
compare that result directly with v2 or claim real-handwriting accuracy.

## Reproducibility

Build script: annotations/dataset-rebuild/build-reviewed-v2.3.py

AI review decisions: annotations/dataset-rebuild/page-review-v2.3.json

Source ZIP SHA-256:
75a088507f2892e879f48c215e9dac8518699513e80a3593630863f895415b04

v2.3 ZIP SHA-256:
12099ef68bba659420be44f7bab093226633f031634378189e83bfa0e2e8b222

Verification results are recorded separately after import/tests. Full page
review remains outstanding; do not describe this package as fully certified.
