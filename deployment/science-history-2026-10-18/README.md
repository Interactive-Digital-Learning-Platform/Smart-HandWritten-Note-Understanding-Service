# Existing Science model update — 18 October 2026

This release continues training of the same Science coverage classifier and serves
the resulting v3.2 weights through the existing Notes upload pipeline and Science
checker. It does not add a new model architecture, endpoint, picker or student flow.
History v5.1 and ICT artifacts are unchanged; the production profile enables Science
and History only. Hosting is still to be configured.

Science v3.2 retains the ten concepts, rubric/feature extractor, scalers, evidence
mapping and review policy from v3.1. It adds 75 AI-labelled transcript examples from
the supplied simulated notebooks, with weak-label weighting, notebook-normalized
page variants and an update anchored to the previous weights (strength 10). The
71 reserved proposals were not fitted or counted as human-reviewed examples.

The first, larger update regressed on exposed development examples and was not
applied. The smaller update retained the scores and false-complete counts on all
three earlier human-reviewed synthetic sets (90 examples). These sets informed
development and are not a new independent accuracy benchmark. New handwriting
accuracy and improved general accuracy have not been established.

## Run on the destination host

```powershell
docker load -i smart-notes-science-history-v32.tar
if (-not (Test-Path -LiteralPath .env.production)) { Copy-Item .env.production.example .env.production }
# Configure the real external database, Qdrant, AI and Clerk values privately.
docker compose -f compose.production.yaml config --quiet
docker compose -f compose.production.yaml up -d --no-build
docker compose -f compose.production.yaml ps
```

The default port is bound to 127.0.0.1:8005. Put the existing authenticated gateway
in front of it. Do not publish student files or credentials. The service still
requires external MongoDB, curriculum PostgreSQL, Qdrant, AI credentials for the
upstream analysis stages, and Clerk configuration. Run the dependency preflight
on the destination as described in the prior release. The trained Science/History
inference itself is bundled and local; training data/images are not in the image.

New analyses and newly requested Science checks record v3.2. Previously saved
v3.1 results keep their recorded version and are not silently relabelled. The
historical loader filename `models/english-coverage-v3.1.json` remains the existing
service artifact slot; its metadata and pinned SHA-256 identify the active v3.2
weights. The mobile Notes version formatter displays the actual stored version.

The previous v3.1 image/archive and model backup are retained for rollback. On a
local rollback, use an image override with the same Compose project and volumes;
do not delete volumes or start an unrelated project against empty storage.

The Notes-only update preserves existing student photos, OCR, lesson scores,
materials, support decisions and research consent. Temporary sign-in changes
were not altered and still require their agreed rollback before a GitHub commit.
