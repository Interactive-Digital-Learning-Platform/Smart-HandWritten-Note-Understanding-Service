# Notes Docker release for Azure

This release packages the Notes API, Science V3.5, History V6.2, their Python
runtime and frozen MiniLM encoder in **one Linux amd64 image**. R2 stores images;
MongoDB, PostgreSQL, Qdrant v2, Clerk and Groq remain external services. No GPU,
model training, separate inference microservice or local Python installation is
needed on the deployment host.

The group has not selected Container Apps, AKS or an Azure VM yet. This image works
as the Notes container on those platforms. This folder supplies a Docker-host
Compose example and the environment contract; it is not an Azure resource template.
No Azure resources, registry publication or automatic deployment are created.

## Build and validate

From the Notes repository root, with Docker and Git LFS installed:

```powershell
git lfs pull
git lfs fsck
docker build --platform linux/amd64 -t smart-notes:science-v35-history-v62-r2-20261019 .
docker run --rm --network none --read-only --tmpfs /tmp smart-notes:science-v35-history-v62-r2-20261019 node dist/scripts/verify-coverage-container.js
```

The offline check must pass all 15 model packaging fixtures. This is a deployment
regression check, not a new model accuracy estimate. The Dockerfile validates the
frozen model bundle. Do not regenerate that bundle on the hosting machine.

With Node available on the Docker host, the additional packaging verifier checks
the same model fixtures, fake-value configuration preflight, non-root user,
absence of credentials/student uploads, and the exact Docker health command on
an isolated custom-port test container (including a failed-health response):

```powershell
node deployment/azure-ready-2026-10-19/verify-image.cjs
```

Its aggregate result is saved in `image-verification.json`. It does not contact
Azure, Groq, R2 or the application databases.

## Configure the destination

Copy `.env.production.example` to this folder's ignored `.env.production`, then
replace every placeholder privately. Use the **existing Notes database and R2
bucket** to retain uploaded notes, or migrate them before changing their addresses.
The current local PostgreSQL/Qdrant textbook stack is not inside this image.
Deploy/restore the shared v2 database and ingested collection separately, and set
the reachable destination endpoints and key. `localhost` and
`host.docker.internal` are rejected by the deployment check.

Supply secrets as Azure secrets/Key Vault references on hosted platforms. Never
pass credentials as Docker build arguments or copy `.env` into the image. Set
the actual deployed frontend origin in `CLERK_AUTHORIZED_PARTIES`. The application
continues verifying the existing Clerk tokens.

Configuration/catalog check, with no network operations:

```powershell
docker run --rm --network none --env-file deployment/azure-ready-2026-10-19/.env.production smart-notes:science-v35-history-v62-r2-20261019 node dist/scripts/verify-deployment.js
```

After destination services and network access are available, prewarm and verify
the actual v2 retrieval collection from the destination network:

```powershell
docker run --rm --env-file deployment/azure-ready-2026-10-19/.env.production -v notes-retrieval-cache:/app/.cache smart-notes:science-v35-history-v62-r2-20261019 node dist/scripts/verify-knowledge-base-v2.js
```

On Azure, run that command as a controlled one-off job/container with the **same
cache mount and network as the application**; the CLI example volume is only a
Docker-host example. It downloads public retrieval encoder files if necessary
and reads Qdrant, without using student images or calling Groq. Require `ready:
true`. Also verify PostgreSQL ingestion records and perform the signed-in upload
and materials checks in the Azure guide before opening the service to students.

## Optional Docker-host run

This is useful on an Azure VM with Docker. Container Apps and AKS should translate
the same environment, port, storage and replica requirements into their own specs.

```powershell
docker compose --env-file deployment/azure-ready-2026-10-19/.env.production -f deployment/azure-ready-2026-10-19/compose.production.yaml config --quiet
docker compose --env-file deployment/azure-ready-2026-10-19/.env.production -f deployment/azure-ready-2026-10-19/compose.production.yaml up -d
```

The Compose example creates new audio/cache volumes. Existing audio and encoder
caches must be transferred/mounted explicitly if those existing records are kept.
Do not run this alongside another production Notes replica during active jobs.

## Azure handover settings

| Setting | Value |
| --- | --- |
| Image | `smart-notes:science-v35-history-v62-r2-20261019`, later tagged in ACR |
| Platform | `linux/amd64` |
| Default process | `node dist/server.js`; run `node dist/scripts/verify-deployment.js` as a separate preflight (the Compose example enforces both) |
| Port | `8004`; bind the app ingress target/service port to this value |
| Probe | HTTP `/api/health` on 8004; no authentication needed |
| Initial resource budget | 2 vCPU / 4 GiB; measure and tune before final sizing |
| Replicas | One active instance, minimum 1, maximum 1 for now |
| Image storage | Existing private Cloudflare R2 bucket |
| Persistent storage | `/app/generated_audio`; `/app/.cache` for the retrieval cache |
| Temporary storage | `/app/uploads` for staged uploads; `/tmp` |
| Container user | UID 1000 (`node`), not root; mounts must be writable by it |

Use the team's gateway and preserve its prefix rewrite: gateway
`/api/notes/api/notes` reaches backend `/api/notes`, and
`/api/notes/uploads/<file>` reaches backend `/uploads/<file>`. Prefer private Notes
ingress where the gateway shares its network. Do not edit the team's gateway as
part of deploying this Notes container.

Start with one active replica because processing and material workers execute
inside the API process. R2 alone does not make background execution distributed.
Drain active jobs before an update; restart/revision replacement can interrupt
work. Health proves process responsiveness, not all external dependencies.

The 114 successfully migrated images already reside in R2 and are not transferred
in the Docker image. Original recovery copies remain on the old host. The 75
pre-existing missing source images and one invalid source still need restoration
or re-upload if those older records are required.

See [the Azure deployment guide](../../docs/azure-deployment.md) for registry push,
Container Apps probe/storage settings and destination acceptance checks.
