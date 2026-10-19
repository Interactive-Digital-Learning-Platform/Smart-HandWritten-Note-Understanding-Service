# Notes study materials v2

Structured notes are scoped study guides with short explanations, comparisons,
procedures, and self-check questions with answers. They no longer claim to be a
complete, authoritative substitute for a textbook. Both generators retrieve the
requested grade's textbook context; `Grade 11` is parsed and passed to retrieval.
Only student-confirmed support topics are labelled as requested support.

Optional source-based visuals are saved in `LearningMaterial.visuals` and rendered
next to the matching heading in the Notes material screen:

- `flow`: ordered steps with connecting arrows.
- `timeline`: dated events with a connecting line.
- `comparison`: labelled concept panels.
- `bar`: category/value bars, units, a zero baseline and readable numeric values.

Visuals require a matching heading, bounded labels/items, and an excerpt present
in the actual prompt. Bar charts additionally require the category/value pairs
and unit to appear in that excerpt. Invalid optional visuals are omitted without
losing the readable guide. There are no generated photographs, arbitrary remote
image URLs, executable HTML, Mermaid or SVG supplied by the model. This avoids
invented illustrative data and works on web and native without new dependencies.
This does not yet extract or reuse diagrams embedded in textbook PDFs.

Flashcards have bounded, distinct front/back prompts, optional hints, explanations,
question kinds and source excerpts. A separate source-grounding review call runs
before saving both types of material. Cards without a matching excerpt are
rejected; an unusably small deck fails cleanly. This reduces unsupported additions
but is not a guarantee of factual accuracy: teacher review is still useful, and
OCR/textbook extraction errors can remain. Excerpt matching verifies provenance,
not that every generated statement logically follows from it.

The student reveals the answer before rating recall. Unremembered or skipped
cards can be practised in another round. Progress is explicitly session-only and
does not claim assessed mastery. Card contents scroll instead of being clipped.
Old text-only guides and front/back-only cards remain supported.

The material viewer's **Update version** uses the existing asynchronous job queue
and bounded polling. The old saved material remains readable while generating;
the new content loads after completion. Failures preserve the saved version and
remain retryable. No automatic deletion or migration of student material occurs.
The extra review is one bounded pass; generation still has the existing worker
timeout. Generation latency and availability depend on the external AI provider.

## Validation

`npm run test:study-materials` covers provenance, invalid data, swapped chart
values, schema persistence, grade retrieval, content bounds and generation
contracts. Existing material job and mobile polling tests remain unchanged.

`node -r ts-node/register src/scripts/verify-study-materials.ts [science|history]`
runs real generation using synthetic notes plus retrieved textbook excerpts and
saves local inspection files under `tmp/study-materials-verification/`. This live
command sends that context to the configured Groq provider; it is not part of CI.
Outputs are examples, not a statistical accuracy benchmark.

Verified on 2026-10-18: 15 backend material tests and 11 mobile polling/auth tests
passed; mobile TypeScript and targeted ESLint checks passed. Live Science and
History examples generated guides with visuals and grounded flashcards. The
current Science note was also updated through the authenticated app: five cards,
answer reveal, source excerpts and the practice-again round were verified, then
its structured guide was updated and the procedure diagram/source excerpt were
checked on screen. Screenshots are in `tmp/study-materials-verification/`.
The provider returned rate-limit errors during some tests and used fallbacks;
the previous material stayed readable throughout the app updates.

## Local preview and Docker

The Notes-only image tag is
`smart-notes-coverage:science-v34-history-v6-ict-v31-materials-v2`.
The previous release image is preserved; Science/History/ICT coverage model
artifacts are unchanged. The earlier release manifest describes its earlier
image, not this new application image. Rebuild and verify a deployment manifest
when promoting this application version to a hosted release.
The final local image ID is
`sha256:539d000b4d9eb58d15f9e9c5d6712073750bf6519193d3ad3fda8f1af68635e4`;
both the direct `/api/health` and temporary proxy health check returned HTTP 200.

For this local check the shared saved gateway was unavailable. Expo on 8082 uses
a process-only `EXPO_PUBLIC_API_GATEWAY_URL=http://127.0.0.1:18886` override with a
temporary Notes-only loopback proxy to Docker port 8005. No shared gateway source,
saved mobile `.env`, authentication or other service containers were changed.
The proxy and preview launch logs are under `tmp/study-*`. A normal Expo restart
uses the saved gateway configuration again; these temporary preview processes
are not deployment infrastructure.
