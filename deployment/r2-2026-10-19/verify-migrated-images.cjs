/** Read-only verification of migrated real Notes images. No OCR/AI calls.
 * Uses production image/note routers in an isolated loopback server with signed
 * test JWTs. It never changes the running server's Clerk trust configuration.
 */
const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
const mongoose=require('mongoose');const express=require('express');const sharp=require('sharp');
const {config}=require('/app/dist/config/config');const {Note}=require('/app/dist/models/Note');
const {noteImageStorage}=require('/app/dist/services/noteImageStorage');
const {createStudentAuth}=require('/app/dist/middleware/studentAuth');
const {createPrivateAssets}=require('/app/dist/routes/privateAssets');
const {errorHandler}=require('/app/dist/middleware/errorHandler');
const {filenameFor,sha}=require('./image-migration-core.cjs');
const directory=process.env.NOTES_IMAGE_MIGRATION_DIR||'/app/.cache/r2-image-migration';
let server;let base;let tokenFor;
const invalidSources=[];
const summary={passed:false,notesVerified:0,remoteImagesVerified:0,decodedImages:0,imageDecodingFailures:0,excludedInvalidSourceFiles:0,notesWithOnlyInvalidSourceFilesSkipped:0,bytesVerified:0,originalRecoveryCopiesVerified:0,
  authenticatedAppNotesVerified:0,authenticatedAppImagesVerified:0,legacyNonStudentOwnerNotesStorageVerified:0,
  matchingOcrFingerprintsVerified:0,crossUserAccessDenied:0,maxAppImageResponseMs:0,
  authMode:'production routers and verified isolated test JWTs; production Clerk configuration unchanged',
  groqInvoked:false,visualBrowserTested:false};

async function main(){
  await mongoose.connect(config.mongodb.uri,{serverSelectionTimeoutMS:15000});
  const events=(await fs.readFile(path.join(directory,'journal.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  const plans=new Map(),prepared=new Map(),committed=new Map(),excluded=new Set();
  for(const event of events){
    if(event.phase==='planned')plans.set(event.noteId,event);
    if(event.phase==='prepared')prepared.set(event.noteId,event);
    if(event.phase==='committed')committed.set(event.noteId,event);
    if(event.phase==='invalid_source_restored'){
      committed.set(event.noteId,event);for(const entry of event.restored)excluded.add(entry.newUrl);
    }
  }
  summary.excludedInvalidSourceFiles=excluded.size;
  const sourceMap=new Map(JSON.parse(await fs.readFile(path.join(directory,'host-imports/source-map.json'),'utf8')).map(source=>[source.url,source]));
  const {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT}=await import('jose');
  const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);Object.assign(jwk,{kid:'notes-r2-migration-check'});
  const tokens=new Map();
  tokenFor=async identity=>{
    if(!tokens.has(identity))tokens.set(identity,await new SignJWT({sid:'sess_notes_r2_migration',azp:'http://127.0.0.1:8082'})
      .setProtectedHeader({alg:'RS256',typ:'JWT',kid:jwk.kid}).setSubject(identity).setIssuer('https://notes-migration-test.invalid')
      .setIssuedAt().setNotBefore('0s').setExpirationTime('30m').sign(privateKey));
    return tokens.get(identity);
  };
  const auth=createStudentAuth({issuer:'https://notes-migration-test.invalid',authorizedParties:['http://127.0.0.1:8082']},createLocalJWKSet({keys:[jwk]}));
  const app=express();app.use('/uploads',auth,createPrivateAssets('uploads',config.uploads.uploadDir));app.use(errorHandler);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${server.address().port}`;
  for(const [noteId,commit] of committed){
    const note=await Note.findById(noteId).select('userId imageUrl imageUrls analysis.ocrPageSummary').lean();assert.ok(note,'Migrated note still exists');
    assert.equal(note.imageUrl,commit.newImageUrl);assert.deepEqual(note.imageUrls,commit.newImageUrls);
    const plan=plans.get(noteId),pairs=prepared.get(noteId).pairs.filter(pair=>!excluded.has(pair[1]));
    if(!pairs.length){summary.notesWithOnlyInvalidSourceFilesSkipped++;continue;}
    const oldPages=plan.oldImageUrls?.length?plan.oldImageUrls:[plan.oldImageUrl];
    const newPages=note.imageUrls?.length?note.imageUrls:[note.imageUrl];
    if(plan.oldOcrImagesSha256&&plan.oldOcrImagesSha256===sha(JSON.stringify(oldPages))){
      assert.equal(note.analysis.ocrPageSummary.imagesSha256,sha(JSON.stringify(newPages)));summary.matchingOcrFingerprintsVerified++;
    }else assert.equal(note.analysis?.ocrPageSummary?.imagesSha256,plan.oldOcrImagesSha256);
    const studentOwner=String(note.userId).startsWith('user_');let noteHasInvalidImage=false;
    for(const [oldUrl,newUrl] of pairs){
      const expected=plan.sources.find(source=>source.url===oldUrl);assert.ok(expected);
      const local=sourceMap.has(oldUrl)?path.join(directory,'host-imports',sourceMap.get(oldUrl).filename):path.join(config.uploads.uploadDir,filenameFor(oldUrl));
      assert.equal(sha(await fs.readFile(local)),expected.sha256,'Recovery copy retains original bytes');summary.originalRecoveryCopiesVerified++;
      const image=await noteImageStorage.read(path.basename(newUrl));
      assert.equal(sha(image),expected.sha256,'R2 object retains original bytes');
      summary.remoteImagesVerified++;summary.bytesVerified+=image.length;
      try{
        const metadata=await sharp(image).metadata();assert.ok(metadata.width>0&&metadata.height>0,'R2 bytes decode as an image');summary.decodedImages++;
      }catch{
        invalidSources.push({noteId,oldUrl,newUrl,sha256:expected.sha256,bytes:image.length});summary.imageDecodingFailures++;noteHasInvalidImage=true;continue;
      }
      // This is the exact authenticated /uploads/ route used by useNotesAsset.
      assert.match(newUrl,/^\/uploads\/[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
      if(studentOwner){
        const started=Date.now();
        const response=await fetch(base+newUrl,{headers:{Authorization:`Bearer ${await tokenFor(note.userId)}`},signal:AbortSignal.timeout(12000)});
        assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
        assert.match(response.headers.get('content-type')||'',/^image\//);
        assert.equal(sha(Buffer.from(await response.arrayBuffer())),expected.sha256);
        const elapsed=Date.now()-started;summary.maxAppImageResponseMs=Math.max(summary.maxAppImageResponseMs,elapsed);
        assert.ok(elapsed<10000,'Image must arrive within the Notes web asset timeout');summary.authenticatedAppImagesVerified++;
      }
    }
    if(studentOwner){
      const imageUrl=pairs[0][1];assert.equal((await fetch(base+imageUrl)).status,401);
      assert.equal((await fetch(base+imageUrl,{headers:{Authorization:`Bearer ${await tokenFor('user_r2_migration_other_student')}`}})).status,404);
      summary.crossUserAccessDenied++;if(!noteHasInvalidImage)summary.authenticatedAppNotesVerified++;
    }else summary.legacyNonStudentOwnerNotesStorageVerified++;
    summary.notesVerified++;console.log(JSON.stringify({event:'verification_progress',notes:summary.notesVerified,images:summary.remoteImagesVerified}));
  }
  summary.passed=summary.imageDecodingFailures===0;
  if(!summary.passed)process.exitCode=1;
}
main().catch(error=>{summary.failure=String(error.message).slice(0,300);console.error('Migrated image verification failed:',summary.failure);process.exitCode=1;}).finally(async()=>{
  await fs.writeFile(path.join(directory,'verification-summary.json'),JSON.stringify(summary,null,2),{mode:0o600});
  await fs.writeFile(path.join(directory,'invalid-sources.json'),JSON.stringify(invalidSources,null,2),{mode:0o600});
  console.log(JSON.stringify({event:'verification_complete',...summary}));
  if(server)await new Promise(resolve=>server.close(resolve));await mongoose.disconnect();
});
