import test from 'node:test';
import assert from 'node:assert/strict';
import {HistoryPreviewWorker, HISTORY_PREVIEW_SHA} from './historyPreviewWorker';

const fixture = String.raw`
const readline = require('readline');
const hash = '${HISTORY_PREVIEW_SHA}';
process.stdout.write(JSON.stringify({type:'ready',modelSha256:hash})+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const {id,input}=JSON.parse(line);
 if(input.text==='crash') return process.exit(1);
 if(input.text==='hang') return;
 if(input.text==='malformed') return process.stdout.write('not-json\n');
 if(input.text==='oversize') return process.stdout.write('x'.repeat(1024*1024+1));
 if(input.text==='error') return process.stdout.write(JSON.stringify({id,error:'rejected'})+'\n');
 const result={modelSha256:hash,previewOnly:true,pid:process.pid,text:input.text};
 // Split multibyte output to check streaming UTF-8 decoding.
 const bytes=Buffer.from(JSON.stringify({id,result})+'\n');
 const point=bytes.indexOf(Buffer.from('📖'))+1;
 process.stdout.write(bytes.subarray(0,point));
 setImmediate(()=>process.stdout.write(bytes.subarray(point)));
});`;
const input = (text: string) => ({text, conceptId: 'hist-g11-l02-c01', scopeConfirmed: true as const});
const makeWorker = () => new HistoryPreviewWorker({command: process.execPath, args: ['-e', fixture], timeoutMs: 3000});

test('worker reuses process, preserves Unicode, and survives request rejection', async () => {
  const worker = makeWorker();
  try {
    const first = await worker.predict(input('📖 first')) as any;
    assert.equal(first.text, '📖 first');
    await assert.rejects(worker.predict(input('error')), /inference failed/);
    const second = await worker.predict(input('📖 second')) as any;
    assert.equal(second.pid, first.pid);
    assert.equal(second.text, '📖 second');
  } finally {worker.dispose();}
  await assert.rejects(worker.predict(input('closed')), /closed/);
});

for (const failure of ['crash', 'hang', 'malformed', 'oversize']) {
  test(`worker recovers after ${failure} and rejects overlapping requests`, async () => {
    const worker = makeWorker();
    try {
      const pending = worker.predict(input(failure));
      await assert.rejects(worker.predict(input('overlap')), /busy/);
      await assert.rejects(pending);
      assert.equal((await worker.predict(input('📖 recovered')) as any).text, '📖 recovered');
    } finally {worker.dispose();}
  });
}

test('disposing an active worker rejects its pending request', async () => {
  const worker = makeWorker();
  const pending = worker.predict(input('hang'));
  worker.dispose();
  await assert.rejects(pending, /closed/);
});

test('shared worker accepts only its configured ICT model identity', async () => {
  const sha = 'df42a138824f57fec3339ecb973f643cebf8899d7eaba902d5adfb40d4a3b74b';
  const ict = new HistoryPreviewWorker({command: process.execPath, args: ['-e', fixture.split(HISTORY_PREVIEW_SHA).join(sha)], modelSha256: sha, timeoutMs: 3000});
  const wrong = new HistoryPreviewWorker({command: process.execPath, args: ['-e', fixture], modelSha256: sha, timeoutMs: 3000});
  try {
    assert.equal((await ict.predict(input('📖 ICT')) as any).modelSha256, sha);
    await assert.rejects(wrong.predict(input('wrong model')));
  } finally {ict.dispose(); wrong.dispose();}
});
