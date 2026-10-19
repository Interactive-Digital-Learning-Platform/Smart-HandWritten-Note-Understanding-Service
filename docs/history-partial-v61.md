# History V6.1 — Partial/Missing correction

19 October 2026. Only Notes-service files changed. The same frozen MiniLM
encoder, 94 concepts, 37 features, scaler, point model and review policy remain.
The existing three RBF SVM class heads received a trained weight update; no
additional service, LLM or classifier architecture was introduced.

## Corrected cases

The five-page L02_F notebook explains foreign accounts, contains a named Greek
source, and discusses critical analysis/credible historical information. Those
are meaningful explanations even though visitor/nonvisitor distinctions and
full source-production/corroboration details are incomplete. V6 returned Missing
for both concepts. V6.1 returns raw and displayed Partial, rather than changing
a Missing prediction after inference. The shorter L02_E foreign-account page
also changes from Missing to Partial.

The same notebook's inscriptions remain Partial, coins remain Missing and
ruins/art/antiquities remain Complete. In particular, merely listing Coins in
a diagram does not supply coin types or historical interpretation.

## Training and selection

The existing 2,185-row feature/training snapshot was replayed with 17 additions:
three visually reviewed image-text examples (two notebooks from one source
family, sharing total weight 12) and 14 assistant-authored positive/negative
contrasts. None of the added labels is teacher-confirmed. Full image transcripts
and private references remain in Git-ignored outputs; content plans were not
substituted for handwriting.

Partial-head-only and full-head refits corrected the reported examples but each
lost one older validation match. The final update retains 25% of V6's RBF
weights and 75% of the refitted weights. With identical kernels/scaling, the
combined support vectors are exactly one SVM head. Selection used exposed
regression data and is not an independent accuracy estimate.

## Regression results

| Existing check | V6 | V6.1 |
|---|---:|---:|
| Human-reviewed development | 23/24 | 23/24 |
| Older synthetic test | 332/340 | 333/340 |
| Older synthetic validation | 334/338 | 334/338 |
| Prior typed checks | 18/18 | 18/18 |
| Packaged presentation checks | 12/12 | 12/12 |
| Earlier assistant-reviewed development | 50/50 | 50/50 |
| Earlier related-text challenges | 15/18 | 15/18 |

No incorrect Complete suggestion was introduced on these sets or the new
checks. All six new image-reference checks match (five concepts in L02_F plus
one page check in L02_E). These include fitted cases, not six independent
notebooks or six unseen tests.

An additional eight post-fit typed probes have six matching suggestions. Two
short paraphrases still receive Missing instead of the assistant's Partial
reference: an account of travellers from abroad and a short statement about a
historian selecting credible evidence. They remain visible in partial-checks.json;
this release fixes the reported cases, not every possible phrasing. No overall
real-student accuracy percentage is claimed.

## Runtime and rollback

Model SHA-256:
`e9440b662ae46838e40ff68da23ce150db10e6c3edd1a2311841989561260233`.

The artifact keeps the compatible bundled filename `history-coverage-v6.json`;
its metadata, backend integrity pins and catalog identify V6.1. Stored checks
from the older hash become stale, retain their reviewed text, and can be rerun.
Existing notes, OCR and lesson scores were not rewritten. Automatic History
grading remains disabled. Science V3.5 and ICT V3.1 weights are unchanged.

Image: `smart-notes-coverage:science-v35-history-v61-ict-v31-materials-v31-ocr-v2`.
Image ID: `sha256:fa7af7b9e437acf8d0f3dbfb79fd5780699541b3796bc80f2e99247e32008da6`.
The previous image with `history-v6` is retained for rollback. No external hosting
deployment or Git commit/push was performed.

Validation completed: TypeScript build; 27 focused Python model, provenance and
bundle checks; 15 Notes History API/worker/saved-result checks; all 15 packaged
Science/History prediction fixtures on Linux; and six actual image-reference
checks through the container's production HistoryCoverageReviewService. The
Notes container is healthy and its health endpoint returns HTTP 200. Native
Windows and packaged Linux predictions retain the existing numeric tolerance.

The 98-page Groq OCR batch remains incomplete from the previous provider rate
limit. This update uses existing local visual transcriptions and makes no new
external AI calls. The original V6 baseline report remains unchanged.

Reproduction scripts: fix_history_partial_v61.py, blend_history_partial_v61.py,
check_history_partial_v61.py and activate_history_partial_v61.py under ml-training/.
Final model, training evidence, comparisons, release gates and activation backup
are under ml-training/outputs/history-coverage-v6.1-partial-2026-10-19/.
