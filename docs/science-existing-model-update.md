# Continued training of the existing Science classifier

The user requested training the existing model with the supplied notebook batch,
without implementing a separate model. The existing logistic head was therefore
updated and versioned as `english-coverage-v3.2-student-notes-2026-10-18`, retaining
its inference architecture, feature extractors, scalers, ten concept checklists,
evidence offsets and complete-withholding policy. The same Notes routes and upload
pipeline serve the update. Offline training checkpoints are reproducibility files,
not additional deployed models.

Training inputs: 75 AI-labelled examples from six synthetic source-chapter families,
using supplied transcripts. Labels: 7 complete, 21 partial, 47 missing. The 71
reserved proposals were not fitted. Page variants share notebook weight. AI labels
retain weight 0.25; no new labels are represented as human-reviewed, and no OCR
recognizer was trained.

The initial anchored update (strength 1) regressed on previously exposed human
development sets and was not applied. Strength 10 was fitted using the same new
training examples and selected after retaining all three historical reviewed-set
scores and false-complete counts. This selection used exposed development data,
so it does not create an independent accuracy result. The old raw-model accuracies
on those small synthetic sets remain 29/30, 29/30 and 28/30; the latest set still
has two false complete suggestions. There is no claim of a measured accuracy
improvement or verified real student handwriting performance.

Source checkpoint:
`ml-training/outputs/science-continued-strength10-2026-10-18/`.
Versioned artifact, previous model backup and 90-case comparison:
`ml-training/outputs/english-coverage-v3.2-strength10-update-2026-10-18/`.
The prior larger-update reports are kept, including the failed regression report.

Active model SHA-256:
`4ca8524b08f4c500ee9140bf37dfce52eb5af2935a2c8fc66d35869c98b7af7c`.
Previous Science model SHA-256:
`bc1916bc34adaecd699426987cf4c78fcde84c88052d49b070991c92159a84ec`.

The existing loader path is retained for compatibility. Its model hash and version
guard, inference bundle manifest, numeric regression fixtures and Notes pipeline
version (2.1.7) were updated together. History and ICT weights/sources are unchanged.
The Notes mobile formatter recognizes v3.2 while leaving saved old versions intact.
No shared authentication, gateway or other members' service code was edited.

Validation completed before activation: 90 historical human-reviewed development
cases without score regression, all three Benedict presentation outcomes, 14
Science service/procedure/pipeline tests, 107 other backend tests plus 10 OCR tests
run directly, 8 Notes version/status tests and mobile TypeScript compilation, 4
release config tests, and 15 cross-platform Science/History cases in the exact new
Docker image with networking disabled and a read-only filesystem. The combined
Node test runner hit its previously observed OCR-module IPC serialization error;
the isolated OCR module passed all ten tests. The Windows full golden refresh hit
a History worker cold-start timeout; only the changed Science golden values were
refreshed, preserving History fixtures, and all 15 cases then passed in Linux.

The container is updated with `--no-deps --no-build` in the existing Compose
project, preserving its named storage volumes. New checks use v3.2; old stored
results retain v3.1 until explicitly rerun. The current release packaging is
`deployment/science-history-2026-10-18/`; older archives remain rollback releases.
