/** Prepare reviewed OCR examples locally; never call a provider or label from predictions. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {activeOcrText}=require('../dist/services/ocrText');
const {scienceModelText}=require('../dist/services/scienceModelText');
const root=path.resolve(__dirname,'..');
const source=path.resolve(process.argv[2]||path.join(root,'tmp/science-new-notes-eval-2026-10-19'));
const output=path.resolve(process.argv[3]||path.join(__dirname,'outputs/science-v35-new-notes-2026-10-19/notes.json'));
const hashes={};
const hash=raw=>crypto.createHash('sha256').update(raw).digest('hex');
function read(p){const raw=fs.readFileSync(p);hashes[path.relative(root,p).replaceAll('\\','/')]=hash(raw);return JSON.parse(raw.toString('utf8'));}
const intake=read(path.join(source,'intake.json'));
const pages=read(path.join(source,'blind-page-reference.json'));
const notebooks=read(path.join(source,'notebook-reference.json'));
if(hash(fs.readFileSync(path.join(root,'models/english-coverage-v3.1.json')))!==intake.modelSha256)throw Error('Baseline changed since evaluation');
const rows=[];
function add(pack,text,label,variant,provenance){
 const conceptId=pack.supportedConcepts[0];
 if(!['present','partial','missing'].includes(label))throw Error('Invalid reviewed label');
 rows.push({id:pack.id+':'+variant,notebook:pack.id,sourceFamily:pack.id.includes('unit-01')?'generated-food-molecules-EF':'generated-atoms-E',conceptId,text:scienceModelText(activeOcrText(text),conceptId).text,label,variant,provenance,labelSource:'ai_assistant_visual_review',humanReviewed:false,synthetic:true,previouslyExposed:true});
}
for(const pack of intake.packs.filter(p=>p.supportedConcepts.length)){
 const texts=new Map();
 for(const image of pack.images){
  const raw=fs.readFileSync(path.join(source,pack.id,image.file));
  if(hash(raw)!==image.sha256)throw Error('Image changed');
  const result=read(path.join(source,pack.id,image.file+'.ocr.json'));
  if(result.sourceSha256!==image.sha256)throw Error('OCR image hash mismatch');
  if(result.success){if(result.textSha256!==hash(result.text))throw Error('OCR text hash mismatch');texts.set(image.file,result.text);}
 }
 const page=pages.cases.find(p=>p.pack===pack.id);
 if(!texts.has(page.page))throw Error('Reviewed target page lacks OCR');
 add(pack,texts.get(page.page),page.referenceCoverage,page.page,'blind-page-reference.json; '+page.referenceConfidence+' confidence');
 const notebook=notebooks.cases.find(p=>p.pack===pack.id);
 const omitted=pack.images.filter(i=>!texts.has(i.file)).map(i=>i.file);
 if(omitted.some(p=>pack.id!=='science-unit-01-student-e'||p!=='page_02.webp'))throw Error('Unreviewed incomplete notebook');
 const combined=[...texts].map(([file,text])=>`--- Page ${Number(file.match(/\d+/)[0])} ---\n${activeOcrText(text)}`).join('\n\n');
 add(pack,combined,notebook.referenceCoverage,omitted.length?'available-8-of-9':'whole',notebook.rationale);
 if(pack.id.includes('unit-01')){
  const file=pack.id.endsWith('-f')?'page_08.webp':'page_09.webp';
  add(pack,texts.get(file),'present',file,'Actual image visually checked before whole-notebook predictions; all Benedict rubric points supplied.');
 }
}
if(rows.length!==8)throw Error('Expected eight reviewed examples');
if(fs.existsSync(output))throw Error('Use a fresh output');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify({schemaVersion:'science-reviewed-ocr-update-v1',baseModelSha256:intake.modelSha256,sourceHashes:hashes,unseenHoldoutAvailable:false,rows},null,2)+'\n');
console.log(JSON.stringify({output,rows:rows.length,notebooks:3,sourceFamilies:2,humanReviewed:0,labels:rows.map(r=>r.label)}));
