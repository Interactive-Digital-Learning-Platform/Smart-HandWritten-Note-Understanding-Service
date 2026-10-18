import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {EnglishCoverageService} from '../services/englishCoverageService';
/** Update numeric golden values only after preserving the previous Science labels.
 * History cases remain byte-for-byte equivalent JSON values with their frozen model. */
async function main(){
 const file=path.resolve(__dirname,'../../packaging/coverage-verification.json');
 const pack=JSON.parse(fs.readFileSync(file,'utf8')),service=new EnglishCoverageService();let count=0;
 for(const sample of pack.cases){
  if(sample.subject!=='science')continue;
  const prediction=await service.predict(service.validate(sample.input));
  assert.equal(prediction.suggestedStatus,sample.prediction.suggestedStatus,sample.id);
  assert.equal(prediction.completeSuggestionWithheld,sample.prediction.completeSuggestionWithheld,sample.id);
  sample.prediction=prediction;count++;
 }
 assert.equal(count,3);pack.scienceSha256=service.catalog().modelSha256;
 fs.writeFileSync(file,JSON.stringify(pack,null,2)+'\n');
 console.log(JSON.stringify({updatedScienceCases:count,scienceModel:service.catalog().modelVersion,historyCasesUnchanged:true}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
