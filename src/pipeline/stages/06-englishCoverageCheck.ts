import { config } from "../../config/config";
import { EnglishCoverageCheck } from "../../ml/englishCoverageCheck";
import { coverageHash, EnglishCoverageService } from "../../services/englishCoverageService";
import { PipelineContext } from "../types";
import { modelConceptId } from "../../ml/englishCoverageConcepts";
import { completeOcrPages } from "../ocrProvenance";

const model=new EnglishCoverageService();

/** Adds trained-model suggestions to the normal upload flow without grading understanding. */
export async function runEnglishCoverageCheck(
 ctx:PipelineContext,
 service:Pick<EnglishCoverageService,"catalog"|"predict">=model,
 enabled=config.englishCoverage.suggestionsEnabled,
):Promise<void> {
 const result:EnglishCoverageCheck={state:"skipped",checkedAt:new Date(),reviewRequired:true,suggestions:[]};
 ctx.englishCoverageCheck=result;
 if(!enabled){result.reason="disabled";return;}
 if(ctx.contentLanguage?.primaryLanguage!=="English" || ctx.contentLanguage.confidence<70){result.reason="language";return;}
 const text=ctx.ocrCleaning?.cleanedText ?? ctx.rawOcrText ?? "";
 if(!text.trim() || text.length>20000 || ctx.ocrCleaning?.lowQualityWarning || !completeOcrPages(ctx.ocrExtraction,ctx.imageUrls?.length || 1)){result.reason="ocr_quality";return;}
 if(!ctx.matchedLessonId || !ctx.matchedLesson || (ctx.lessonMatchConfidence??0)<.7){result.reason="lesson_scope";return;}
 try {
  const catalog=service.catalog();const supported=new Map(catalog.concepts.map(c=>[c.id,c]));
  const targets=new Map<string,string>();
  for(const c of ctx.matchedLesson.concepts){const id=modelConceptId(c.id);if(supported.has(id)&&!targets.has(id))targets.set(id,c.id);}
  if(!targets.size){result.reason="unsupported_concepts";return;}
  Object.assign(result,{modelVersion:catalog.modelVersion,modelSha256:catalog.modelSha256,textSha256:coverageHash(text),lessonId:ctx.matchedLessonId});
  // Bounded and sequential: most supported lessons map to one concept, and
  // all requests share the bridge's two-job concurrency limit.
  for(const [conceptId,sourceConceptId] of targets){
   const prediction=await service.predict({noteText:text,conceptId,language:"English",scopeConfirmed:true});
   result.suggestions.push({conceptId:sourceConceptId,modelConceptId:conceptId,conceptName:supported.get(conceptId)!.name,prediction});
  }
  result.state="ready";
 } catch {
  result.state="unavailable";result.reason="runtime";result.suggestions=[];
  ctx.qualityWarnings=[...(ctx.qualityWarnings??[]),"The trained English coverage check is temporarily unavailable."];
 }
}
