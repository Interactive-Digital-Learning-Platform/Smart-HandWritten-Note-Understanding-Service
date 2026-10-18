/** Loopback-only demonstration of the real router/model with temporary records. */
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { createCoverageRouter } from "../routes/englishCoverage";
import { createMongoCoverageStore, memoryCoverageStore } from "../models/EnglishCoverageReview";
import { EnglishCoverageService } from "../services/englishCoverageService";
import { errorHandler } from "../middleware/errorHandler";
import { demoCoverageSources } from "../services/englishCoverageSources";
import mongoose from "mongoose";
import { config } from "../config/config";
const portIndex=process.argv.indexOf("--port");
const port=portIndex>=0?Number(process.argv[portIndex+1]):8880;
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error("Invalid preview port");
async function start():Promise<void> {
 const persistent=process.argv.includes("--mongo");
 const connection=persistent?await mongoose.createConnection(config.mongodb.uri,{serverSelectionTimeoutMS:8000}).asPromise():undefined;
 const store=connection?createMongoCoverageStore(connection,"english_coverage_demo_reviews"):memoryCoverageStore();
 const app=express();app.use(helmet());app.use(express.json({limit:"100kb"}));
 app.get("/api/english-coverage/preview-mode",(_req,res)=>res.json({success:true,data:{persistent,syntheticSource:true}}));
 app.use("/api/english-coverage",createCoverageRouter({enabled:true,auth:(_req,res,next)=>{res.locals.expertId="local-preview";next();},store,service:new EnglishCoverageService(),sources:demoCoverageSources()}));
 app.use("/english-coverage",express.static(path.resolve("public/english-coverage")));app.use(errorHandler);
 app.listen(port,"127.0.0.1",()=>console.log(`English coverage ${persistent?"durable demo":"temporary preview"}: http://127.0.0.1:${port}/english-coverage/?preview=1`));
}
start().catch(()=>{console.error("Coverage preview startup failed; check database configuration when using --mongo");process.exitCode=1;});
