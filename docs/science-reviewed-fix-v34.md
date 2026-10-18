# Science v3.4 review and evidence correction

The existing Science classifier is versioned as
`english-coverage-v3.4-review-fix-2026-10-18` in its compatibility artifact slot
`models/english-coverage-v3.1.json`. Its learned weights, vectorizers, scalers and
18 feature dimensions are unchanged. Point relation matching and conflict evidence
were corrected. The Notes pipeline version is 2.1.9. History and ICT model sources
and weights are unchanged; no shared authentication or other members' services
were edited. The mobile Notes version formatter recognizes v3.4 while retaining
older saved versions.

Reproduction:

```
ml-training/.venv/Scripts/python.exe ml-training/patch_science_review_v34.py
ml-training/.venv/Scripts/python.exe ml-training/evaluate_science_review_v34.py
```

The full label audit, exact source quotes and development comparison are under
`ml-training/outputs/science-v34-review-fix-2026-10-18/`. The original dataset is
unchanged. `assistant-label-review.json` is explicitly AI-reviewed, not a completed
human review, and cannot be mistaken for `notes-human-review-v1` training input.
Four labels change in an overlay view; no labels from the older human reviews
were changed. No weights were refitted using the exposed evaluation cases.

Original-label agreement rises 66/71 to 67/71. After the four documented label
corrections, the same exposed set scores 71/71, compared with 70/71 for v3.3.
Earlier human-reviewed synthetic development checks improve 86/90 to 90/90 shown
suggestions, with false complete suggestions reduced from two to zero. These
checks have been used in development and are not independent accuracy estimates.
Details, including the lower-confidence cut-off Ohm page, are in RESULTS.md.

Previously saved Notes outputs retain their original versions. A new analysis or
explicit Science recheck is needed to obtain the current model result. Existing
OCR, student decisions and study materials are not rewritten by this release.


The running Notes container is now v3.4 with original named volumes preserved.
Validation passed: 55 Python tests, 19 Notes API/pipeline/bridge tests, eight mobile
Notes tests, four release-config tests, both TypeScript compilers, 15 offline Linux
Science/History cases, all 71 running-container examples and seven focused live
service cases. Authentication remains required and the app returns HTTP 200.

The ready Docker archive, checksum, production profile and release manifest are
under `C:/Users/DLK/Desktop/RP_PROJECT_3/output/notes-production-release-science-v34-2026-10-18/`.
Source deployment profile: `deployment/science-history-v34-2026-10-18/`.
Export/load and image identity were verified; no remote hosting was configured.
The v3.3 release remains intact for rollback. No GitHub commit or push was made.
