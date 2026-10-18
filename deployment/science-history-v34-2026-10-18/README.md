# Notes Science v3.4 / History v5.1 release

This release fixes the existing Science classifier's complete/partial evidence
handling and includes a separate auditable review of four inconsistent AI labels.
It retains the learned linear weights, scalers and vectorizers. It does not add
a separate model. See docs/science-reviewed-fix-v34.md for changes and the report
under ml-training/outputs/science-v34-review-fix-2026-10-18/ for the full audit.

All reported 71-case and 90-case results are development checks, not independent
handwriting accuracy. The assistant review is not human or teacher confirmation.
No original labels or submitted human reviews were overwritten.

## Destination host

For a source checkout, follow [build from GitHub](../README.md) to fetch Git LFS
and build the image with the tag expected by this profile. The Docker archive
command below is an alternative for recipients of the separately exported image.

```
docker load -i smart-notes-science-history-v34.tar
```

Copy .env.production.example to a private .env.production if needed and configure
MongoDB, curriculum PostgreSQL, Qdrant, AI credentials and Clerk. Then:

```
docker compose -f compose.production.yaml config --quiet
docker compose -f compose.production.yaml up -d --no-build
docker compose -f compose.production.yaml ps
```

The service binds to loopback port 8005 by default and requires the existing
authenticated gateway. Inference is bundled locally; upstream OCR and curriculum
stages still require their configured dependencies. The production profile enables
Science and History only. History/ICT artifacts are unchanged. Training examples,
student files and credentials are excluded from the image. Hosting is not set up
by this package.

When updating an existing installation, retain its Compose project and volumes.
Never delete volumes. Local testing uses the existing compose.coverage.yaml
project. The v3.3 release is preserved for rollback.

New analyses and explicit rechecks use Science v3.4 / pipeline 2.1.9. Old saved
outputs retain their actual versions. No OCR, student decision or material is
rewritten. No shared authentication or other members' services were edited.
Mobile integration and its separately recorded sign-in rollback are outside
this backend release. No shared mobile files are part of the backend repository.
