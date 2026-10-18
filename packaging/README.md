# Deployment verification fixtures

`coverage-verification.json` and `ict-verification.json` are synthetic regression
fixtures used by the container's inference self-tests and copied by the
Dockerfile. Keep them in Git. The other small reports record the earlier
packaging checks; they are evidence, not live environment configuration.

The inference-only `runtime/coverage/` bundle is included in Git, with the large
encoder binary in Git LFS. Docker `.tar` archives remain ignored. See
[build from GitHub](../deployment/README.md) for clone/build instructions and
[Azure deployment](../docs/azure-deployment.md) for hosting the complete image.
