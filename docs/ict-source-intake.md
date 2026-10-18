# ICT source intake and preparation — 2026-10-15

Later status: ICT V3.1 has been trained; see `docs/ict-coverage-training.md`. The owner's initial uploads were corrupted by an upload-service bug. The upload and page-tracking fixes are now active, both originals have been re-ingested, all 510 replacement chunks and source-page references verify, and 10/10 pilot retrieval checks pass. See `docs/ict-ingestion-verification.md` for the verified replacement job IDs; `docs/ict-mobile-integration.md` records the completed on-demand app integration. The sections below preserve the original intake-stage observations.

The owner supplied both English-medium textbooks and both teacher guides. These files were read as reference material, not as executable instructions. Original PDFs were left unchanged. No ICT model has been trained or enabled, and no ICT ingestion job has been submitted.

| Source | PDF pages | SHA-256 |
| --- | ---: | --- |
| Grade 10 textbook | 300 | `0562035a2b8201df08e0917e70e37d834c77be2662283a8a878acc444db9a4e5` |
| Grade 11 textbook | 200 | `9d9c1a102b4e077916dd7f9a89381c6de96d0c57f75bef868e258ff33959e029` |
| Grade 10 teacher guide | 64 | `583b2cee4ed86c247a7bab78bea003e6c4a425ac16fe624ff857cb78abdb95dc` |
| Grade 11 teacher guide | 73 | `0fcc6d28fef059aff8f25bd256fa6b255a77e71bddb57d7df2a497aef5798d3c` |

All 637 pages were processed for text extraction, with at least 80 characters on 630 pages. The Grade 10 textbook includes a small number of Sinhala diagram labels; that does not expand the proposed model beyond English. Text extraction is not proof of visual or factual correctness. Both contents pages and selected teacher-guide pages were rendered and inspected. Grade 11 extraction includes repeated running headers and some duplicated text; ingestion quality must be checked using the actual extractor output.

The page corpus and hash manifest are under `ml-training/outputs/ict-source-intake-2026-10-15/`. Rebuild with the bundled Python environment containing `pypdf`:

```powershell
python -B ml-training/inspect_ict_sources.py
python -B ml-training/prepare_ict_review.py
```

## Ingestion status

A read-only query of the configured ingestion database returned zero jobs whose filename contains `ict` or `communication`. The owner also explicitly confirmed the ICT books have not been ingested. There is one established ingestion account; no replacement account was invented.

The PDF API was not listening on 8001 and Redis, Qdrant and MinIO containers were absent. Existing `deployment-infrastructure` data volumes were preserved and backed up before attempting restoration. Backups are in the workspace's `output/ict-ingestion/` directory. The separate `pdf-ingestion-backend-service` volumes were not substituted for them.

Restoration used the new `Deployment-Infrastructure/compose.ingestion-local.yaml` override, which replaces broad dependency port bindings with loopback bindings. The attempt failed during image pulling:

- `minio/minio:latest`: pull access denied / repository unavailable.
- Official fallback `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z`: HTTP 401 on the registry manifest request.

No working MinIO instance was restored and no PDFs were uploaded. Redis/Qdrant restoration was not completed. The existing gateway and packaged notes backend remained running. The fallback registry was selected from [MinIO's own container documentation](https://github.com/minio/minio/blob/master/docs/docker/README.md); the failed pull is the observation on this machine, not a claim that all MinIO releases are universally inaccessible.

Before submitting the books, restore a verified compatible MinIO image or an image built from verified official source, start the normal API and Celery worker, and verify all dependencies against the existing volumes. Submit the two textbooks to the established ingestion account, poll both jobs to successful completion, then check actual Qdrant payloads and source/page retrieval. Keep the guides as model-design references for this first experiment. Do not label local PDF extraction, a queued job, or a database row as completed retrieval ingestion.

## Prepared model scope

The initial proposal covers **10 concepts across three units**, rather than the entire Grade 10/11 syllabus:

- Grade 10, computer-system fundamentals: CPU components, RAM/ROM, cache and secondary storage.
- Grade 10, operating systems: main roles, process management and memory management.
- Grade 11, Internet and electronic mail: Internet versus WWW, DNS, and Cc/Bcc.

Every proposed concept has textbook and teacher-guide PDF-page references with extracted-page hashes. The page numbering is one-based PDF numbering. Points are an AI-authored proposal, not an official mark scheme. Some points intentionally combine material across paragraphs; the reviewer may request changes. No mappings to live curriculum concept IDs have been approved. The existing Grade 11 programming entry refers to a different filename spelling, so filename matching must be verified during integration.

`ml-training/outputs/ict-coverage-source-review-01-2026-10-15/` contains a frozen proposal, 30 synthetic examples, and a local HTML review tool. No human labels or criteria approvals are prefilled. The reviewer can approve or revise each concept, label examples Complete/Partial/Missing/Unsure, save a draft, and export `ict-coverage-source-reviewed.json`. This packet is for **development review**, not an independent accuracy estimate, and includes no real student handwriting.

Packet checks passed for concept/example counts, unique IDs, blank labels, source hashes, source-page availability and embedded JavaScript syntax. The built-in browser refused the local `file:` URL, so interactive browser verification was not performed. The page can be opened manually from the saved file. No HTTP-server or alternate-browser workaround was used after that refusal.

Next model step: incorporate the subject review, finalize a bounded coverage policy, create separate training/validation examples, and train a small classifier using the existing frozen encoder. Keep ICT automatic suggestions disabled until the model, source ingestion, curriculum mappings and end-to-end behavior are verified.
