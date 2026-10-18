import {Note,INote} from '../models/Note';
import {AppError} from '../middleware/errorHandler';
import {EnglishCoverageService,coverageHash} from './englishCoverageService';
import {EnglishCoverageCheck} from '../ml/englishCoverageCheck';
import {activeOcrText} from './ocrText';
import {historySourceRevision} from './historyNoteChecks';
import {SavedNoteCheck,SavedNoteChecks} from './savedNoteChecks';

export interface ScienceReviewInput {text:string;conceptId:string;language:'English';scopeConfirmed:true}
export interface ScienceReviewResult {analyzedText:string;check:EnglishCoverageCheck}
export type SavedScienceCheck=SavedNoteCheck<ScienceReviewInput,ScienceReviewResult>;

export class ScienceReviewService {
  constructor(private model=new EnglishCoverageService()) {}
  catalog(){return this.model.catalog();}
  validate(body:unknown):ScienceReviewInput {
    const b=body as Partial<ScienceReviewInput>|null;
    let text=b?.text;
    try{if(typeof text==='string')text=activeOcrText(text);}catch{throw new AppError('Correct the crossed-out text markers before checking this note',400);}
    const input=this.model.validate({noteText:text,
      conceptId:b?.conceptId,language:b?.language,scopeConfirmed:b?.scopeConfirmed});
    return {text:input.noteText,conceptId:input.conceptId,language:'English',scopeConfirmed:true};
  }
  async predict(input:ScienceReviewInput):Promise<ScienceReviewResult> {
    const catalog=this.catalog(),concept=catalog.concepts.find(c=>c.id===input.conceptId)!;
    const prediction=await this.model.predict({noteText:input.text,conceptId:input.conceptId,language:'English',scopeConfirmed:true});
    return {analyzedText:input.text,check:{state:'ready',checkedAt:new Date(),reviewRequired:true,
      modelVersion:catalog.modelVersion,modelSha256:catalog.modelSha256,textSha256:coverageHash(input.text),
      suggestions:[{conceptId:concept.id,modelConceptId:concept.id,conceptName:concept.name,prediction}]}};
  }
}
export const scienceNoteStore={
  load:(id:string,userId:string)=>Note.findOne({_id:id,userId}),
  claim:async(id:string,userId:string,check:SavedScienceCheck,updatedAt:Date)=>(await Note.updateOne({_id:id,userId,updatedAt,status:'analyzed',
    $or:[{'scienceCoverageReview.state':{$ne:'running'}},{'scienceCoverageReview.expiresAt':{$lte:new Date()}},
      {'scienceCoverageReview.sourceRevision':{$ne:check.sourceRevision}}]},{$set:{scienceCoverageReview:check}})).modifiedCount>0,
  finish:async(id:string,userId:string,jobId:string,state:'ready'|'failed',patch:Partial<SavedScienceCheck>)=>
    (await Note.updateOne({_id:id,userId,'scienceCoverageReview.jobId':jobId,'scienceCoverageReview.state':'running',
      ...(state==='ready'?{'scienceCoverageReview.expiresAt':{$gt:new Date()}}:{})},
    {$set:{'scienceCoverageReview.state':state,...Object.fromEntries(Object.entries(patch).map(([key,value])=>['scienceCoverageReview.'+key,value]))}})).modifiedCount>0,
};
export class ScienceNoteChecks extends SavedNoteChecks<ScienceReviewInput,ScienceReviewResult,INote> {
  constructor(service=new ScienceReviewService(),store=scienceNoteStore){super(service,store,n=>n.scienceCoverageReview,historySourceRevision,'Science');}
}
