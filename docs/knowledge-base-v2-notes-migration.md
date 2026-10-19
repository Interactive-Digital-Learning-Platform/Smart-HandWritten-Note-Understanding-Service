# Notes migration to Knowledge Base v2

19 October 2026. Based on the supplied `knowledge-base-v2-migration-guide.md`.
The Notes changes and local deployment helpers are in this repository. The
official ingestion v2 release is checked out separately, without editing its
application code or the original dirty ingestion checkout. Shared cloud data,
other members' functions and trained model weights are unchanged.

## Prepared changes

- Configuration and environment templates use `pdf_knowledge_base_v2`.
  Explicit v1 configuration fails validation rather than silently using it.
- All Notes Qdrant readers (stats, vector queries, chapter/inventory scrolls,
  ICT references and diagnostic scripts) send `QDRANT_API_KEY` when configured.
  Cloud endpoints require HTTPS and a non-placeholder key. Errors omit request
  objects/secret headers.
- Dense requests use `using: "dense"`. The older endpoint compatibility path
  uses `vector: { name: "dense", vector: [...] }`; it is attempted only for
  unsupported endpoints, not authentication/strict-mode/provider errors.
- Collection checks read `vectors.dense.size` and cosine distance. An unnamed
  v1 schema or mismatched dimension fails explicitly. The existing Nomic
  768-dimensional `search_query: ` embedding path is retained. Dense-only is a
  supported v2 mode; no BM25 runtime or new embedding model is introduced.
- Optional subject/grade search filters use indexed tags. Existing chapter
  matching still accepts untagged textbooks using its filename/page checks.
  Chapter scrolls filter on indexed `filename`; ICT scrolls filter only on
  indexed `job_id`. Unindexed `pages`, `page_start`, `text`, `source` and `lesson`
  are never used as Qdrant filters.
- The verified upstream writer uses **one-based** PDF pages, contrary to the
  supplied guide. `QDRANT_PAYLOAD_PAGE_BASE=1` is the default. Set it explicitly
  to `0` only for a separately verified zero-based writer; Notes then converts
  once for its existing TOC/UI. Raw payload metadata is retained. Missing page
  metadata is not interpreted as page one.
- Notes' PostgreSQL inventory/health/job queries are scoped to the configured
  collection. Successful old v1 jobs cannot advertise textbooks as ingested in v2.
- Docker Compose respects the configured cloud URL instead of overriding it
  with `host.docker.internal`. `COVERAGE_QDRANT_URL` remains an explicit optional
  override for local tests. The image gets a separate `-kb-v2` tag.

## Local rollout completed

After refreshing the remote, official `main` at
`cf206469347c093f7d4313a2e3b81f9bf6e6c9d9` provides the v2 writer and migrations.
It is cloned into the sibling `PDF-Ingestion-Backend-Service-v2-local` directory.
An isolated PostgreSQL/Redis/Qdrant/MinIO stack uses new volumes and loopback
ports. Upstream migrations 006/007 create the v2 schema and indexes; destructive
v1 retirement migration 008 was not run. The original v1 collection remains.

Five supplied Science/History textbooks were re-ingested through the actual
v2 API, yielding 1,541 chunks with dense and BM25 vectors. All five jobs are done.
Readiness, scoped semantic search, PostgreSQL inventory and all 45 registered
Science/History chapter bounds pass inside the activated Notes container.
This verifies retrieval availability, not completeness or accuracy of every
textbook concept. See [local setup and restart instructions](../deployment/kb-v2-local/README.md).

The shared cloud endpoint/key is still unavailable. A cloud rollout requires
the ingestion owners to provision equivalent v2 data and confirm its page
convention. Configure the Notes service's private `.env` (never commit the key):

```dotenv
QDRANT_DB_URL=https://<cluster-id>.<region>.cloud.qdrant.io:6333
QDRANT_API_KEY=<shared-key>
QDRANT_COLLECTION=pdf_knowledge_base_v2
QDRANT_PAYLOAD_PAGE_BASE=1
```

The ingestion owners must apply their v2 migrations and re-upload textbooks to
that collection. Use subject/grade upload tags, particularly for the scoped
readiness test. Then run:

```sh
npm run kb:verify-v2
npm run kb:verify
docker compose -f compose.coverage.yaml build notes-coverage
docker compose -f compose.coverage.yaml up -d --no-deps notes-coverage
```

`kb:verify-v2` is read-only: checks the named dense schema, all six documented
indexes, nonempty data and a Science/Grade 10 search through the Notes retrieval
service. `kb:verify` checks registered Science/History chapter coverage. Neither
command mutates ingestion or sends student notes to an AI provider.

The current Notes container uses the local v2 override. Historical frozen image
profiles need a rebuild from this source; changing their environment alone is
insufficient. The cloud commands above do not apply the local override.

## ICT source identity

ICT manual checks keep their existing frozen model and verified PDF/job bindings.
Reference lookup now paginates the pinned job without filtering unindexed pages.
A re-upload creates a new job ID: its PDF/source identity must be verified before
rebinding this reference feature. Filename equality alone is not accepted as proof.
An unavailable old reference remains unavailable instead of citing another upload.
This does not prevent Science/History retrieval or offline model inference.

## Validation

Contract checks cover authentication on query/scroll/reference readers, named
vector dimension checks, indexed tag filters, the named legacy endpoint form,
non-retryable errors, page zero and preserved raw metadata, chapter boundaries,
old-job exclusion and paginated ICT source isolation. Tests use mocks and public
typed examples, not the unavailable shared cloud cluster.

Completed: TypeScript build; all 161 default Notes regression tests; focused
v2/lesson-guide checks; Docker image build; live local retrieval and inventory;
and all 15 packaged Science/History inference fixtures on Linux with networking disabled.
Science V3.5, History V6.2 and ICT V3.1 artifact hashes are unchanged.

Active local image:
`smart-notes-coverage:science-v35-history-v62-ict-v31-materials-v31-ocr-v2-kb-v2-local`.
Image ID:
`sha256:f8a51ec1403a2286658d24f3e148acfce044307b7ed7dd540dac3bd1af34dd98`.
The earlier cloud-preparation manifest is historical and not the active local
release. See the [local manifest](../deployment/kb-v2-local/release-manifest.json).

## Upload-path follow-up

Selecting a lesson during upload previously returned from lesson identification
before retrieving textbook passages. The selected-lesson path now retrieves
references using that lesson's subject, grade and title. A retrieval failure
keeps the selected checklist and adds a readable warning, without exposing
provider errors. Two regression tests cover correct scope and graceful failure.

The rebuilt container passed local multipart storage, signed-JWT authentication,
ownership, note polling, pre-analysis material rejection and deletion checks.
Both selected Science/History lessons retrieved six actual v2 passages. The
test uses a temporary loopback server with the production routers and verified
test JWTs; it does not bypass or alter the running server's Clerk authentication.
Test images, notes and materials were removed after the run.

Browser access was blocked by the browser tool. The user subsequently approved
the new synthetic images and textbook excerpts going to Groq. Science image
analysis and both subjects' model/material components were exercised. The final
fresh History attempt was blocked by Groq vision quota. No complete fresh-image
or browser pass is claimed. See the [detailed retest](notes-v2-upload-retest-2026-10-19.md)
for OCR, material-ordering, guide-repair and provider-quota fixes and evidence.
