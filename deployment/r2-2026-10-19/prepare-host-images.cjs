// Run on the Windows Notes workspace. Copies images referenced by the inventory;
// it never searches unrelated folders or removes any source file.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
async function main(){
  const destination=path.resolve('tmp/r2-migration/host-imports');
  const allowedRoot=path.resolve('../grade 10 lesson for testing/science');
  const inventory=JSON.parse(await fs.readFile('tmp/r2-migration/inventory.json','utf8'));
  const urls=[...new Set(inventory.notes.flatMap(note=>[note.imageUrl,...note.imageUrls||[]]).filter(url=>typeof url==='string'&&path.win32.isAbsolute(url)&&!url.startsWith('/')))];
  await fs.mkdir(destination,{recursive:true});const sources=[];
  for(const url of urls){
    const source=path.resolve(url);
    if(!source.startsWith(allowedRoot+path.sep))throw Error('Referenced host image is outside the approved Notes fixture source folder');
    const bytes=await fs.readFile(source);
    const metadata=await sharp(bytes).metadata();
    if(!metadata.width||!metadata.height)throw Error('A source is not a readable image');
    const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
    const ext=path.extname(source).toLowerCase();
    if(!/^\.(png|jpe?g|webp|heic|heif)$/.test(ext))throw Error('Unsupported host image extension');
    const filename=`host-${sha256}${ext}`;
    await fs.writeFile(path.join(destination,filename),bytes,{mode:0o600});
    sources.push({url,filename,sha256,bytes:bytes.length});
  }
  await fs.writeFile(path.join(destination,'source-map.json'),JSON.stringify(sources,null,2),{mode:0o600});
  console.log(JSON.stringify({copiedHostImages:sources.length,bytes:sources.reduce((total,s)=>total+s.bytes,0),originalsPreserved:true}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
