/** Real note-service/gateway contract check using synthetic demo text only. */
import fs from 'fs/promises';
import path from 'path';
import assert from 'node:assert/strict';

async function main() {
  const root = path.resolve(__dirname, '../..');
  const direct = process.argv.includes('--direct');
  const docker = process.argv.includes('--docker');
  const base = direct ? 'http://127.0.0.1:8004/api' : 'http://127.0.0.1:8080/api/notes/api';
  const catalogResponse = await fetch(base + '/history-coverage/concepts');
  assert.equal(catalogResponse.status, 200);
  const gatewayServer = catalogResponse.headers.get('server');
  if (docker) {
    assert.match(gatewayServer || '', /nginx/i);
    assert.equal(catalogResponse.headers.get('x-local-gateway'), null);
  }
  const catalog = (await catalogResponse.json() as any).data;
  assert.equal(catalog.concepts.length, 94);
  const pack = JSON.parse(await fs.readFile(path.join(root, 'public/history-preview/demo-pack.json'), 'utf8'));
  const baseline = JSON.parse(await fs.readFile(path.join(root, 'tmp/history-preview/demo-api-results.json'), 'utf8'));
  const examples = JSON.parse(await fs.readFile(path.resolve(root, '../Mobile-Application/assets/data/historyCoverageDemoExamples.json'), 'utf8'));
  const results: {id: string; expectedLabel: string; result: any; elapsedSeconds: number}[] = [];
  for (const example of pack.examples) {
    const start = performance.now();
    const response = await fetch(base + '/history-coverage/suggestions', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text: example.text, conceptId: example.conceptId, language: 'English', scopeConfirmed: true}), signal: AbortSignal.timeout(100000)});
    assert.equal(response.status, 200, `HTTP failure for ${example.id}`);
    const result = (await response.json() as any).data;
    assert.equal(result.mode, 'manual_review'); assert.equal(result.experimental, true);
    assert.equal(result.concept.id, example.conceptId); assert.equal(result.analyzedText, example.text);
    const prior = baseline.results.find((row: any) => row.id === example.id);
    assert.deepEqual(result.prediction, prior.prediction, `Prediction changed for ${example.id}`);
    results.push({id: example.id, expectedLabel: example.expectedLabel, result, elapsedSeconds: Math.round(performance.now() - start) / 1000});
    console.log(JSON.stringify({id: example.id, suggestedStatus: result.prediction.suggestedStatus}));
  }
  const directory = path.join(root, 'tmp/history-mobile-integration');
  await fs.mkdir(directory, {recursive: true});
  await fs.writeFile(path.join(directory, direct ? 'direct-api-check.json' : docker ? 'gateway-api-check-docker.json' : 'gateway-api-check.json'), JSON.stringify({synthetic: true, independentAccuracyClaim: false, base, gatewayServer, dockerGateway: docker, checkedAt: new Date().toISOString(), modelSha256: catalog.modelSha256, allPredictionsUnchanged: true, results}, null, 2));
  const fixture = {synthetic: true, source: base, samples: examples.samples.map((sample: any) => ({...sample, result: results.find(r => r.id === sample.id)!.result}))};
  await fs.writeFile(path.resolve(root, '../Mobile-Application/assets/data/historyCoverageDemoResponses.json'), JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify({passed: results.length, allPredictionsUnchanged: true, mobileFixtures: fixture.samples.length}));
}
main().catch(error => {console.error(error instanceof Error ? error.message : 'Mobile History verification failed'); process.exitCode = 1;});
