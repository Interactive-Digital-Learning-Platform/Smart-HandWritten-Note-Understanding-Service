/** Synthetic printed-image plumbing check; not handwriting accuracy evidence. */
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import assert from 'node:assert/strict';

async function main() {
  const output = path.resolve(__dirname, '../../tmp/history-preview');
  await fs.mkdir(output, {recursive: true});
  const svg = `<svg width="1600" height="1000" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" font-size="32" fill="black"><text x="70" y="110">British strategic interests in Sri Lanka</text><text x="70" y="200">Sri Lanka was valuable to Britain for its location</text><text x="70" y="250">along Indian Ocean sea routes.</text><text x="70" y="340">The port of Trincomalee was strategically important</text><text x="70" y="390">for naval security near India.</text></g></svg>`;
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  await fs.writeFile(path.join(output, 'synthetic-printed-page.png'), image);
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(image)], {type: 'image/png'}), 'synthetic-printed-page.png');
  const response = await fetch('http://127.0.0.1:8884/api/ocr', {method: 'POST', body: form});
  const ocr = await response.json() as any;
  assert.equal(response.status, 200, ocr.error);
  assert.match(ocr.text, /Trincomalee/i);
  assert.match(ocr.text, /Indian Ocean/i);
  const predictionResponse = await fetch('http://127.0.0.1:8884/api/predict', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text: ocr.text, conceptId: 'hist-g11-l02-c01', scopeConfirmed: true})});
  const prediction = await predictionResponse.json() as any;
  assert.equal(predictionResponse.status, 200, prediction.error);
  assert.equal(prediction.suggestedStatus, 'present');
  const report = {fixture: 'Synthetic printed image, not handwriting', ocr, prediction, provesHandwritingAccuracy: false, checkedAt: new Date().toISOString()};
  await fs.writeFile(path.join(output, 'image-smoke-check.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ocrSucceeded: true, suggestedStatus: prediction.suggestedStatus, reviewRequired: prediction.reviewRequired, report: path.join(output, 'image-smoke-check.json')}));
}
main().catch(() => {console.error('History image smoke check failed; inspect local preview/provider availability.'); process.exitCode = 1;});
