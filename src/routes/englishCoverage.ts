import { Router, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { requireExpertAnnotationAuth } from "../annotations/expertAuth";
import { AppError, sendSuccess } from "../middleware/errorHandler";
import { CoverageLabel, EnglishCoverageService, coverageHash } from "../services/englishCoverageService";
import { CoverageReviewStore, mongoCoverageStore } from "../models/EnglishCoverageReview";
import { CoverageSources, MongoCoverageSources } from "../services/englishCoverageSources";

export function createCoverageRouter(options:{enabled:boolean;auth:RequestHandler;store:CoverageReviewStore;service:EnglishCoverageService;sources?:CoverageSources}):Router {
  const router=Router();
  router.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");if(!options.enabled)return next(new AppError("English coverage review is not enabled",503));next();});
  router.use(options.auth);
  router.get("/concepts",(_req,res,next)=>{try{sendSuccess(res,options.service.catalog());}catch(e){next(e);}});
  const concepts=()=>options.service.catalog().concepts.map(c=>c.id);
  const sourceAccess=async(taskId:string,expertId:string)=>{
    if(!options.sources)throw new AppError("Assigned notes are unavailable",503);
    return options.sources.get(taskId,expertId,concepts());
  };
  router.get("/notes",async(_req,res,next)=>{try{
    const notes=options.sources?await options.sources.list(res.locals.expertId,concepts()):[];
    sendSuccess(res,notes.map(({noteText,...summary})=>summary));
  }catch(e){next(e);}});
  router.get("/notes/:id",async(req,res,next)=>{try{sendSuccess(res,await sourceAccess(String(req.params.id),res.locals.expertId));}catch(e){next(e);}});
  router.get("/reviews",async(_req,res,next)=>{try{
    const reviews=await options.store.list(res.locals.expertId);const visible=[];
    for(const row of reviews){if(row.source){try{await sourceAccess(row.source.taskId,res.locals.expertId);}catch(e){if(e instanceof AppError&&e.statusCode===404)continue;throw e;}}
      visible.push({id:row.id,conceptId:row.input.conceptId,state:row.state,humanLabel:row.humanLabel,createdAt:row.createdAt,source:row.source});}
    sendSuccess(res,visible);
  }catch(e){next(e);}});
  router.post("/reviews",async(req,res,next)=>{try{
    const input=options.service.validate(req.body);
    let source;
    if(req.body.sourceTaskId!==undefined){
      if(typeof req.body.sourceTaskId!=="string" || typeof req.body.sourceTextSha256!=="string")throw new AppError("Invalid source note reference",400);
      const note=await sourceAccess(req.body.sourceTaskId,res.locals.expertId);
      if(!note.conceptIds.includes(input.conceptId))throw new AppError("Selected concept is not in this note's review scope",400);
      if(note.noteTextSha256!==req.body.sourceTextSha256)throw new AppError("The note changed; reload its OCR text",409);
      source={taskId:note.taskId,noteGroupId:note.noteGroupId,noteTextSha256:note.noteTextSha256};
    }
    const prediction=await options.service.predict(input);
    if(source){const current=await sourceAccess(source.taskId,res.locals.expertId);if(current.noteTextSha256!==source.noteTextSha256)throw new AppError("The note changed during inference; reload it",409);}
    const record=await options.store.create({id:randomUUID(),expertId:res.locals.expertId,input,textSha256:coverageHash(input.noteText),
      modelSha256:options.service.catalog().modelSha256,prediction,state:"pending",createdAt:new Date(),source});
    if(source){try{const current=await sourceAccess(source.taskId,res.locals.expertId);if(current.noteTextSha256!==source.noteTextSha256)throw new AppError("The note changed during inference; reload it",409);}
      catch(e){await options.store.deletePending(record.id,res.locals.expertId);throw e;}}
    sendSuccess(res,record,"Suggestion created; explicit human confirmation is required",201);
  }catch(e){next(e);}});
  router.get("/reviews/:id",async(req,res,next)=>{try{
    const row=await options.store.get(String(req.params.id),res.locals.expertId);
    if(!row)throw new AppError("Review not found",404);
    if(row.source)await sourceAccess(row.source.taskId,res.locals.expertId);
    sendSuccess(res,row);
  }catch(e){next(e);}});
  router.post("/reviews/:id/confirm",async(req,res,next)=>{try{
    const {humanLabel,comment,confirmed}=req.body || {};
    if(confirmed!==true || !["present","partial","missing"].includes(humanLabel) || typeof comment!=="string" || comment.length>2000)throw new AppError("Select a human label and explicitly confirm the review; comment limit is 2,000 characters",400);
    const previous=await options.store.get(String(req.params.id),res.locals.expertId);
    if(!previous)throw new AppError("Review not found",404);
    if(previous.state!=="pending")throw new AppError("This review was already confirmed",409);
    if(previous.source){const current=await sourceAccess(previous.source.taskId,res.locals.expertId);
      if(current.noteTextSha256!==previous.source.noteTextSha256)throw new AppError("The source note changed; create a new review",409);}
    if(previous.prediction.suggestedStatus!==humanLabel && !comment.trim())throw new AppError("Explain a correction or a decision on a withheld suggestion",400);
    const row=await options.store.confirm(previous.id,res.locals.expertId,humanLabel as CoverageLabel,comment.trim());
    if(!row)throw new AppError("This review was already confirmed",409);
    sendSuccess(res,row,"Human review saved separately from automated note analysis");
  }catch(e){next(e);}});
  return router;
}
export default createCoverageRouter({enabled:process.env.ENGLISH_COVERAGE_REVIEW_ENABLED==="true",auth:requireExpertAnnotationAuth,store:mongoCoverageStore,service:new EnglishCoverageService(),sources:new MongoCoverageSources()});
