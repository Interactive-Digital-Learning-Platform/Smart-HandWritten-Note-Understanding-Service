// Read-only local Notes verification; no database writes or provider requests.
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const directory=path.join(__dirname,'outputs/history-coverage-v6.2-paraphrases-2026-10-19');
const checks=JSON.parse(fs.readFileSync(path.join(directory,'partial-checks.json'),'utf8'));
const rows=checks.rows.map(({id,text,conceptId,expected})=>({id,text,conceptId,expected}));
const code=`const fs=require('fs'),assert=require('assert/strict');const {HistoryCoverageReviewService}=require('./dist/services/historyCoverageReviewService');
(async()=>{const input=JSON.parse(fs.readFileSync(0,'utf8')),s=new HistoryCoverageReviewService(),results=[];
try{assert.equal(s.catalog().modelSha256,input.sha);assert.equal(s.catalog().model,'History V6.2');
for(const row of input.rows){const r=await s.predict(s.validate({text:row.text,conceptId:row.conceptId,language:'English',scopeConfirmed:true}));assert.equal(r.prediction.rawModelStatus,row.expected,row.id);assert.equal(r.prediction.suggestedStatus,row.expected,row.id);results.push({id:row.id,raw:r.prediction.rawModelStatus,suggested:r.prediction.suggestedStatus});}
console.log(JSON.stringify({model:s.catalog().model,modelSha256:s.catalog().modelSha256,passed:results.length,results,noteRecordsWritten:0,externalCalls:0}));}finally{s.dispose();}})().catch(e=>{console.error(e.message);process.exitCode=1;});`;
const r=spawnSync('docker',['exec','-i','smart-handwritten-note-understanding-service-notes-coverage-1','node','-e',code],{input:JSON.stringify({sha:checks.modelSha256,rows}),encoding:'utf8',timeout:180000,windowsHide:true});
if(r.status!==0){console.error(r.stderr||r.error?.message);process.exit(1);}
const report=JSON.parse(r.stdout.trim().split(/\r?\n/).findLast(l=>l.startsWith('{')));
fs.writeFileSync(path.join(directory,'container-checks.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({model:report.model,passed:report.passed,externalCalls:0,noteRecordsWritten:0}));
