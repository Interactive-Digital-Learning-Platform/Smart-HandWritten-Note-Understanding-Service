# ICT coverage pilot — 2026-10-15

**ICT V3.1 is trained and integrated into the app and deployment image for on-demand checking of 10 English theory concepts.** All suggestions require review. Science, History and ICT are now packaged with the backend. See `docs/ict-mobile-integration.md` for the running app flow and verification.

## Review intake

The submitted `ict-coverage-source-reviewed.json` matched all frozen concept definitions, source-page hashes, note texts and example IDs. Its source links had been changed to portable filenames while retaining the original links; these display-only changes were accepted without following the submitted links. The four original PDF hashes were verified using the frozen intake manifest.

The file contains 10 approved criteria and 30 labels: 10 Complete, 11 Partial, 9 Missing. It originally declares AI-assisted provisional review. In a subsequent direct chat reply, the owner confirmed personally checking all labels and criteria. That confirmation is recorded separately in `ml-training/outputs/ict-coverage-v1-2026-10-15/owner-confirmation.json`; the original submission is unchanged. These are **owner-confirmed, AI-assisted development labels**, not an independent teacher assessment or a representative handwriting test.

## Trained model

The model uses the existing frozen MiniLM encoder, word/character rubric measurements, semantic similarities and safety features, followed by a trained three-class logistic-regression head. The encoder was not fine-tuned. The head has 36 input features and 111 learned coefficients/intercepts. The current head was fitted on **334 AI-authored synthetic examples**, with class balancing and CPU execution. None of the 30 owner-reviewed texts or the 12 probe texts were fitted.

Regularization was selected from `.01, .1, 1, 10` using 54 authored validation examples; selected C is `.01`. Vectorizer fitting and scaler/head fitting use training rows only. Frozen embeddings may be cached for evaluation texts, but that does not fit the encoder or expose evaluation labels to the classifier. There is no exact concept/text identity overlap between fitting rows and the evaluation sets. Same-author paraphrase, criterion and generation-template leakage remain; no independent author split is claimed.

Scope: Grade 10 CPU components, RAM/ROM, cache, secondary storage, operating-system roles, process management and memory management; Grade 11 Internet/WWW, DNS and Cc/Bcc. This is not the complete ICT syllabus, code correctness, diagram assessment or a handwriting recognition model. The secondary-storage criterion requires an example only when the selected question/scope calls for one.

## Selected candidate results

| Development check | Matching final suggestions | Withheld | Other final errors |
| --- | ---: | ---: | ---: |
| Owner-confirmed examples | 28 / 30 | 2 | 0 |
| Additional AI probes, now exposed development | 11 / 12 | 1 | 0 |
| Current synthetic validation | 54 / 54 | 0 | 0 |
| Previous synthetic validation reused as regression | 63 / 64 | 1 | 0 |

Withheld predictions are **not counted as correct**. These rows are not independent test populations and must not be combined into an overall accuracy claim. Scores are not calibrated probabilities of correctness. No real handwritten ICT notes have been tested.

The two withheld owner examples reverse RAM/ROM roles and incorrectly make Bcc addresses visible. The raw head still makes errors on these cases; the review policy prevents presenting its positive-coverage decisions. A Bcc-only explanation also caused a raw false-Complete decision in the old regression set; the policy withholds it because mentioning Cc inside the Bcc visibility rule does not establish the Cc sending role. These are limited review heuristics, not a general factual correctness checker.

All earlier versions and results are retained. V1.1 missed a correct shorthand memory-management explanation. V2 improved shorthand but exposed multi-sentence instruction-block and negation problems. V3 refits the head with shorthand families, explicit task/process aliases, corrected prompt/ROM features and mixed-correctness contrasts. V3.1 leaves V3 weights and features unchanged and adds conservative review of positive coverage with role conflicts and unsupported Cc-role evidence. These improvements used already exposed development findings; they do not establish fresh accuracy.

Current model SHA-256: `df42a138824f57fec3339ecb973f643cebf8899d7eaba902d5adfb40d4a3b74b`.

## Run and verify

From the backend repository in PowerShell:

```powershell
Get-Content ml-training/outputs/ict-coverage-v3.1-2026-10-15/demo-input.json -Raw |
  ml-training/.venv/Scripts/python.exe -B ml-training/ict_candidate_cli.py
```

Input fields are `text`, a supported `conceptId`, `language: "English"`, and `scopeConfirmed: true`. Output keeps `status: null`, provides an optional `suggestedStatus`, and always requires review. Evidence offsets use Unicode code points. A null suggestion requires human review; do not replace it with the raw model label.

```powershell
ml-training/.venv/Scripts/python.exe -B -m unittest discover -s ml-training/tests -p test_ict_coverage.py
ml-training/.venv/Scripts/python.exe -B ml-training/verify_ict_runtime.py `
  --candidate ml-training/outputs/ict-coverage-v3.1-2026-10-15 `
  --entrypoint ict_candidate_cli.py
```

Nine review-integrity/safety tests passed. A fresh CLI process reproduced all 30 selected-candidate development decisions, rejected unconfirmed scope and unsupported language, and passed exact Unicode evidence-span checks. The exported linear head matched scikit-learn probabilities with maximum difference zero. The runtime retains public rubric embeddings, then discards request embeddings between inputs. This is a local CLI check, not mobile, OCR or full backend verification.

Artifacts are in `ml-training/outputs/ict-coverage-v3.1-2026-10-15/`: `model.json`, `release.json`, `evaluation.json`, `decisions.json`, `runtime-verification.json` and `demo-input.json`. The trained head and complete training protocol are in the V3 directory. Outputs and caches are excluded from Git. The original CLI preserves its workstation source checks. A separate `ict_service_cli.py` adapter supports the portable, integrity-checked bundle without changing any frozen training or prediction module.

## Integration status

The owner restored ingestion services and uploaded both textbooks. Both jobs report done, with 290 indexed chunks for Grade 10 and 158 for Grade 11. However, a read-only source audit found that both stored PDFs exactly match a known corruption pattern: the upload service duplicated the first 1 MiB block and omitted the second. These are not different textbook editions. Some model source pages are unreadable or absent from the index, so completion status alone does not establish usable ingestion.

Recovery is now complete: the API/worker were restarted with corrected upload and source-page tracking logic, and both originals were re-ingested into new jobs. Grade 10 has 325 verified chunks from 299 extracted pages; Grade 11 has 185 from 197. Both stored PDFs match the frozen original hashes, all expected chunk texts and page references match the source replay, and no new chunks have page 0. All 10 pilot-concept retrieval checks found an expected source page in the top five. Twelve upload/page regression tests and targeted lint checks pass. The Grade 11 registry filename alias was also added; its six tests and the backend TypeScript build passed in the initial audit. See `docs/ict-ingestion-verification.md` for replacement IDs, reports and the distinction between new verified jobs and preserved corrupted jobs.

The explicit review flow is now integrated into the app and portable deployment image, with textbook references pinned to the verified replacement jobs. Six real model examples, ten reference endpoints, mobile contracts, browser interaction and offline Docker regressions passed. Automatic curriculum-wide mapping and a new real-image OCR-to-ICT-card test remain outside this pass. Fresh independently written notes with human labels are still needed before making practical accuracy claims. The Science/History model artifacts remain unchanged.
