// Restore only files proven to have been invalid before migration. Valid migrated
// images and original local data are untouched. Default: dry run.
const fs=require('node:fs/promises');const path=require('node:path');const sharp=require('sharp');
const assert=require('node:assert/strict');const mongoose=require('mongoose');
const {config}=require('/app/dist/config/config');const {Note}=require('/app/dist/models/Note');
const {noteImageStorage,isR2Image}=require('/app/dist/services/noteImageStorage');
const {filenameFor,planImageUpdate,sha}=require('./image-migration-core.cjs');
const directory=process.env.NOTES_IMAGE_MIGRATION_DIR||'/app/.cache/r2-image-migration';
async function journal(event){const file=await fs.open(path.join(directory,'journal.jsonl'),'a',0o600);try{await file.writeFile(JSON.stringify({time:new Date().toISOString(),...event})+'\n');await file.sync();}finally{await file.close();}}
async function main(){
  const invalid=JSON.parse(await fs.readFile(path.join(directory,'invalid-sources.json'),'utf8'));
  const groups=new Map();for(const entry of invalid){if(!groups.has(entry.noteId))groups.set(entry.noteId,[]);groups.get(entry.noteId).push(entry);}
  console.log(JSON.stringify({apply:process.argv.includes('--apply'),invalidFiles:invalid.length,notesAffected:groups.size}));
  if(!process.argv.includes('--apply'))return;
  await mongoose.connect(config.mongodb.uri,{serverSelectionTimeoutMS:15000});
  const imports=new Map(JSON.parse(await fs.readFile(path.join(directory,'host-imports/source-map.json'),'utf8')).map(entry=>[entry.url,entry]));
  let restored=0,removed=0;
  for(const [noteId,entries] of groups){
    const note=await Note.findById(noteId).select('userId status updatedAt imageUrl imageUrls analysis.ocrPageSummary').lean();assert.ok(note);
    const mapping=new Map();
    for(const entry of entries){
      assert.ok(isR2Image(path.basename(entry.newUrl)));
      const local=imports.has(entry.oldUrl)?path.join(directory,'host-imports',imports.get(entry.oldUrl).filename):path.join(config.uploads.uploadDir,filenameFor(entry.oldUrl));
      const original=await fs.readFile(local);assert.equal(sha(original),entry.sha256);
      let invalidOriginal=false;try{const meta=await sharp(original).metadata();invalidOriginal=!meta.width||!meta.height;}catch{invalidOriginal=true;}
      assert.ok(invalidOriginal,'Never restore a valid migrated image to an old reference');
      if([note.imageUrl,...note.imageUrls||[]].includes(entry.newUrl)){
        assert.equal(sha(await noteImageStorage.read(path.basename(entry.newUrl))),entry.sha256);
        mapping.set(entry.newUrl,entry.oldUrl);
      }
    }
    if(mapping.size){
      const plan=planImageUpdate(note,mapping);
      await journal({phase:'invalid_source_restore_planned',noteId,restored:entries});
      const changed=await Note.collection.updateOne(plan.filter,{$set:plan.set});assert.equal(changed.matchedCount,1,'Concurrent edit prevents restoration');
      await journal({phase:'invalid_source_restored',noteId,newImageUrl:plan.imageUrl,newImageUrls:plan.imageUrls,restored:entries});restored+=mapping.size;
    }
    for(const entry of entries){
      // Never delete an object if any current Notes record references it.
      if(!await Note.exists({$or:[{imageUrl:entry.newUrl},{imageUrls:entry.newUrl}]})){
        await noteImageStorage.remove(entry.newUrl);removed++;
      }
    }
  }
  const result={invalidSourceReferencesRestored:restored,unreferencedInvalidR2ObjectsRemoved:removed,originalFilesPreserved:true};
  await fs.writeFile(path.join(directory,'invalid-restore-summary.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
}
main().catch(error=>{console.error('Invalid source restoration failed:',error.message);process.exitCode=1;}).finally(()=>mongoose.disconnect());
