import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import sharp from 'sharp';
import { AddressInfo } from 'net';
import { createHistoryPreview } from './preview-history-coverage';

test('preview validates scope, isolates requests, and cleans OCR temporary files', async () => {
  let calls = 0, ocrCalls = 0, temporaryFile = '', malformed = false;
  let finish: ((value: unknown) => void) | undefined;
  const app = await createHistoryPreview({
    predict: async () => { calls++; return new Promise(resolve => { finish = resolve; }); },
    ocr: async file => {
      ocrCalls++; temporaryFile = file;
      assert.ok((await fs.stat(file)).isFile());
      return {success: true, text: malformed ? 'Bad <deleted>markup' : 'Active fact. <deleted>Wrong fact.</deleted>'};
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: unknown, origin?: string) => fetch(base + '/api/predict', {method: 'POST', headers: {'Content-Type': 'application/json', ...(origin ? {Origin: origin} : {})}, body: JSON.stringify(body)});
  try {
    assert.equal((await fetch(base + '/')).status, 200);
    const catalog = await (await fetch(base + '/api/catalog')).json() as any;
    assert.equal(catalog.concepts.length, 94);
    const valid = {text: 'Some English note.', conceptId: catalog.concepts[0].id, scopeConfirmed: true};
    assert.equal((await post({...valid, scopeConfirmed: false})).status, 400);
    assert.equal((await post({...valid, conceptId: 'unregistered'})).status, 400);
    assert.equal((await post({...valid, text: 'x'.repeat(20001)})).status, 400);
    assert.equal((await post(valid, 'http://attacker.example')).status, 403);
    assert.equal(calls, 0);
    const pending = post(valid);
    while (!finish) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await post(valid)).status, 429);
    finish({previewOnly: true}); assert.equal((await pending).status, 200);
    const png = await sharp({create: {width: 30, height: 30, channels: 3, background: 'white'}}).png().toBuffer();
    async function upload(bytes: Uint8Array) {
      const form = new FormData(); form.append('image', new Blob([new Uint8Array(bytes)], {type: 'image/png'}), 'page.png');
      return fetch(base + '/api/ocr', {method: 'POST', body: form});
    }
    assert.equal((await upload(Buffer.from('fake image'))).status, 422);
    assert.equal(ocrCalls, 0);
    const response = await upload(png); assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.text, 'Active fact.'); assert.ok(body.transcription.includes('<deleted>'));
    await assert.rejects(fs.stat(temporaryFile));
    malformed = true; assert.equal((await upload(png)).status, 422);
    await assert.rejects(fs.stat(temporaryFile));
    assert.equal((await post({...valid, scopeConfirmed: false})).status, 400);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
