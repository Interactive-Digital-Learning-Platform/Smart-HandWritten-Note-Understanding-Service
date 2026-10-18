import {randomUUID} from 'node:crypto';
import {AppError} from '../middleware/errorHandler';

export interface SavedNoteCheck<I,R> {
  jobId:string; state:'running'|'ready'|'failed'; sourceRevision:string;
  input:I; expiresAt:Date; requestedAt:Date; result?:R; error?:string;
}
export interface SavedCheckView<I,R> {
  state:'not_requested'|'stale'|'running'|'ready'|'failed'; input?:I; result?:R; error?:string;
}
interface CheckStore<I,R,N> {
  load(id:string,userId:string):PromiseLike<N|null>;
  claim(id:string,userId:string,check:SavedNoteCheck<I,R>,updatedAt:Date):Promise<boolean>;
  finish(id:string,userId:string,jobId:string,state:'ready'|'failed',patch:Partial<SavedNoteCheck<I,R>>):Promise<boolean>;
}

/** Durable acknowledgement, bounded ownership and stale-result protection for
 * explicit student concept checks. Predictions never mutate lesson scores. */
export class SavedNoteChecks<I,R,N extends {status:string;updatedAt:Date}> {
  private busy=false;
  completion?:Promise<void>;
  constructor(private service:{validate(body:unknown):I;predict(input:I):Promise<R>},
    private store:CheckStore<I,R,N>,private record:(note:N)=>SavedNoteCheck<I,R>|undefined,
    private revision:(note:N)=>string,private subject:string) {}

  private async load(id:string,userId:string) {
    const note=await this.store.load(id,userId);
    if(!note)throw new AppError('Note not found',404);
    return note;
  }
  async get(id:string,userId:string):Promise<SavedCheckView<I,R>> {
    const note=await this.load(id,userId),check=this.record(note);
    if(!check)return {state:'not_requested'};
    if(note.status!=='analyzed'||check.sourceRevision!==this.revision(note))return {state:'stale'};
    if(check.state==='running'&&new Date(check.expiresAt).getTime()<=Date.now()) {
      if(!await this.store.finish(id,userId,check.jobId,'failed',{error:'This check was interrupted. Please try again.'}))return this.get(id,userId);
      return {state:'failed',input:check.input,error:'This check was interrupted. Please try again.'};
    }
    return {state:check.state,input:check.input,result:check.state==='ready'?check.result:undefined,error:check.error};
  }
  async start(id:string,userId:string,body:unknown):Promise<SavedCheckView<I,R>> {
    const input=this.service.validate(body),note=await this.load(id,userId);
    if(note.status!=='analyzed')throw new AppError(`Finish analyzing this note before checking ${this.subject} coverage`,409);
    if(this.busy)throw new AppError(`Another ${this.subject} check is running. Try again shortly.`,429);
    this.busy=true;
    const check:SavedNoteCheck<I,R>={jobId:randomUUID(),state:'running',sourceRevision:this.revision(note),input,
      requestedAt:new Date(),expiresAt:new Date(Date.now()+120000)};
    try {
      if(!await this.store.claim(id,userId,check,note.updatedAt))throw new AppError(`This note changed or a ${this.subject} check is already running. Refresh and try again.`,409);
    }catch(error){this.busy=false;throw error;}
    this.completion=(async()=>{
      try {
        const result=await this.service.predict(input),current=await this.store.load(id,userId);
        if(!current||current.status!=='analyzed'||this.revision(current)!==check.sourceRevision) {
          await this.store.finish(id,userId,check.jobId,'failed',{error:'The note changed. Check the updated text again.'});return;
        }
        await this.store.finish(id,userId,check.jobId,'ready',{result});
      }catch {
        await this.store.finish(id,userId,check.jobId,'failed',{error:`We could not finish this ${this.subject} check. Please try again.`});
      }finally{this.busy=false;}
    })();
    void this.completion.catch(()=>console.warn(`Could not save a ${this.subject} check; its lease will expire.`));
    return {state:'running',input};
  }
}
