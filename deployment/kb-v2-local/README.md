# Local Knowledge Base v2 for Notes

Verified 19 October 2026. The running Notes backend uses local v2, without
requiring cloud credentials. This setup is private development infrastructure.

## Running services

| Service | Loopback address |
| --- | --- |
| Notes health | http://127.0.0.1:8005/api/health |
| Official ingestion API | http://127.0.0.1:8011/docs |
| Qdrant REST | http://127.0.0.1:6335 (API key required) |
| PostgreSQL | 127.0.0.1:5433 |
| Redis | 127.0.0.1:6380 |
| MinIO API / console | http://127.0.0.1:9010 / http://127.0.0.1:9011 |

The Docker infrastructure and Notes restart automatically with Docker Desktop.
The Windows ingestion API and optional worker must be restarted after reboot.
From the Notes repository in PowerShell:

```powershell
& ./deployment/kb-v2-local/start.ps1 -WithWorker
```

Use `start.ps1` without `-WithWorker` when only retrieving existing books, to
save RAM. New uploads require the worker. It runs one job at a time with the
Windows-compatible solo pool. Logs are in the sibling ingestion checkout's
`.local/logs/`. Existing files are already imported; do not upload duplicates.

To rebuild or recreate only Notes, preserving its volumes:

```powershell
docker compose --env-file deployment/kb-v2-local/.env.local -f compose.coverage.yaml -f deployment/kb-v2-local/notes.override.yaml build notes-coverage
docker compose --env-file deployment/kb-v2-local/.env.local -f compose.coverage.yaml -f deployment/kb-v2-local/notes.override.yaml up -d --no-deps notes-coverage
npm.cmd run kb:verify-v2
npm.cmd run kb:verify
```

For the additional read-only API authentication, strict filtering and import
checks, run from the sibling `PDF-Ingestion-Backend-Service-v2-local` folder:

```powershell
.venv/Scripts/python.exe ../Smart-HandWritten-Note-Understanding-Service/deployment/kb-v2-local/verify.py
```

The override attaches Notes directly to the isolated Docker network. Native
Notes commands use equivalent loopback addresses from the private root `.env`.
No mobile URL or other member's application code was changed.

## Data and source identity

Official ingestion upstream commit:
`cf206469347c093f7d4313a2e3b81f9bf6e6c9d9`, in the sibling
`PDF-Ingestion-Backend-Service-v2-local` checkout. Its application code is
unmodified. This workstation's separate Python environment reuses heavy
dependencies from the original ingestion virtual environment read-only via
`site.addsitedir`; it adds fastembed and a compatible qdrant-client locally.
This workstation environment is not a portable production image.

The official extractor stores **one-based PDF pages**. Notes uses
`QDRANT_PAYLOAD_PAGE_BASE=1`. This corrects the supplied migration guide's
zero-based description. Collection `pdf_knowledge_base_v2` has named dense
768-dimensional cosine vectors, BM25 sparse vectors, six payload indexes and
strict filtering. Notes uses dense retrieval with `search_query: ` embeddings.

| Textbook | Chunks | Extracted pages reported by pipeline |
| --- | ---: | ---: |
| Science Grade 10 | 433 | 403 |
| Science Grade 11 part 1 | 262 | 219 |
| Science Grade 11 part 2 | 291 | 224 |
| History Grade 10 | 325 | 144 |
| History Grade 11 | 230 | 155 |

All five jobs completed; 1,541 chunks total. Page counts are pipeline output,
not a claim that every physical PDF page has extractable text. All 45 registered
chapter bounds have chunks: Science G10 12, Science G11 15, History G10 10,
History G11 8. This is retrieval coverage, not model accuracy or verification
of every concept. OCR/AI generation and full student upload were not rerun for
this migration. Trained model artifacts remain unchanged.

ICT/Geography are not ingested into this isolated stack. Frozen ICT source
bindings need a separately verified re-upload/rebind before reference retrieval.

## Credentials, setup helpers and rollback

`verify-upload.cjs` exercises production Notes routes in a temporary loopback
test server, with verified test JWTs and a unique test owner. Its local-only
mode tests upload/storage/ownership/polling/deletion and retrieves selected
Science/History lesson passages without external AI calls:

```powershell
docker cp deployment/kb-v2-local/verify-upload.cjs smart-handwritten-note-understanding-service-notes-coverage-1:/app/verify-notes-upload-v2.cjs
docker exec -e NOTES_LOCAL_TEST=1 smart-handwritten-note-understanding-service-notes-coverage-1 node /app/verify-notes-upload-v2.cjs
```

The report is `/tmp/notes-v2-upload-local-report.json` inside the container.
The separate live mode sends synthetic images and textbook excerpts to Groq.
The user approved it; see the [retest report](../../docs/notes-v2-upload-retest-2026-10-19.md)
for passed material/model component checks and the final vision-quota block.
Fresh image end-to-end success is not claimed. The script's test server does
not change production authentication or validate the Clerk login/mobile UI.
Use `render-fixtures.ps1` for live-test PNGs; the container intentionally has
no font dependency. `NOTES_TEST_TEXT=1` is explicitly a provided-synthetic-text
component run, not a fresh OCR test. `NOTES_ANALYSIS_AND_CARDS_ONLY=1` skips the
long guide, and `NOTES_TEST_SUBJECT=History` selects only that fixture.

Generated credentials stay in ignored `.env.local` and the two private service
`.env` files. Never publish them. `configure_notes.py` saves the previous Notes
environment once under ignored `tmp/kb-v2-local/notes-env-before`.
`bootstrap.py` runs from the isolated ingestion checkout and applies only
upstream Qdrant migrations 006/007 to local endpoints. Alembic was applied to
the new database first. Destructive migration 008 was not run. The one-time
`ingest_textbooks.py` records job IDs and source SHA256 values in ignored
`tmp/kb-v2-local/jobs.json`; it refuses duplicate intake.

Do not use `docker compose down -v`: the named volumes hold the new knowledge
base. To stop only infrastructure without deleting data:

```powershell
docker compose --env-file deployment/kb-v2-local/.env.local -f deployment/kb-v2-local/compose.yaml stop
```

The original v1 Qdrant and dirty ingestion checkout are preserved. The previous
Notes image is `smart-notes-coverage:science-v35-history-v62-ict-v31-materials-v31-ocr-v2`.
A rollback requires the saved original environment and that image together;
the new v2 reader deliberately rejects a v1 configuration. Keep the saved
environment private. Shared cloud deployment remains a separate step after
the group leader provides its endpoint, credentials and matching v2 data.
