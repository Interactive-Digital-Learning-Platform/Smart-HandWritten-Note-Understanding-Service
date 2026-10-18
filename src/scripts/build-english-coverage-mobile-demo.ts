/** Generate synthetic UI examples by invoking the same real-model pipeline stage. */
import fs from "node:fs/promises";
import path from "node:path";
import { runEnglishCoverageCheck } from "../pipeline/stages/06-englishCoverageCheck";
import { PipelineContext } from "../pipeline/types";

async function main():Promise<void> {
 const examples=[
  {title:"Both types explained",noteText:"Sexual reproduction involves fusion of male and female gametes during fertilisation. Asexual reproduction uses one parent without gamete fusion and usually produces genetically identical offspring."},
  {title:"One required idea omitted",noteText:"Asexual reproduction involves a single parent without fusion of gametes. The offspring are genetically identical."},
  {title:"A different topic",noteText:"Friction opposes the relative motion of surfaces. Lubrication reduces friction, while rough surfaces can increase it."},
 ];
 const samples=[];
 for(const example of examples){const ctx={rawOcrText:example.noteText,contentLanguage:{primaryLanguage:"English",confidence:90},matchedLessonId:"synthetic-reproduction",lessonMatchConfidence:1,
  ocrExtraction:{totalPages:1,extractedPages:1,failedPages:0,qualityState:"known",source:"provided_text"},
  matchedLesson:{lessonId:"synthetic-reproduction",concepts:[{id:"sci-g10-col-001"}]},qualityWarnings:[]} as unknown as PipelineContext;
  await runEnglishCoverageCheck(ctx,undefined,true);
  if(ctx.englishCoverageCheck?.state!=="ready")throw Error("Model demo could not generate a verified suggestion");
  samples.push({...example,check:ctx.englishCoverageCheck});
 }
 const out=path.resolve("../Mobile-Application/assets/data/englishCoverageDemo.json");
 await fs.mkdir(path.dirname(out),{recursive:true});
 await fs.writeFile(out,JSON.stringify({synthetic:true,generatedAt:new Date().toISOString(),modelSha256:samples[0].check?.modelSha256,samples},null,2)+"\n");
 console.log(JSON.stringify({output:out,samples:samples.map(s=>({title:s.title,suggestion:s.check?.suggestions[0].prediction.suggestedStatus})),synthetic:true}));
}
main().catch(()=>{console.error("Could not generate mobile model demo");process.exitCode=1;});
