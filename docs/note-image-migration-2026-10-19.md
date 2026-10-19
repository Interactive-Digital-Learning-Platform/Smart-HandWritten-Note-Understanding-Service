# Existing Notes images: R2 migration

Scope: Handwritten Notes records and referenced note image files only. No model
retraining, Groq calls, authentication changes, ownership changes or other service
code changes are part of this operation.

## Preflight

The database contained 76 Notes records with 190 distinct image references per
note. Of these, 43 image files existed in the Notes Docker uploads volume and 72
were Windows paths pointing to the original Science test image folder. Those 72
host files were readable images and were copied into the Notes migration cache,
with SHA-256 checksums. The remaining 75 old upload references had no source in
the current uploads volume, host uploads directory or Notes image file index.
They are retained unchanged and need the original files restored from a backup.

One of the 43 local files was subsequently found to contain non-image bytes.
Its identical migration copy was removed after restoring its original database
reference, and the original file was preserved. Final migration eligibility is
therefore **114 valid images across 35 notes**. The migration preflight now checks
image decoding before uploading, so this invalid source is skipped on later runs.

There were no active processing leases in the preflight. Older processing records
are not restarted or relabeled by this migration. Records with older, non-student
owner IDs are not reassigned to a different account.

## Safety and recovery

- Each image is copied into R2 and read back for an exact SHA-256 comparison before
  any note metadata is changed. Source files are never moved or deleted.
- Ordered page arrays and the primary image are changed together, using a
  conditional update matching the observed owner, status, timestamp and previous
  image references. A concurrent change prevents the migration write.
- A matching cached OCR image-URL fingerprint is relocated only after byte
  verification, in that same conditional write. OCR text, its text fingerprint,
  confidence, concept findings and generated study materials are retained.
  Already-stale OCR fingerprints are not made trusted.
- The migration does not place the database update inside upload rollback logic.
  If a database acknowledgement is uncertain, uploaded objects are retained so a
  possibly committed note cannot lose its images.
- Private before-image inventories and a flushed phase journal are saved at
  `/app/.cache/r2-image-migration/` on the Notes cache volume. It contains student
  record IDs and original image paths and must not be committed to Git. Local
  copies of these private records belong under the ignored `tmp/r2-migration/`.
- Keep the original uploads volume, original host image folder and migration cache
  until the retention/backup decision has been made. Removing a note through the
  app deletes its active R2 objects, but these intentional recovery copies are
  retained separately until explicitly cleaned up by an operator.

For a specific note, the journal's `planned` record contains the old image
references/fingerprint and `committed` contains the new references. A rollback
must first ensure that the current note still matches that committed state. Do
not replay old image references over subsequent uploads or edits. Windows source
paths are recovery references only and are not compatible with the mobile asset
loader; their R2 paths are the supported app references after migration.

## Verification

`deployment/r2-2026-10-19/verify-migrated-images.cjs` reads every migrated object,
checks its checksum against the preflight source, confirms it decodes as an image,
and verifies the updated database references and OCR image fingerprints.

For actual `user_` student records it also uses the production private image router
in an isolated loopback server with verified test JWTs. It checks the same
authenticated `/uploads/` route used by the mobile/web `useNotesAsset` hook:
correct bytes, private response headers, image response within the web client's
10-second deadline, anonymous rejection and cross-user rejection. Production
Clerk trust and the running API's authentication are unchanged.

Older demo records whose owners are not valid student account IDs can be checked
for image storage integrity but cannot be presented as passing a real student
sign-in flow. This operation does not repair their pre-existing ownership data.
This is API/image-loader compatibility verification, not a visual browser test.

The initial complete verification read all 115 copied files and confirmed their
checksums. It identified 114 decodable images and one invalid original source.
All 39 valid image pages belonging to 17 student-owned notes passed authenticated
image retrieval; responses were below the web asset loader's 10-second deadline.
The other 18 records with valid images are legacy non-student-owner records and
were verified for storage integrity without changing their ownership.

After restoring the invalid file's original reference and removing its unreferenced
R2 copy, the final verification passed for all **114 retained images / 35 notes**.
All 114 images decoded successfully, all recovery copies matched, and the three
matching OCR image fingerprints remained consistent. The 39 authenticated app
image responses took at most 1,120 ms. A final inventory found zero remaining
recoverable valid local images, 75 missing sources and one invalid source. The
invalid R2 object was independently confirmed deleted and unreferenced; the Notes
health endpoint returned HTTP 200. Four migration safety tests also passed.

Refresh an existing note in the app to load its new private R2 references. The
app's Notes image loader already accepts these `/uploads/r2-<uuid>.<ext>` paths;
no mobile authentication or other members' functions were changed.

The commands are operational scripts copied into the existing Notes container;
they do not require a new application image or a container restart. The inventory
mode is the default; a metadata migration requires `--apply`. Re-running it skips
existing R2 references. The source map for Windows references is generated by
`prepare-host-images.cjs` with an explicit allowed source folder.

Aggregate results are recorded in
`deployment/r2-2026-10-19/migration-verification.json` after verification. No private
student record IDs or original file paths should be included in that summary.
