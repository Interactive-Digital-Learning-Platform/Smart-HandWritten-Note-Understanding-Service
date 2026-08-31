# Offline concept-annotation workflow

This workflow creates expert-reviewed labels for the three-class concept model
(`present`, `partial`, `missing`) without adding a teacher account or teacher
authorization path to the student mobile application.

## Roles and data boundary

- Students continue to be the only authenticated mobile-app users.
- An approved subject expert works outside the mobile application on an exported
  JSONL file.
- The service stores the expert identity as annotation provenance, not as an
  application role.
- Exports exclude user IDs and image locations. Common email, phone, and student-ID
  patterns are redacted, but a manual privacy check is still required before a file
  is shared with a reviewer.
- `data/annotations/` is ignored by Git because exports contain student-derived
  educational text.

## 1. Export candidates

When collected notes exist as local multi-page image folders, inventory them
before creating database records. Keep all pages of one note in a single
`student-XX` folder and name them `page-01`, `page-02`, and so on:

```powershell
npm run annotations:ingest-notes -- --root <science-folder> --batch-id <collection-id>
npm run annotations:ingest-notes -- --root <science-folder> --batch-id <collection-id> --pilot --execute
```

The first command is a local dry run. The guarded pilot processes one note from
each available grade. After checking its OCR, lesson identity, and concept
anchors, rerun with `--execute` but without `--pilot` to process the full batch.
The batch account is pseudonymous, material generation and student-profile
updates are disabled, and rerunning the same batch is idempotent.

Run from the service directory:

```powershell
npm run annotations:export -- --subject Science --grade 10 --limit 500
```

For an offline collection, isolate the export to its pseudonymous batch and
include representative high-confidence rows as well as review-needed rows:

```powershell
npm run annotations:export -- --subject Science --batch-id <collection-id> --all --output <science-candidates.jsonl>
```

Notes carrying any pipeline quality warning are excluded by default. Do not use
`--allow-quality-warnings` for model-training labels unless the warning has been
manually investigated and documented.

By default, only uncertain or otherwise review-needed concept decisions are
exported. Use `--all` when building a representative training dataset that also
needs high-confidence examples. Use `--output <path.jsonl>` to select a controlled
storage location.

Notes whose system prediction marks every curriculum concept as missing are
quarantined from candidate export because this commonly indicates an incorrect
lesson match. Missing concepts are still exported as negative examples whenever
the note has at least one `present` or `partial` anchor concept.

The command writes a JSONL candidate file and a manifest with class counts and the
privacy controls applied. The source snapshot has a deterministic `recordId` based
on note, curriculum version, and concept ID.

## 2. Review the JSONL file

For each line, keep the source fields unchanged and complete only the `review`
object:

```json
{
  "review": {
    "verdict": "partial",
    "reviewerId": "science-expert-01",
    "labelQuality": "single_review",
    "evidenceText": "The note names the organelle but does not explain its function.",
    "reviewerNotes": "",
    "reviewedAt": "2026-08-30T12:00:00.000Z"
  }
}
```

The snippet shows only the field to edit; each JSONL line must remain a complete
exported annotation record. `labelQuality` must be `single_review`,
`double_review`, or `adjudicated`.

For a first pass, the reviewer and quality may instead be supplied to the import
command as defaults. Explicit values in each record take priority.

## 3. Import reviewed labels

```powershell
npm run annotations:import -- --input <reviewed.jsonl> --candidate <original-candidates.jsonl> --dry-run
npm run annotations:import -- --input <reviewed.jsonl> --candidate <original-candidates.jsonl> --reviewer science-expert-01 --quality single_review
```

Run the dry-run command first; it performs no database writes. The complete file
is parsed and validated before database writes begin. When `--candidate` is
provided, every field outside `review` must exactly match the original export and
every original row must still be present. The import
rejects duplicate or tampered record identities, invalid probabilities, incomplete
review provenance, forbidden identity fields, and updates to labels already used
for training. Candidate text, curriculum identity, and the original prediction are
insert-only source snapshots; a later re-review can update review fields but cannot
rewrite that evidence.

`--allow-used-update` exists only for an explicitly governed correction. A changed
training label should normally lead to a new dataset version and retraining record.

## 4. Check dataset composition

```powershell
npm run annotations:stats
npm run annotations:stats -- --output <annotation-stats.json>
```

The report includes reviewer-label and system-prediction class counts, subject and
language coverage, label quality, curriculum versions, class imbalance, exact
system/reviewer agreement, and a confusion matrix. Agreement from review-needed
candidates is descriptive; it is not a replacement for a representative held-out
evaluation set.

## 5. Release an immutable training snapshot

```powershell
npm run annotations:release -- --version concepts-2026-08-v1 --minimum-quality single_review
```

The default release is cumulative: previously locked labels are included with new
labels so a later dataset remains suitable for full retraining. Use `--new-only`
only when a deliberate delta dataset is required. The release can also be filtered
with `--subject`, `--grade`, and `--output`.

The command creates a deterministic-order JSONL dataset and a manifest containing
its SHA-256 hash, filters, curriculum versions, class counts, and provenance counts.
It removes reviewer identity, replaces the database note ID with `noteGroupId`, and
locks newly released labels against ordinary re-import. Model data splits must be
made by `noteGroupId`, never by individual concept row, to prevent concepts from the
same handwritten note leaking across train and evaluation sets.

## Curriculum coverage rule

Textbooks for every Grade 10-11 subject are not required to operate this workflow.
Run `npm run kb:verify` and treat a subject/grade as grounded only when every
registered unit has bounded chunks. Start annotation with the verified Science and
History Grade 10-11 scopes, and filter training/evaluation claims to those supported
domains. Add Geography, Information Technology, Mathematics, and English material
incrementally before claiming model quality for those subjects. Never silently mix
curriculum versions in a dataset release.
