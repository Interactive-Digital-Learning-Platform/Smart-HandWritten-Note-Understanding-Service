# Azure deployment and model hosting

Updated 19 October 2026 after R2 activation and existing-image migration. The backend and model bundle
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
single revision mode. The current service starts work inside the Node process;
R2 image storage does not make its background workers distributed.
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
| Science v3.5 | Portable JSON weights/rubrics, called through the bundled Python bridge; compatibility filename remains v3.1 |
| History v6.2 | Frozen JSON model plus the bundled MiniLM encoder, loaded by a persistent Python worker |
| ICT v3.1 | Artifact exists in this image; disabled in the selected release configuration |
| OCR / selected text tasks | Requests to the configured external Groq models |
| Curriculum retrieval | Separate Nomic embedding model and the existing 768-dimensional Qdrant collection |

The coverage inference bundle contains hash-verified files, including the three
models, inference modules and MiniLM encoder. Keep it at
`/app/coverage-runtime` in the image. It contains no training datasets. The
Nomic retrieval encoder is separate: provision its cache and run the dependency
check before accepting uploads; the first check may download that encoder.

Current tested image:

```text
smart-notes:science-v35-history-v62-r2-20261019
```

See the current [Docker release](../deployment/azure-ready-2026-10-19/README.md)
and its release-verification JSON for the local image ID and validation results.
The team has not selected an Azure hosting option yet; the Linux amd64 image can
also run in AKS or on an Azure Docker VM. Container Apps is the optional example
in this guide, not a provisioned or verified Azure deployment.

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
   $sourceImage = 'smart-notes:science-v35-history-v62-r2-20261019'
   $targetImage = "${registryHost}/smart-notes:science-v35-history-v62-r2-20261019"
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
5. Keep the existing private R2 bucket and its server-only credentials for note
   images. Mount persistent Azure Files storage at `/app/generated_audio` and
   `/app/.cache`. Verify that UID 1000 (the image's
   `node` user) can write to the mounts. Container/replica temporary storage is
   insufficient for audio across replacement. `/app/uploads` is temporary staging
   for new R2 uploads and must be writable. The 114 valid existing images have
   already been migrated to R2, so keep that bucket and the matching Notes database.
   Transfer audio separately when keeping its existing records. Keep original
   recovery copies on the old host; the Docker image contains no student media.
6. Run release configuration/dependency preflight against the destination
   settings. `node dist/scripts/verify-deployment.js` is inside the image and checks
   the configuration and packaged model catalogs without connecting externally.
   Then run `node dist/scripts/verify-knowledge-base-v2.js` in a controlled
   container/job with the destination network and the same cache mount; require
   `ready: true`. Verify the destination PostgreSQL ingestion records too. The
   existing local v2 PostgreSQL/Qdrant Docker stack is not included in this image
   and must be deployed/restored separately. Health alone cannot verify this.
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
NOTE_IMAGE_STORAGE=r2
QDRANT_COLLECTION=pdf_knowledge_base_v2
QDRANT_PAYLOAD_PAGE_BASE=1
```

Use the [current production environment example](../deployment/azure-ready-2026-10-19/.env.production.example)
for all database, Clerk, Groq and R2 variable names. Supply their values as secrets,
including `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Configure startup, readiness
and liveness probes explicitly in the Azure hosting spec; the Dockerfile's own
health check does not replace platform probe configuration. A reasonable initial
Container Apps startup allowance is 10-second periods with 30 failures (five
minutes); readiness/liveness may use 10-second periods, 5-second timeouts and
failure thresholds of 3. Tune these after measuring the destination cold start.

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

Relevant guides: [release profile](../deployment/azure-ready-2026-10-19/README.md),
[existing-image migration](note-image-migration-2026-10-19.md),
[model packaging](coverage-deployment.md).

Microsoft references checked for this guide:
[registry pull identities](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull),
[replica scaling](https://learn.microsoft.com/en-us/azure/container-apps/scale-app),
[persistent storage](https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts),
[secrets](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets),
[health probes](https://learn.microsoft.com/en-us/azure/container-apps/health-probes).
