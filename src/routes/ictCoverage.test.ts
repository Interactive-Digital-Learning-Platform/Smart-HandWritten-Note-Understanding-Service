import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'fs';
import path from 'path';
import {AddressInfo} from 'net';
import {createICTCoverageRouter} from './ictCoverage';
import {ICTCoverageReviewService, ICT_MODEL_SHA} from '../services/ictCoverageReviewService';
import {AppError} from '../middleware/errorHandler';

test('ICT API validates scope, preserves withheld/Unicode evidence, isolates verified sources and recovers safely', async () => {
  const decisions = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../ml-training/outputs/ict-coverage-v3.1-2026-10-15/decisions.json'), 'utf8'));
  let calls = 0, fail = false, pending = false, corrupt = false, sourceRequest: any;
  let finish: (() => void) | undefined;
  const service: ICTCoverageReviewService = new ICTCoverageReviewService(async input => {
    calls++;
    if (fail) throw new Error('private internal details');
    if (pending) await new Promise<void>(resolve => {finish = resolve;});
    const row = decisions.find((r: any) => r.conceptId === input.conceptId && r.text === input.text.replace(/^📖 /, ''));
    const result = structuredClone(row.prediction);
    if (input.text.startsWith('📖 ')) {
      for (const p of result.evidence.points) for (const key of ['start', 'end', 'semanticStart', 'semanticEnd']) p[key] += 2;
      for (const c of result.evidence.concerns) {c.start += 2; c.end += 2;}
    }
    return {...result, modelSha256: corrupt ? '0'.repeat(64) : ICT_MODEL_SHA, previewOnly: true};
  }, async (_url, init) => {
    sourceRequest = JSON.parse(String(init?.body));
    const source = service.catalog().concepts[0].textbook;
    return new Response(JSON.stringify({result: {points: [
      {payload: {job_id: 'fc0e19ef-0642-4911-88ef-39efe2299775', filename: source.filename, pages: [53], text: 'Corrupted old source'}},
      {payload: {job_id: source.jobId, filename: source.filename, pages: [53], text: 'Verified CPU reference'}},
    ]}}), {status: 200});
  });
  const app = express(); app.use(express.json());
  app.use('/off', createICTCoverageRouter({enabled: false, service}));
  app.use('/ict', createICTCoverageRouter({enabled: true, service}));
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error instanceof AppError ? error.statusCode : 500).json({success: false, error: error.message}));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (input: unknown) => fetch(url + '/ict/suggestions', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input)});
  const row = decisions.find((r: any) => r.conceptId === 'ict-g10-u02-cpu' && r.prediction.suggestedStatus === 'present');
  const valid = {text: row.text, conceptId: row.conceptId, scopeConfirmed: true, language: 'English'};
  try {
    assert.equal((await fetch(url + '/off/concepts')).status, 503);
    const catalog = await fetch(url + '/ict/concepts');
    assert.equal(catalog.headers.get('cache-control'), 'no-store');
    assert.equal(((await catalog.json()) as any).data.concepts.length, 10);
    for (const bad of [{...valid, scopeConfirmed: false}, {...valid, language: 'Sinhala'}, {...valid, text: 'සිංහල'},
      {...valid, conceptId: 'unknown'}, {...valid, text: 'x'.repeat(20001)}, {...valid, text: '<deleted>unfinished'},
      {...valid, text: '<deleted>all deleted</deleted>'}]) assert.equal((await post(bad)).status, 400);
    assert.equal(calls, 0);
    const response = await post({...valid, text: '📖 ' + row.text + '<deleted>old</deleted>'});
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as any).data.analyzedText, '📖 ' + row.text);
    const conflict = decisions.find((r: any) => r.prediction.suggestionWithheld && r.prediction.rawModelStatus === 'partial');
    assert.ok(conflict, 'Exercise withholding of a raw Partial result');
    const withheld = (await (await post({...valid, conceptId: conflict.conceptId, text: conflict.text})).json() as any).data.prediction;
    assert.equal(withheld.suggestedStatus, null); assert.equal(withheld.completeSuggestionWithheld, false);
    const reference = (await (await fetch(url + '/ict/concepts/ict-g10-u02-cpu/reference')).json() as any).data;
    assert.deepEqual(sourceRequest.filter.must[0], {key: 'job_id', match: {value: '3fa953c7-3d14-4612-9bed-b3887cf1a624'}});
    assert.equal(reference.passages.length, 1); assert.equal(reference.passages[0].text, 'Verified CPU reference');
    pending = true; const running = post(valid);
    while (!finish) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await post(valid)).status, 429); finish(); assert.equal((await running).status, 200);
    pending = false; fail = true;
    const unavailable = await post(valid); assert.equal(unavailable.status, 503);
    assert.ok(!JSON.stringify(await unavailable.json()).includes('private'));
    fail = false; corrupt = true; assert.equal((await post(valid)).status, 503);
    corrupt = false; assert.equal((await post(valid)).status, 200);
  } finally {service.dispose(); await new Promise<void>(resolve => server.close(() => resolve()));}
});
