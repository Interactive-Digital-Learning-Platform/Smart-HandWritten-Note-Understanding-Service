export interface SyntheticExample {
 recordId:string;noteGroupId:string;sourceFamilyId:string;conceptId:string;conceptName:string;
 requirements:string[];text:string;variant:string;source:Record<string,unknown>;
}
export interface TeacherLabel {recordId:string;status:'present'|'partial'|'missing';confidence:number;
 points:Array<{index:number;coverage:'full'|'partial'|'missing';quote:string}>;conflicts:string[]}
/** Model/teacher outputs are data. Require one entry per input and exact per-point quotes. */
export function validateSyntheticTeacher(examples:SyntheticExample[],value:unknown) {
 if(!Array.isArray(value))throw Error('Teacher must return an array');
 const counts=new Map<string,number>();for(const item of value)if(item&&typeof item.recordId==='string')counts.set(item.recordId,(counts.get(item.recordId)||0)+1);
 const accepted:Array<{example:SyntheticExample;label:TeacherLabel}>=[],rejected:Array<{recordId:string;reason:string}>=[];
 for(const example of examples){
  const row=value.find(v=>v?.recordId===example.recordId) as TeacherLabel|undefined;
  let reason='';
  if(!row||counts.get(example.recordId)!==1)reason='missing_or_duplicate_response';
  else if(!['present','partial','missing'].includes(row.status)||typeof row.confidence!=='number'||!Number.isFinite(row.confidence)||row.confidence<.7||row.confidence>1)reason='invalid_or_low_confidence';
  else if(!Array.isArray(row.points)||row.points.length!==example.requirements.length||!Array.isArray(row.conflicts)||row.conflicts.some(c=>typeof c!=='string'||!example.text.includes(c)))reason='invalid_points_or_conflicts';
  else {
   const ids=new Set<number>();
   for(const p of row.points){
    if(!p||!Number.isInteger(p.index)||p.index<1||p.index>example.requirements.length||ids.has(p.index)||!['full','partial','missing'].includes(p.coverage)||typeof p.quote!=='string'||p.quote.length>1200||
      (p.coverage==='missing'?Boolean(p.quote.trim()):!p.quote.trim()||!example.text.includes(p.quote)))reason='invalid_point_evidence';
    ids.add(p?.index);
   }
   if(!reason){
    const supported=row.points.some(p=>p.coverage!=='missing');
    if(row.status==='present'&&(row.points.some(p=>p.coverage!=='full')||row.conflicts.length))reason='unsupported_complete';
    if(row.status==='partial'&&!supported)reason='partial_without_evidence';
    if(row.status==='missing'&&supported)reason='missing_with_evidence';
   }
  }
  if(reason)rejected.push({recordId:example.recordId,reason});else accepted.push({example,label:row!});
 }
 return {accepted,rejected};
}
