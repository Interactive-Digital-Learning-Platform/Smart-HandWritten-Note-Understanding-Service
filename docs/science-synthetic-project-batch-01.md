# Synthetic Science university project: review batch 01

Date: 2026-10-03

The dataset owner reports that their research panel accepts synthetic data for
this university prototype. Real-note collection and independent human review
are therefore **not training prerequisites for this project**. Keep the source
described as synthetic and the review as AI review, not real student collection
or independent human certification. Production integration is out of scope.

## Deliverable

`C:/Users/DLK/Desktop/annotations/outputs/01a0b35a-0472-7970-be36-7b8d55391c86/science-training-release-v2.4-batch-01.zip`

Archive SHA-256:
`e9178d2bc45bf392760e18202763ed956b505d85f13c228d2dfeb1fd21aa9fd4`

- Original 80 notes / 160 text files preserved; no archive from v2.2/v2.3 changed.
- 162 newly AI-reviewed page/concept pairs across 10 notes, both languages/grades.
- 42 new pair labels corrected after reading page context, not keyword scoring.
- Active supervision: 216 pairs / 432 raw+corrected views across 91/322 concepts.
- Active pair labels: present 61, partial 52, missing 103.
- Remaining quarantine: 388 pairs / 776 views. They remain excluded from fitting.
- New positive/partial decisions carry exact support quotes and character offsets.
- Raw/corrected differences were inspected; no essential evidence loss identified
  in this batch. Student substantive mistakes were retained, not OCR-corrected.
- Supplied learning-outcome arrays are empty for all new pairs. The review uses
  concept names, named subtopics and page context; it does not claim to verify
  against unavailable outcomes.
- Older 54 reviewed pairs retain legacy review provenance without exact quotes.
- All 812 whole-note reference labels remain inherited synthetic AI candidates;
  this batch does not certify or re-review them.

## Backend compatibility

`import_page_release.py` now accepts both reviewed v2.3 and v2.4-batch-01 and
creates different immutable dataset versions. It checks exact page evidence and
retains review reason/date/evidence in snapshots. No requirement for independent
human certification or real collection is imposed. Existing safeguards for
student splits, source hashes and quarantine remain in force.

From the backend's `ml-training` directory (PowerShell):

```powershell
$env:PYTHONDONTWRITEBYTECODE = '1'
$batchBase = 'C:/Users/DLK/Desktop/annotations/outputs/01a0b35a-0472-7970-be36-7b8d55391c86'
.\.venv\Scripts\python.exe import_page_release.py --release "$batchBase/science-training-release-v2.4-batch-01.zip" --pages-output "$batchBase/science-v2.4-batch-01-training-snapshots/page-annotations.jsonl" --notes-output "$batchBase/science-v2.4-batch-01-training-snapshots/note-references.jsonl"
.\.venv\Scripts\python.exe train_pages.py --pages "$batchBase/science-v2.4-batch-01-training-snapshots/page-annotations.jsonl" --notes "$batchBase/science-v2.4-batch-01-training-snapshots/note-references.jsonl" --check-only
```

Import refuses existing outputs: reuse already imported snapshots rather than
overwrite them. For actual fitting, replace `--check-only` with `--output` and a
new experiment directory. Encoder download/availability and compute still apply.

## What the project can claim

Report performance on an AI-reviewed synthetic benchmark. Fit training students
only and choose thresholds using validation students only; never tune on test.
Report macro-F1, balanced accuracy, per-class recall and language/grade slices,
with majority baseline and unseen-concept coverage. Accuracy alone is misleading
with class imbalance. New supervision may improve performance but that has not
been measured by this preparation work.

Current test students appeared in earlier v2 training experiments. Their results
are exploratory, not untouched external evaluation and not directly comparable
to the previous split. Real handwriting generalisation is unmeasured.

## Next batch

Continue the 388 remaining pair reviews, then review examples for concepts still
without page supervision. Do not automatically clear quarantine or mark AI work
as human review. Further synthetic authorship should vary student styles and
concept difficulty and avoid systematic label clues. Re-evaluate only after a
versioned reviewed release is prepared. No training or deployment started here.
