/** Notes-only image migration. Default: inventory; --apply: copy and verify.
 * Run inside the Notes container with cwd=/app. Never removes original images.
 * Private recovery manifests belong on the persistent cache volume, not in Git.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const sharp = require('sharp');
const {config} = require('/app/dist/config/config');
const {Note} = require('/app/dist/models/Note');
const {isR2Image,noteImageStorage} = require('/app/dist/services/noteImageStorage');
const {processingIsExpired}=require('/app/dist/services/processingLease');
const {filenameFor,planImageUpdate,sha}=require('./image-migration-core.cjs');
const runDirectory = process.env.NOTES_IMAGE_MIGRATION_DIR || '/app/.cache/r2-image-migration';
const apply=process.argv.includes('--apply');
let sourceMap=new Map();

function sourceFor(url){
  if(sourceMap.has(url))return sourceMap.get(url);
  const filename=filenameFor(url);
  return filename&&!isR2Image(filename)?{path:path.join(config.uploads.uploadDir,filename)}:undefined;
}
async function appendJournal(record){
  const handle=await fs.open(path.join(runDirectory,'journal.jsonl'),'a',0o600);
  try{await handle.writeFile(JSON.stringify({time:new Date().toISOString(),...record})+'\n');await handle.sync();}
  finally{await handle.close();}
}

async function inventory() {
  const notes = await Note.find({}).select('_id userId imageUrl imageUrls status updatedAt processingLeaseExpiresAt processingProgress analysis.ocrPageSummary').lean();
  const report={notes:notes.length,localReferences:0,remoteReferences:0,unsupportedReferences:0,missingFiles:0,invalidFiles:0,uniqueLocalImages:0,totalLocalBytes:0,processingNotes:0,activeProcessingNotes:0,invalidOwnerIds:0};
  const files=new Map();
  for(const note of notes) {
    if(note.status==='processing')report.processingNotes++;
    if(note.status==='processing'&&!processingIsExpired(note))report.activeProcessingNotes++;
    if(!String(note.userId).startsWith('user_'))report.invalidOwnerIds++;
    for(const url of new Set([note.imageUrl,...(note.imageUrls||[])].filter(Boolean))) {
      const filename=filenameFor(url);
      if(filename&&isR2Image(filename)){report.remoteReferences++;continue;}
      const source=sourceFor(url);
      if(!source){report.unsupportedReferences++;continue;}
      report.localReferences++;
      if(files.has(url))continue;
      try{
        const bytes=await fs.readFile(source.path);
        if(source.sha256&&sha(bytes)!==source.sha256)throw Error('Imported image checksum mismatch');
        if(bytes.length>config.uploads.maxFileSizeMB*1024*1024)throw Error('A legacy source image exceeds the configured upload size limit');
        try{const meta=await sharp(bytes).metadata();if(!meta.width||!meta.height)throw Error('Invalid image');}
        catch{files.set(url,{url,filename:path.basename(source.path),available:false,reason:'invalid_image',bytes:bytes.length,sha256:sha(bytes)});report.invalidFiles++;continue;}
        files.set(url,{url,filename:path.basename(source.path),bytes:bytes.length,sha256:sha(bytes),available:true});
        report.totalLocalBytes+=bytes.length;
      }catch(error){
        if(error.code!=='ENOENT')throw error;
        files.set(url,{url,filename,available:false});report.missingFiles++;
      }
    }
  }
  report.uniqueLocalImages=files.size;
  return {report,notes,files:[...files.values()]};
}

async function migrate(snapshot){
  const available=new Map(snapshot.files.filter(file=>file.available).map(file=>[file.url,file]));
  const result={notesMigrated:0,imagesMigrated:0,bytesMigrated:0,ocrFingerprintsPreserved:0,notesWithoutAvailableLocalSources:0,activeProcessingNotesSkipped:0,conflicts:0,originalFilesPreserved:true};
  for(const note of snapshot.notes){
    if(note.status==='processing'&&!processingIsExpired(note)){result.activeProcessingNotesSkipped++;continue;}
    const oldUrls=[...new Set([note.imageUrl,...note.imageUrls||[]].filter(Boolean))];
    const candidates=oldUrls.filter(url=>available.has(url));
    if(!candidates.length){result.notesWithoutAvailableLocalSources++;continue;}
    // Prepare a per-note recovery record before making any external writes.
    await appendJournal({phase:'planned',noteId:String(note._id),userId:note.userId,oldImageUrl:note.imageUrl,oldImageUrls:note.imageUrls,
      oldOcrImagesSha256:note.analysis?.ocrPageSummary?.imagesSha256,sources:candidates.map(url=>available.get(url))});
    const stage=await fs.mkdtemp(path.join(runDirectory,'stage-'));
    let mapping,prepared;
    try{
      const files=[];
      for(let index=0;index<candidates.length;index++){
        const url=candidates[index],source=sourceFor(url);
        const target=path.join(stage,`page-${index}${path.extname(source.path).toLowerCase()}`);
        await fs.copyFile(source.path,target);files.push({path:target});
        if(sha(await fs.readFile(target))!==available.get(url).sha256)throw Error('Source changed during migration');
      }
      prepared=await noteImageStorage.withUploadedImages(files,async urls=>{
        for(let index=0;index<urls.length;index++){
          const bytes=await noteImageStorage.read(path.basename(urls[index]));
          if(sha(bytes)!==available.get(candidates[index]).sha256)throw Error('Remote image byte verification failed');
        }
        const pairs=candidates.map((url,index)=>[url,urls[index]]);
        await appendJournal({phase:'prepared',noteId:String(note._id),pairs});
        return urls;
      });
      mapping=new Map(candidates.map((url,index)=>[url,prepared[index]]));
    }finally{
      // These are copies in this run's staging directory, never original uploads.
      if(path.dirname(stage)!==path.resolve(runDirectory)||!path.basename(stage).startsWith('stage-'))throw Error('Unsafe staging cleanup path');
      await fs.rm(stage,{recursive:true,force:true});
    }
    const plan=planImageUpdate(note,mapping);
    // Keep the write outside withUploadedImages: an ambiguous DB acknowledgement
    // must not delete objects which a committed database update may reference.
    let changed;
    try{changed=await Note.collection.updateOne(plan.filter,{$set:plan.set});}
    catch(error){await appendJournal({phase:'database_outcome_uncertain',noteId:String(note._id),newImageUrl:plan.imageUrl,newImageUrls:plan.imageUrls});throw Error('Database update outcome uncertain; recovery copies and uploaded objects retained');}
    if(changed.matchedCount!==1){
      await appendJournal({phase:'conflict',noteId:String(note._id)});result.conflicts++;
      for(const url of prepared)await noteImageStorage.remove(url);
      continue;
    }
    await appendJournal({phase:'committed',noteId:String(note._id),newImageUrl:plan.imageUrl,newImageUrls:plan.imageUrls});
    result.notesMigrated++;result.imagesMigrated+=candidates.length;
    result.bytesMigrated+=candidates.reduce((total,url)=>total+available.get(url).bytes,0);
    if('analysis.ocrPageSummary.imagesSha256' in plan.set)result.ocrFingerprintsPreserved++;
    console.log(JSON.stringify({event:'migration_progress',notesMigrated:result.notesMigrated,imagesMigrated:result.imagesMigrated}));
  }
  await fs.writeFile(path.join(runDirectory,'apply-summary.json'),JSON.stringify(result,null,2),{mode:0o600});
  console.log(JSON.stringify({event:'migration_complete',...result}));
}

async function main() {
  if(config.noteImages.provider!=='r2')throw Error('R2 must be active before running this migration');
  await mongoose.connect(config.mongodb.uri,{serverSelectionTimeoutMS:15000});
  await fs.mkdir(runDirectory,{recursive:true,mode:0o700});
  const imports=path.join(runDirectory,'host-imports');
  try{
    const entries=JSON.parse(await fs.readFile(path.join(imports,'source-map.json'),'utf8'));
    sourceMap=new Map(entries.map(entry=>{
      if(path.basename(entry.filename)!==entry.filename||!/^host-[a-f0-9]{64}\.(png|jpe?g|webp|heic|heif)$/.test(entry.filename))throw Error('Invalid imported source filename');
      return [entry.url,{path:path.join(imports,entry.filename),sha256:entry.sha256}];
    }));
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const snapshot=await inventory();
  // Each apply invocation has its own immutable before-image inventory.
  const inventoryName=apply?`inventory-before-${Date.now()}.json`:'inventory.json';
  await fs.writeFile(path.join(runDirectory,inventoryName),JSON.stringify(snapshot,null,2),{mode:0o600});
  console.log(JSON.stringify({mode:apply?'apply':'inventory',...snapshot.report}));
  if(!apply)return;
  await migrate(snapshot);
}
main().catch(error=>{console.error('Notes image migration:',error.message);process.exitCode=1;}).finally(()=>mongoose.disconnect());
