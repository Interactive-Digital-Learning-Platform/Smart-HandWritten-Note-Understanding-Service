import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AppError } from "../middleware/errorHandler";
import {coverageRuntimeRoot, coveragePython} from './coverageRuntime';
import {scienceModelText} from './scienceModelText';

export type CoverageLabel = "present" | "partial" | "missing";
export interface CoverageInput { noteText: string; conceptId: string; language: "English"; scopeConfirmed: true }
export interface CoverageEvidence {
  pointId: string; requirement: string; lexicalCoverage: number;
    candidateEvidence: string | null; start: number | null; end: number | null;
}
export interface CoveragePrediction {
  inputFormatting?:'benedict_procedure_spacing_v1';
  status: null; suggestedStatus: CoverageLabel | null; rawModelStatus: CoverageLabel;
  reviewRequired: true; scoresCalibrated: false; modelVersion: string;
  completeSuggestionWithheld: boolean; unsupportedRequiredPoints: string[];
  evidence: { points: CoverageEvidence[]; concerns: Array<{ quote: string; kind: string; start?: number; end?: number }> };
}
export const coverageHash = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex");

/** Translate Python code-point offsets to the JavaScript string indexing contract. */
const alignEvidenceOffsets = (result: CoveragePrediction, text: string): void => {
  const offsets=[0];
  for(const character of text) offsets.push(offsets[offsets.length-1]+character.length);
  const convert=(span:{start?:number|null;end?:number|null},quote:string|null|undefined) => {
    if(quote==null)return;
    const {start,end}=span;
    if(!Number.isInteger(start)||!Number.isInteger(end)||start==null||end==null||start<0||end<start||end>=offsets.length)throw Error("Invalid evidence offsets");
    span.start=offsets[start];span.end=offsets[end];
    if(text.slice(span.start,span.end)!==quote)throw Error("Evidence does not match submitted text");
  };
  for(const point of result.evidence.points)convert(point,point.candidateEvidence);
  for(const concern of result.evidence.concerns)convert(concern,concern.quote);
};
const MODEL_HASH = "af9c5f0aeb326bb59f3ffc80ddecb61c251f0e02bdebfe9d272a98b8df16ef63";
const MODEL_VERSION = "english-coverage-v3.4-review-fix-2026-10-18";
const SOURCES: Record<string,string> = {
  "ml-training/english_coverage_v31_cli.py": "8d18fd28f8f49f42384e139328c560df0d3689cd0b391ed2aa8f72941db61f0b",
  "ml-training/src/smart_note_training/english_coverage_v31.py": "b653bd56f495b67e281239bc3c7c0abbe20f0a75e7461c952a0e576862fa4af1",

  "ml-training/english_coverage_v3_cli.py": "ed179e07b3317a75e5a93c14f274f6a27400ca31ab456c20dfa292357f47f859",
  "ml-training/src/smart_note_training/english_coverage.py": "bb042a83caee169ecd8bcaa00b90be9ce6fab8d853856263e867c0c651c86138",
  "ml-training/src/smart_note_training/english_coverage_v3.py": "c0b32b21f4c7a51328f7146b9c69227f472f7e2664a43c6efba767222f1cc020",
};
export class EnglishCoverageService {
  private active = 0;
  constructor(private root = coverageRuntimeRoot(path.resolve(__dirname, "../..")), private python = process.env.ENGLISH_COVERAGE_PYTHON || coveragePython(root)) {}
  private modelPath(): string { return path.join(this.root, "models/english-coverage-v3.1.json"); }
  catalog(): { modelVersion: string; modelSha256: string; concepts: Array<{ id: string; name: string; points: Array<{id:string;text:string}> }> } {
    try {
      const bytes = fs.readFileSync(this.modelPath());
      if (coverageHash(bytes) !== MODEL_HASH) throw new Error("model changed");
      for (const [file, hash] of Object.entries(SOURCES)) {
        if (coverageHash(fs.readFileSync(path.join(this.root, file))) !== hash) throw new Error("source changed");
      }
      const model = JSON.parse(bytes.toString("utf8"));
      return { modelVersion: model.metadata.experimentId, modelSha256: MODEL_HASH,
        concepts: model.rubrics.concepts.map((c: any) => ({ id: c.id, name: c.name, points: c.points.map((p: any) => ({ id:p.id,text:p.text })) })) };
    } catch { throw new AppError("Frozen English coverage model is unavailable or its integrity check failed", 503); }
  }
  validate(body: unknown): CoverageInput {
    const b = body as Partial<CoverageInput> | null;
    if (!b || typeof b !== "object" || typeof b.noteText !== "string" || !b.noteText.trim() || b.noteText.length > 20000) throw new AppError("Provide noteText containing 1â€“20,000 characters", 400);
    if (b.language !== "English" || /[\u0D80-\u0DFF]/.test(b.noteText)) throw new AppError("This model supports English notes only", 400);
    if (b.scopeConfirmed !== true) throw new AppError("Confirm that the selected concept is in scope for this submitted text", 400);
    if (!this.catalog().concepts.some(c => c.id === b.conceptId)) throw new AppError("Unsupported concept", 400);
    return { noteText:b.noteText,conceptId:b.conceptId!,language:"English",scopeConfirmed:true };
  }
  async predict(input: CoverageInput): Promise<CoveragePrediction> {
    this.validate(input);
    const prepared=scienceModelText(input.noteText,input.conceptId);
    if (this.active >= 2) throw new AppError("Model is busy; try again shortly", 429);
    this.active++;
    try {
      return await new Promise<CoveragePrediction>((resolve,reject) => {
        const child=spawn(this.python,["-B",path.join(this.root,"ml-training/english_coverage_v31_cli.py"),"--model",this.modelPath()],{ cwd:this.root,shell:false,windowsHide:true,stdio:["pipe","pipe","pipe"],env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8",OMP_NUM_THREADS:"2",OPENBLAS_NUM_THREADS:"2"} });
        let output="", settled=false;
        const finish=(error?:Error,result?:CoveragePrediction) => {
          if (settled) return; settled=true;clearTimeout(timer);
          if(error)reject(error);else resolve(result!);
        };
        // Windows cold interpreter/library startup can exceed 20 seconds even
        // for a short note. Keep a bounded budget without blaming note length.
        const timer=setTimeout(()=>{child.kill();finish(new AppError("Coverage model timed out; try again shortly",504));},60000);
        child.stdout.on("data",chunk=>{output+=chunk.toString();if(Buffer.byteLength(output)>1000000){child.kill();finish(new AppError("Coverage model response exceeded its limit",503));}});
        child.stderr.resume(); // Do not expose interpreter output or note text to clients/logs.
        child.on("error",()=>finish(new AppError("Coverage Python runtime could not start",503)));
        child.stdin.on("error",()=>finish(new AppError("Coverage model input failed",503)));
        child.on("close",code=>{
          if(settled)return;
          if(code!==0){finish(new AppError("Coverage model could not process this note",503));return;}
          try {
            const result=JSON.parse(output) as CoveragePrediction;
            if(result.status!==null || result.reviewRequired!==true || result.scoresCalibrated!==false || result.modelVersion!==MODEL_VERSION || !Array.isArray(result.evidence?.points)) throw new Error("invalid result");
            alignEvidenceOffsets(result,prepared.text);
            if(prepared.changed){
              for(const point of result.evidence.points){if(point.candidateEvidence!==null&&point.start!==null&&point.end!==null){
                Object.assign(point,prepared.originalSpan(point.start,point.end));point.candidateEvidence=input.noteText.slice(point.start!,point.end!);
              }}
              for(const concern of result.evidence.concerns){if(concern.start!==undefined&&concern.end!==undefined){Object.assign(concern,prepared.originalSpan(concern.start,concern.end));concern.quote=input.noteText.slice(concern.start,concern.end);}}
              result.inputFormatting='benedict_procedure_spacing_v1';
            }
            finish(undefined,result);
          } catch {finish(new AppError("Coverage model returned an invalid response",503));}
        });
        child.stdin.end(JSON.stringify({...input,noteText:prepared.text}));
      });
    } finally { this.active--; }
  }
}
