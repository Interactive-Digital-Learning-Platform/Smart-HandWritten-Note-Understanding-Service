# Supplied History notebooks E/F — 18 October 2026

These seven user-supplied ZIPs contain 100 English synthetic History notebooks,
50 lesson units, and 665 WebP page images. They are simulated pen-stroke writing,
not real pupils' handwriting. Transcripts are supplied text, not Notes OCR output.
Some statements, dates and explanations are deliberately incorrect. Original
archives in Downloads are unchanged, and their viewer HTML is never executed.

## Source audit and scope

Accepted intake: `ml-training/outputs/history-student-ef-intake-2026-10-18/`.
All seven shared ledgers agree. Every image's byte count and SHA-256 match its
manifest, with no duplicate image hashes or normalized complete notebook texts.
All 665 files passed image-format verification as 1536 × 2048 WebP images using
the bundled document runtime's Pillow. No handwriting OCR accuracy was measured.

The source grade and textbook chapter map explicitly to the existing frozen
History model's lesson IDs. All 94 supported concepts are represented across 18
source chapters. This creates 524 whole-note/concept pairs, not 524 independent
student notebooks. No page augmentation or new concepts are added in this pass.
Notebook profiles (40 complete, 30 partial, 30 missing-concept notebooks) are
audit metadata, not per-concept target labels. Model/teacher text excludes the
profile, source and synthetic headers before the first image marker.

Some notebooks intentionally cover only a unit within their source chapter.
A missing concept therefore means absent from this submitted text, not omitted
from every notebook by the student or a verified learning deficit.

## Label proposals and existing model update

`src/scripts/label-synthetic-history-batch.ts` uses the Notes service's configured
AI teacher and the frozen model's exact points and source criteria. Batches
contain up to five concepts for one complete transcript. The nine-concept chapter
uses smaller groups; cached responses retain their original grouping. Valid responses are
cached against packet/input hashes. Missing responses, low confidence, invalid
quotes, inconsistent per-point labels and unsupported Complete proposals are
excluded; no target label is inferred from the model being trained.

The existing shared teacher validator is reused. Human-review flags remain false.
No label is counted as human-confirmed because an assistant checked it. An exact
quote check prevents fabricated evidence; it does not prove semantic correctness
of an AI proposal. Responses rejected for punctuation/wording differences remain
excluded rather than being automatically rewritten.

Before reviewing labels or candidate performance, four complete source chapters
were reserved: Grade 10 chapters 2 and 7, Grade 11 chapters 1 and 6. Both E/F
writers and every unit of a chapter stay in the same split. Training never sees
these reserved examples. These synthetic writers do not establish independence
by real student author; copied or similar textbook passages may also limit
generalization beyond the reserved source chapters.

Use the existing `train_student_note_batch.py --subject history` command to fit
a candidate head. It retains the MiniLM encoder, feature definitions, scaling,
rubrics and review-withholding policy. The existing prior-anchored optimizer
updates the current head; it is not a separate replacement architecture.
AI proposals receive weak-label weights. A candidate and held-out AI agreement
report do not constitute human accuracy validation or deployment approval.

## Reproduction

From the Notes backend directory in PowerShell:

```powershell
ml-training/.venv/Scripts/python.exe ml-training/prepare_student_history_archives.py --downloads C:/Users/DLK/Downloads --output ml-training/outputs/history-ef-intake-fresh
npx ts-node src/scripts/label-synthetic-history-batch.ts --packet ml-training/outputs/history-ef-intake-fresh/packet.json --output ml-training/outputs/history-ef-labels-fresh --concurrency 2
ml-training/.venv/Scripts/python.exe ml-training/train_student_note_batch.py --subject history --dataset ml-training/outputs/history-ef-labels-fresh/dataset.json --reviews ml-training/outputs/history-ef-labels-fresh/split-template.json --output ml-training/outputs/history-ef-candidate-fresh
```

The label command resumes only compatible cached responses. A transport probe
was retained separately in `history-student-ef-labels-2026-10-18/`; the accepted
resumable batch output is `history-student-ef-labels-2026-10-18-02/`.
The initial large output allocation caused token-limit failures. The resumable
teacher uses bounded response budgets and rejects truncated answers. New chapter
batches avoid repeating the same transcript, with up to 3,000 output tokens.
It keeps the same teacher model and exact-quote checks. Original accepted cache
responses are retained, including those produced with the earlier allocation.

Open the generated `review.html`, read the transcript against every requirement,
and confirm only personally checked labels. Exported reviews are bound to the
dataset SHA-256. The existing deployment checks require reviewed held-out cases,
minimum class coverage, no false Complete suggestions on that reviewed set, and
unchanged presentation regressions. A candidate is not automatically promoted.

`evaluate_student_history_batch.py --packet ... --output ...` can score the
unlabelled source packet with the current model. Its separate `--dataset ...
--splits ... --candidate ... --output ...` mode reports current/candidate
agreement on reserved AI-labelled chapters, counting withheld predictions as
non-matches. Those diagnostics are explicitly not independent student accuracy.

## Verification and scope

Five History archive tests, nine existing training-batch tests and five shared
teacher-label tests passed (19 tests). TypeScript compilation passed. Tests
cover actual archive corruption, traversal, label-revealing headers, exact
chapter mapping, dataset/review binding, chapter-family split isolation, the
actual optimizer and reloading an updated History head with the local encoder.

Only Notes service training scripts, tests, documentation and ignored outputs
are involved. No app account, consent record, Science model, shared service,
mobile screen or deployed Docker model is changed by this intake.

## Completed first candidate and remaining work

The teacher's daily quota was exhausted part-way through Grade 11. A bounded
single-notebook probe confirmed HTTP 429 with a tokens-per-day limit, rather than
a malformed dataset. No unavailable row was assigned a guessed label. The caller
now stops issuing further new requests once it detects this daily quota condition.

The accepted batch has **214 proposals from 54 notebooks across 12 source
chapters and 63 concept IDs**: 39 Complete, 56 Partial and 119 Missing. Another
85 proposals failed evidence/consistency checks; 225 concept inputs were not
successfully labelled. The complete source inventory still spans all 94 concepts.
The 45 failed request groups and rejected rows remain listed in `teacher-report.json`.

`ml-training/outputs/history-student-ef-candidate-2026-10-18/` contains an actual
update to the existing head, fitted on **164 AI-labelled rows** (31 Complete,
47 Partial, 86 Missing) across nine source-chapter groups. Fifty accepted rows
across three reserved chapters were excluded from fitting. The fourth planned
reserved chapter, Grade 11 chapter 6, has no successful teacher labels yet and
remains reserved for any later continuation. The head parameters changed; the
encoder, rubric, feature/scaler definitions and review policy were retained.
All 12 packaged History presentation regression outputs remain unchanged.

Diagnostic agreement with the 50 reserved **AI proposals** improved from 35/50
(70%) to 39/50 (78%). This is not teacher-reviewed accuracy or independent student
accuracy. Per-class matches changed as follows:

| Proposed label | Current model | Candidate |
| --- | ---: | ---: |
| Complete | 5/8 | 7/8 |
| Partial | 1/9 | 3/9 |
| Missing | 29/33 | 29/33 |

Both versions suggest Complete on five rows whose AI proposal is not Complete.
Candidate raw macro-F1 is 0.660417. Partial quality remains insufficient for
production replacement even on these unconfirmed proposals. Some AI labels also
need scrutiny: one proposed Complete on early settlements quotes a claim that
all early settlements were large cities, conflicting with the intermediate
settlement distinction in the required points. That AI proposal remains
unmodified and unconfirmed for the human review, not silently counted as truth.

Comparison artifacts: `ml-training/outputs/history-student-ef-ai-comparison-2026-10-18/`.
The current frozen History model remains active. The candidate is disabled by
default, has no human-reviewed holdout score and is not approved for deployment.

Focused review: `http://127.0.0.1:8886/review-30.html` (also saved in the accepted
label batch). It contains 8 proposed Complete, 9 Partial and 13 Missing examples
across all three available reserved chapters and 13 notebook groups. Selection
uses deterministic record hashes, proposed class balance and notebook diversity;
it never uses model predictions. All confirmations initially remain false.
`review-30-selection.json` records the selected IDs and original dataset hash.
The review can be exported as `student-note-reviewed-labels.json`; its hash binds
it to this exact 214-row batch. Resuming teacher labelling later creates a new
dataset snapshot/hash. This batch now has a `FROZEN_DATASET.json` marker and the
label command refuses to overwrite it. For continuation, copy only the cached
`synthetic-history-*.json` response files to a fresh output folder, then resume
against the original packet. Existing dataset, split files, reviews and candidate
provenance stay intact; new examples belong to the new snapshot.

Dataset SHA-256: `5fe60e3fb4006ee8319a4276e6cf3f0ef29ea7e46801d283858badd30ea50dc1`.
Base model SHA-256: `12ba94e87415adb0ceb851919a6e87bc5d36e8535f0539352b450bd104e368e8`.
Candidate SHA-256: `d1602c82bf19d5e4847b75dac5dd30e247c28f6553c1986903379777b7dba2ea`.

## Assistant review completed on 18 October

The requested assistant review is now complete for all 50 reserved examples,
including the 30-example page. Twenty labels were corrected in a separate audit;
the original AI proposals and human confirmations are unchanged. See
[History Partial assistant review](history-partial-assistant-review.md) for the
corrected targets, substantially improved Partial results, remaining errors and
the reason the selected candidate has not replaced the running History model.
The earlier 70%/78% agreement figures above refer to the original flawed proposals
and must not be used as accuracy against the corrected audit.

The subsequent [History V6 release](history-v6-grounded-release.md) is the current
update. It explicitly fits the corrected 50 examples, preserves the original
dataset and checks broader regressions. Its 50/50 fitted-case agreement must not
be confused with held-out accuracy.
