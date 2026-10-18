import {randomUUID} from 'node:crypto';
import {Note,INote} from '../models/Note';
export const PROCESSING_LEASE_MS=90000;
export const PROCESSING_LIMIT_MS=15*60*1000;
export function processingIsExpired(note:Pick<INote,'status'|'processingLeaseExpiresAt'|'processingProgress'|'updatedAt'>,now=Date.now()) {
  if(note.status!=='processing')return false;
  const started=new Date(note.processingProgress?.startedAt??note.updatedAt).getTime();
  if(Number.isFinite(started)&&now-started>PROCESSING_LIMIT_MS)return true;
  if(note.processingLeaseExpiresAt)return new Date(note.processingLeaseExpiresAt).getTime()<=now;
  return now-new Date(note.processingProgress?.updatedAt??note.updatedAt).getTime()>PROCESSING_LIMIT_MS;
}
/** Compare the observed lease/token so expiry cannot cancel a newer attempt. */
export async function expireProcessingNote(note:INote) {
  if(!processingIsExpired(note))return false;
  const patch={updatedAt:new Date(),status:note.analysis?'analyzed' as const:'failed' as const,
    errorMessage:note.analysis?'Analysis was interrupted. Your earlier results were kept. Try analyzing again.':'Analysis was interrupted. Please try again.'};
  const changed=await Note.updateOne({_id:note._id,status:'processing',updatedAt:note.updatedAt,
    processingRunId:note.processingRunId??{$exists:false}},{$set:patch,$unset:{processingProgress:1,processingRunId:1,processingLeaseExpiresAt:1}},{timestamps:false});
  if(changed.modifiedCount){Object.assign(note,patch);note.processingProgress=undefined;note.processingRunId=undefined;note.processingLeaseExpiresAt=undefined;return true;}
  return false;
}
export function processingLeaseFilter(noteId:string,token:string) {
  return {_id:noteId,status:'processing' as const,processingRunId:token,processingLeaseExpiresAt:{$gt:new Date()},
    'processingProgress.startedAt':{$gte:new Date(Date.now()-PROCESSING_LIMIT_MS).toISOString()}};
}
export async function claimProcessing(note:INote) {
  const token=randomUUID();
  const progress={stage:'queued' as const,completedStages:[],totalPages:note.pageCount||1,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const changed=await Note.updateOne({_id:note._id,status:{$ne:'processing'},updatedAt:note.updatedAt},
    {$set:{status:'processing',processingRunId:token,processingLeaseExpiresAt:new Date(Date.now()+PROCESSING_LEASE_MS),processingProgress:progress},$unset:{errorMessage:1}});
  if(!changed.modifiedCount)return null;
  note.status='processing';note.processingProgress=progress;note.processingRunId=token;note.errorMessage=undefined;
  return token;
}
