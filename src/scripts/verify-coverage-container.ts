import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {EnglishCoverageService} from '../services/englishCoverageService';
import {HistoryCoverageReviewService} from '../services/historyCoverageReviewService';

type Case = {id: string; subject: 'science' | 'history'; input: any; prediction: any};
const root = path.resolve(__dirname, '../..');
const file = path.join(root, 'packaging/coverage-verification.json');
let maxNumericDifference = 0;
function compare(actual: any, expected: any, at = ''): void {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number', at);
    const difference = Math.abs(actual - expected);
    maxNumericDifference = Math.max(maxNumericDifference, difference);
    // CPU libraries may differ in their final floating point digits across OSes.
    assert.ok(difference <= 1e-6 + 1e-5 * Math.abs(expected), `${at}: ${actual} differs from ${expected}`);
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), at);
    for (const key of Object.keys(expected)) compare(actual[key], expected[key], `${at}.${key}`);
  } else assert.equal(actual, expected, at);
}

async function main() {
  const science = new EnglishCoverageService();
  const history = new HistoryCoverageReviewService();
  try {
    assert.equal(science.catalog().concepts.length, 10);
    assert.equal(history.catalog().concepts.length, 94);
    let cases: Case[];
    const prepare = process.argv.includes('--prepare');
    const http = process.argv.includes('--http');
    assert.ok(!(prepare && http));
    const base = 'http://127.0.0.1:8004/api';
    if (http) {
      assert.equal((await fetch(base + '/health')).status, 200);
      const response = await fetch(base + '/history-coverage/concepts');
      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as any).data.concepts.length, 94);
    }
    if (prepare) {
      assert.ok(!process.env.COVERAGE_BUNDLE_DIR, 'Prepare baseline with the original Windows runtime');
      const fixture = JSON.parse(fs.readFileSync(path.join(root, '../Mobile-Application/assets/data/englishCoverageDemo.json'), 'utf8'));
      const previous = JSON.parse(fs.readFileSync(path.join(root, 'tmp/history-preview/demo-api-results.json'), 'utf8'));
      assert.equal(fixture.synthetic, true);
      assert.equal(previous.synthetic, true);
      cases = fixture.samples.map((s: any, i: number) => ({id: `science-${i + 1}`, subject: 'science', input: {
        noteText: s.noteText, conceptId: s.check.suggestions[0].conceptId, language: 'English', scopeConfirmed: true,
      }}));
      for (const sample of previous.results) cases.push({id: sample.id, subject: 'history', input: {
        text: sample.text, conceptId: sample.conceptId, language: 'English', scopeConfirmed: true,
      }, prediction: sample.prediction});
    } else cases = JSON.parse(fs.readFileSync(file, 'utf8')).cases;
    if (http) cases = cases.filter(sample => sample.subject === 'history');
    const results = [];
    for (const sample of cases) {
      const start = performance.now();
      let prediction: any;
      if (http) {
        const response = await fetch(base + '/history-coverage/suggestions', {method: 'POST',
          headers: {'Content-Type': 'application/json'}, body: JSON.stringify(sample.input), signal: AbortSignal.timeout(100000)});
        assert.equal(response.status, 200, sample.id);
        const result = ((await response.json()) as any).data;
        assert.equal(result.mode, 'manual_review');
        assert.equal(result.experimental, true);
        assert.equal(result.reviewRequired, true);
        assert.equal(result.analyzedText, sample.input.text);
        assert.equal(result.concept.id, sample.input.conceptId);
        assert.equal(result.offsetUnit, 'unicode_code_points');
        prediction = result.prediction;
      } else prediction = sample.subject === 'science'
          ? await science.predict(science.validate(sample.input))
          : (await history.predict(history.validate(sample.input))).prediction;
      if (sample.prediction) compare(prediction, sample.prediction, sample.id);
      if (prepare) sample.prediction = prediction;
      results.push({id: sample.id, subject: sample.subject, suggestedStatus: prediction.suggestedStatus,
        withheld: prediction.completeSuggestionWithheld, milliseconds: Math.round(performance.now() - start)});
    }
    assert.equal(cases.length, http ? 12 : 15);
    if (prepare) {
      fs.mkdirSync(path.dirname(file), {recursive: true});
      fs.writeFileSync(file, JSON.stringify({synthetic: true, independentAccuracyEvaluation: false,
        purpose: 'Cross-platform prediction regression, not an accuracy estimate',
        numericTolerance: {absolute: 1e-6, relative: 1e-5},
        scienceSha256: science.catalog().modelSha256, historySha256: history.catalog().modelSha256, cases}, null, 2) + '\n');
    }
    console.log(JSON.stringify({passed: results.length, mode: http ? 'full_backend_http' : 'offline_service_bridges', platform: process.platform,
      bundleMode: Boolean(process.env.COVERAGE_BUNDLE_DIR), maxNumericDifference, results}, null, 2));
  } finally {history.dispose();}
}
main().catch(error => {console.error(error); process.exitCode = 1;});
