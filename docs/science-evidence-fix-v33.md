# Science evidence correction, v3.3

The Notes Science model now uses `english-coverage-v3.3-evidence-fix-2026-10-18`.
Its learned linear head, scalers and vectorizers remain those of v3.2; the Science
relation checks and rubric configuration were corrected. History/ICT models and
their frozen sources are unchanged. No shared authentication or other members'
services were edited. The only mobile changes recognize the new Science version
in the Notes result display and verify backward-compatible version formatting.

Reproduce the candidate from the saved v3.2 artifact:

```
ml-training/.venv/Scripts/python.exe ml-training/patch_science_evidence_v33.py
ml-training/.venv/Scripts/python.exe ml-training/evaluate_science_evidence_v33.py
```

Artifact SHA-256: `357e2a67f768bbda261aaf430887e3d1b875a4b91d639453f5fb79dc77e8923f`.
The compatibility file slot remains `models/english-coverage-v3.1.json`; metadata
and integrity pins identify the actual version. Source checks, bundle manifest,
Science numeric golden cases and pipeline version 2.1.8 were updated together.
Previously saved model outputs retain their original version; new analyses or an
explicit Science recheck use v3.3. No OCR text, saved study material, decisions or
existing analyses are rewritten by this release.

The full comparison and limitations are in
`ml-training/outputs/science-v33-evidence-fix-2026-10-18/RESULTS.md`.
The 71 supplied examples are now exposed development data. All-case AI agreement
improves 59/71 to 66/71, with one abstention counted as not correct. Isotopes improve
12/20 to 18/20. Partial precision improves while partial recall decreases against
unchanged AI labels, and complete precision decreases; the report describes the
AI label inconsistencies and unresolved disagreements. No independent accuracy
improvement on real handwriting has been established.


Validation: 39 Python tests, 19 Notes API/pipeline/bridge tests, eight mobile
status tests, both TypeScript compilers, four release-config tests, 15 Linux
Science/History regression cases, 71 running-container predictions and five
additional live service-bridge cases passed. The Notes container is running v3.3
with its original storage volumes; authentication remains required. New checks
use this release, while saved outputs keep their recorded versions.

Production profile: `deployment/science-history-v33-2026-10-18/`.
The Docker archive and checksum are under
`C:/Users/DLK/Desktop/RP_PROJECT_3/output/notes-production-release-science-v33-2026-10-18/`.
Export/load and image identity were verified. The previous v3.2 package remains
available. This is prepared for deployment; no remote hosting was configured.
