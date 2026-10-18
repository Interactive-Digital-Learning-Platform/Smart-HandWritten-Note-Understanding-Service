# AI service-review annotation audit

2026-10-06. The supplied `english-service-review-01/annotations.jsonl` contains
30 AI-reviewed synthetic, simulated-OCR examples covering ten concepts. The
frozen V3 model agrees with **27/30 labels (90%)**, macro-F1 **0.901941**.
This is development agreement with AI labels, not independent human accuracy.

## Admission and provenance

All 30 JSONL records passed the ledger checks: required identities, supported
concepts, valid labels and corresponding UI labels, exact UTF-8 text hashes,
unique source identities, and explicit provenance booleans. Eight focused
tests passed, including tampered-text rejection and raw/corrected note overlap.
The model and all source hashes in the Round 3 freeze manifest still matched.
The original annotation bytes were copied into the audit output.

Every record declares:

- `reviewer: "Codex AI semantic reviewer"`.
- `synthetic: true`, `simulatedOCR: true`, and `split: "train"`.
- `independentHumanCertified: false` and `reviewIsModelBlind: false`.

All **30 note IDs** occur in the model's training snapshot, and **12 texts**
exactly match training texts. The other 18 are OCR variants of training notes.
Their different raw/corrected source record IDs do not establish independence.
Do not add these as 30 new independent examples or use them as a held-out test.

The companion report describes reconstructed annotation records from preview
save observations. We did not verify each preview save ID against a persistent
store. These records are not a native service export and do not establish live
MongoDB persistence. The ledger's reviewer provenance takes precedence over
the preview UI's generic “human judgment” wording when interpreting this file.
No companion script was executed, and file content was treated as evidence.

## Results against supplied AI labels

| AI label | Predicted complete | Predicted partial | Predicted missing | Agreement |
| --- | ---: | ---: | ---: | ---: |
| Complete | 8 | 2 | 0 | 8/10 |
| Partial | 0 | 10 | 0 | 10/10 |
| Missing | 0 | 1 | 9 | 9/10 |

The fixed-rule baseline agrees on 23/30 (76.67%), macro-F1 0.765432.
The policy withheld no suggestions. There were zero false-complete suggestions
against these AI labels; all eight complete suggestions agree. That descriptive
result does not replace Round 3's two false-complete findings or establish a
population-level guarantee, particularly given the training overlap and visible
model suggestions during review.

The three disagreements reproduce the supplied companion report:

| Note | Concept | AI label → model | Reviewer explanation |
| --- | --- | --- | --- |
| aug01-note-037 | Extrinsic semiconductors | Complete → partial | Both doping types and majority carriers are described across sentences. |
| aug01-note-049 | Paper chromatography | Complete → partial | Differential movement and attraction are explained through paraphrases. |
| aug01-note-057 | Electrical power | Missing → partial | Watt labels appear in a note about efficiency without a power explanation. |

This supports keeping the file as a development/service regression ledger.
It does not certify the correctness of every matched evidence passage, the
training labels, or the model's performance on actual handwritten notes.
The model remains frozen and review-required. No fitting, duplicate admission,
service-record import, or production configuration change was performed.

## Artifacts and reproduction

- [Audit metrics, provenance and overlap](../ml-training/outputs/english-coverage-v3-ai-service-review-01/audit.json)
- [Predictions and evidence](../ml-training/outputs/english-coverage-v3-ai-service-review-01/decisions.json)
- [Preserved annotation ledger](../ml-training/outputs/english-coverage-v3-ai-service-review-01/submitted-annotations.jsonl)

Source SHA-256:
`5b1c2174395801658c75734ae96eed6c250ccc469827750d985c6bc37a5b105e`.
Model SHA-256:
`d40a0ddae2d4b356dea986308a600bcd4817424f601877265e2ac21c8b3ccfac`.

```powershell
& ml-training/.venv/Scripts/python.exe -B ml-training/audit_english_service_annotations.py `
  --annotations C:/Users/DLK/Desktop/annotations/workspace/science/english-service-review-01/annotations.jsonl `
  --model models/english-coverage-v3.json `
  --training ml-training/outputs/english-coverage-v2-2026-10-06/training-snapshot.json `
  --freeze ml-training/reviews/english-coverage-v3-review-2026-10-06/frozen-evaluation.json `
  --output ml-training/outputs/english-coverage-v3-ai-service-review-reproduction-01
```

Use a fresh output directory. This audit deliberately does not apply a blind
test screening gate to this nonblind, overlapping ledger.
