# Science, History and ICT deployment package

## Current GitHub handover — 18 October 2026

Use [build from GitHub](../deployment/README.md) and the
[Science v3.4 / History v5.1 profile](../deployment/science-history-v34-2026-10-18/README.md).
The inference-only `runtime/coverage/` bundle is included in the repository,
with its large encoder binary in Git LFS. Fetch LFS contents before building
the Docker image. Separate Blob Storage is not required. Training outputs,
student files and credentials remain excluded. The sections below record
earlier releases and their historical local packaging instructions.

## Current final-day release — 17 October 2026

The user selected Science and History for today's Docker release; hosting is
not ready. Use [the release guide](../deployment/science-history-2026-10-16/README.md)
and its separate production Compose file. ICT and research-review APIs are
disabled in that profile. The previously tested image is frozen under
`smart-notes-coverage:science-v31-history-v51-release-20261017-presentation`, image ID
`sha256:3b793ee5b886edf175046eb3a2767cb5110934aecfeafeb20d69c749ade0a500`.

The image archive, configuration template, preflight scripts, guide, manifest
and checksums are in the shared workspace's
`output/notes-production-release-2026-10-16` directory. The release passed 15
offline frozen-model regressions and an isolated production-profile startup;
its database, textbook collection, Clerk keys and retrieval encoder checks
passed. Repeat destination checks when hosting is available. This is a prepared
backend release, not a claim of a live public deployment or independent
handwriting accuracy. Earlier sections below describe historical packages and
may list older image IDs or local routing.

This image contains the compiled Node backend, Science V3.1, History V5.1, ICT V3.1, the frozen MiniLM encoder, and a CPU Python environment. It uses a separate inference bundle, so the server does not need the Windows training environment or training datasets. No retraining occurs during packaging.

Science suggestions keep their existing uploaded-note pipeline behavior. History remains an explicitly requested, experimental concept check requiring human review; packaging does not enable automatic History grading. ICT now uses the same on-demand review flow for 10 pilot concepts, with textbook references restricted to the verified replacement jobs. See [ICT integration](ict-mobile-integration.md).

## Build on the model preparation workstation

Run from the backend repository in PowerShell:

```powershell
ml-training/.venv/Scripts/python.exe -B ml-training/prepare_coverage_bundle.py
docker build -t smart-notes-coverage:science-v31-history-v51-ict-v31 .
docker run --rm --network none smart-notes-coverage:science-v31-history-v51-ict-v31 node dist/scripts/verify-coverage-container.js
docker run --rm --network none smart-notes-coverage:science-v31-history-v51-ict-v31 node dist/scripts/verify-ict-integration.js
```

The preparer validates the original frozen provenance, then copies an explicit allowlist into `runtime/coverage/`. The generated bundle is approximately 94 MB and is ignored by Git. Preserve that directory with the Docker build sources, or distribute the built image. A recipient of the built image needs neither Python nor the training files installed on the host.

The Docker context allowlist excludes `.env`, uploads, annotation files, training outputs, and local dependencies. Only the 21 explicitly synthetic regression examples are packaged for the self-test. All three model files retain their original bytes and SHA-256 hashes. The original History model includes an unused Windows provenance path in its metadata; deployment uses the bundled encoder manifest and never opens that old path.

The Node base image is pinned by digest. Direct Python model dependencies are pinned to the versions tested during training, with the CPU build of PyTorch. See the generated verification report for the installed versions. Debian package repositories and transitive Python dependencies are not a complete reproducible source-build lock; preserve the tested image for exact runtime distribution.

## Start the full backend

Configure the existing `.env` with reachable MongoDB and other service credentials. Secrets are supplied at runtime and excluded from the image. Database or Qdrant URLs using `localhost` refer to the container itself; use a reachable service hostname or Docker Desktop's `host.docker.internal` for a host service.

```powershell
docker compose -f compose.coverage.yaml up -d --no-build
Invoke-RestMethod http://127.0.0.1:8005/api/health
```

The default host port is **8005**, bound to loopback, so the existing backend on 8004 and mobile gateway on 8080 can keep running. Persistent named volumes hold new uploads, generated audio, and the ordinary application embedding cache. Existing host uploads are not automatically copied into those volumes.

This packages the complete backend executable but does not bundle MongoDB, the curriculum database, Qdrant, Groq OCR, or other external services. The three coverage models themselves can infer offline. Ordinary OCR, retrieval, and note storage still require their normal service configuration. The existing service's authentication and production security configuration require a separate deployment review before exposing it publicly.

History and ICT APIs:

```text
GET  /api/history-coverage/concepts
POST /api/history-coverage/suggestions
GET  /api/ict-coverage/concepts
POST /api/ict-coverage/suggestions
GET  /api/ict-coverage/concepts/:conceptId/reference
```

The POST body has `text`, a registered `conceptId`, `language: "English"`, and `scopeConfirmed: true`. It returns transient review suggestions; it does not change a student's marks or profile.

To stop only this packaged backend, preserving its data:

```powershell
docker compose -f compose.coverage.yaml down
```

To transfer the tested image without a registry:

```powershell
docker save -o smart-notes-coverage.tar smart-notes-coverage:science-v31-history-v51-ict-v31
# On the destination Docker host:
docker load -i smart-notes-coverage.tar
```

## Current three-subject verification

The three-subject image passed all 21 offline regression cases with networking disabled: 3 Science, 12 History and 6 ICT. The running container on port 8005 also passed 6/6 ICT prediction checks and 10/10 textbook-reference checks. The app gateway still routes to the host backend on port 8004, where the same ICT checks pass.

Image ID: `sha256:fd693f273144f97fb8a546fbc534b08a40b68ef2a9598ca2373f41c4cde08756`. Evidence and limits: [ICT integration](ict-mobile-integration.md) and [integration report](../packaging/ict-integration-report.json). Existing volumes were preserved when updating the local compose service. Compose uses `host.docker.internal:6333` for local Qdrant; override `COVERAGE_QDRANT_URL` when deploying elsewhere. No training data or credentials are in the image.

## Earlier two-subject verification (historical)

Verified on 2026-10-15 using Linux amd64 in Docker Desktop:

| Check | Result |
| --- | --- |
| Original Windows predictions | 15/15 recorded and matched earlier History predictions |
| Portable Windows bundle | 15/15 matched |
| Read-only Linux container, network disabled, no host mounts | 15/15 matched |
| Running full backend, History HTTP routes | 12/12 matched |
| Existing Science/History Node service and HTTP tests | 15 passed |
| Deployment bundle integrity tests | 4 passed |
| Full backend health | Healthy on `127.0.0.1:8005` |

All nonnumeric prediction fields matched exactly. The maximum numeric difference in Docker was `2.980232238769531e-7`. In this run, History's first offline request took 5.7 seconds including encoder initialization, and later requests took 5–34 ms. These timings are observations on this machine, not a latency guarantee.

The tested image is `smart-notes-coverage:science-v31-history-v51`, ID `sha256:7bf3f967fbddd14ecb2262604b7c71aad134dccd01c4d5073dd07d854fda29c1`. Docker reported 694,363,653 bytes for this image. It runs as UID 1000. The existing host backend/mobile gateway continues to use its original port; this validation did not switch the mobile app to port 8005.

Saved evidence: [offline predictions](../packaging/container-verification-report.json), [HTTP predictions](../packaging/backend-http-verification-report.json), [health](../packaging/backend-health-report.json), [image metadata](../packaging/image-verification-metadata.json), and [Python dependency versions](../packaging/python-runtime-freeze.txt).

To repeat the HTTP check against the running container:

```powershell
docker compose -f compose.coverage.yaml exec -T notes-coverage node dist/scripts/verify-coverage-container.js --http
```

The container self-test runs the actual compiled Node service bridges against three Science and twelve History examples. It compares labels, withheld decisions, evidence text/offsets, and remaining prediction fields with the original Windows runtime. Numeric comparisons permit absolute error `1e-6` plus relative error `1e-5`; all nonnumeric values must match exactly. The self-test is run without a network or host-mounted model files.

This establishes packaging compatibility for these synthetic examples. It is not an independent model accuracy estimate and does not validate real handwriting or the full OCR/upload workflow. The existing accuracy limitations and human-review requirements still apply.

Dependency references: [official Node image](https://github.com/nodejs/docker-node), [official PyTorch CPU wheel index](https://download.pytorch.org/whl/cpu/torch/).
