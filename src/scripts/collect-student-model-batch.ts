import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import mongoose from 'mongoose';
import {config} from '../config/config';
import {Note} from '../models/Note';
import {collectStudentRows,digest,STUDENT_BATCH_SCHEMA,BatchConcept} from '../annotations/studentModelBatch';

const arg=(name:string)=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;};
async function main() {
  const root=path.resolve(__dirname,'../..'),output=path.resolve(arg('--output')||path.join(root,'data/annotations/student-model',new Date().toISOString().replace(/[:.]/g,'-')));
  if(fs.existsSync(output))throw Error('Choose a fresh output directory');
  const since=arg('--since');if(since&&!Number.isFinite(Date.parse(since)))throw Error('--since must be an ISO date');
  const minimum=Number(arg('--min-confidence')||'.7');
  const keyFile=path.join(root,'data/annotations/student-model/.pseudonym-key');
  fs.mkdirSync(path.dirname(keyFile),{recursive:true});
  if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});
  const secret=fs.readFileSync(keyFile,'utf8');
  const modelFiles={science:path.join(root,'models/english-coverage-v3.1.json'),history:path.join(root,'ml-training/outputs/history-coverage-v5.1-review-policy-2026-10-15/model.json')};
  const catalogs={} as Record<'science'|'history',BatchConcept[]>,modelHashes={} as Record<string,string>;
  for(const subject of ['science','history'] as const){const bytes=fs.readFileSync(modelFiles[subject],'utf8');catalogs[subject]=JSON.parse(bytes).rubrics.concepts;modelHashes[subject]=digest(bytes);}
  await mongoose.connect(config.mongodb.uri,{serverSelectionTimeoutMS:8000});
  // Existing upload consent and analysis are authoritative. No writes to student records.
  const notes=await Note.find({...since?{createdAt:{$gte:new Date(since)}}:{}})
    .select('_id userId status rawText researchConsent analysis pageCount').sort({_id:1}).lean();
  const batch=collectStudentRows(notes as any,catalogs,secret,minimum);
  const dataset={schemaVersion:STUDENT_BATCH_SCHEMA,createdAt:new Date().toISOString(),modelHashes,
    thresholds:{minimumTeacherConfidence:minimum,minimumOcrConfidence:70},
    labelMeaning:'AI lesson-coverage labels; model rubric agreement requires human review. Uploader is not necessarily student author.',...batch};
  const bytes=JSON.stringify(dataset,null,2)+'\n',datasetSha256=digest(bytes);
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'dataset.json'),bytes,{flag:'wx'});
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({schemaVersion:STUDENT_BATCH_SCHEMA,datasetSha256,rowCount:batch.rows.length,modelHashes},null,2)+'\n');
  const template=fs.readFileSync(path.join(root,'ml-training/review-student-model-template.html'),'utf8');
  fs.writeFileSync(path.join(output,'review.html'),template.replace('/*__BATCH__*/',JSON.stringify({datasetSha256,rows:batch.rows}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')));
  const counts:Record<string,number>={};for(const row of batch.rows){const k=row.subject+':'+row.teacherLabel;counts[k]=(counts[k]||0)+1;}
  console.log(JSON.stringify({output,rows:batch.rows.length,counts,skipped:batch.skipped,
    next:batch.rows.length?'Open review.html to confirm examples against the displayed model requirements, then export reviews.':'Upload English Science/History notes with research contribution selected, then run collection again.',
    liveModelChanged:false},null,2));
}
main().catch(()=>{console.error('Student model batch collection failed. Check database access, model files and CLI arguments; no student records were changed.');process.exitCode=1;}).finally(()=>mongoose.disconnect());
