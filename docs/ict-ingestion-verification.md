# ICT ingestion verification - 2026-10-15

**Recovery completed: both original ICT textbooks have been re-ingested and verified.** The restarted API and Celery worker use the corrected upload and source-page tracking logic. The original, corrupted jobs were preserved. The app now includes explicit ICT model checking and references pinned to the verified jobs; see `docs/ict-mobile-integration.md`.

## Initial audit

The owner reported ingesting both textbooks. Read-only checks confirmed completed jobs, MinIO objects and the corresponding Qdrant points. No files were uploaded, jobs altered, vectors written or services restarted during that initial audit.

| Grade | Job ID | Reported/indexed chunks | Extracted pages |
| --- | --- | ---: | ---: |
| 10 | `fc0e19ef-0642-4911-88ef-39efe2299775` | 290 / 290 | 273 |
| 11 | `77425e33-af60-4214-8dfa-85c04a5cb685` | 158 / 158 | 171 |

Extracted-page counts are not total PDF page counts. The originals contain 300 and 200 pages respectively. The index payload filenames and nonempty-text checks passed, but the source-integrity check failed for both books.

## Confirmed upload corruption

`PDF-Ingestion-Backend-Service/app/services/storage_service.py` read the first and second input blocks, then mistakenly appended the first again. The second was lost. The upload route reads 1 MiB blocks. For each original PDF, hashing `original[:1MiB] + original[:1MiB] + original[2MiB:]` exactly reproduces the stored object's hash:

| Grade | Stored SHA-256 | Original SHA-256 |
| --- | --- | --- |
| 10 | `b7c58d639b77c2a6b631a2b38e428a33b60c2a27caf0e12b9ca1797bddf441d8` | `0562035a2b8201df08e0917e70e37d834c77be2662283a8a878acc444db9a4e5` |
| 11 | `f5e1fcf2f7eeea66dff99d332751e5baf47e311c2cc564d3e5ed00b26e717519` | `9d9c1a102b4e077916dd7f9a89381c6de96d0c57f75bef868e258ff33959e029` |

MuPDF reports invalid PDF objects in both stored files. Grade 10's CPU source page 53 and Grade 11 source pages 74, 77, 80, 85 and 86 are not recoverable as matching source text in the stored PDFs. Indexed page labels also omit these numbers. Page-text similarity candidates are diagnostic guesses, not approved replacement references.

The fix appends and counts the actual second block. Six tests in `PDF-Ingestion-Backend-Service/tests/test_storage_upload.py` pass: empty/single input, distinct two-block input, uneven multi-block boundaries, realistic 1 MiB PDF blocks, second-block size limits and aborting an oversized in-progress upload. Tests use mocked storage and write no external data.

## Other findings

Three old Grade 10 chunks and two old Grade 11 chunks have page 0 in their metadata. The old chunker reconstructed source offsets from transformed chunk lengths; overlapping windows and trimming made those offsets diverge from the original document. The correction carries original character ranges through section splitting, paragraph assembly, overlapping windows and small-chunk merges. Page overlap uses half-open ranges; a chunk with no valid source page is rejected.

Six page-attribution regressions pass, including overlapping windows, headings/whitespace, merged chunks, cross-page boundaries, skipped page numbers and empty input. Together with the upload tests, all 12 tests pass. Targeted Ruff checks pass. Replaying the old and corrected chunkers over both original textbooks confirms identical chunk text and ordering (333 and 191 chunks before batch deduplication); only source tracking changes.

The backend Grade 11 registry uses `ICT G-11 E.pdf`; the upload uses `ICT grade 11.pdf`. A filename alias now recognizes this upload without matching Grade 10. Six filename tests and `npm run build` pass. This is a code change; running backend/container processes were not reloaded by the audit.

## Completed recovery

The API and worker were stopped when recovery began. They were started in hidden background processes on the normal port/queue, using the existing environment and locally cached Nomic encoder. No dependency containers or unrelated apps were restarted. Service logs and launcher IDs are under `output/ict-ingestion/reingest-2026-10-15/` in the workspace root.

| Grade | Replacement job ID | Extracted / total PDF pages | Verified chunks | Completed UTC |
| --- | --- | ---: | ---: | --- |
| 10 | `3fa953c7-3d14-4612-9bed-b3887cf1a624` | 299 / 300 | 325 | 13:43:43 |
| 11 | `f5110037-6100-45ac-b3b6-ae6baded7ea9` | 197 / 200 | 185 | 13:47:24 |

Both stored PDFs exactly match the frozen original SHA-256 values in the table above. All 510 expected unique chunk texts are indexed, and every indexed chunk's page list and starting page match a fresh extraction/chunking replay from its original PDF. All 12 model source-page numbers are represented (7 Grade 10 and 5 Grade 11), and neither new job contains a page-0 chunk. Extractor thresholds still skip pages with insufficient text; these counts do not claim OCR of every page.

Ten semantic queries, one for each reviewed pilot concept, used `nomic-ai/nomic-embed-text-v1.5` and filters pinned to the replacement job IDs. Every query found an expected source page within the top five results. The matching source was first for eight queries and second for CPU/DNS. Returned passages were inspected for relevance. This is a small textbook-retrieval smoke check, not coverage-model accuracy, full-syllabus retrieval evaluation or mobile/OCR testing.

The report is `ml-training/outputs/ict-ingestion-reingest-2026-10-15/semantic-audit.json`; both `sourceAndIndexChecksPassed` and `allSemanticExpectedPagesInTop5` are true. The same directory contains `jobs.json`, `chunker-compatibility.json`, `grade10/source-index-audit.json` and the final service-health check. The initial failed audit remains in `ml-training/outputs/ict-ingestion-verification-2026-10-15/source-index-audit.json`.

Reproduce the final read-only audit from the ingestion repository using its Python environment:

```powershell
.venv/Scripts/python.exe -B ../Smart-HandWritten-Note-Understanding-Service/ml-training/verify_ict_ingestion.py `
  --semantic `
  --jobs-manifest ../Smart-HandWritten-Note-Understanding-Service/ml-training/outputs/ict-ingestion-reingest-2026-10-15/jobs.json `
  --output-dir ../Smart-HandWritten-Note-Understanding-Service/ml-training/outputs/ict-ingestion-reingest-2026-10-15
```

## Next integration work

Use the replacement IDs above as the verified ICT sources. Old corrupted jobs, stored objects and vector points remain available for comparison; filename-only searches do not distinguish them. Before student-facing ICT retrieval is enabled, select the verified jobs explicitly or retire the superseded sources. Today's verification deliberately isolates the new jobs and does not assert that global app retrieval excludes the old ones.

The review-required ICT model is now connected to backend/mobile and the portable deployment bundle; its own textbook endpoint explicitly selects these replacement jobs. A curriculum-wide automatic mapping is not enabled. The original training/intake manifests describe their earlier stage and remain unchanged.
