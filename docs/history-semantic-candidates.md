# History semantic candidates — 2026-10-15

Two new offline candidates tested a general change to paraphrase handling. Neither is enabled in the app. The live Science artifact and all previous History results remain intact.

## Approach

V4 adds six sentence-similarity statistics to V3.2's 29 lexical/review features, producing a 35-feature logistic-regression head. V5 removes the original exact-word coverage/similarity features from the classifier head, retaining six semantic statistics and seven review-related features: 13 features total. Both still use lexical retrieval for existing explanations and concern detection. V5 is a semantic/safety-focused linear head, not an end-to-end semantic correctness detector.

The encoder is frozen `sentence-transformers/all-MiniLM-L6-v2`, pinned to revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`. It produces normalized sentence representations using attention-masked mean pooling. It is a 22.7-million-parameter feature extractor trained by its original authors; the trainable component here is our logistic-regression head. The implementation follows the original [MiniLM model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2). No encoder fine-tuning was performed.

Encoding runs locally on CPU with two threads. Exact source windows are split at a maximum of 48 whitespace-delimited words; windows exceeding 256 word pieces raise an error instead of silently truncating. No notes were uploaded for inference. Only public encoder files were downloaded, as safetensors with remote code disabled; their checksums and revision are recorded. The weights are 90,868,376 bytes, separate from the roughly 1.1 MB head artifact. This candidate therefore has a larger inference dependency than the lexical model even though head training stays lightweight.

The same 955 development/training records are used as V3.2. The newest 24 submitted-review labels are **not fitted or used for C selection**. However, the architecture was developed after seeing those errors, so the resulting comparison is development evidence. Vocabulary and scaler/head fitting use training data only. The frozen encoder's unlabelled representations are cached across sets; encoding a validation/test text does not fit or update the encoder. C is selected on the same 338 development-validation records. V4 selected C = 1; V5 selected C = 0.1.

Concern handling also distinguishes the positive assistance construction “did not … alone” and additive “not only …” from actual negation. This finite heuristic is not a general parser. The earlier prompt, source-role, date and review-required policies remain. Semantic quotes are saved in addition to the original lexical quotes, with exact source offsets; they are candidate evidence, not verified entailment.

## Results and selection

| Comparison set | V3.2 | V4 combined head | V5 semantic-focused head |
|---|---:|---:|---:|
| Exposed 24 submitted-review examples | 19/24 | 21/24 | 22/24 |
| Complete-answer recall on those 24 | 3/8 | 5/8 | 8/8 |
| First new 22-example AI diagnostic set | 18/22 | 17/22 | 21/22 |
| Second new-topic 20-example AI set | 15/20 | Not scored | 18/20 |

V4 was not promoted: adding semantic features while retaining the exact-word features did not improve the first new wording check. That outcome motivated the V5 ablation. The 22 diagnostic texts therefore influenced V5 architecture development; their score is not fresh V5 evidence. The 20-example new-topic set was created and scored after V5 was frozen and was not used to fit, select or modify its policy. Its labels are AI expectations based on supplied proposed criteria, not independent historical certification or handwriting validation.

V5 recognizes all eight complete answers on the exposed review packet without fitting those labels. The two non-matches are partial answers with negation/date errors: the classifier predicts Complete, then safeguards withhold the suggestions. They are counted as abstentions, not correct Partial predictions. There are no final false Complete suggestions in that small packet.

On the new-topic set, V5 recognizes all six expected Complete answers and matches 18/20 final labels. The other two have raw Complete withheld for incorrect-year/negation concerns. Withheld predictions remain non-matches. V3.2 recognizes three of those six Complete answers and matches 15/20 overall. Neither model has a final false Complete in that small AI check; this is not a precision guarantee.

There is a material trade-off on the exposed 340-example synthetic regression set: V3.2 raw agreement is 338/340 (99.41%) with one final false Complete; V5 raw agreement is 333/340 (97.94%) with **four final false Complete suggestions** and three abstentions. Those regression errors remain recorded. Better paraphrase recall does not establish uniformly better reliability or justify automatic app activation.

## Timing, validation and reproducibility

Initial local V4 encoding/head fit/evaluation took 55.04 seconds, including 3,714 unique embedding inputs. The cached V5 ablation took 13.36 seconds. Initial Python/encoder startup and the public model download are additional costs. A cached feature lookup is not a representative uncached app latency test.

Portable head probabilities matched fitted scikit-learn probabilities within 2.5e-16 for V4 and exactly for V5. Evidence and semantic quote spans were verified during comparisons. Targeted checks cover negation scope, complete word coverage by bounded windows, exact spans, prompt gating, encoder revision, artifact dimensions and preservation of original results.

Artifacts:

- `ml-training/outputs/history-coverage-v4-semantic-2026-10-15/`: initial candidate, protocol, evaluation, exposed-review comparison and first new AI checks. Model SHA-256 `ef18da245753c9f46e49b3a6cd7aec1da2e95f590780b309e5d1f27496ec5c08`.
- `ml-training/outputs/history-coverage-v5-semantic-core-2026-10-15/`: ablation, protocol, evaluation, comparisons and new-topic checks. Model SHA-256 `2cad8eca6f17672e5c34e2d17115bc4b96ed4ba4fca3961b42966f73c176e9d3`.
- `ml-training/encoders/minilm-l6-v2/encoder-manifest.json`: pinned encoder path and file checksums. Encoder files and embeddings are excluded from Git. A head JSON alone is insufficient for inference; deploying this candidate needs the encoder/runtime and portable path configuration.
- `ml-training/outputs/history-semantic-embedding-cache-v1/`: local unlabelled text embeddings; model selection never fits from cache metadata or labels.
- `ml-training/requirements-history-semantic.txt`: optional semantic runtime pins, separate from the existing Science runtime. Locally installed PyTorch has CUDA packaging but all these computations use CPU.

V5 is a promising research candidate for broader fresh subject review because the change generalizes across requirements instead of editing five concepts. It still needs false-complete analysis, independently reviewed new examples and real-image/OCR/whole-note testing. No production routing, model promotion or mobile configuration was changed.
