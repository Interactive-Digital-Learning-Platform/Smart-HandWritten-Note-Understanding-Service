# Private note images in Cloudflare R2

Only the Handwritten Notes service changes. The mobile app keeps its existing
authenticated `/uploads/<filename>` URLs. R2 keys stay on the backend.

## Verification on 2026-10-19

The Notes container is deployed and healthy, with **Cloudflare R2 active for new
image uploads**. The private `.env` was switched to `NOTE_IMAGE_STORAGE=r2` after
a live Cloudflare synthetic upload/read/delete probe passed. Only the Notes
container was recreated; no credentials were added to Git or the mobile app.

All 171 default regression tests passed before activation. A synthetic MinIO
compatibility test passed streamed upload, exact byte reads, anonymous denial,
deletion and failed-save rollback; its private test bucket was removed.

The active container also passed a real R2 synthetic note upload through production
routers with verified isolated test JWTs: exact bytes from storage and the owner's
private image route, no permanent local copy, anonymous/cross-user access denial,
polling, textbook retrieval, and note/object deletion. All test data was cleaned.
Cloudflare's S3 API rejects unsigned requests with HTTP 400, while MinIO uses 403;
the verification harness accepts either provider's authentication rejection.
These checks do not claim a new fresh OCR/AI run. Older images are now covered by
the separate migration described below.

## Cloudflare setup

1. In the Cloudflare dashboard, activate **R2 Object Storage**. Review the billing
   terms shown by Cloudflare during activation.
2. Create a **Standard** bucket, for example `smart-notes-private`. Leave the
   public development URL and public custom domain disabled.
3. Under R2 API tokens, create **Object Read & Write** credentials scoped to that
   one bucket. The Notes backend does not need account-wide administration.
4. Save the S3 API endpoint, Access Key ID and Secret Access Key in this service's
   private `.env`. Do not put them in the mobile app, Git, screenshots or chat.

```dotenv
NOTE_IMAGE_STORAGE=local
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_BUCKET=smart-notes-private
R2_ACCESS_KEY_ID=<ACCESS_KEY_ID>
R2_SECRET_ACCESS_KEY=<SECRET_ACCESS_KEY>
```

Use the actual S3 API endpoint shown by Cloudflare; it is not an `r2.dev` URL or
the dashboard URL. Replace all placeholders. The endpoint validator also accepts
Cloudflare's EU and FedRAMP jurisdiction endpoints.

## Verify and activate

From the Notes service directory, after filling in real credentials:

```powershell
npm.cmd run verify:image-storage
```

This writes one synthetic one-pixel PNG, reads and compares its bytes, deletes it,
and checks it is no longer readable. It does not access student records or call
Groq. The probe works while `NOTE_IMAGE_STORAGE=local`, so uploads need not switch
before connectivity is verified.

Then change `NOTE_IMAGE_STORAGE=r2` and restart/recreate the Notes backend. The
Notes Compose service already loads `.env`; keep R2 settings in that file or the
hosting platform's server-side secret configuration. A rebuild is required the
first time to include the SDK and application changes; later credential changes
require recreation, not an image rebuild. For the existing local-v2 deployment:

```powershell
docker compose --env-file deployment/kb-v2-local/.env.local -f compose.coverage.yaml -f deployment/kb-v2-local/notes.override.yaml -f deployment/r2-2026-10-19/notes.override.yaml build notes-coverage
docker compose --env-file deployment/kb-v2-local/.env.local -f compose.coverage.yaml -f deployment/kb-v2-local/notes.override.yaml -f deployment/r2-2026-10-19/notes.override.yaml up -d --no-deps notes-coverage
```

Upload a new test note. Its private image URL now contains an `r2-` UUID. Verify
owner viewing, OCR, and deleting that test note. There are no public bucket URLs,
browser-side storage credentials or additional bucket CORS rules in this design.

## Storage behavior

- Multer stages bounded uploads locally. Objects are written to `notes/r2-<uuid>.<ext>`
  before note metadata is saved. Requests stream files rather than loading the
  whole notebook into memory.
- Successful R2 uploads remove staged files after metadata is saved. Failed
  uploads roll back attempted objects and staged files; a failed object cleanup
  logs a warning. A process crash or prolonged provider outage can still leave
  unreferenced objects; there is no durable cleanup queue in this release.
- Viewing checks the verified student's ownership before contacting R2. Responses
  remain `private, no-store`. OCR and the existing expert-review image route also
  read the private object through the backend.
- Object operations have a 20-second deadline and bounded SDK retries. Provider
  failures return a safe temporary-unavailability message. New uploads do not
  silently fall back to disk on an R2 outage.
- Deleting a note removes its objects before deleting note metadata. A storage
  failure retains the note record for a retry; some pages may already have been
  deleted if a multi-page deletion fails partway through.

## Existing notes and rollback

Existing images with available, valid source files have now been migrated under
the separate [2026-10-19 migration](note-image-migration-2026-10-19.md). Their image
references point to R2, while original local recovery copies remain intact.
Pre-existing missing or invalid source references were retained unchanged and
require their original images to be restored/re-uploaded. Audio remains on the
existing audio volume.

Changing `NOTE_IMAGE_STORAGE` back to `local` changes only future uploads. Keep
R2 credentials configured so previously uploaded R2 notes can still be read and
deleted. Moving to a different bucket/account requires migrating its objects
first, because existing remote URLs refer to the configured bucket.

Official references: [S3 setup](https://developers.cloudflare.com/r2/get-started/s3/),
[bucket-scoped credentials](https://developers.cloudflare.com/r2/api/tokens/),
[JavaScript SDK](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/),
[pricing](https://developers.cloudflare.com/r2/pricing/).
