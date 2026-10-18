import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ICTCoverageReviewService, ICT_MODEL_SHA} from '../services/ictCoverageReviewService';

const root = path.resolve(__dirname, '../..');
const fixtureFile = path.join(root, 'packaging/ict-verification.json');
let maxNumericDifference = 0;
function compare(actual: any, expected: any): void {
  if (typeof expected === 'number') {
    const difference = Math.abs(actual - expected); maxNumericDifference = Math.max(maxNumericDifference, difference);
    assert.ok(difference <= 1e-6 + 1e-5 * Math.abs(expected));
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
    for (const key of Object.keys(expected)) compare(actual[key], expected[key]);
  } else assert.equal(actual, expected);
}

async function main() {
  const prepare = process.argv.includes('--prepare');
  const http = process.argv.includes('--http');
  assert.ok(!(prepare && http));
  const service = new ICTCoverageReviewService();
  const base = process.env.ICT_VERIFY_URL || 'http://127.0.0.1:8004/api';
  const authHeaders: Record<string, string> = {};
  if (http) {
    assert.ok(process.env.NOTES_SESSION_TOKEN, 'HTTP verification requires a current NOTES_SESSION_TOKEN; offline bridge checks do not.');
    authHeaders.Authorization = `Bearer ${process.env.NOTES_SESSION_TOKEN}`;
  }
  try {
    let samples: any[];
    if (prepare) {
      assert.ok(!process.env.COVERAGE_BUNDLE_DIR);
      samples = JSON.parse(fs.readFileSync(path.join(root, '../Mobile-Application/assets/data/ictCoverageDemoExamples.json'), 'utf8')).samples;
    } else samples = JSON.parse(fs.readFileSync(fixtureFile, 'utf8')).samples;
    assert.equal(samples.length, 6);
    const responses = [], results = [];
    for (const sample of samples) {
      const input = {text: sample.text, conceptId: sample.conceptId, language: 'English' as const, scopeConfirmed: true as const};
      let result;
      const start = performance.now();
      if (http) {
        const response = await fetch(base + '/ict-coverage/suggestions', {method: 'POST', headers: {...authHeaders, 'Content-Type': 'application/json'},
          body: JSON.stringify(input), signal: AbortSignal.timeout(100000)});
        assert.equal(response.status, 200, sample.id);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        result = ((await response.json()) as any).data;
      } else result = await service.predict(service.validate(input));
      assert.equal(result.modelSha256, ICT_MODEL_SHA);
      assert.equal(result.analyzedText, sample.text);
      assert.equal(result.concept.id, sample.conceptId);
      assert.equal(result.prediction.suggestedStatus, sample.expectedStatus, sample.id);
      assert.equal(result.prediction.status, null); assert.equal(result.reviewRequired, true);
      if (sample.prediction) compare(result.prediction, sample.prediction);
      if (prepare) sample.prediction = result.prediction;
      responses.push({...sample, result});
      results.push({id: sample.id, suggestedStatus: result.prediction.suggestedStatus,
        rawModelStatus: result.prediction.rawModelStatus, milliseconds: Math.round(performance.now() - start)});
      console.log(JSON.stringify(results[results.length - 1]));
    }
    if (prepare) {
      const provenance = {synthetic: true, independentAccuracyEvaluation: false, modelSha256: ICT_MODEL_SHA};
      fs.writeFileSync(fixtureFile, JSON.stringify({...provenance, samples}, null, 2) + '\n');
      fs.writeFileSync(path.join(root, '../Mobile-Application/assets/data/ictCoverageDemoResponses.json'), JSON.stringify({...provenance, samples: responses}, null, 2) + '\n');
    }
    let references = 0;
    if (http) {
      const catalogResponse = await fetch(base + '/ict-coverage/concepts', {headers: authHeaders}); assert.equal(catalogResponse.status, 200);
      const catalog = ((await catalogResponse.json()) as any).data;
      assert.equal(catalog.concepts.length, 10);
      for (const concept of catalog.concepts) {
        const response = await fetch(`${base}/ict-coverage/concepts/${concept.id}/reference`, {headers: authHeaders});
        assert.equal(response.status, 200, concept.id);
        const ref = ((await response.json()) as any).data;
        assert.equal(ref.source.jobId, concept.textbook.jobId);
        assert.equal(ref.source.pdfSha256, concept.textbook.pdfSha256);
        assert.ok(ref.passages.length > 0);
        assert.ok(ref.passages.every((p: any) => p.text.trim() && p.pdfPages.some((n: number) => concept.textbook.pdfPages.includes(n))));
        references++;
      }
      for (const invalid of [{scopeConfirmed: false}, {language: 'Sinhala'}, {conceptId: 'not-a-concept'}]) {
        const response = await fetch(base + '/ict-coverage/suggestions', {method: 'POST', headers: {...authHeaders, 'Content-Type': 'application/json'},
          body: JSON.stringify({text: samples[0].text, conceptId: samples[0].conceptId, language: 'English', scopeConfirmed: true, ...invalid})});
        assert.equal(response.status, 400);
      }
    }
    console.log(JSON.stringify({passed: results.length, textbookReferences: references, modelSha256: ICT_MODEL_SHA,
      mode: http ? 'full_backend_http' : 'offline_service_bridge', bundleMode: Boolean(process.env.COVERAGE_BUNDLE_DIR), maxNumericDifference, results}, null, 2));
  } finally {service.dispose();}
}
main().catch(error => {console.error(error); process.exitCode = 1;});
