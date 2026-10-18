# Notes Science v3.3 and History v5.1 release

The existing Science classifier has corrected isotope relation evidence and
partial/missing formula handling. Its learned v3.2 weights, scalers and vectorizers
are unchanged. History v5.1 and ICT artifacts are unchanged; this production
profile enables Science and History only. Hosting is not configured here.

The 71 supplied synthetic transcript examples are exposed development data:
AI agreement changes from 59/71 to 66/71. This is not independently verified
accuracy or handwriting/OCR accuracy. See `docs/science-evidence-fix-v33.md` and
the full comparison in `ml-training/outputs/science-v33-evidence-fix-2026-10-18/`.
That report discloses the decrease in partial recall and complete precision
against unchanged, sometimes inconsistent AI labels. Suggestions remain reviewable.

## Destination host

```
docker load -i smart-notes-science-history-v33.tar
```

Copy `.env.production.example` to a private `.env.production` if needed, and
configure MongoDB, curriculum PostgreSQL, Qdrant, AI credentials and Clerk.
Then run:

```
docker compose -f compose.production.yaml config --quiet
docker compose -f compose.production.yaml up -d --no-build
docker compose -f compose.production.yaml ps
```

The service binds to 127.0.0.1:8005 by default. Use the existing authenticated
gateway. Model inference is bundled and local; earlier OCR and curriculum stages
still require their configured dependencies. The image does not include student
files, annotation datasets or credentials. Never delete storage volumes as part
of this update. Keep the same Compose project/storage when updating an existing
installation; local testing uses the existing compose.coverage.yaml project.

New analyses and explicit Science rechecks use v3.3 (pipeline 2.1.8). Existing
saved outputs keep their recorded version and are not relabelled. The mobile
Notes display recognizes v3.3 and keeps older version displays intact. No shared
authentication or other members' services were edited. Temporary local sign-in
changes remain subject to their previously agreed rollback before GitHub commit.

The v3.2 image/archive and its original release directory remain available for
rollback. The legacy model filename `models/english-coverage-v3.1.json` is retained
for compatibility; pinned hash and metadata identify the actual current release.
