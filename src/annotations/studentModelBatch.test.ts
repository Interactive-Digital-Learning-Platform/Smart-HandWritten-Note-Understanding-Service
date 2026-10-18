import test from 'node:test';
import assert from 'node:assert/strict';
import {collectStudentRows} from './studentModelBatch';
const secret='local-test-pseudonym-secret';
const catalogs={science:[{id:'sci-g10-cbl-007',name:'Benedict',points:[{id:'heat',text:'Heat sample in water bath.'}]}],
  history:[{id:'hist-g10-l03-c01',name:'Leadership',lessonId:'hist-g10-l03',points:[]}]};
const note=():any=>({_id:'private-note-id',userId:'private-uploader',status:'analyzed',pageCount:1,
  rawText:'Add Benedict solution to the food sample.\n\nHeat the sample in a hot water bath.\nA brick red precipitate indicates reducing sugar. email: a@school.lk',
  researchConsent:{status:'granted',version:'1',grantedAt:new Date()},analysis:{subject:'Science',lessonId:'sci-g10-cbl',
    lessonMatchConfidence:.9,contentLanguage:{primaryLanguage:'English',confidence:99},ocrConfidence:95,
    ocrPageSummary:{qualityState:'known',totalPages:1,extractedPages:1,failedPages:0},
    analyzedAt:new Date(),conceptFindings:[{conceptId:'sci-g10-cbl-007',status:'present',source:'semantic_llm',decisionConfidence:.8,evidence:'Add Benedict solution to the food sample.'}]}});
test('collects only AI source with explicit provenance, redacts identifiers and uses runtime spacing',()=>{
 const result=collectStudentRows([note()],catalogs,secret);assert.equal(result.rows.length,1);
 const row=result.rows[0];assert.equal(row.humanReviewed,false);assert.equal(row.labelSource,'ai_teacher');
 assert.ok(row.modelInputText.includes('sample.\nHeat'));assert.ok(row.text.includes('sample.\n\nHeat'));
 assert.ok(row.text.includes('[EMAIL]'));assert.ok(!JSON.stringify(row).includes('private-'));
});
test('consent missing, withdrawn or incomplete never exports',()=>{
 for(const consent of [{status:'not_provided'},{status:'withdrawn'},{status:'granted',version:'1'},
   {status:'granted',version:'1',grantedAt:new Date(),withdrawnAt:new Date()}]){
  const n=note();n.researchConsent=consent;assert.equal(collectStudentRows([n],catalogs,secret).rows.length,0);
 }
});
test('does not train on fallback, keywords, own model output, absent status or bad quotes',()=>{
 for(const patch of [{source:'fallback'},{source:'rule'},{source:'trained_model'},{status:undefined},{evidence:'invented quote'},{decisionConfidence:.69}]){
  const n=note();Object.assign(n.analysis.conceptFindings[0],patch);assert.equal(collectStudentRows([n],catalogs,secret).rows.length,0);
 }
});
test('rejects uncertain lesson, unsupported concepts and degraded OCR',()=>{
 const mutations=[(n:any)=>n.analysis.lessonMatchConfidence=.5,(n:any)=>n.analysis.ocrLowQualityWarning=true,
  (n:any)=>delete n.analysis.ocrPageSummary,(n:any)=>n.analysis.ocrPageSummary.failedPages=1,
  (n:any)=>n.pageCount=2,(n:any)=>n.analysis.contentLanguage.primaryLanguage='Mixed',
  (n:any)=>n.analysis.conceptFindings[0].conceptId='unknown'];
 for(const change of mutations){const n=note();change(n);assert.equal(collectStudentRows([n],catalogs,secret).rows.length,0);}
});
test('exact repeated content/concept is exported once even with different upload ids',()=>{
 const second=note();second._id='other-id';second.rawText=second.rawText.toUpperCase();second.analysis.conceptFindings[0].evidence='ADD BENEDICT SOLUTION TO THE FOOD SAMPLE.';
 const result=collectStudentRows([note(),second],catalogs,secret);assert.equal(result.rows.length,1);assert.equal(result.skipped.duplicate_text_concept,1);
});
test('missing labels need another grounded AI finding and cannot carry contradictory evidence',()=>{
 const n=note();n.analysis.conceptFindings.push({...n.analysis.conceptFindings[0],conceptId:'other',status:'missing',evidence:undefined});
 const cat={...catalogs,science:[...catalogs.science,{id:'other',name:'Other',points:[]}]};
 let rows=collectStudentRows([n],cat,secret).rows;assert.equal(rows[1].teacherLabel,'missing');
 n.analysis.conceptFindings[1].evidence='conflict';rows=collectStudentRows([n],cat,secret).rows;assert.equal(rows.length,1);
});
test('History uses exact concept and lesson identity',()=>{
 const n=note();n.analysis.subject='History';n.analysis.lessonId='wrong';n.analysis.conceptFindings[0].conceptId='hist-g10-l03-c01';
 assert.equal(collectStudentRows([n],catalogs,secret).rows.length,0);n.analysis.lessonId='hist-g10-l03';
 assert.equal(collectStudentRows([n],catalogs,secret).rows.length,1);
});
