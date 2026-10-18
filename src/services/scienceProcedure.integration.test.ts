import test from 'node:test';
import assert from 'node:assert/strict';
import {EnglishCoverageService} from './englishCoverageService';
const model=new EnglishCoverageService();
const action='Add Benedict solution to the food sample.',heat='Heat the sample in a hot water bath.',result='A brick red precipitate indicates reducing sugar.';
async function predict(noteText:string){return model.predict({noteText,conceptId:'sci-g10-cbl-007',language:'English',scopeConfirmed:true});}
test('actual trained Science model recognizes the complete procedure despite OCR paragraph spacing',async()=>{
 const text='Science · Grade 10 · Chemical Basis of Life\n\nBenedict test for reducing sugar\n\n'+[action,heat,result].join('\n\n');
 const prediction=await predict(text);assert.equal(prediction.suggestedStatus,'present');assert.equal(prediction.inputFormatting,'benedict_procedure_spacing_v1');
 for(const p of prediction.evidence.points){assert.equal(p.lexicalCoverage,1);assert.equal(text.slice(p.start!,p.end!),p.candidateEvidence);}
});
test('actual classifier retains partial and missing outcomes without inventing required heating evidence',async()=>{
 assert.equal((await predict([action,result].join('\n\n'))).suggestedStatus,'partial');
 assert.equal((await predict('Living organisms contain carbon, hydrogen, oxygen and nitrogen.')).suggestedStatus,'missing');
 for(const text of [action+'\n\nIodine test:\n\n'+heat+'\n\n'+result,action+'\n\nDo not heat the sample in a hot water bath.\n\n'+result]){
  const prediction=await predict(text);assert.notEqual(prediction.suggestedStatus,'present');
 }
});
