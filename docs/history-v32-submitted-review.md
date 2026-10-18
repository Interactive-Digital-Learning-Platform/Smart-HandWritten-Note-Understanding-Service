# Frozen History V3.2 review — 2026-10-15

The returned `history-v32-reviewed.json` contains all 24 expected labels with no unresolved criteria. IDs, concepts, grades, source-reference objects, requirements and note texts match the prepared packet. It declares reviewer name Anura, reviewer type Human and independent human review. Those declarations are preserved; reviewer identity, qualifications and independence were not externally verified.

These synthetic texts were not scored before the returned review and were not used to fit or select V3.2. The frozen model and inference-source hashes matched the protocol. This evaluation did not retrain, alter or activate the model.

## Results

| Measure | Observed result |
|---|---:|
| Exact final agreement | 19/24 (79.17%) |
| Macro F1 | 0.781818 |
| Correct Complete predictions / reviewed Complete answers | 3/8 (37.5% recall) |
| Correct Partial predictions / reviewed Partial answers | 10/10 |
| Correct Missing predictions / reviewed Missing answers | 6/6 |
| Complete prediction precision | 3/3 |
| Model suggestions withheld | 0 |
| Grade 10 agreement | 8/12 |
| Grade 11 agreement | 11/12 |

All five errors are complete answers labelled Partial. The affected targets are first urbanization/ancient cities, scientific observation, plantation economy, ancient rulers/administration and pre-state leadership. Zero false Complete suggestions in only three Complete predictions does not establish a general precision guarantee. The candidate under-recognizes adequate complete coverage.

Final confusion matrix (rows reviewed, columns predicted):

| Reviewed | Complete | Partial | Missing |
|---|---:|---:|---:|
| Complete | 3 | 5 | 0 |
| Partial | 0 | 10 | 0 |
| Missing | 0 | 0 | 6 |

This is a different, broader packet than the earlier 18-example V3.1 review. Do not present 79.17% versus 83.33% as a controlled before/after comparison. The new 24 texts span eight of 94 proposed targets, with 12 examples per grade; they do not establish full-curriculum or real-handwriting performance. The earlier 23/24 diagnostic result used AI-authored expectations on different texts and is not interchangeable with this review score.

## Interpretation and next development

The two previously revised Grade 11 rubrics still classify their Complete examples correctly in this packet. Expanding to other targets exposes the same broader dependence on exact wording in the automatically generated rubrics. A subsequent revision needs principled paraphrase handling across requirements, supported by broader contrastive development data and safeguards for negation and dates. Repeatedly fixing only the latest observed examples would not demonstrate generalization.

Preserve this frozen result. If these labels or errors guide any later revision, the packet becomes development material for that revision. History remains experimental and disabled in the normal app flow. Real handwritten-image OCR and whole-note scope checks remain pending.

## Integrity and artifacts

Source review SHA-256: `16bcbcd63e0247f3a850d9ea84c5d69513b5027a036becba14deb92f512feaa6`. Model SHA-256: `51fd4d45c2294e373f4fb435fa5898b22e77842953cb0c823d4d05829ba44ae2`.

The preparation script recorded a hash of LF UTF-8 text before Windows converted newlines to CRLF on disk. This was caught before inference. The original builder source still matches its stored hash, the LF-normalized template bytes match the original recorded digest exactly, and every submitted source field matches. The scorer records both the actual byte hash and original preparation hash; no original file was rewritten. Hash differences beyond that documented line-ending conversion are rejected.

Successful evaluation artifacts are in `ml-training/outputs/history-v32-submitted-review-2026-10-15-verified/`: the original submission, `evaluation.json` and `decisions.json` with evidence and comments. The initial stopped checksum attempt remains separately under `history-v32-submitted-review-2026-10-15/` with its original input only. Scoring script: `ml-training/evaluate_history_v32_review.py`. Evidence and concern quote offsets were checked during scoring. Nine validation checks cover unchanged intake, source tampering, uncertainty, candidate/reviewer provenance and narrowly bounded newline integrity handling.
