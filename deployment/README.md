# Group leader handover: build the backend and models from GitHub

The complete inference-only bundle is versioned under `runtime/coverage/`.
The 90,868,376-byte MiniLM `model.safetensors` file uses Git LFS. The models,
tokenizer, inference Python modules and integrity manifests are included.
No separate Blob Storage, training environment or training run is required.

Current release: Science v3.4 (the compatibility filename remains
`english-coverage-v3.1.json`), History v5.1 and pipeline 2.1.9. The current
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
docker build --platform linux/amd64 -t smart-notes-coverage:science-v34-history-v51-release-20261018 .
docker run --rm --network none --read-only --tmpfs /tmp smart-notes-coverage:science-v34-history-v51-release-20261018 node dist/scripts/verify-coverage-container.js
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

This is a checkout fragment, not a complete workflow. No auto-deploy workflow
is enabled by this handover. The group leader can add registry authentication,
image publication and Azure deployment to the team's existing pipeline later.
Use a current GitHub-hosted runner or a compatible self-hosted runner; see the
[checkout action documentation](https://github.com/actions/checkout).

## Run or deploy

Use [the current production profile](science-history-v34-2026-10-18/README.md)
and its `.env.production.example` for the required configuration. Supply actual
credentials privately. The Compose profile expects the image tag built above.

For Azure, publish this complete image to ACR and run it in Container Apps on
port 8004. Models stay inside the image. Configure one active replica, persistent
uploads/audio/cache mounts, the gateway prefix rewrite and existing database,
Clerk and OCR connections as described in [the Azure guide](../docs/azure-deployment.md).
The checked-in Compose file is a Docker-host profile; translate its environment,
volumes and preflight checks to the Azure configuration.

Existing media/databases are not copied by cloning this repository or building
the image. Keep current production volumes and migrate data privately when
changing hosts. Do not remove existing volumes during an update.
