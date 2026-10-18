import {createHash, createHmac} from 'node:crypto';
import {redactAnnotationText} from './contract';
import {modelConceptId} from '../ml/englishCoverageConcepts';
import {scienceModelText} from '../services/scienceModelText';
import type {INote} from '../models/Note';

export const STUDENT_BATCH_SCHEMA='notes-ai-training-v1';
export const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
export interface BatchConcept {id:string;name:string;lessonId?:string;points:{id:string;text:string}[]}
export interface StudentModelRow {
  recordId:string; noteGroupId:string; uploaderGroupId:string; subject:'science'|'history';
  conceptId:string; conceptName:string; requirements:string[]; text:string; modelInputText:string;
  textSha256:string; teacherLabel:'present'|'partial'|'missing'; teacherEvidence:string;
  teacherConfidence:number; labelSource:'ai_teacher'; humanReviewed:false;
  source:{pipelineVersion:string; analyzedAt:string; consentVersion:string; curriculumVersion:string};
}
export interface BatchResult {rows:StudentModelRow[];skipped:Record<string,number>}

/** Snapshot existing results; never call an LLM, infer consent or consume our own predictions. */
export function collectStudentRows(notes:Array<Pick<INote,'_id'|'userId'|'status'|'rawText'|'researchConsent'|'analysis'|'pageCount'>>,
  catalogs:Record<'science'|'history',BatchConcept[]>,secret:string,minConfidence=.7):BatchResult {
  if(secret.length<16)throw Error('A persistent local pseudonym key of at least 16 characters is required');
  if(!Number.isFinite(minConfidence)||minConfidence<.7||minConfidence>1)throw Error('Minimum confidence must be between 0.7 and 1');
  const rows:StudentModelRow[]=[],skipped:Record<string,number>={},seen=new Set<string>();
  const skip=(reason:string)=>{skipped[reason]=(skipped[reason]||0)+1;};
  const pseudonym=(type:string,id:string)=>type+'-'+createHmac('sha256',secret).update(type+'|'+id).digest('hex').slice(0,24);
  for(const note of notes) {
    const a=note.analysis,consent=note.researchConsent;
    if(consent?.status!=='granted'||!consent.version||!consent.grantedAt||consent.withdrawnAt){skip('no_current_consent');continue;}
    if(note.status!=='analyzed'||!a){skip('not_analyzed');continue;}
    const subject=/^(Science|Biology|Chemistry|Physics)$/i.test(a.subject)?'science':/^History$/i.test(a.subject)?'history':null;
    if(!subject){skip('unsupported_subject');continue;}
    if(a.contentLanguage?.primaryLanguage!=='English'||a.contentLanguage.confidence<70||/[\u0d80-\u0dff]/.test(note.rawText)){skip('not_english');continue;}
    if(!a.lessonId||(a.lessonMatchConfidence??0)<.7){skip('uncertain_lesson');continue;}
    const pages=a.ocrPageSummary;
    if(a.ocrLowQualityWarning||!Number.isFinite(a.ocrConfidence)||(a.ocrConfidence??0)<70||!pages||pages.qualityState!=='known'||pages.failedPages!==0||pages.totalPages!==(note.pageCount||1)||pages.extractedPages!==pages.totalPages){skip('ocr_quality');continue;}
    const text=redactAnnotationText(note.rawText||'');
    if(!text||text.length>20000){skip('text_length');continue;}
    const findings=a.conceptFindings||[];
    if(!findings.some(f=>f.source==='semantic_llm'&&(f.status==='present'||f.status==='partial')&&f.evidence&&note.rawText.includes(f.evidence))){skip('no_lesson_anchor');continue;}
    const concepts=new Map(catalogs[subject].map(c=>[c.id,c]));
    const counts=new Map<string,number>();for(const f of findings)counts.set(f.conceptId,(counts.get(f.conceptId)||0)+1);
    for(const f of findings) {
      const conceptId=subject==='science'?modelConceptId(f.conceptId):f.conceptId,concept=concepts.get(conceptId);
      if(!concept||concept.lessonId&&concept.lessonId!==a.lessonId){skip('unsupported_concept');continue;}
      if(counts.get(f.conceptId)!==1){skip('duplicate_finding');continue;}
      if(f.source!=='semantic_llm'){skip('not_ai_teacher');continue;}
      if(!['present','partial','missing'].includes(f.status||'')){skip('invalid_status');continue;}
      if(!Number.isFinite(f.decisionConfidence)||f.decisionConfidence<minConfidence){skip('low_teacher_confidence');continue;}
      if(f.status!=='missing'&&(!f.evidence?.trim()||!note.rawText.includes(f.evidence))){skip('unquoted_evidence');continue;}
      if(f.status==='missing'&&f.evidence?.trim()){skip('conflicting_missing_evidence');continue;}
      const textSha256=digest(text.replace(/\s+/g,' ').trim().toLowerCase()),dedup=subject+'|'+conceptId+'|'+textSha256;
      if(seen.has(dedup)){skip('duplicate_text_concept');continue;}seen.add(dedup);
      rows.push({recordId:'row-'+digest(dedup).slice(0,24),noteGroupId:pseudonym('note',String(note._id)),
        uploaderGroupId:pseudonym('uploader',note.userId),subject,conceptId,conceptName:concept.name,
        requirements:concept.points.map(p=>p.text),text,modelInputText:subject==='science'?scienceModelText(text,conceptId).text:text,
        textSha256,teacherLabel:f.status!,teacherEvidence:redactAnnotationText(f.evidence||''),teacherConfidence:f.decisionConfidence,
        labelSource:'ai_teacher',humanReviewed:false,source:{pipelineVersion:a.pipelineVersion||'unknown',
          analyzedAt:new Date(a.analyzedAt).toISOString(),consentVersion:consent.version,curriculumVersion:a.curriculumVersion||'unknown'}});
    }
  }
  return {rows,skipped};
}
