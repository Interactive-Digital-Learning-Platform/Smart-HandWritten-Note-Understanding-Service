import mongoose from "mongoose";
import { AppError } from "../middleware/errorHandler";
import { ExpertAnnotationTask } from "../models/ExpertAnnotationTask";
import { Note } from "../models/Note";
import { redactAnnotationText } from "../annotations/contract";
import { coverageHash } from "./englishCoverageService";
import { modelConceptId, serviceConceptIds } from "../ml/englishCoverageConcepts";

export interface CoverageSource {
 taskId:string; noteGroupId:string; title:string; noteText:string; noteTextSha256:string; conceptIds:string[];
}
export interface CoverageSources {
 list(expertId:string,conceptIds:string[]):Promise<CoverageSource[]>;
 get(taskId:string,expertId:string,conceptIds:string[]):Promise<CoverageSource>;
}
/** Access follows the existing assignment and current consent, never client userId. */
export class MongoCoverageSources implements CoverageSources {
 constructor(private tasks=ExpertAnnotationTask,private notes=Note) {}
 private filter(expertId:string,conceptIds:string[]) {
  return {assignedExpertId:expertId,status:{$in:["in_review","submitted","approved"] as const},language:"English" as const,
   "concepts.conceptId":{$in:serviceConceptIds(conceptIds)},"flags.wrongLesson":{$ne:true},"flags.unreadable":{$ne:true},
   "flags.duplicate":{$ne:true},"flags.containsPersonalData":{$ne:true},consentWithdrawnAt:{$exists:false}};
 }
 async get(taskId:string,expertId:string,conceptIds:string[]):Promise<CoverageSource> {
  if(!mongoose.isValidObjectId(taskId))throw new AppError("Assigned note is unavailable",404);
  const task=await this.tasks.findOne({_id:taskId,...this.filter(expertId,conceptIds)}).lean();
  if(!task)throw new AppError("Assigned note is unavailable",404);
  const note=await this.notes.findOne({_id:task.sourceNoteId,status:"analyzed","researchConsent.status":"granted"})
   .select("rawText analysis.lessonId analysis.conceptFindings researchConsent").lean();
  if(!note || note.analysis?.lessonId!==task.lessonId)throw new AppError("Assigned note is unavailable",404);
  const currentIds=new Set(note.analysis?.conceptFindings?.map(c=>c.conceptId) || []);
  const allowedIds=task.concepts.map(c=>c.conceptId).filter(id=>conceptIds.includes(modelConceptId(id))&&currentIds.has(id)).map(modelConceptId);
  const noteText=redactAnnotationText(note.rawText);
  if(!noteText.trim() || !allowedIds.length)throw new AppError("Assigned note is unavailable",404);
  return {taskId:String(task._id),noteGroupId:task.noteGroupId,title:task.lessonName,noteText,noteTextSha256:coverageHash(noteText),conceptIds:allowedIds};
 }
 async list(expertId:string,conceptIds:string[]):Promise<CoverageSource[]> {
  const tasks=await this.tasks.find(this.filter(expertId,conceptIds)).select("_id").sort({updatedAt:-1}).limit(50).lean();
  const result:CoverageSource[]=[];
  for(const task of tasks){try{result.push(await this.get(String(task._id),expertId,conceptIds));}
   catch(error){if(!(error instanceof AppError && error.statusCode===404))throw error;}}
  return result;
 }
}
/** Synthetic source used only by the loopback demonstration. */
export function demoCoverageSources():CoverageSources {
 const noteText="Asexual reproduction involves a single parent without fusion of gametes. The offspring are genetically identical.";
 const source:CoverageSource={taskId:"demo-note",noteGroupId:"synthetic-demo",title:"Synthetic reproduction note",noteText,noteTextSha256:coverageHash(noteText),conceptIds:["sci-g10-col-001"]};
 return {async list(){return [structuredClone(source)];},async get(id){if(id!==source.taskId)throw new AppError("Assigned note is unavailable",404);return structuredClone(source);}};
}
