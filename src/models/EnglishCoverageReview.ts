import mongoose, { Connection, Schema } from "mongoose";
import { randomUUID } from "node:crypto";
import { CoverageInput, CoverageLabel, CoveragePrediction } from "../services/englishCoverageService";

export interface CoverageReview {
  id: string; expertId: string; input: CoverageInput; textSha256: string; modelSha256: string;
  prediction: CoveragePrediction; state: "pending" | "confirmed";
  humanLabel?: CoverageLabel; comment?: string; createdAt: Date; confirmedAt?: Date;
  source?: { taskId:string; noteGroupId:string; noteTextSha256:string };
}
const schema=new Schema({
  _id:{type:String,default:()=>randomUUID()}, expertId:{type:String,required:true,index:true},
  input:{type:Schema.Types.Mixed,required:true}, textSha256:{type:String,required:true},
  modelSha256:{type:String,required:true},prediction:{type:Schema.Types.Mixed,required:true},
  state:{type:String,enum:["pending","confirmed"],required:true,default:"pending"},
  humanLabel:{type:String,enum:["present","partial","missing"]},comment:{type:String,maxlength:2000},
  createdAt:{type:Date,required:true},confirmedAt:Date,
  source:{type:Schema.Types.Mixed},
},{versionKey:false});
export interface CoverageReviewStore {
  create(record:CoverageReview):Promise<CoverageReview>;
  get(id:string,expertId:string):Promise<CoverageReview|null>;
  confirm(id:string,expertId:string,label:CoverageLabel,comment:string):Promise<CoverageReview|null>;
  list(expertId:string):Promise<CoverageReview[]>;
  deletePending(id:string,expertId:string):Promise<void>;
}
function toRecord(row:any):CoverageReview|null {
  if(!row)return null;
  const {_id,...rest}=row.toObject?row.toObject():row;
  return {id:String(_id),...rest};
}
export function createMongoCoverageStore(connection:Connection=mongoose.connection,collection?:string):CoverageReviewStore {
 const name=collection || "EnglishCoverageReview";
 const model=connection.models[name] || connection.model(name,schema,collection);
 return {
  async create(record){const {id,...rest}=record;return toRecord(await model.create({_id:id,...rest}))!;},
  async get(id,expertId){return toRecord(await model.findOne({_id:id,expertId}).lean());},
  async confirm(id,expertId,humanLabel,comment){return toRecord(await model.findOneAndUpdate({_id:id,expertId,state:"pending"},{$set:{state:"confirmed",humanLabel,comment,confirmedAt:new Date()}},{returnDocument:"after",runValidators:true}).lean());},
  async list(expertId){const rows=await model.find({expertId}).sort({createdAt:-1,_id:-1}).limit(50).lean();return rows.map(r=>toRecord(r)!);},
  async deletePending(id,expertId){await model.deleteOne({_id:id,expertId,state:"pending"});},
 };
}
export const mongoCoverageStore=createMongoCoverageStore();
export async function purgeCoverageTask(taskId:string):Promise<void> {
 await mongoose.connection.models.EnglishCoverageReview.deleteMany({"source.taskId":taskId});
}
/** For loopback preview/tests only; no database or persistent student records. */
export function memoryCoverageStore():CoverageReviewStore {
  const rows=new Map<string,CoverageReview>();
  return {
    async create(r){rows.set(r.id,structuredClone(r));return structuredClone(r);},
    async get(id,expertId){const r=rows.get(id);return r?.expertId===expertId?structuredClone(r):null;},
    async confirm(id,expertId,humanLabel,comment){const r=rows.get(id);if(!r || r.expertId!==expertId || r.state!=="pending")return null;
      Object.assign(r,{state:"confirmed",humanLabel,comment,confirmedAt:new Date()});return structuredClone(r);},
    async list(expertId){return [...rows.values()].filter(r=>r.expertId===expertId).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()).slice(0,50).map(r=>structuredClone(r));},
    async deletePending(id,expertId){const r=rows.get(id);if(r?.expertId===expertId&&r.state==="pending")rows.delete(id);},
  };
}
