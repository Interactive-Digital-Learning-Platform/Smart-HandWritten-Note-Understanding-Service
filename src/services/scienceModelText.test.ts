import test from 'node:test';
import assert from 'node:assert/strict';
import {scienceModelText} from './scienceModelText';
const action='Add Benedict solution to the food sample.',heat='Heat the sample in a hot water bath.';
test('OCR blank lines within an explicit Benedict procedure are cleaned with exact original span mapping',()=>{
 const text='📖 Notes\n\n'+action+'\n\n\n'+heat+'\n\nA brick red precipitate indicates reducing sugar.';
 const prepared=scienceModelText(text,'sci-g10-cbl-007');assert.equal(prepared.changed,true);
 assert.ok(prepared.text.includes(action+'\n'+heat));
 const start=prepared.text.indexOf(action),end=prepared.text.indexOf(heat)+heat.length;
 const span=prepared.originalSpan(start,end);assert.equal(text.slice(span.start,span.end),action+'\n\n\n'+heat);
 const tail=prepared.text.indexOf('A brick');const mapped=prepared.originalSpan(tail,prepared.text.length);assert.equal(text.slice(mapped.start,mapped.end),'A brick red precipitate indicates reducing sugar.');
});
test('spacing cleanup does not cross different tests, headings, pages, negation or merely named reagents',()=>{
 for(const text of [action+'\n\nIodine test\n\n'+heat,action+'\n\n--- Page 2 ---\n\n'+heat,
   action+'\n\nProtein test:\n\n'+heat,action+'\n\nDo not heat the sample in a hot water bath.',
   'Benedict test\n\n'+heat,action+'\n\nHeat a different starch sample in a hot water bath.']){
   assert.equal(scienceModelText(text,'sci-g10-cbl-007').changed,false,text);
 }
 assert.equal(scienceModelText(action+'\n\n'+heat,'sci-g10-cur-006').changed,false);
});
