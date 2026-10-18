# History demo API verification

Completed: 2026-10-15T06:04:50.826Z

All 12 supplied synthetic demo examples were sent sequentially to the actual local `/api/predict` endpoint. No model fitting, OCR image calls, or weight changes were performed. Expected labels were authored by AI from the proposed criteria; these results are demo agreement, not an independent accuracy estimate.

| Example | AI expected | API result | Seconds |
| --- | --- | --- | --- |
| sources-complete | Complete | Complete | 62.1 |
| sources-partial | Partial | Partial | 64.9 |
| sources-missing | Missing | Missing | 27.5 |
| british-complete | Complete | Complete | 18.6 |
| british-partial | Partial | Partial | 18.3 |
| british-missing | Missing | Missing | 24.9 |
| kandy-complete | Complete | Complete | 25.8 |
| kandy-partial | Partial | Partial | 7.9 |
| kandy-missing | Missing | Missing | 22 |
| sources-complete-ocr-noise | Complete | Complete | 25.1 |
| british-complete-ocr-noise | Complete | Complete | 26.2 |
| kandy-complete-ocr-noise | Complete | Withheld for review | 33.7 |

- Clean typed examples: 9/9 matched (three Complete, three Partial, three Missing).
- Simulated OCR text: 2/3 matched; one Complete suggestion was withheld for review.
- Overall: 11/12 exact matches, one abstention, zero transport or evidence-alignment errors.
- In the withheld Kandyan example, `1815` was replaced with `18l5` and `British` with `Britlsh`. The missing required year triggered evidence review.
- All quoted lexical/semantic evidence and concerns matched their Unicode source offsets.
- Requests took 7.9 to 64.9 seconds (median 25.45 seconds); process/model startup was a performance limitation in this run. See `history-preview-performance.md` for the subsequent persistent-worker improvement.
- No real handwriting or independent teacher-labelled examples were included.

Frozen model SHA256: `12ba94e87415adb0ceb851919a6e87bc5d36e8535f0539352b450bd104e368e8`.

Demo pack SHA256: `9774cf959a1c93155fb08a90dca04b737564c613c5c99ca1e58337c312d4d88c`.

Reproduce while the preview is running: `npx ts-node src/scripts/verify-history-demo-pack.ts`. Full raw results: `tmp/history-preview/demo-api-results.json`.
