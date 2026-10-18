# Science + History Docker release — 17 October 2026

This is the frozen Notes backend release for today's delivery. Hosting is not
configured yet. The supplied archive can be loaded on a Linux amd64 Docker
host; no Python installation, GPU, training files or retraining is needed.

## What is enabled

| Model | Student flow | Scope |
| --- | --- | --- |
| Science v3.1 | Automatic suggestions on uploaded notes when English/OCR/lesson checks pass; saved with the note | 10 supported concepts |
| History v5.1 | Student selects an expected concept and checks reviewed English text; results show candidate evidence | 94 concepts; on-demand review |

ICT is disabled by this release configuration. Its existing artifact remains
inside the already-tested image; no new ICT work is required. Research review
APIs are disabled. The general lesson checker, uploaded-note coverage score,
review decisions and study-material flow remain available.

Suggestions describe note coverage, not verified student understanding or a
grade. History checks remain experimental and require review. Their selected concept,
reviewed text and result are saved with the note and restored after navigation.
They do not become a grade or automatically change the student's profile. Existing saved
Science suggestions retain their recorded model version. Real-handwriting
accuracy has not been independently established.

The image includes the latest Notes fixes: authenticated API/private media,
materials job states and bounded polling, all three concept counts, visible
skipped-model reasons, retained OCR quality and evidence-based keyword checks.
It also includes saved asynchronous History checks and processing leases that
allow interrupted analyses to be retried without replacing newer results.
A student-requested Science checker also saves the selected concept, reviewed
text and live prediction separately from the automatic result. The same frozen
v3.1 weights are used. A bounded input adapter handles OCR blank lines between
Benedict reagent and heating steps, with exact evidence mapped to original text;
it never changes OCR words. OCR validation also rejects a restarted page
number followed by a substantially duplicated, fragmented transcription. Separate tests cover complete/partial/missing inputs,
negated heating and different tests. The Notes pipeline version is 2.1.6.
It does not include a mobile build or the temporary local sign-in UI edits.

## Files

- `smart-notes-science-history.tar`: prebuilt image; distribute instead of
  committing it to GitHub.
- `compose.production.yaml`: this Notes service only, with persistent volumes.
- `.env.production.example`: destination configuration template, no real keys.
- `check-config.cjs`: validates configuration/model identity before startup.
- `check-dependencies.cjs`: checks storage, textbook databases, Clerk public
  keys and retrieval embeddings without processing a student's note.
- `release-manifest.json` and `SHA256SUMS`: image/model identities and checksums.

## Start on the destination host

Run these commands from the release folder. Configure `.env.production` using
the existing service credentials through your server's private secret storage;
do not upload that file to GitHub or redistribute it with the release.

```sh
sha256sum -c SHA256SUMS
docker load -i smart-notes-science-history.tar
cp .env.production.example .env.production
# Edit .env.production with the actual destination settings before continuing.
docker compose -f compose.production.yaml config --quiet
docker compose -f compose.production.yaml run --rm --no-deps notes-coverage node /release/check-config.cjs
docker compose -f compose.production.yaml run --rm --no-deps notes-coverage node /release/check-dependencies.cjs
```

Continue only if the dependency report has `ready: true`. The first retrieval
embedding check can download a public model into the persistent cache. A cold
curriculum database can time out initially; retry the read-only check once
after the database wakes. Resolve persistent failures before sending uploads.

```sh
docker compose -f compose.production.yaml up -d
curl --fail http://127.0.0.1:8005/api/health
docker compose -f compose.production.yaml ps
```

PowerShell users can use `Copy-Item .env.production.example .env.production`,
`Get-FileHash smart-notes-science-history.tar -Algorithm SHA256` and
`Invoke-RestMethod http://127.0.0.1:8005/api/health`. Compare the archive hash
with `SHA256SUMS` before loading.

The release tag is
`smart-notes-coverage:science-v31-history-v51-release-20261017-presentation`.
It points to image ID
`sha256:3b793ee5b886edf175046eb3a2767cb5110934aecfeafeb20d69c749ade0a500`.
`pull_policy: never` ensures this profile uses the loaded image.

## Destination connections

The model inference runtime is bundled. OCR and the full Notes service still
need MongoDB, Groq, the existing curriculum PostgreSQL database and its ingested
Qdrant textbook collection. The image does not copy those databases. Keep the
retrieval model/dimension consistent with the existing collection; the default
is Nomic v1.5 with 768-dimensional vectors. The MiniLM encoder bundled for the
History classifier is separate from that retrieval encoder.

`localhost` in a database URL means this Notes container. For Qdrant on the
Docker host, use `http://host.docker.internal:6333`; otherwise configure a
reachable private service address. `CLERK_ISSUER_URL` must match the deployed
app's Clerk instance, and `CLERK_AUTHORIZED_PARTIES` must list its exact frontend
origins. Public frontend origins must use HTTPS. Existing local loopback origins
are accepted for testing only. Optional speech-provider credentials can be
added privately; without them, the existing transcript fallback remains.

Port 8005 is published on loopback for a destination HTTPS reverse proxy.
No public exposure, DNS, TLS, shared gateway or other member's infrastructure
is configured by this release. The gateway owner should route `/api/notes/`
to this backend and strip that leading prefix. Preserve the existing contract:

| Through the gateway | At the Notes backend |
| --- | --- |
| `/api/notes/api/health` | `/api/health` |
| `/api/notes/api/notes` | `/api/notes` |
| `/api/notes/api/history-coverage/concepts` | `/api/history-coverage/concepts` |
| `/api/notes/uploads/<file>` | `/uploads/<file>` |

Authenticated Notes and History requests require the current Clerk bearer
token. The mobile application must use the destination gateway URL when it is
built. Its shared gateway/provider code has not been changed here.

## Data and operating scope

Named volumes retain uploaded photos, generated audio and downloaded retrieval
models. The distributed image has no credentials or student media. Reusing the
same MongoDB does not copy old photos: migrate their existing uploads/audio
volumes separately and privately if retaining old notes on a different server.

Use one Notes backend instance for this release. Wait for active processing to
finish before maintenance. History accepts one check at a time; a cold first
check can take longer while its encoder loads. The existing UI reports that
state. A check interrupted by a restart expires after two minutes and can be
requested again. Results are hidden as stale when the source note or lesson
context changes. Analysis workers renew a 90-second lease; an abandoned attempt
is recovered when the note is opened/listed, keeping prior analysis if available.
A 15-minute limit bounds how long an attempt can own the note; an expired
worker cannot publish its result over a newer attempt.
The mobile processing view pauses automatic polling after two minutes and offers
a manual check. Multi-instance scheduling and automatic restart/resume are not
provided by this release.

```sh
# Stop this Notes instance while preserving all its data volumes:
docker compose -f compose.production.yaml down
```

Do not add `--volumes` when stopping an instance containing student data.
The previously recorded targeted temporary sign-in rollback was applied on
18 October 2026. Permanent Notes authentication and feature fixes were preserved.

## Verification

The exact image passed all 15 frozen Science/History regression cases with
networking disabled, a read-only filesystem and no host data mounts. Prior
Notes verification passed 117 backend tests, 47 focused mobile tests and five
trained-Science pipeline tests. Four release-configuration tests pass.
The isolated production-profile test uses port 8006 and separate test volumes;
the ordinary local app remains on 8082 and its backend on 8005. See the release
manifest for final dependency/startup checks. These checks establish packaging
and integration behavior, not a real-note accuracy percentage.
