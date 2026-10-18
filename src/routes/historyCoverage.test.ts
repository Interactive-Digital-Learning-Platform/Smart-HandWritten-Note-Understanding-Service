import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {AddressInfo} from 'net';
import {createHistoryCoverageRouter} from './historyCoverage';
import {HistoryCoverageReviewService} from '../services/historyCoverageReviewService';
import {AppError} from '../middleware/errorHandler';

test('History review API validates scope, excludes deletions, isolates jobs and fails safely', async () => {
  let calls = 0, fail = false, pending = false;
  let finish: ((value: unknown) => void) | undefined;
  let received: any;
  const service = new HistoryCoverageReviewService(async input => {
    received = input; calls++;
    if (fail) throw new Error('private internal error');
    if (pending) return new Promise(resolve => {finish = resolve;});
    return {suggestedStatus: 'partial', reviewRequired: true};
  });
  const app = express(); app.use(express.json());
  app.use('/disabled', createHistoryCoverageRouter({enabled: false, service}));
  app.use('/history', createHistoryCoverageRouter({enabled: true, service}));
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error instanceof AppError ? error.statusCode : 500).json({success: false, error: error.message}));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (input: unknown) => fetch(url + '/history/suggestions', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input)});
  try {
    assert.equal((await fetch(url + '/disabled/concepts')).status, 503);
    const catalogResponse = await fetch(url + '/history/concepts');
    assert.equal(catalogResponse.headers.get('cache-control'), 'no-store');
    const catalog = await catalogResponse.json() as any;
    assert.equal(catalog.data.concepts.length, 94);
    const valid = {text: 'An English note.', conceptId: 'hist-g11-l02-c01', scopeConfirmed: true, language: 'English'};
    for (const bad of [{...valid, scopeConfirmed: false}, {...valid, language: 'Sinhala'}, {...valid, text: 'සිංහල'},
      {...valid, conceptId: 'unknown'}, {...valid, text: 'x'.repeat(20001)}, {...valid, text: '<deleted>unfinished'},
      {...valid, text: '<deleted>All deleted.</deleted>'}]) assert.equal((await post(bad)).status, 400);
    assert.equal(calls, 0);
    const response = await post({...valid, text: '📖 Active. <deleted>Wrong year.</deleted>'});
    assert.equal(response.status, 200);
    const result = (await response.json() as any).data;
    assert.equal(result.analyzedText, '📖 Active.'); assert.equal(received.text, result.analyzedText);
    assert.equal(result.experimental, true); assert.equal(result.mode, 'manual_review');
    assert.equal(result.concept.id, valid.conceptId); assert.match(result.textSha256, /^[a-f0-9]{64}$/);
    pending = true; const running = post(valid);
    while (!finish) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await post(valid)).status, 429);
    finish({suggestedStatus: null}); assert.equal((await running).status, 200);
    pending = false; fail = true;
    const unavailable = await post(valid); assert.equal(unavailable.status, 503);
    assert.ok(!JSON.stringify(await unavailable.json()).includes('private'));
    fail = false; assert.equal((await post(valid)).status, 200);
  } finally {service.dispose(); await new Promise<void>(resolve => server.close(() => resolve()));}
});
