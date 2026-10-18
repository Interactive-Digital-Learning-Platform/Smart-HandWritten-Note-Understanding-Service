/** Exercise the actual HTTP preview bridge on every synthetic demo input. */
import fs from 'fs/promises';
import path from 'path';
import assert from 'node:assert/strict';
import {createHash} from 'crypto';

const ROOT = path.resolve(__dirname, '../..');
const BASE = 'http://127.0.0.1:8884';

async function main() {
  const packBytes = await fs.readFile(path.join(ROOT, 'public/history-preview/demo-pack.json'));
  const pack = JSON.parse(packBytes.toString('utf8'));
  assert.equal(pack.examples.length, 12);
  const health = await fetch(BASE + '/api/health', {signal: AbortSignal.timeout(10000)});
  assert.equal(health.status, 200);
  const catalog = await (await fetch(BASE + '/api/catalog')).json() as any;
  const persistent = process.argv.includes('--persistent');
  if (persistent) assert.equal((await health.json() as any).inferenceRuntime, 'persistent-python-v1');
  const output = path.join(ROOT, `tmp/history-preview/demo-api-results${persistent ? '-persistent' : ''}.json`);
  const baseline = persistent ? JSON.parse(await fs.readFile(path.join(ROOT, 'tmp/history-preview/demo-api-results.json'), 'utf8')) : undefined;
  await fs.mkdir(path.dirname(output), {recursive: true});
  const rows: any[] = [];
  const report = {
    runStartedAt: new Date().toISOString(), endpoint: BASE + '/api/predict',
    modelSha256: catalog.modelSha256,
    demoPackSha256: createHash('sha256').update(packBytes).digest('hex'),
    synthetic: true, independentHumanReview: false, realHandwritingIncluded: false,
    expectedLabelAuthor: pack.expectedLabelAuthor,
    interpretation: 'Repeated demo agreement against AI expectations, not independent accuracy.',
    results: rows,
  };
  for (const example of pack.examples) {
    const start = performance.now();
    try {
      const response = await fetch(BASE + '/api/predict', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({text: example.text, conceptId: example.conceptId, scopeConfirmed: true}),
        signal: AbortSignal.timeout(100000),
      });
      assert.equal(response.status, 200, `HTTP failure for ${example.id}`);
      const prediction = await response.json() as any;
      assert.equal(prediction.modelSha256, catalog.modelSha256);
      assert.equal(prediction.previewOnly, true);
      assert.equal(prediction.reviewRequired, true);
      assert.equal(prediction.scoresCalibrated, false);
      const codepoints = [...example.text];
      const quote = (start: number, end: number) => codepoints.slice(start, end).join('');
      for (const point of prediction.evidence.points) {
        assert.equal(quote(point.start, point.end), point.candidateEvidence);
        assert.equal(quote(point.semanticStart, point.semanticEnd), point.semanticCandidateEvidence);
      }
      for (const concern of prediction.evidence.concerns) {
        assert.equal(quote(concern.start, concern.end), concern.quote);
      }
      if (baseline) {
        const previous = baseline.results.find((row: any) => row.id === example.id);
        assert.equal(previous.text, example.text);
        assert.equal(previous.conceptId, example.conceptId);
        assert.deepEqual(prediction, previous.prediction, `Prediction changed for ${example.id}`);
      }
      rows.push({...example, suggestedStatus: prediction.suggestedStatus,
        rawModelStatus: prediction.rawModelStatus, withheld: prediction.suggestionWithheld,
        matchesAIExpectation: prediction.suggestedStatus === example.expectedLabel,
        elapsedSeconds: Math.round(performance.now() - start) / 1000,
        evidenceAligned: true, ...(persistent ? {predictionUnchanged: true} : {}), prediction});
      console.log(JSON.stringify({id: example.id, expected: example.expectedLabel,
        actual: prediction.suggestedStatus, withheld: prediction.suggestionWithheld,
        seconds: rows[rows.length - 1].elapsedSeconds}));
    } catch (error) {
      rows.push({...example, transportOrValidationError: error instanceof Error ? error.message : 'Request failed', matchesAIExpectation: false});
      console.log(JSON.stringify({id: example.id, error: rows[rows.length - 1].transportOrValidationError}));
    }
    await fs.writeFile(output, JSON.stringify(report, null, 2));
  }
  const summary = Object.fromEntries(['synthetic_typed', 'simulated_ocr_text'].map(kind => {
    const subset = rows.filter(row => row.inputType === kind);
    return [kind, {total: subset.length, matched: subset.filter(r => r.matchesAIExpectation).length,
      withheld: subset.filter(r => r.withheld).length,
      errors: subset.filter(r => r.transportOrValidationError).length}];
  }));
  const additionalTimingProbes = [];
  if (persistent) {
    // Newly submitted paraphrases; timing probes only, not extra labelled accuracy cases.
    const texts = [
      'Britain saw value in the island because it lay on Indian Ocean shipping routes. The harbour at Trincomalee mattered for naval security in the waters around India.',
      'Written books and documents count as literary historical sources. Coins and surviving buildings are archaeological remains. These sources help us find evidence about the activities of people in the past.',
    ];
    for (const [i, text] of texts.entries()) {
      const start = performance.now();
      const response = await fetch(BASE + '/api/predict', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({text, conceptId: i === 0 ? 'hist-g11-l02-c01' : 'hist-g10-l01-c01', scopeConfirmed: true}),
        signal: AbortSignal.timeout(100000)});
      assert.equal(response.status, 200);
      const prediction = await response.json() as any;
      additionalTimingProbes.push({text, elapsedSeconds: Math.round(performance.now() - start) / 1000, prediction, labelledAccuracyCase: false});
    }
  }
  await fs.writeFile(output, JSON.stringify({...report, runCompletedAt: new Date().toISOString(), summary, additionalTimingProbes}, null, 2));
  console.log(JSON.stringify({summary, report: output}));
  if (rows.some(row => row.transportOrValidationError)) process.exitCode = 1;
}

main().catch(error => {console.error(error instanceof Error ? error.message : 'Demo verification failed'); process.exitCode = 1;});
