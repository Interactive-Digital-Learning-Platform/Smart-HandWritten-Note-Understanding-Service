/** Live Notes route integration test. Synthetic images only; real OCR/AI calls.
 * Run with cwd=/app inside the Notes container after copying this file there.
 * The temporary server uses production routers and signed test JWTs verified
 * by production middleware. It never alters the running server/auth config.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const sharp = require('sharp');
const mongoose = require('mongoose');
const fromDist = file => require(path.resolve('dist', file));
const {config} = fromDist('config/config');
const {loadCurriculum, getAllLessons} = fromDist('curriculum');
const {createStudentAuth} = fromDist('middleware/studentAuth');
const {errorHandler} = fromDist('middleware/errorHandler');
const {Note} = fromDist('models/Note');
const {LearningMaterial} = fromDist('models/LearningMaterial');
const {StudentProfile} = fromDist('models/StudentProfile');
const {curriculumDbService} = fromDist('services/curriculumDbService');
const {noteImageStorage,isR2Image} = fromDist('services/noteImageStorage');
const localOnly = process.env.NOTES_LOCAL_TEST === '1';
const providedText = process.env.NOTES_TEST_TEXT === '1';
const cardsOnly = process.env.NOTES_ANALYSIS_AND_CARDS_ONLY === '1';
const samples = [
  {subject:'Science', grade:10, topic:'Chemical Basis of Life', pages:[
    ['Science - Grade 10 - Chemical Basis of Life', 'Benedict test for reducing sugars',
     'Add Benedict solution to the food sample.', 'Heat the mixture in a hot water bath.',
     'A brick-red precipitate indicates reducing sugar.', 'A blue solution with no precipitate is a negative result.'],
    ['Science - Grade 10 - Chemical Basis of Life', 'Proteins are made of amino acids.',
     'Carbohydrates provide energy.', 'Glucose is a monosaccharide.',
     'These revision pages do not cover all the concepts in the lesson.']
  ]},
  {subject:'History', grade:10, topic:'Sources for Studying History', pages:[
    ['History - Grade 10 - Sources for Studying History',
     'Historical sources give evidence about the past.',
     'Literary sources include chronicles such as the Mahavamsa.',
     'Archaeological sources include inscriptions, coins and ruins.',
     'Inscriptions can show names of rulers, donations and economic activity.',
     'Compare different sources because one source may be biased or incomplete.']
  ]}
];
const report = {localOnly, providedSyntheticText:providedText, freshImageOCR:!localOnly&&!providedText, syntheticImages:true, handwritingAccuracyTested:false,
  imageStorageProvider:config.noteImages.provider,
  authMode:'isolated verified RS256 test JWT; production auth unchanged', collection:config.qdrant.collection,
  checks:[], notes:[], passed:false, cleanup:false};
const userId = `user_notes_v2_test_${crypto.randomUUID().replaceAll('-','')}`;
let server, base, tokenFor, historyModel;
const ids = [];
// Preserve this synthetic run's guide replies for diagnosing a failed final
// section without repeating all preceding provider calls. No auth headers.
if(!localOnly) {
  const {groqPool}=fromDist('services/groqPool');
  const original=groqPool.createChatCompletion.bind(groqPool);
  let reply=0;
  groqPool.createChatCompletion=async(...args)=>{
    const result=await original(...args);
    if(typeof args[0].messages?.[0]?.content==='string' && args[0].messages[0].content.includes('conceptId')) {
      fs.writeFileSync(`/tmp/notes-v2-guide-reply-${++reply}.json`,JSON.stringify({messages:args[0].messages,
        model:result.model,finish:result.choices[0]?.finish_reason,content:result.choices[0]?.message?.content}));
    }
    return result;
  };
}
async function request(route, options={}, identity=userId) {
  const headers = {...options.headers};
  if(identity) headers.Authorization = `Bearer ${await tokenFor(identity)}`;
  const response = await fetch(base+route, {...options, headers});
  return {status:response.status, body:await response.json()};
}
function success(response, status=200) {
  assert.equal(response.status,status,JSON.stringify(response.body));
  assert.equal(response.body.success,true,JSON.stringify(response.body));
  return response.body.data;
}
async function poll(route, done, timeoutMs) {
  const until=Date.now()+timeoutMs;
  let previous='';
  while(Date.now()<until) {
    const data=success(await request(route));
    const state=data.status ?? JSON.stringify(data.states?.map(s=>[s.type,s.status]));
    if(state!==previous) { console.log(JSON.stringify({event:'poll',route,state})); previous=state; }
    if(done(data)) return data;
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw Error(`Timed out polling ${route}`);
}
async function image(lines) {
  if(process.env.NOTES_FIXTURE_IMAGE_DIR) {
    const name=crypto.createHash('sha256').update(lines.join('\n')).digest('hex').slice(0,12)+'.png';
    return fs.readFileSync(path.join(process.env.NOTES_FIXTURE_IMAGE_DIR,name));
  }
  if(!localOnly) throw Error('Render the readable fixture PNGs first and set NOTES_FIXTURE_IMAGE_DIR.');
  const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1700" height="1000"><rect width="100%" height="100%" fill="white"/>${lines.map((line,i)=>`<text x="65" y="${100+i*110}" font-family="DejaVu Sans,sans-serif" font-size="31" fill="#111">${escape(line)}</text>`).join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
async function upload(sample) {
  const lesson=getAllLessons(sample.grade).find(l=>l.subject===sample.subject && l.lessonName.toLowerCase()===sample.topic.toLowerCase());
  assert.ok(lesson,`Missing test lesson ${sample.topic}`);
  const form=new FormData();
  form.set('title',`[LOCAL V2 SYNTHETIC TEST] ${sample.topic}`);
  form.set('subject',sample.subject); form.set('grade',String(sample.grade));
  form.set('topic',sample.topic); form.set('lessonId',lesson.lessonId);
  for(let i=0;i<sample.pages.length;i++) form.append('images',new Blob([await image(sample.pages[i])],{type:'image/png'}),`synthetic-${i+1}.png`);
  const start=Date.now();
  const uploaded=success(await request(providedText?'/api/notes/upload':'/api/notes/upload-and-process',{method:'POST',body:form}),providedText?201:202);
  ids.push(uploaded.noteId);
  if(providedText) {
    // Component test only: explicit synthetic text, never claimed as image OCR.
    const raw=sample.pages.map((lines,i)=>`${sample.pages.length>1?'--- Page '+(i+1)+' ---\n':''}${lines.join('\n')}`).join('\n\n');
    const {ocrIdentity}=fromDist('pipeline/ocrProvenance');
    await Note.updateOne({_id:uploaded.noteId,userId},{$set:{rawOcrText:raw,rawText:raw,
      'analysis.ocrPageSummary':{totalPages:sample.pages.length,extractedPages:sample.pages.length,failedPages:0,
        qualityState:'known',source:'provided_text',...ocrIdentity(raw,uploaded.imageUrls)}}});
    success(await request(`/api/notes/${uploaded.noteId}/process`,{method:'POST'}),202);
    uploaded.pollUrl=`/api/notes/${uploaded.noteId}`;
  }
  const row={subject:sample.subject,noteId:uploaded.noteId,uploadAcknowledgedMs:Date.now()-start,pages:sample.pages.length};
  report.notes.push(row);
  console.log(JSON.stringify({event:'uploaded',...row}));
  assert.equal((await request(uploaded.pollUrl,{},'user_notes_v2_other_test')).status,404);
  const note=await poll(uploaded.pollUrl,data=>data.status==='analyzed'||data.status==='failed',360000);
  assert.equal(note.status,'analyzed',note.errorMessage);
  assert.equal(note.pageCount,sample.pages.length);
  assert.ok(note.rawText?.length>50,'Fresh image OCR did not persist text');
  assert.equal(note.analysis?.ocrPageSummary?.source,providedText?'cached':'vision');
  assert.equal(note.analysis.ocrPageSummary.extractedPages,sample.pages.length);
  assert.ok((note.analysis.ocrConfidence??0)>=60,'OCR fixture readability failed');
  assert.match(note.rawText,sample.subject==='Science'?/Benedict/i:/Mahavamsa/i,'Expected fixture words were not transcribed');
  assert.equal(note.analysis.subject,sample.subject);
  assert.equal(note.analysis.lessonId,lesson.lessonId);
  assert.ok(note.analysis.textbookPassages?.length>0,'No local v2 textbook grounding');
  assert.ok(note.analysis.conceptFindings?.length>0);
  row.analysisSeconds=Math.round((Date.now()-start)/1000);
  row.ocrCharacters=note.rawText.length; row.lessonId=lesson.lessonId;
  row.textbookPassages=note.analysis.textbookPassages.length;
  row.findings=note.analysis.conceptFindings.map(f=>({name:f.conceptName,status:f.status,source:f.source,modelVersion:f.modelVersion}));
  row.modelCheck=note.analysis.englishCoverageCheck;
  if(sample.subject==='Science') assert.equal(row.modelCheck?.state,'ready','Trained Science model did not run');
  if(sample.subject==='History') {
    const catalog=success(await request('/api/history-coverage/concepts'));
    const concept=catalog.concepts.find(c=>c.grade===10 && /sources/i.test(c.name));
    assert.ok(concept,'History source concept unavailable');
    success(await request(`/api/history-coverage/notes/${uploaded.noteId}/check`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:note.rawText,conceptId:concept.id,scopeConfirmed:true,language:'English'})}),202);
    const checked=await poll(`/api/history-coverage/notes/${uploaded.noteId}/check`,data=>['ready','failed'].includes(data.state),120000);
    assert.equal(checked.state,'ready',checked.error);
    row.historyModel={concept:concept.name,modelSha256:checked.result.modelSha256,prediction:checked.result.prediction};
  }
  row.warnings=note.analysis.qualityWarnings;
  fs.writeFileSync(`/tmp/notes-v2-${sample.subject.toLowerCase()}-private.json`,JSON.stringify(note,null,2));
  return {row,lesson,note};
}
async function materials({row,lesson,note}, types) {
  const start=Date.now();
  success(await request(`/api/materials/${row.noteId}/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({types})}),202);
  const overview=await poll(`/api/materials/${row.noteId}`, data=>types.every(type=>['ready','failed'].includes(data.states.find(s=>s.type===type)?.status)),690000);
  row.materials=[];
  for(const type of types) {
    const state=overview.states.find(s=>s.type===type);
    assert.equal(state.status,'ready',`${type}: ${state.error}`);
    const material=success(await request(`/api/materials/${row.noteId}/${type}`));
    fs.writeFileSync(`/tmp/notes-v2-${row.subject.toLowerCase()}-${type}-private.json`,JSON.stringify(material,null,2));
    const result={type,status:state.status};
    if(type==='flashcards') {assert.ok(material.flashcards?.length>=5); result.cards=material.flashcards.length;}
    if(type==='structured_notes') {
      result.words=material.textContent.split(/\s+/).length;
      assert.ok(result.words>lesson.concepts.length*70,'Guide is too short for this checklist');
      for(const concept of lesson.concepts) assert.ok(material.textContent.includes(concept.name),`Guide missing ${concept.name}`);
      assert.match(material.textContent,/Partial in your upload|Missing from your upload/);
      for(let index=0;index<lesson.concepts.length;index++) {
        const concept=lesson.concepts[index];
        const status=note.analysis.conceptFindings.find(f=>f.conceptId===concept.id)?.status;
        const label={present:'Covered in your upload',partial:'Partial in your upload',missing:'Missing from your upload'}[status]??'Not checked in your upload';
        const heading=`## ${index+1}. ${concept.name}`;
        const start=material.textContent.indexOf(heading);
        assert.ok(start>=0,`Missing guide heading ${concept.name}`);
        const end=material.textContent.indexOf('\n## ',start+heading.length);
        assert.ok(material.textContent.includes(`**${concept.name}** — ${label}`),`Incorrect checklist coverage label for ${concept.name}`);
        assert.ok(material.textContent.slice(start,end<0?undefined:end).includes(`<!-- note-coverage:${status??'unchecked'} -->`),`Incorrect section coverage badge for ${concept.name}`);
      }
      result.concepts=lesson.concepts.length; result.visuals=material.visuals?.length ?? 0;
    }
    row.materials.push(result);
    fs.writeFileSync(`/tmp/notes-v2-${row.subject.toLowerCase()}-${type}-private.json`,JSON.stringify(material,null,2));
  }
  row.materialSeconds=Math.round((Date.now()-start)/1000);
}
async function main() {
  assert.equal(config.qdrant.collection,'pdf_knowledge_base_v2');
  assert.ok(['qdrant','127.0.0.1','localhost'].includes(new URL(config.qdrant.url).hostname),'Local KB only');
  if (!localOnly) assert.equal(process.env.NOTES_LIVE_TEST,'synthetic-images-and-textbook-excerpts','Explicit live test opt-in required');
  await mongoose.connect(config.mongodb.uri,{serverSelectionTimeoutMS:10000});
  await loadCurriculum();
  const {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT}=await import('jose');
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey); Object.assign(jwk,{kid:'notes-flow-test',alg:'RS256',use:'sig'});
  tokenFor=identity=>new SignJWT({sid:'sess_notes_v2_test',azp:'http://127.0.0.1:8082'}).setProtectedHeader({alg:'RS256',typ:'JWT',kid:jwk.kid}).setSubject(identity).setIssuer('https://notes-flow-test.invalid').setIssuedAt().setNotBefore('0s').setExpirationTime('30m').sign(privateKey);
  const auth=createStudentAuth({issuer:'https://notes-flow-test.invalid',authorizedParties:['http://127.0.0.1:8082']},createLocalJWKSet({keys:[jwk]}));
  const app=express(); app.use(express.json());
  app.use('/api/notes',auth,fromDist('routes/notes').default);
  app.use('/uploads',auth,fromDist('routes/privateAssets').createPrivateAssets('uploads',config.uploads.uploadDir));
  app.use('/api/materials',auth,fromDist('routes/materials').default);
  historyModel=new (fromDist('services/historyCoverageReviewService').HistoryCoverageReviewService)();
  app.use('/api/history-coverage',auth,fromDist('routes/historyCoverage').createHistoryCoverageRouter({enabled:true,service:historyModel}));
  app.use(errorHandler);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await request('/api/notes',{},null)).status,401);
  assert.equal((await request('/api/notes/upload-and-process',{method:'POST',body:new FormData()})).status,400);
  const invalid=new FormData(); invalid.append('images',new Blob(['test'],{type:'text/plain'}),'test.txt');
  assert.equal((await request('/api/notes/upload',{method:'POST',body:invalid})).status,400);
  report.checks.push('unauthenticated rejected','empty upload rejected','unsupported MIME rejected');
  if(localOnly) {
    // This branch never calls OCR/AI providers. It uses the configured image
    // storage provider, including R2 after separately authorized activation.
    const form=new FormData();form.set('title','[LOCAL V2 SYNTHETIC TEST] Upload storage');
    const fixtureBytes=await image(samples[0].pages[0]);
    form.append('images',new Blob([fixtureBytes],{type:'image/png'}),'synthetic.png');
    const uploaded=success(await request('/api/notes/upload',{method:'POST',body:form}),201);
    ids.push(uploaded.noteId);
    const note=success(await request(`/api/notes/${uploaded.noteId}`));
    assert.equal(note.status,'uploaded');assert.equal(note.rawText,'');assert.equal(note.pageCount,1);
    const filename=path.basename(note.imageUrl);
    if(config.noteImages.provider==='r2') {
      assert.ok(isR2Image(filename));
      assert.equal(fs.existsSync(path.join(config.uploads.uploadDir,filename)),false);
      assert.deepEqual(await noteImageStorage.read(filename),fixtureBytes);
      const objectUrl=`${config.noteImages.endpoint}/${config.noteImages.bucket}/notes/${filename}`;
      const anonymousObject=await fetch(objectUrl);
      // R2 returns 400 for missing authentication headers; MinIO returns 403.
      assert.ok([400,401,403].includes(anonymousObject.status),'Anonymous S3 API object access must be rejected');
      assert.notDeepEqual(Buffer.from(await anonymousObject.arrayBuffer()),fixtureBytes);
    } else {
      assert.ok(fs.existsSync(path.join(config.uploads.uploadDir,filename)));
    }
    const ownedImage=await fetch(base+note.imageUrl,{headers:{Authorization:`Bearer ${await tokenFor(userId)}`}});
    assert.equal(ownedImage.status,200);
    assert.equal(ownedImage.headers.get('cache-control'),'private, no-store');
    assert.deepEqual(Buffer.from(await ownedImage.arrayBuffer()),fixtureBytes);
    assert.equal((await fetch(base+note.imageUrl)).status,401);
    assert.equal((await fetch(base+note.imageUrl,{headers:{Authorization:`Bearer ${await tokenFor('user_notes_v2_other_test')}`}})).status,404);
    assert.equal((await request(`/api/notes/${uploaded.noteId}`,{},'user_notes_v2_other_test')).status,404);
    assert.equal((await request('/api/notes/not-an-id')).status,404);
    assert.equal((await request('/api/notes?userId=user_other')).status,403);
    assert.equal((await request(`/api/materials/${uploaded.noteId}/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({types:['flashcards']})})).status,409);
    assert.equal(success(await request(`/api/materials/${uploaded.noteId}`)).hasActiveJobs,false);
    const {runLessonIdentification}=fromDist('pipeline/stages/04-lessonIdentification');
    for(const sample of samples) {
      const lesson=getAllLessons(sample.grade).find(l=>l.subject===sample.subject && l.lessonName.toLowerCase()===sample.topic.toLowerCase());
      assert.ok(lesson,`Missing test lesson ${sample.topic}`);
      const ctx={userLessonId:lesson.lessonId,rawOcrText:sample.pages.flat().join('\n'),
        subjectDetection:{subject:sample.subject,grade:sample.grade,topicHint:sample.topic}};
      await runLessonIdentification(ctx);
      assert.equal(ctx.matchedLessonId,lesson.lessonId);
      assert.ok(ctx.textbookPassages?.length>0,`Selected ${sample.subject} lesson did not retrieve local v2 passages`);
      report.notes.push({subject:sample.subject,lessonId:lesson.lessonId,textbookPassages:ctx.textbookPassages.length,ocrTested:false});
    }
    report.checks.push('multipart image stored','uploaded note polling','cross-user and malformed IDs rejected','materials before analysis rejected','no active jobs for uploaded note');
    report.checks.push('owner private image byte comparison','anonymous and cross-user image access denied');
    if(config.noteImages.provider==='r2')report.checks.push('real Cloudflare object byte comparison','no permanent local R2 image copy','anonymous S3 API read denied');
    report.checks.push('selected Science and History lessons retrieve actual local v2 passages');
    report.passed=true;return;
  }
  const failures=[];
  for(const sample of samples.filter(sample=>!process.env.NOTES_TEST_SUBJECT || sample.subject===process.env.NOTES_TEST_SUBJECT)) {
    try {
      const uploaded=await upload(sample);
      await materials(uploaded,sample.subject==='Science'&&!cardsOnly?['structured_notes','flashcards']:['flashcards']);
    } catch(error) { failures.push(`${sample.subject}: ${error.message}`); }
  }
  if(failures.length) throw Error(failures.join('; '));
  report.checks.push('multipart image upload',providedText?'provided synthetic text analysis':'fresh OCR','background analysis and polling','cross-user ownership','v2 textbook grounding','persisted concept findings','requested flashcards');
  if(!cardsOnly)report.checks.push('full Science lesson guide');
  report.passed=true;
}
main().catch(error=>{report.failure=String(error?.message??error).replace(/gsk_\w+/g,'[redacted]').slice(0,500);console.error(report.failure);process.exitCode=1;}).finally(async()=>{
  try {
    for(const id of ids) {
      const note=await Note.findOne({_id:id,userId});
      if(!note)continue;
      // Wait for the neutral auto-summary before exercising normal deletion.
      await poll(`/api/materials/${id}`,data=>!data.hasActiveJobs,180000);
      success(await request(`/api/notes/${id}`,{method:'DELETE'}));
      assert.equal(await Note.countDocuments({_id:id,userId}),0);
      assert.equal(await LearningMaterial.countDocuments({noteId:id}),0);
      for(const url of note.imageUrls) {
        const filename=path.basename(url);
        assert.equal(fs.existsSync(path.join(config.uploads.uploadDir,filename)),false);
        if(isR2Image(filename))await assert.rejects(noteImageStorage.read(filename),error=>error.statusCode===404);
      }
    }
    await StudentProfile.deleteMany({userId}); report.cleanup=true;
    if(report.passed)report.checks.push('test note and images deleted from configured storage');
  } catch(error) {report.cleanupError=String(error?.message??error).slice(0,300);process.exitCode=1;}
  fs.writeFileSync(localOnly?'/tmp/notes-v2-upload-local-report.json':'/tmp/notes-v2-upload-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({event:'result',...report}));
  if(server) await new Promise(resolve=>server.close(resolve));
  historyModel?.dispose();
  await curriculumDbService.closePool(); await mongoose.disconnect();
  process.exit(process.exitCode??0);
});
