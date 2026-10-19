# Notes Science v3.4 / History v6

This Notes-only release updates the History coverage checker. Science v3.4,
ICT parameters, authentication and the existing upload pipeline are unchanged.
This production profile enables Science and History; ICT and expert-review
routes remain disabled. The local development Compose profile retains its
existing feature flags.

History uses the same frozen English MiniLM encoder and 94 rubrics with a small
trained SVM head and passage-support features. It distinguishes related mentions
from supporting assertions, including fully denied statements. It remains an
explicit concept check with reviewable evidence, not automatic History grading.
See [the History v6 report](../../docs/history-v6-grounded-release.md).

The 50 assistant-corrected notebook cases were used for training/development.
Their 50/50 matching outputs are not independent accuracy. No new assistant
labels were marked as human confirmations. Real handwritten OCR accuracy has
not been measured by these checks.

Build the tested image from a checkout containing this release and resolved
Git LFS files:

```sh
docker build --platform linux/amd64 -t smart-notes-coverage:science-v34-history-v6-ict-v31 .
docker run --rm --network none --read-only --tmpfs /tmp smart-notes-coverage:science-v34-history-v6-ict-v31 node dist/scripts/verify-coverage-container.js
```

Use the inference-only `runtime/coverage/` bundle. The deployment host needs
neither the training files nor a model download. Copy `.env.production.example`
to a private `.env.production` and supply the existing infrastructure and Clerk
configuration. From this profile directory:

```sh
docker compose -f compose.production.yaml config --quiet
docker compose -f compose.production.yaml up -d --no-build
```

Keep the existing Compose project identity and named volumes when updating an
installation. Older release profiles and Docker images remain available for
rollback. No credentials, student notes, review labels or training matrices are
included in the Docker image. Hosting and publishing to GitHub are separate
steps and have not been performed by this update.

Existing saved History checks from older model hashes now appear stale and can
be rerun using their retained reviewed text. The old result remains stored;
neither the original OCR nor the student's lesson score is rewritten.
