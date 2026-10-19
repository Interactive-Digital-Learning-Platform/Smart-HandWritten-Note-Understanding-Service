# Notes study materials: 19 October 2026 retest

Changes are limited to the Notes backend, Notes material API/screen/components,
and Notes test utilities. No authentication, shared gateway, other service code,
coverage model weights, or source note/OCR records were changed.

## Reproduced issues and fixes

- Flashcard answer-reveal state survived Browse → Practice, allowing a rating on
  a hidden answer. Mode switches now clear that state.
- Failed initial material reads had no retry; refresh failures were silent.
  Content reads now have a timeout, cancellation on leaving/switching note or
  material type, a retry action, and a visible error while retaining saved content.
- A repeated `##` / `###` title displayed the same comparison visual twice.
  Empty duplicate parent headings are merged and each visual is attached once.
- Self-check answers were immediately visible, including old inline Q1/A1 notes.
  Questions and answers now separate; answer sections expand only on request.
  Hidden focus anchors remain available for navigation and are not shown as text.
- The Markdown library enabled smart typography by default, replacing `(R)` and
  `(C)` in scientific notation with registered/copyright symbols. The Notes
  material renderer now explicitly disables this transformation.
  Simple inline equations are displayed readably without affecting currency or
  literal code blocks.
- Bar validation could accept a positive number from a negative observation,
  mismatched units or a substring of a category. Each complete category/value/unit
  must now match its own observation. Equivalent decimals are accepted.
- An image/comment-only response could become a blank ready lesson. Readability
  is now checked after cleaning. Empty trailing headings are removed unless they
  hold a validated visual; code-fence headings are not valid attachment targets.
- The four-page Friction update hit the provider's output limit. Source/draft
  budgets and deck size are now bounded. GPT-OSS JSON material requests use the
  SDK-supported low reasoning effort, with compatible GPT-OSS fallbacks; other
  generation types retain their existing settings. Token counts and termination
  status are logged without student text. Truncated results remain failures.
- If AI omits visuals, a clearly labelled numbered source list can become a
  comparison panel under a matching heading. Labels, descriptions and the quoted
  excerpt come directly from the notes; no measurements or extra facts are added.
  Direct answer leaks in hints and duplicate answer/explanation text are omitted.

Generation instructions also preserve source qualifiers such as relative motion
at contact surfaces. Excerpt matching is still a provenance check, not proof that
every explanation is correct. AI-generated content can require human review.

## Verification

- 24 backend material/content/job tests passed, including regression cases that
  failed before these fixes; backend TypeScript build passed.
- 21 mobile Notes parsing/rendering/polling/auth tests passed. Mobile TypeScript
  and targeted ESLint checks passed.
- Browser checks reproduced the Browse-state bug and verified the fix; tested
  hints, a full nine-card round, practice of only the unremembered card, restart,
  single comparison rendering, and hidden/revealed self-check answers.
- A one-time HTTP 503 was injected only for the selected note's flashcard read
  through the temporary loopback Notes proxy. Try again recovered successfully.
  The proxy's original code was restored and the one-time flag was consumed.
- The selected Friction note and retrieved textbook excerpts were used for live
  provider checks with the user's explicit approval. The initial failed update
  retained its saved nine-card version. After budget fixes, a direct live run
  completed with four sourced cards and a 481-word guide with a comparison panel.
  The authenticated app also recovered from its earlier failed deck update and
  saved five flashcards successfully; the saved older deck stayed available while
  updating.
  The final app guide has 495 words and one source-based comparison. An assistant
  source spot-check corrected an unsupported percentage claim and a reversed
  wet-road explanation in this generated guide, using a version-guarded update
  with a backup. This is not a human review or a change to OCR/coverage results.
  The generation instructions were strengthened for these cases.
  Local inspection artifacts are in `tmp/study-materials-retest-2026-10-19/`.

These are functional/regression checks and content spot checks, not an accuracy
benchmark. The provider reported primary-model rate limits, so compatible fallback
models were used. Successful generation remains dependent on provider capacity.

The active local image tag is
`smart-notes-coverage:science-v34-history-v6-ict-v31-materials-v21`; the preceding
materials-v2 image is retained. The earlier deployment manifest still describes
its earlier image and must be regenerated before promoting this build to hosting.
Final local image ID:
`sha256:1016860cc5ad7bd6622f254e583e41e65e04a415fd846836354beec0c6273069`.
