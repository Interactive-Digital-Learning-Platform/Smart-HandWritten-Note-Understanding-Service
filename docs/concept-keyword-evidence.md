# Keyword evidence and full coverage — 16 October 2026

Pipeline 2.1.3 fixes automatic full credit for a keyword. Previously,
`Homework: define friction.` could become present/rule with confidence 1 and
skip semantic review. It now remains partial and reviewable. The existing
partial-credit scoring rule still awards half credit for a partial concept;
this fix does not introduce a new scoring formula.

## Behavior

- Keywords locate candidate excerpts using whole-term boundaries. `cell` in
  `cellulose` and `friction` in `frictionless` no longer create keyword hits.
  Common plural, whitespace/hyphen and apostrophe variations remain supported.
- One semantic batch checks every expected concept, including keyword hits.
  It receives the concept name/category and definitions explicitly bound to its
  ID, where available. Keyword occurrence is not a completeness rubric.
- A positive semantic result must include a contiguous quote from the text
  actually checked. Whitespace/case variations are accepted while the stored
  excerpt retains the source wording. Invented or stitched quotations fail.
- Obvious bare labels, unanswered tasks/questions and low-confidence positive
  responses cannot receive full credit. A later genuine answer can qualify,
  including when it repeats a phrase inside an earlier question. Short equations
  remain eligible; length alone is not a coverage rule.
- Failed, malformed, duplicate, omitted, truncated or ungrounded results retain
  tentative keyword evidence as partial, or low-confidence missing when no
  candidate exists. These fallbacks require review. Valid results for other
  concepts are preserved. Legacy `found: true` alone cannot award full credit.
- An incomplete-check warning is saved and shown in the Notes screen with an
  action opening the extracted text. OCR reliability still reduces confidence.
- The input context is capped at 30,000 characters. Evidence beyond it cannot
  receive semantic credit, and the student receives the review warning. The
  request uses low reasoning effort, a 20-second timeout per pool attempt and
  no extra fallback-model cascade. The existing pool can retry keys; 20 seconds
  is not a total processing-time guarantee.

New findings flow through the existing weighted scores, partial-concept lists,
student review and gap recommendations. Saved older notes are unchanged until
explicitly reanalyzed. Science trained-model suggestions keep their separate
quality gates, reviewed mappings and evidence contract. History/ICT models,
training artifacts, shared authentication/configuration and other members'
services were not changed.

## Verification

- Backend build and mobile TypeScript check passed.
- 99 backend tests passed, including 16 new concept-matching regressions and
  the existing 11 cached-OCR regressions. Both groups are now in `npm test`.
- 35 focused Notes mobile tests and five real trained-Science pipeline tests
  passed.
- Three fresh synthetic examples ran through the live semantic checker:
  homework-only text -> partial; a complete definition -> present; a question
  followed by a genuine answer -> present. These are behavior checks against
  a small explicit fixture rubric, not a real-note accuracy estimate.
- A separate fixture simulated an unavailable semantic provider. Its partial
  finding, 50% single-concept score and warning survived MongoDB persistence
  and the authenticated app API. The mobile screen showed 0 covered / 1 partial
  and the review action opened `Homework: define friction.` The fixture was
  deleted afterward without processing an existing note or creating materials.
- Notes Docker was rebuilt and restarted with its media/cache volumes intact.
  All 27 compiled concept/OCR tests passed inside it. Health/app return 200 and
  anonymous Notes access still returns 401.

Evidence: `../output/notes-keyword-coverage-2026-10-16` in the shared workspace.

The general checker still depends on semantic judgment. Grounded quotations and
these guards do not prove factual correctness, whole-syllabus accuracy or a
student's understanding. Additional reviewed concept rubrics and independent
teacher-labeled handwriting remain necessary to evaluate those claims.
