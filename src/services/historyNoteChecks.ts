import {createHash, randomUUID} from 'node:crypto';
import {Note} from '../models/Note';
import {AppError} from '../middleware/errorHandler';
import {HistoryCoverageReviewService, HistoryReviewInput} from './historyCoverageReviewService';

export interface SavedHistoryCheck {
  jobId: string; state: 'running'|'ready'|'failed'; sourceRevision: string;
  input: HistoryReviewInput; expiresAt: Date; requestedAt: Date;
  result?: Awaited<ReturnType<HistoryCoverageReviewService['predict']>>;
  error?: string;
}
export interface HistoryCheckView {state:'not_requested'|'stale'|'running'|'ready'|'failed';input?:HistoryReviewInput;result?:SavedHistoryCheck['result'];error?:string}
export function historySourceRevision(note: any): string {
  return createHash('sha256').update(JSON.stringify([note.rawText ?? '',note.rawOcrText ?? '',
    note.userSubject,note.userGrade,note.userTopic,note.userLessonId,note.analysis?.subject,
    note.analysis?.lessonId,note.analysis?.analyzedAt ? new Date(note.analysis.analyzedAt).toISOString() : null])).digest('hex');
}
export const historyNoteStore = {
  load: (id: string,userId: string) => Note.findOne({_id:id,userId}),
  claim: async(id:string,userId:string,check:SavedHistoryCheck,updatedAt:Date) => (await Note.updateOne({_id:id,userId,updatedAt,status:'analyzed',
    $or:[{'historyCoverageCheck.state':{$ne:'running'}},{'historyCoverageCheck.expiresAt':{$lte:new Date()}},
      {'historyCoverageCheck.sourceRevision':{$ne:check.sourceRevision}}]},{$set:{historyCoverageCheck:check}})).modifiedCount>0,
  finish: async(id:string,userId:string,jobId:string,state:'ready'|'failed',patch:Partial<SavedHistoryCheck>) =>
    (await Note.updateOne({_id:id,userId,'historyCoverageCheck.jobId':jobId,'historyCoverageCheck.state':'running',
      ...(state==='ready'?{'historyCoverageCheck.expiresAt':{$gt:new Date()}}:{})},
    {$set:{'historyCoverageCheck.state':state,...Object.fromEntries(Object.entries(patch).map(([key,value])=>['historyCoverageCheck.'+key,value]))}})).modifiedCount>0,
};

/** One bounded History check at a time, durably recorded before returning 202.
 * Results survive navigation/restarts; interrupted checks expire and can retry. */
export class HistoryNoteChecks {
  private busy=false;
  completion?:Promise<void>;
  constructor(private service:HistoryCoverageReviewService,private store=historyNoteStore) {}
  private async load(id:string,userId:string) {
    const note=await this.store.load(id,userId);
    if(!note) throw new AppError('Note not found',404);
    return note;
  }
  async get(id:string,userId:string):Promise<HistoryCheckView> {
    const note=await this.load(id,userId);
    const check=note.historyCoverageCheck;
    if(!check)return {state:'not_requested' as const};
    if(note.status!=='analyzed'||check.sourceRevision!==historySourceRevision(note))return {state:'stale' as const};
    if(check.state==='running'&&new Date(check.expiresAt).getTime()<=Date.now()) {
      if(!await this.store.finish(id,userId,check.jobId,'failed',{error:'This check was interrupted. Please try again.'}))return this.get(id,userId);
      return {state:'failed' as const,input:check.input,error:'This check was interrupted. Please try again.'};
    }
    return {state:check.state,input:check.input,result:check.state==='ready'?check.result:undefined,error:check.error};
  }
  async start(id:string,userId:string,body:unknown) {
    const input=this.service.validate(body);
    const note=await this.load(id,userId);
    if(note.status!=='analyzed')throw new AppError('Finish analyzing this note before checking History coverage',409);
    if(this.busy)throw new AppError('Another History check is running. Try again shortly.',429);
    this.busy=true;
    const check:SavedHistoryCheck={jobId:randomUUID(),state:'running',sourceRevision:historySourceRevision(note),input,
      requestedAt:new Date(),expiresAt:new Date(Date.now()+120000)};
    try {
      if(!await this.store.claim(id,userId,check,note.updatedAt))throw new AppError('This note changed or a History check is already running. Refresh and try again.',409);
    } catch(error){this.busy=false;throw error;}
    this.completion=(async()=>{
      try {
        const result=await this.service.predict(input);
        const current=await this.store.load(id,userId);
        if(!current||current.status!=='analyzed'||historySourceRevision(current)!==check.sourceRevision) {
          await this.store.finish(id,userId,check.jobId,'failed',{error:'The note changed. Check the updated text again.'});return;
        }
        await this.store.finish(id,userId,check.jobId,'ready',{result});
      } catch {
        await this.store.finish(id,userId,check.jobId,'failed',{error:'We could not finish this History check. Please try again.'});
      } finally {this.busy=false;}
    })();
    void this.completion.catch(()=>console.warn('Could not save a History check; its lease will expire.'));
    return {state:'running' as const,input};
  }
}
