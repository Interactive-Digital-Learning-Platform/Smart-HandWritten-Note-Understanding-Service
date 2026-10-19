# Group leader handover: build the backend and models from GitHub

The current source targets Knowledge Base v2. See [the v2 migration notes](../docs/knowledge-base-v2-notes-migration.md) before starting it. A verified [local v2 stack](kb-v2-local/README.md) is active with Science/History textbooks. Shared cloud deployment requires its own URL/key and matching re-ingested textbooks. Historical frozen images predating this migration cannot consume v2 as written.

The complete inference-only bundle is versioned under `runtime/coverage/`.
The 90,868,376-byte MiniLM `model.safetensors` file uses Git LFS. The models,
tokenizer, inference Python modules and integrity manifests are included.
No separate Blob Storage, training environment or training run is required.

Current prepared local release: Science V3.5 (the compatibility filename remains
`english-coverage-v3.1.json`), History V6.2 and pipeline 2.1.9. See the
[V6.2 model report](../docs/history-paraphrases-v62.md) and
[local release manifest](history-v62-2026-10-19/release-manifest.json).
Use the instructions below from the integration branch containing this release. The current
production profile disables ICT and expert research-review routes. Its ICT
artifact is retained in the bundle for the existing integrity contract.

## Clone and build

Install Git LFS and Docker with Linux amd64 container support. Check out the
branch being deployed; these commands use the current handover branch:

```sh
git clone --branch changes_before_deployment https://github.com/Interactive-Digital-Learning-Platform/Smart-HandWritten-Note-Understanding-Service.git
cd Smart-HandWritten-Note-Understanding-Service
git lfs install --local
git lfs pull
git lfs fsck
docker build --platform linux/amd64 -t smart-notes:science-v35-history-v62-r2-20261019 .
docker run --rm --network none --read-only --tmpfs /tmp smart-notes:science-v35-history-v62-r2-20261019 node dist/scripts/verify-coverage-container.js
```

The Docker build installs Node/Python dependencies and validates every bundled
file against its SHA-256 manifest. The offline self-test must pass all 15
Science/History regression examples. These are packaging checks, not independent
real-handwriting accuracy estimates. No credentials are needed for these checks.

Do not rebuild the bundle using `prepare_coverage_bundle.py` on the deployment
host: that is a model-workstation tool requiring ignored training provenance.
Use the checked-in verified bundle directly. Git LFS pointers must be resolved
to actual files before `docker build`; a source ZIP without LFS content is
insufficient.

For GitHub Actions, enable LFS during checkout before the Docker build:

```yaml
- uses: actions/checkout@v7
  with:
    lfs: true
- run: git lfs fsck
```

This is a checkout fragment. The CI/CD integration branch also contains
`.github/workflows/deploy.yml`: it caches/pulls Git LFS, builds and publishes
the image to ACR, then updates the existing Azure Container App using OIDC.
Its only trigger is a push to `main`; pushing `feature/ci-cd-pipeline` does not
deploy. A later merge to `main` can deploy using the configured Azure secrets.
The workflow preserves the Container App's existing environment values.
Use a current GitHub-hosted runner or a compatible self-hosted runner; see the
[checkout action documentation](https://github.com/actions/checkout).

## Run or deploy

Use [the current Docker production profile](azure-ready-2026-10-19/README.md)
and its `.env.production.example` for the required configuration. Supply actual
credentials privately. The Compose profile expects the image tag built above.

For Azure, publish this complete image to ACR and run it in Container Apps on
port 8004. Models stay inside the image. Configure one active replica,
persistent audio/cache mounts, private R2 images, the gateway prefix rewrite and existing database,
Clerk and OCR connections as described in [the Azure guide](../docs/azure-deployment.md).
The checked-in Compose file is a Docker-host profile; translate its environment,
volumes and preflight checks to the Azure configuration.

The CI/CD Dockerfile preloads the Nomic encoder at `/app/.cache/embeddings`.
A runtime mount over `/app/.cache` hides that image directory; seed the mounted
cache with the matching encoder or permit its first download. Do not assume a
new empty cache volume contains the baked encoder. Keep `QDRANT_VECTOR_NAME`
aligned with the ingested collection (`dense` by default); API-key authentication,
page-base configuration and compatibility checks remain required.

Existing media/databases are not copied by cloning this repository or building
the image. Keep current production volumes and migrate data privately when
changing hosts. Do not remove existing volumes during an update.
