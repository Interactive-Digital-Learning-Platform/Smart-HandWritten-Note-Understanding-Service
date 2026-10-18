# Science v2.3 delivery audit

Verified on 2026-10-02 against the actual ZIP records and backend implementation.
No model fitting, encoder download, deployment, or mobile change was performed.

## Supplied archive

Workspace source: `../DATASETS/science-training-release-v2.3.zip`.

SHA-256: `12099ef68bba659420be44f7bab093226633f031634378189e83bfa0e2e8b222`.
This matches the previously documented v2.3 remediation release exactly.
The archive and all pre-existing files were preserved.

## Verified corrections and scope

- The moment rows `page-example-00494` / `00496` and pressure rows
  `page-example-00762` / `00764` change from missing to present.
- Simple permanent tissue rows `page-example-00186` / `00188` change to partial.
- Movement rows `page-example-00450` / `00452` remain missing with a review reason:
  the observation prompt is unanswered.
- 108 active views represent 54 reviewed page/concept pairs, across eight training
  students and 23 concepts: 34 present, 34 partial, 40 missing.
- 38 view labels changed. The remaining 1,100 rows are explicitly quarantined.
  Active and quarantined IDs partition all 1,208 v2.2 rows exactly, without overlap.
- All 160 source texts, metadata, and student splits are unchanged from v2.2.
  All 812 whole-note labels are retained. Only the pressure reference's evidence
  page, quote, offsets, and reviewer notes change.
- The active JSONL/CSV review ledgers agree, and all 54 decision rationales agree
  with their paired page records. These are AI review decisions, not independent
  human certification.

## Execution evidence

The existing `import_page_release.py` accepted the delivered archive, including
CRC/path checks, complete release manifest hashes, source text hashes, exact page
joins, note evidence offsets, coverage summaries, student splits, paired labels,
sample weights, eligibility, and CSV/JSONL agreement.

New snapshots were created in the ignored directory
`data/annotations/intake/science-v2.3-delivery/`; existing snapshots were not reused
or overwritten. Page snapshot SHA-256:
`8689af4d84ad55937b72eb30ee6e77d59acd8873d92d75f55515af5bed1bdd9f`.
Note reference snapshot SHA-256:
`c7ab8c029ad11c9e6acba077aa87697237441b346639190567e77e7cea10794c`.

`train_pages.py --check-only` passed with `trainingStarted: false` and zero
student overlap. The independent comparison helper `audit_release.py` in that
directory also passed with no errors; `audit.json` contains its detailed findings.

## Remaining limitations

The package supports a limited synthetic experiment. It does not establish
full-curriculum performance: validation has 104 concepts and test has 116 concepts
without active page supervision. Both test students were earlier v2 training
students; historical exposure is unchanged. Whole-note references remain inherited
synthetic AI candidates, and reviewed page holdouts are absent.

The supplied corrections address the previously flagged rows and quarantine
unverified supervision. More page review and an independent real-note holdout are
needed for broader accuracy claims. No accuracy improvement is claimed by intake.
The standalone v2.1 archive was not opened or processed.
