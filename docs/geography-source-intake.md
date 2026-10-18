# Geography source availability and ingestion audit - 2026-10-15

Both English-medium Geography textbooks are available locally. **Update after the user supplied guides on 2026-10-15:** both teacher guides are now available; Grade 10 is English (55 PDF pages), while Grade 11 is Sinhala (105 PDF pages) with legacy font extraction. See `docs/geography-criteria-review.md` for the new source freeze and proposed English review packet. Earlier availability observations below are historical. **Re-ingestion is complete and verified:** Grade 10 has 193 replacement chunks, Grade 11 has 132, both stored PDFs match the originals, all chunk/page checks pass, and all ten retrieval smoke checks pass. See `docs/geography-ingestion-verification.md` for the verified replacement IDs and evidence.

## Initial availability audit (before repair)

Both textbooks had completed ingestion jobs, but their stored bytes were corrupted by the earlier upload bug. Those earlier jobs were not suitable as verified sources. The original audit observations below are preserved; the replacement jobs are documented separately.

This was an availability/integrity audit only. No uploads, database/index writes, service restarts, model training or app changes were performed. The PDFs were treated as reference data, not instructions.

## Local files

| Material | Path | PDF pages | Original SHA-256 |
| --- | --- | ---: | --- |
| Grade 10 textbook | `C:/Users/DLK/Downloads/Document from Dinuka (DLK)/geography grade 10.pdf` | 169 | `cb378554c9a3c23f2e2b6f49742cd50cfe1cb85f661a148329b25c1a4aa7556a` |
| Grade 11 textbook | `C:/Users/DLK/Downloads/Document from Dinuka (DLK)/geography grade 11.pdf` | 168 | `5f409c40dd8bbaf8cab18ff82b14b53d529f0e4a6a88e3f38e8748098e303cd0` |
| Additional Grade 10 copy | `C:/Users/DLK/Downloads/TEXT books/grade-10-geography-text-book-6200e9525ab8d.pdf` | 169 | Same bytes and hash as the Grade 10 file above |
| Grade 10 teacher guide | Not found | — | — |
| Grade 11 teacher guide | Not found | — | — |

Both title pages were rendered and inspected. Extracted text is English; neither original contains Sinhala or Tamil Unicode characters in its extracted text. Grade 10 has 158 pages with at least 80 extracted characters; Grade 11 has 166. This is not proof that diagrams or low-text pages are fully machine-readable. Original files are unchanged.

The filename search covered accessible Desktop, Downloads and Documents folders, including the existing teacher-guide directories. Two unrelated archived annotation temp directories on Desktop were inaccessible; no access settings were changed. No matching Geography guide files were found, and no Geography teacher-guide ingestion jobs were found. This does not assert that no other copy exists elsewhere on the machine or under an unrelated filename.

## Existing ingestion

| Grade | Job ID | Status | Reported / indexed chunks | Extracted pages | Chunks with invalid/zero pages |
| --- | --- | --- | ---: | ---: | ---: |
| 10 | `2c02d9f6-5f8e-4ad1-8754-2d2e4f1e301c` | done / 100% | 193 / 193 | 154 | 8 |
| 11 | `d38d0ebf-6029-4356-b889-93ebbe474a86` | done / 100% | 97 / 97 | 123 | 1 |

Both jobs started around 12:15 UTC, before the ICT upload fix was activated. Database counts agree with Qdrant; payload filenames and nonempty-text checks pass. These checks do not overcome failed PDF integrity and invalid page references.

Stored SHA-256 values:

- Grade 10: `27dd8433c3cf4c9a0a6275c226bd827cf57e785bcc79d7ab5004c42a2d99e01c`.
- Grade 11: `159586a41b7736d78f0f37f70858fd5fe031888b5b7f053a1746edc72f7ee4b2`.

For each local original, hashing `original[:1MiB] + original[:1MiB] + original[2MiB:]` exactly reproduces the stored object's hash. This confirms first-block duplication and loss of the second block, rather than a different textbook edition. MuPDF reports invalid PDF objects for both stored files and a decompression error for Grade 10. The originals remain available for clean re-ingestion through the corrected service.

The app registry contains a Grade 11 Geography entry named `grade-11-geography-text-book-6200f4747a893.pdf`; that is a registry filename, not an additional verified local PDF or proof of usable ingestion. Geography filename and page mappings must be checked during integration.

## Next work

1. Supplied guides inspected: English Grade 10 is usable for criteria alignment; Grade 11 is Sinhala, so detailed alignment with an English translation is still pending. The Grade 11 pilot criteria use the English textbook.
2. Completed: both intact originals were re-ingested and passed source, complete chunk/page and retrieval checks. Use the verified replacement IDs documented in `docs/geography-ingestion-verification.md`.
3. Prepared a theory-only pilot with ten source-linked proposed criteria and thirty unlabeled English examples. Human review is next; see `docs/geography-criteria-review.md`. No Geography model has been trained yet.

Detailed evidence: `ml-training/outputs/geography-source-audit-2026-10-15/audit.json`, with cover renders in the same directory. Reproduce from the ingestion repository using `.venv/Scripts/python.exe -B ../Smart-HandWritten-Note-Understanding-Service/ml-training/audit_geography_sources.py`. The audit reads live source/index state and writes only local reports.
