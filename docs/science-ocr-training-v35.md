# Science V3.5 — reviewed OCR update, 19 October 2026

Continued training of the existing Science linear classifier using the new
generated handwriting packs. The encoder/features, feature scaler, vocabulary,
ten concept rubrics, evidence checks, review policy and output contract are
unchanged. The fitted weights and intercept changed. No other service or mobile
code was edited.

## Training inputs

- Eight AI-assistant-reviewed examples from three notebooks, representing two
  source families: Benedict's test and isotopes. These are synthetic handwriting,
  not independent real-student records or new teacher-verified labels.
- Three concept pages, three combined notebook texts, and two later Benedict
  procedure pages. Whole-notebook and page fragments share their notebook's
  training weight; each new notebook has one quarter the weight of an older
  training group.
- 71 earlier training examples provide rehearsal across the existing catalog
  and all three classes. Total: 79 rows (27 complete/present, 28 partial,
  24 missing). The new examples contribute four complete and four partial rows;
  there are no newly reviewed missing examples.
- Student E unit01 uses eight of nine OCR pages: the glucose page failed OCR.
  The complete Benedict evidence is on other, visually checked pages. No
  content-plan text was substituted for that failed page.
- Six other packs remain outside this model's supported concept catalog.

Training uses the existing prior-anchored optimizer with prespecified strength
10. No search was performed against the regression results. The 90 reviewed
human examples, 48 diagnostic examples and 71 earlier student development
examples were excluded from fitting, with normalized text-overlap checks.
Those sets were already exposed during earlier model development and are not
fresh holdouts.

## Comparison with V3.4

| Set | Previous matched labels | Updated matched labels |
|---|---:|---:|
| Human-reviewed development | 90/90 | 90/90 |
| Authored diagnostic development | 48/48 | 48/48 |
| Previous student development, with prior assistant label corrections | 71/71 | 71/71 |
| New training examples | 8/8 | 8/8 |

No additional false-complete suggestions occurred on these sets. These counts
show regression preservation, not an independently measured accuracy increase.
The baseline already matched the new examples; training-set agreement is not
validation accuracy. The new notes are now training data and must not be used
as an unseen accuracy test. A new teacher-reviewed notebook batch is needed
to measure generalization.

Validation completed: backend TypeScript build; 55 focused Python checks;
17 focused Node checks (localhost tests rerun with local-network access);
15 Linux container prediction fixtures; and all eight new examples plus a
separate missing diagnostic through the container's actual Science service.
The Notes container is healthy. The isotope contradiction remains visible in
both page and combined-notebook checks. The new-example checks are training
regressions, not unseen evaluation.

## Reproduce and apply

Run from the Notes service repository, using a fresh output directory:

```powershell
node ml-training/prepare_science_ocr_update.cjs <evaluation-folder> <notes-json>
ml-training/.venv/Scripts/python.exe -B ml-training/train_science_ocr_update.py --notes <notes-json> --output <fresh-fit-folder>
ml-training/.venv/Scripts/python.exe -B ml-training/activate_science_ocr_update.py --fit <fit-folder>
node -r ts-node/register src/scripts/refresh-science-verification.ts
```

The activation step verifies candidate hashes and regression gates, backs up
the previous Science files, and synchronizes the Notes backend and inference
bundle's integrity pins. History and ICT models remain unchanged. The Docker
image tag is `smart-notes-coverage:science-v35-history-v6-ict-v31-materials-v31`.
Existing stored note results retain their original model provenance; subsequent
analyses/checks use V3.5 once the container is restarted.

Candidate SHA-256:
`021bb8bd41df5d55599258144a9694097a32cae054ebabd12643783d1d50b191`

Previous V3.4 SHA-256:
`af9c5f0aeb326bb59f3ffc80ddecb61c251f0e02bdebfe9d272a98b8df16ef63`

Private training data, model backup, decisions and report are under
`ml-training/outputs/science-v35-new-notes-2026-10-19/` (ignored by Git).

The local release record is
`deployment/science-v35-2026-10-19/release-manifest.json`. The previous Docker
image remains available for rollback; the activation backup retains the six
previous host model/pin/manifest files. Stored uploads and results were not
rewritten, and no external hosting deployment was performed.
