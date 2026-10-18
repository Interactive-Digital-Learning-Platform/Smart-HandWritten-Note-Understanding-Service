# Geography re-ingestion verification - 2026-10-15

Both intact Geography textbook originals have been re-ingested through the corrected API and verified in storage and Qdrant. The earlier corrupted jobs, objects and indexed points were preserved. No Geography coverage model was trained or enabled by this work.

| Grade | Verified replacement job | Extracted / total PDF pages | Expected / indexed chunks | Completed UTC |
| --- | --- | ---: | ---: | --- |
| 10 | `a7cc0dd4-5a6a-439d-9854-b8b8dac4ae2e` | 157 / 169 | 193 / 193 | 14:50:17 |
| 11 | `f9629a8a-ae77-435d-a0cc-fc9f98325a81` | 166 / 168 | 132 / 132 | 14:53:19 |

## Verified integrity and page references

The frozen originals are the files under `C:/Users/DLK/Downloads/Document from Dinuka (DLK)/`. The extra Grade 10 copy under `TEXT books` is byte-identical and was not uploaded separately. Both stored PDFs match their respective original SHA-256 values exactly:

- Grade 10: `cb378554c9a3c23f2e2b6f49742cd50cfe1cb85f661a148329b25c1a4aa7556a`.
- Grade 11: `5f409c40dd8bbaf8cab18ff82b14b53d529f0e4a6a88e3f38e8748098e303cd0`.

The verifier replayed extraction, batching, overlap, chunking and deduplication against the originals, without embedding or indexing again. All **325 expected unique chunk texts** are present in the replacement jobs. Every chunk's page list and starting page agree with the replay. Reported, exact Qdrant and replay counts match. Both books have nonempty payload text and matching filenames; no replacement chunk has a missing, zero, negative or out-of-range page number.

The normal extractor requires sufficient text and leaves OCR fallback disabled. It skipped 12 low-text Grade 10 pages and 2 Grade 11 pages. This is expected under the existing extraction policy; verification does not claim OCR or visual understanding of every diagram/map page. The complete original PDFs are stored intact.

## Retrieval checks

Ten source-linked queries were selected and saved before querying the new index. They use the ingestion service's existing `nomic-ai/nomic-embed-text-v1.5` encoder and filter results to the appropriate replacement job ID. Each requires an expected one-based PDF page and selected source terms in a returned chunk.

| Grade | Textbook topic | Expected PDF page | Top-five check |
| --- | --- | ---: | --- |
| 10 | Earth subsystems | 13 | Passed |
| 10 | Lithosphere | 14 | Passed |
| 10 | Troposphere | 16 | Passed |
| 10 | Plantation agriculture | 51 | Passed |
| 10 | Topographic map key | 164 | Passed |
| 11 | Natural resources | 11 | Passed |
| 11 | Sedimentary rocks | 14 | Passed |
| 11 | Population density | 67 | Passed |
| 11 | Landslide mitigation | 115 | Passed |
| 11 | Greenhouse effect | 127 | Passed |

All ten checks passed. Retrieved excerpts were inspected for relevance; the population-density definition and formula are in the third result, alongside a broader topic match in the second. These are small textbook-retrieval smoke checks, not approved training criteria, full-syllabus evaluation or coverage-model accuracy results.

## Service repair and health

The ingestion API and existing shared worker were available. The first Geography upload encountered `asyncpg InterfaceError: connection is closed` on insertion of the job record. A database check confirmed no replacement job had been committed before retrying.

`PDF-Ingestion-Backend-Service/app/core/database.py` now enables SQLAlchemy `pool_pre_ping=True` and `pool_recycle=300`, so expired pooled connections are checked/replaced before upload transactions. Only the ingestion API was restarted to activate this correction. The worker, dependency containers, notes backend and mobile app were left running. Both uploads then succeeded under the existing ingestion account. No account was invented and no duplicate database jobs were created by the failed attempt.

All 12 existing upload and page-attribution regressions pass. Final checks confirm the API health route responds, the database-backed `/ingest/jobs` route returns HTTP 200 after the idle period, and the worker responds to ping. The two original Geography job/index counts remain unchanged at 193 and 97.

## Evidence and reproduction

The source freeze is `ml-training/outputs/geography-source-intake-2026-10-15/manifest.json`, with complete page text in `pages.jsonl` and the preselected checks in `retrieval-checks.json`. Its manifest records a pre-ingestion freeze stage; current completion evidence is separate.

`ml-training/outputs/geography-ingestion-reingest-2026-10-15/` contains:

- `jobs.json`: replacement IDs, original hashes and final job status.
- `semantic-audit.json`: full source, chunk/page and retrieval results. `sourceAndIndexChecksPassed` and `allRetrievalChecksPassed` are true.
- `source-index-audit-grade10.json`: the earlier completed Grade 10 integrity check.
- `verified-textbooks.json`: compact verified source bindings for subsequent model preparation.
- `service-health.json`: final API/worker health and preservation checks.

The API restart record/logs are in workspace `output/geography-ingestion/reingest-2026-10-15/`; the unchanged shared worker continues logging in `output/ict-ingestion/reingest-2026-10-15/`.

Run a fresh read-only verification from the ingestion repository:

```powershell
$env:HF_HUB_OFFLINE = '1'
.venv/Scripts/python.exe -B ../Smart-HandWritten-Note-Understanding-Service/ml-training/verify_geography_ingestion.py --semantic
```

The uploader's saved manifest prevents resubmitting a grade that already has a recorded replacement job. Re-running status checks does not upload again.

## Next model-preparation step

Use these verified replacement jobs explicitly in future Geography references. Filename-only searches can still include the preserved corrupted records; this verification deliberately isolates the replacements and does not change global app retrieval.

The existing Grade 11 registry entry named "Physical Landscape of Sri Lanka" must not be assumed to describe this PDF: this original starts "Natural Resources of the Earth" on PDF page 11. Confirm the source-derived chapter/page mapping during integration. Update after the user supplied guides: Grade 10 is English, Grade 11 is Sinhala with legacy font extraction. A ten-concept, thirty-example proposed English review packet is ready; Grade 11 criteria use the English textbook and detailed guide alignment remains pending. See `geography-criteria-review.md`. No Geography accuracy claim is established by ingestion or this development packet alone.
