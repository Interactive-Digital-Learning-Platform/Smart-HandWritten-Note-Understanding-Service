import test from 'node:test';
import assert from 'node:assert/strict';
import {Note} from '../models/Note';
import {ScienceReviewService,ScienceNoteChecks,SavedScienceCheck} from './scienceNoteChecks';
import {EnglishCoverageService} from './englishCoverageService';

const input={text:'Add Benedict solution to a food sample.',conceptId:'sci-g10-cbl-007',language:'English',scopeConfirmed:true};
function fixture(){
 const note:any={userId:'owner',status:'analyzed',updatedAt:new Date(),rawText:'Original OCR',analysis:{subject:'Science',overallCompleteness:75},scienceCoverageReview:undefined};
 const store:any={load:async(_id:string,user:string)=>user==='owner'?note:null,
  claim:async(_id:string,_user:string,check:SavedScienceCheck)=>{note.scienceCoverageReview=structuredClone(check);return true;},
  finish:async(_id:string,_user:string,id:string,state:string,patch:any)=>{const old=note.scienceCoverageReview;
   if(old?.jobId!==id||old.state!=='running'||state==='ready'&&new Date(old.expiresAt).getTime()<=Date.now())return false;
   Object.assign(old,patch,{state});return true;}};
 return {note,store};
}
test('focused Science input validates supported scope, English and deletion markers before inference',()=>{
 const service=new ScienceReviewService();
 assert.equal(service.validate({...input,text:'<deleted>Old statement</deleted> '+input.text}).text,input.text);
 for(const bad of [{...input,scopeConfirmed:false},{...input,language:'Sinhala'},{...input,conceptId:'unknown'},
  {...input,text:'<deleted>unclosed'},{...input,text:'x'.repeat(20001)}])assert.throws(()=>service.validate(bad));
});
test('saved Science checks restore reviewed text without replacing OCR, automatic results or lesson scores',async t=>{
 const {note,store}=fixture(),model=new EnglishCoverageService();let finish!:(result:any)=>void;
 t.mock.method(model,'predict',()=>new Promise(resolve=>finish=resolve));
 const service=new ScienceReviewService(model),jobs=new ScienceNoteChecks(service,store),before=JSON.stringify(note.analysis);
 await jobs.start('fixture','owner',input);assert.equal((await new ScienceNoteChecks(service,store).get('fixture','owner')).state,'running');
 finish({suggestedStatus:'partial',evidence:{points:[],concerns:[]}});await jobs.completion;
 const saved=await new ScienceNoteChecks(service,store).get('fixture','owner');assert.equal(saved.state,'ready');
 assert.equal(saved.result?.analyzedText,input.text);assert.equal(saved.result?.check.suggestions[0].conceptId,input.conceptId);
 assert.equal(JSON.stringify(note.analysis),before);assert.equal(note.rawText,'Original OCR');
 const doc=new Note({userId:'owner',imageUrl:'/unused.png',scienceCoverageReview:note.scienceCoverageReview});
 assert.equal(Note.hydrate(JSON.parse(JSON.stringify(doc))).scienceCoverageReview?.state,'ready');
 note.rawText='New OCR';assert.equal((await jobs.get('fixture','owner')).state,'stale');
});
test('Science ownership, interrupted checks and late worker results fail safely',async t=>{
 const {note,store}=fixture(),model=new EnglishCoverageService();let finish!:(result:any)=>void;
 t.mock.method(model,'predict',()=>new Promise(resolve=>finish=resolve));
 const jobs=new ScienceNoteChecks(new ScienceReviewService(model),store);
 await assert.rejects(jobs.start('fixture','other',input),/Note not found/);
 await jobs.start('fixture','owner',input);note.scienceCoverageReview.expiresAt=new Date(0);
 assert.equal((await jobs.get('fixture','owner')).state,'failed');finish({suggestedStatus:'present'});await jobs.completion;
 assert.equal((await jobs.get('fixture','owner')).state,'failed');
 note.status='processing';await assert.rejects(jobs.start('fixture','owner',input),/Finish analyzing/);
});
