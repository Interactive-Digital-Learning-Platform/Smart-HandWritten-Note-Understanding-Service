# Geography proposed criteria review - 2026-10-15

The two user-supplied teacher guides have been inspected without modifying their files. Grade 10 is an English guide, implemented from 2015, with 55 PDF pages. Grade 11 is a Sinhala guide, implemented from 2016, with 105 PDF pages. Its cover and contents were inspected visually; extracted legacy-font strings must not be treated as English. No detailed English translation or Grade 11 teacher-guide criterion alignment is claimed.

The combined source freeze is `ml-training/outputs/geography-review-source-intake-2026-10-15/manifest.json`. It retains both verified textbook hashes and adds both guides. Its 497 page records each include a text hash. The original textbook-only ingestion freeze is unchanged. Guides are design references and were not submitted for knowledge-base ingestion.

Guide hashes:

- Grade 10: `eba86d10c85637c85c0ef43f07ca904475bae81c8156cb716af0c211e783827d`.
- Grade 11: `86e28ca9317b611de951ce842f47a490d1e4da2bd8a25a4f5ae0b7ec5a6fafaa`.

## Review packet

Open `ml-training/outputs/geography-coverage-source-review-01-2026-10-15/review.html`. Enter your name, approve or request changes to each criterion, and label all thirty examples. Choose Unsure when a factual conflict or ambiguous requirement needs discussion. Explain criteria marked Needs changes. Download the completed `geography-coverage-source-reviewed.json` and return it for analysis. Draft download and local browser storage support unfinished reviews.

Proposed scope is ten theory concepts, five per grade:

| Grade | Concept | Textbook PDF pages | English guide PDF pages |
| --- | --- | --- | --- |
| 10 | Earth subsystems and interaction | 13, 14 | 28, 29 |
| 10 | Lithosphere structure | 14 | 28, 30 |
| 10 | Troposphere characteristics | 16 | 28 |
| 10 | Main water-cycle transfers | 20 | 29, 30 |
| 10 | Plantation agriculture | 51 | 38 |
| 11 | Natural resources and value | 11 | Pending |
| 11 | Formation of rock types | 13, 14 | Pending |
| 11 | Population density | 67 | Pending |
| 11 | Natural and human landslide causes | 114 | Pending |
| 11 | Vegetation and drainage in landslide prevention | 115 | Pending |

All numbers are 1-based PDF pages, not printed book pages. Requirements are AI-authored proposals, not an official mark scheme. Grade 11 criteria rely on the English textbook only. The Sinhala guide remains inventoried in the packet with the limitation visible. Human review must assess whether these limited requirements are appropriate; completeness is relative to these requirements and the selected topic, not a whole chapter or student's knowledge. Diagrams, map interpretation and handwritten OCR accuracy are outside this review.

Each concept has three synthetic examples, displayed in shuffled order without suggested labels. Criteria approvals and example labels are initially blank. This review is development input; it cannot establish independent accuracy or real handwriting performance. No Geography model has been fitted or enabled in the app. Grade 11 teacher-guide alignment remains pending; integration must not label it verified based only on this packet. Current app curriculum mappings also need correction before integration; use verified textbook job IDs in `geography-ingestion-verification.md`.

## Validation and reproduction

`validation.json` in the packet directory records four unchanged PDF hashes, 497 valid page hashes, all selected source references, ten criteria and thirty examples with blank review fields. Five export-control checks passed using a Node VM and mock DOM: incomplete final export blocked, draft available, revision comment required, complete final export available, and progress updated. No browser rendering test is claimed. Source pages were rendered and inspected separately.

Source extraction: run `prepare_geography_review_sources.py` with the ingestion environment's Python (PyMuPDF). Review generation: run `prepare_geography_review.py` with the training environment's Python. Both scripts refuse replacing a different manifest/packet and do not restart services, train models or write to the app. Retain `packet.json`, `rubrics-proposal.json` and `freeze.json` together for later submission integrity checks.
