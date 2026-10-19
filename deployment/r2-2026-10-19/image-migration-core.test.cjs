const test=require('node:test');const assert=require('node:assert/strict');
const {filenameFor,planImageUpdate,sha}=require('./image-migration-core.cjs');
test('migration rejects traversal and unrelated URLs as local upload sources',()=>{
  assert.equal(filenameFor('/uploads/note-page.png'),'note-page.png');
  for(const input of ['/uploads/../.env','/uploads/sub/page.png','https://host/uploads/page.png','C:/private/.env','/uploads/..page.png'])assert.equal(filenameFor(input),undefined);
});
test('migration preserves page order, duplicate pages and missing-source references',()=>{
  const note={_id:'fixture',userId:'owner',status:'analyzed',imageUrl:'/uploads/a.png',imageUrls:['/uploads/a.png','/uploads/missing.png','/uploads/a.png']};
  const result=planImageUpdate(note,new Map([['/uploads/a.png','/uploads/r2-a.png']]));
  assert.equal(result.imageUrl,'/uploads/r2-a.png');assert.deepEqual(result.imageUrls,['/uploads/r2-a.png','/uploads/missing.png','/uploads/r2-a.png']);
  assert.deepEqual(result.filter.imageUrls,{$eq:note.imageUrls});assert.equal(result.filter.status,'analyzed');
  assert.equal('analysis' in result.set,false);assert.equal('rawText' in result.set,false);
});
test('byte-verified URL relocation preserves matching OCR provenance but never repairs stale provenance',()=>{
  const pages=['/uploads/old.png'];const note={imageUrl:pages[0],imageUrls:pages,analysis:{ocrPageSummary:{imagesSha256:sha(JSON.stringify(pages)),textSha256:'unchanged'}}};
  const mapping=new Map([[pages[0],'/uploads/r2-new.png']]);
  const valid=planImageUpdate(note,mapping);
  assert.equal(valid.set['analysis.ocrPageSummary.imagesSha256'],sha(JSON.stringify(['/uploads/r2-new.png'])));
  assert.equal(valid.filter['analysis.ocrPageSummary.imagesSha256'],note.analysis.ocrPageSummary.imagesSha256);
  assert.equal('analysis.ocrPageSummary.textSha256' in valid.set,false);
  const stale=planImageUpdate({...note,analysis:{ocrPageSummary:{imagesSha256:'stale'}}},mapping);
  assert.equal('analysis.ocrPageSummary.imagesSha256' in stale.set,false);
});
test('single-page legacy records keep their missing imageUrls field',()=>{
  const result=planImageUpdate({_id:'fixture',imageUrl:'/uploads/old.png'},new Map([['/uploads/old.png','/uploads/r2-new.png']]));
  assert.deepEqual(result.filter.imageUrls,{$exists:false});assert.equal('imageUrls' in result.set,false);
});
