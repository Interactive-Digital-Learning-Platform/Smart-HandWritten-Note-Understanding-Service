import fs from 'node:fs';
import path from 'node:path';
import {digest,STUDENT_BATCH_SCHEMA} from '../annotations/studentModelBatch';
// Usage: output-directory input-directory [input-directory ...]
const [outputArg,...inputs]=process.argv.slice(2);
if(!outputArg||!inputs.length)throw Error('Provide a fresh output directory and input directories');
const output=path.resolve(outputArg);if(fs.existsSync(output))throw Error('Output must be fresh');
const rows:any[]=[],ids=new Set<string>(),sources:any[]=[];let modelHashes:any;
for(const directory of inputs){
 const raw=fs.readFileSync(path.join(directory,'dataset.json'),'utf8'),dataset=JSON.parse(raw),manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
 if(dataset.schemaVersion!==STUDENT_BATCH_SCHEMA||dataset.synthetic!==true||manifest.datasetSha256!==digest(raw)||manifest.rowCount!==dataset.rows.length)throw Error('Input integrity failed');
 if(modelHashes&&JSON.stringify(modelHashes)!==JSON.stringify(dataset.modelHashes))throw Error('Different frozen models');modelHashes=dataset.modelHashes;
 for(const row of dataset.rows){if(ids.has(row.recordId))throw Error('Overlapping examples need adjudication');ids.add(row.recordId);rows.push(row);}
 sources.push({directory:path.resolve(directory),datasetSha256:digest(raw)});
}
const dataset={schemaVersion:STUDENT_BATCH_SCHEMA,synthetic:true,createdAt:new Date().toISOString(),modelHashes,sources,
 provenance:'Synthetic supplied Science transcripts with unconfirmed rubric-based AI proposals; no OCR accuracy claim.',rows};
const bytes=JSON.stringify(dataset,null,2)+'\n',datasetSha256=digest(bytes);
const held=new Set(['synthetic-v2:g10p1:chapter-1','synthetic-v2:g10p1:chapter-3','synthetic-v2:g10p2:chapter-19','synthetic-v2:g11p2:chapter-11']);
const defaultSplits=Object.fromEntries(rows.map(r=>[r.recordId,held.has(r.sourceFamilyId)?'holdout':'train']));
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'dataset.json'),bytes);
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({schemaVersion:STUDENT_BATCH_SCHEMA,datasetSha256,rowCount:rows.length,modelHashes},null,2));
fs.writeFileSync(path.join(output,'split-template.json'),JSON.stringify({schemaVersion:'notes-human-review-v1',datasetSha256,rows:rows.map(r=>({recordId:r.recordId,humanLabel:r.teacherLabel,confirmed:false,split:defaultSplits[r.recordId]}))},null,2));
const root=path.resolve(__dirname,'../..'),template=fs.readFileSync(path.join(root,'ml-training/review-student-model-template.html'),'utf8');
fs.writeFileSync(path.join(output,'review.html'),template.replace('/*__BATCH__*/',JSON.stringify({datasetSha256,rows,defaultSplits}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')));
const counts:Record<string,number>={};for(const row of rows)counts[row.teacherLabel]=(counts[row.teacherLabel]||0)+1;
console.log(JSON.stringify({rows:rows.length,classCounts:counts,concepts:new Set(rows.map(r=>r.conceptId)).size,
  wholeNotes:rows.filter(r=>r.variant==='whole').length,pageVariants:rows.filter(r=>r.variant!=='whole').length,
  heldoutProposals:rows.filter(r=>defaultSplits[r.recordId]==='holdout').length,humanLabelsConfirmed:false,liveModelChanged:false},null,2));
