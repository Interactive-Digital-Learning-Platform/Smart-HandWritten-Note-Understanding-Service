import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSyntheticTeacher,SyntheticExample} from './syntheticScienceTeacher';
const e:SyntheticExample={recordId:'x',noteGroupId:'note',sourceFamilyId:'chapter',conceptId:'c',conceptName:'Test',requirements:['Heat the sample.'],text:'Heat the sample in water.',variant:'page-1',source:{}};
const label=():any=>({recordId:'x',status:'present',confidence:.9,points:[{index:1,coverage:'full',quote:e.text}],conflicts:[]});
test('accepts grounded proposal without treating it as human review',()=>{
 const result=validateSyntheticTeacher([e],[label()]);assert.equal(result.accepted.length,1);assert.equal(result.rejected.length,0);
});
test('rejects complete with missing requirements or conflicts',()=>{
 for(const change of [(r:any)=>r.points[0]={index:1,coverage:'missing',quote:''},(r:any)=>r.conflicts=[e.text]]){
  const r=label();change(r);assert.equal(validateSyntheticTeacher([e],[r]).accepted.length,0);
 }
});
test('rejects fabricated quotes, malformed points and duplicate responses',()=>{
 for(const points of [[{index:1,coverage:'full',quote:'Not actually written'}],[null],[]]){
  const r=label();r.points=points;assert.equal(validateSyntheticTeacher([e],[r]).accepted.length,0);
 }
 assert.equal(validateSyntheticTeacher([e],[label(),label()]).accepted.length,0);
});
test('missing must have no supporting evidence and partial needs some evidence',()=>{
 const r=label();r.status='missing';assert.equal(validateSyntheticTeacher([e],[r]).accepted.length,0);
 r.points=[{index:1,coverage:'missing',quote:''}];assert.equal(validateSyntheticTeacher([e],[r]).accepted.length,1);
 r.status='partial';assert.equal(validateSyntheticTeacher([e],[r]).accepted.length,0);
});
test('cannot borrow evidence from another variant',()=>{
 const other={...e,recordId:'y',text:'Plants need light.'};const r={...label(),recordId:'y'};
 const result=validateSyntheticTeacher([e,other],[label(),r]);assert.equal(result.accepted.length,1);assert.equal(result.rejected[0].recordId,'y');
});
