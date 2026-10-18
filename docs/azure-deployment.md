# Azure deployment and model hosting

Updated 18 October 2026 for the GitHub handover. The backend and model bundle
are built together from this repository, using Git LFS for the encoder binary.
This guide does not create Azure resources or enable automatic deployment.

## Recommended architecture

Use Azure Container Registry (ACR) for the tested Linux amd64 Docker image and
Azure Container Apps for the Notes backend. Keep the existing HTTPS gateway
contract. Connect the container to the configured MongoDB, curriculum
PostgreSQL database, ingested Qdrant collection, Clerk instance and Groq API.
These dependencies are not inside the image and are not migrated by publishing
the code. They may remain on their current hosts if reachable securely.

Start with a single active replica, `minReplicas: 1`, `maxReplicas: 1` and
single revision mode. The current service starts work inside the Node process
and stores media on disk; its release guide explicitly requires one instance.
Keep it running while processing work, drain active jobs before a revision
change, and avoid routing work to two revisions during rollout. Single revision
mode alone is not a distributed job lock. Start resource testing at 2 vCPU /
4 GiB and measure model memory, cold startup and realistic upload latency before
selecting the final size. This is an initial sizing suggestion, not a benchmark.

## How the models are deployed

The model runs inside the same Docker image as the backend. No separate model
server, Azure Machine Learning endpoint, GPU or training run is required for
the current frozen release.

| Component | Runtime behavior |
| --- | --- |
| Science v3.4 | Portable JSON weights/rubrics, called through the bundled Python bridge; compatibility filename remains v3.1 |
| History v5.1 | Frozen JSON model plus the bundled MiniLM encoder, loaded by a persistent Python worker |
| ICT v3.1 | Artifact exists in this image; disabled in the selected release configuration |
| OCR / selected text tasks | Requests to the configured external Groq models |
| Curriculum retrieval | Separate Nomic embedding model and the existing 768-dimensional Qdrant collection |

The coverage inference bundle has 30 hash-verified files, including the three
models, inference modules and MiniLM encoder. Keep it at
`/app/coverage-runtime` in the image. It contains no training datasets. The
Nomic retrieval encoder is separate: provision its cache and run the dependency
check before accepting uploads; the first check may download that encoder.

Current tested image:

```text
smart-notes-coverage:science-v34-history-v51-release-20261018
sha256:83912e1cd9ea3cf84c90a482133e454371235dc6c2d9241a19803824e288d5c3
```

Use a versioned registry tag and record the registry digest after upload. Do
not overwrite an older deployment tag. Preserve the earlier image for rollback.
Local Docker image IDs and registry manifest digests are different identifiers.

## Deployment sequence

1. Create/select the Azure resource group, region, ACR, Container Apps
   environment and classic Azure Files shares. Use a managed identity for
   registry pulls and grant its applicable pull role for the registry's
   permission mode.
2. Clone with Git LFS, build and verify the image using
   [the handover guide](../deployment/README.md), then publish it to ACR.
   Example PowerShell commands below are
   instructions for the later deployment, not commands executed by cleanup:

   ```powershell
   $registryName = '<your-acr-name>'
   $registryHost = az acr show --name $registryName --query loginServer --output tsv
   $sourceImage = 'smart-notes-coverage:science-v34-history-v51-release-20261018'
   $targetImage = "${registryHost}/smart-notes:science-v34-history-v51-20261018"
   az acr login --name $registryName
   docker tag $sourceImage $targetImage
   docker push $targetImage
   ```

3. Create the Container App with the image, one active replica, port `8004`
   and the settings below. Use internal ingress when the platform gateway can
   reach the same private environment; otherwise configure the HTTPS ingress
   and gateway access deliberately. Preserve the gateway prefix rewrite.
4. Supply actual credentials as Container Apps secrets or Key Vault secret
   references. Set environment variables using secret references; do not copy
   the developer `.env` into the image or GitHub. Set the real Clerk issuer and
   exact deployed frontend origins. Native session tokens still require Clerk
   verification. No Notes authentication bypass exists.
5. Mount persistent Azure Files storage at `/app/uploads`,
   `/app/generated_audio` and `/app/.cache`. Verify that UID 1000 (the image's
   `node` user) can write to the mounts. Container/replica temporary storage is
   insufficient for notes and audio across replacement. Migrate old media
   privately if keeping existing note records; reusing MongoDB alone does not
   transfer photos/audio.
6. Run release configuration/dependency preflight against the destination
   settings. The scripts live in `deployment/science-history-v34-2026-10-18/`;
   the current Dockerfile does not copy them into the image. Run them in a
   controlled preflight container/job with the same environment, connectivity
   and mounted cache. Require `ready: true` from `check-dependencies.cjs`.
7. Add startup/readiness/liveness HTTP probes on port `8004`, path
   `/api/health`, allowing enough startup time to load dependencies. Health is
   not a substitute for dependency preflight or an authenticated upload test.
8. Route the HTTPS gateway, test a signed-in upload and polling, private
   images/audio, Science/History checks, material generation and restart
   persistence. Verify signed-out and cross-account requests are rejected.
9. Build the mobile app with the destination
   `EXPO_PUBLIC_API_GATEWAY_URL` and the intended Clerk publishable key. This
   URL is embedded in the app build. The app calls the gateway; the trained
   model stays on the server. Configure mobile build/signing separately from
   hosting the backend. Keep the original sign-in flow restored as requested.

Required container settings (supply database/provider values privately using
the production example file as the variable-name reference):

```text
NODE_ENV=production
PORT=8004
COVERAGE_BUNDLE_DIR=/app/coverage-runtime
COVERAGE_PYTHON=/opt/coverage-python/bin/python
ENGLISH_COVERAGE_PYTHON=/opt/coverage-python/bin/python
HISTORY_COVERAGE_PYTHON=/opt/coverage-python/bin/python
ENGLISH_COVERAGE_SUGGESTIONS_ENABLED=true
HISTORY_COVERAGE_REVIEW_ENABLED=true
ICT_COVERAGE_REVIEW_ENABLED=false
ENGLISH_COVERAGE_REVIEW_ENABLED=false
ANNOTATION_REVIEW_ENABLED=false
UPLOAD_DIR=/app/uploads
EMBEDDING_CACHE_DIR=/app/.cache/embeddings
```

Do not use `localhost` or `host.docker.internal` for Azure-hosted databases.
Set their reachable private/managed-service DNS addresses instead. Preserve
the retrieval model/dimension and existing textbook collection. Do not assume
a newly created empty database is equivalent to the ingested knowledge base.

The gateway strips `/api/notes/`: for example,
`/api/notes/api/notes` reaches backend `/api/notes`, and
`/api/notes/uploads/<file>` reaches `/uploads/<file>`.

## GitHub and future builds

GitHub stores source, templates and the inference-only `runtime/coverage/`
bundle. The large encoder binary uses Git LFS. ACR stores the executable image.
Training datasets/checkpoints, development encoder caches, student uploads and
credentials remain excluded. Separate Blob Storage is not required.

The build must fetch actual LFS contents before running Docker. For GitHub
Actions, set `lfs: true` on the checkout action. The Dockerfile validates bundled
hashes, and the offline regression script verifies model behavior. See
[build from GitHub](../deployment/README.md) for commands. Do not regenerate the
bundle on the deployment host: its preparer is a model-workstation tool that
needs ignored historical provenance. Use the versioned bundle as supplied.

Relevant guides: [release profile](../deployment/science-history-v34-2026-10-18/README.md),
[model packaging](coverage-deployment.md).

Microsoft references checked for this guide:
[registry pull identities](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull),
[replica scaling](https://learn.microsoft.com/en-us/azure/container-apps/scale-app),
[persistent storage](https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts),
[secrets](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets),
[health probes](https://learn.microsoft.com/en-us/azure/container-apps/health-probes).
