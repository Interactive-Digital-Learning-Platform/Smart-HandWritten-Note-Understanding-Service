# Smart Handwritten Note Understanding Service

Notes backend for authenticated image uploads, OCR, curriculum matching,
concept coverage suggestions and study materials. The mobile application calls
this service through the platform gateway.

## Development

Use Node.js 22, run `npm ci`, copy `.env.example` to `.env`, configure the
existing databases, Clerk issuer and external provider credentials, then run
`npm run dev`. Build with `npm run build`; start compiled code with `npm start`.
The full model runtime also needs the separately prepared Python environment
and frozen artifacts; `npm ci` alone does not install them.

## Deployment

- [Build from GitHub](deployment/README.md): clone with Git LFS, verify the
  included inference bundle, and build the complete backend/model image.
- [Azure deployment and model hosting](docs/azure-deployment.md): recommended
  hosting for the existing service and the boundary between source and artifacts.
- [Current Science + History release](deployment/science-history-v34-2026-10-18/README.md):
  frozen image identity, configuration, dependency checks and gateway routes.
- [Model packaging](docs/coverage-deployment.md): inference bundle and offline checks.
- [Notes security](docs/student-notes-security.md): authentication and ownership.

The selected release enables Science v3.4 and History v5.1. ICT remains
disabled by that release profile. Suggestions describe submitted note coverage
and require review; they do not establish student understanding.

[Science review and evidence fixes](docs/science-reviewed-fix-v34.md) document
the corrected AI-label audit and development checks; these are not independent
real-handwriting accuracy results.

## What belongs in Git

Keep application and training source, tests, dependency manifests/locks,
configuration templates, frozen small model JSON files, synthetic test fixtures,
rubrics and implementation/research documentation. Mobile demo fixtures are
used by the app and its tests and are maintained in the mobile repository.

Do not add `.env` files, uploaded notes, generated audio, annotation exports,
local dependencies, build output, caches, temporary diagnostics, model training
outputs, development encoder downloads, or Docker image archives.
The inference-only `runtime/coverage/` bundle is included in this repository.
Its large pretrained encoder is stored using Git LFS; run `git lfs pull` before
building. The backend and models deploy together without separate Blob Storage.

Checks: `npm run build`, `npm run security:secrets`, `npm test`; additional model
and deployment checks are described in the guides above. Existing Python
training/review fixtures are retained for reproducibility, not used as live
student records.
