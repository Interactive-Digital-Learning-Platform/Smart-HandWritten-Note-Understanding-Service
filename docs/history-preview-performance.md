# History preview response time improvement

Measured: 2026-10-15T06:35:13.182Z

The local preview now keeps its Python encoder and classifier loaded between requests. The candidate weights, rubric, review policy, and full prediction responses remain unchanged. Automatic History suggestions in the main application remain disabled.

| Check | Previous process-per-request | Persistent worker |
| --- | --- | --- |
| Twelve demo inputs, median HTTP latency | 25.450 s | 0.031 s |
| Twelve demo inputs, observed range | 7.900–64.900 s | 0.010–0.065 s |
| Initial worker/model load | Included on every request | 18.8 s on first request |

These are local timings on short synthetic notes. They do not include image upload or Groq OCR time, and do not establish performance on long or concurrent workloads. The warm median is measured in a separate second run after the first-load run. Note embeddings are discarded after each request, so the worker retains its loaded model without accumulating submitted notes.

All 12 full responses match the prior baseline exactly, including scores, suggestions, evidence quotes and offsets, concerns, and review flags. The nine clean notes still match the AI expectations; two noisy notes match, and the `18l5` example is still withheld. This is repeated synthetic regression evidence, not new handwriting accuracy evidence.

Additional newly submitted text timing probes (not labelled accuracy cases):

- 0.042 s; suggested status `partial`.
- 0.055 s; suggested status `present`.

Validation: `npm run build`, seven Node preview/worker tests, and ten Python runtime/policy tests passed. Failure tests cover crash, timeout, malformed/oversized output, overlapping jobs, Unicode framing, disposal, and recovery. The local-only host/origin checks, bounded input/output, and independent OCR flow remain in place.

Reproduce: start `npm run preview:history`, then run `npx ts-node src/scripts/verify-history-demo-pack.ts --persistent`. The baseline must exist at `tmp/history-preview/demo-api-results.json`. Restart the preview to measure cold load; subsequent invocations measure warm latency. The verification script records the demo-pack checksum and verifies the full previous predictions.

Raw reports: `tmp/history-preview/demo-api-results-persistent-cold.json` and `tmp/history-preview/demo-api-results-persistent.json`.

Model SHA256: `12ba94e87415adb0ceb851919a6e87bc5d36e8535f0539352b450bd104e368e8`.
