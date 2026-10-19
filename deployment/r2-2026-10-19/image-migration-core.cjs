const {createHash}=require('node:crypto');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function filenameFor(url){
  if(typeof url!=='string'||!/^\/uploads\/[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(url))return undefined;
  const filename=url.slice('/uploads/'.length);
  return filename.includes('..')?undefined:filename;
}
function planImageUpdate(note,mapping){
  const imageUrl=mapping.get(note.imageUrl)||note.imageUrl;
  const imageUrls=Array.isArray(note.imageUrls)?note.imageUrls.map(url=>mapping.get(url)||url):undefined;
  const oldPages=note.imageUrls?.length?note.imageUrls:[note.imageUrl];
  const newPages=imageUrls?.length?imageUrls:[imageUrl];
  const filter={_id:note._id,userId:note.userId,status:note.status,imageUrl:note.imageUrl,
    imageUrls:Array.isArray(note.imageUrls)?{$eq:note.imageUrls}:{$exists:false},
    updatedAt:note.updatedAt??{$exists:false}};
  const set={imageUrl,...(imageUrls?{imageUrls}:{})};
  const oldHash=note.analysis?.ocrPageSummary?.imagesSha256;
  // This mapping is used only after verifying every copied image byte-for-byte.
  // Do not turn an already-stale OCR cache into a trusted cache.
  if(oldHash&&oldHash===sha(JSON.stringify(oldPages))){
    filter['analysis.ocrPageSummary.imagesSha256']=oldHash;
    set['analysis.ocrPageSummary.imagesSha256']=sha(JSON.stringify(newPages));
  }
  return {filter,set,imageUrl,imageUrls,oldHash};
}
module.exports={filenameFor,planImageUpdate,sha};
