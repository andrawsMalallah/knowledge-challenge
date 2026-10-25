import test from 'node:test';
import assert from 'node:assert/strict';
import {compileDatabase} from './database.mjs';
const categories=[{id:1,slug:'general',name:'معلومات عامة'}];
const subcategories=[{id:10,category_id:1,slug:'mixed',name:'منوعات'}];
const question=id=>({id,subcategory_id:10,type:'normal',points:200,difficultyLevel:1,question:`سؤال ${id}`,answer:'إجابة',format:'text',image_path:null,audio_path:null});
test('empty tables and pools remain valid but non-playable',()=>{
  const empty=compileDatabase([],[],[]);assert.equal(empty.report.categories,0);assert.equal(empty.report.tiebreakers,0);
  const {files,report}=compileDatabase(categories,subcategories,[]);
  assert.equal(report.playablePools,0);assert.equal(files.get('/data/questions/normal/general/mixed/questions.json').totalQuestions,0);
});
test('foreign keys and globally unique question IDs are enforced',()=>{
  assert.throws(()=>compileDatabase(categories,[{...subcategories[0],category_id:99}],[]),/category_id/);
  assert.throws(()=>compileDatabase(categories,subcategories,[{...question(1),subcategory_id:99}]),/subcategory_id/);
  assert.throws(()=>compileDatabase(categories,subcategories,[question(1),{...question(1),type:'tiebreaker',subcategory_id:null,points:0,difficultyLevel:4}]),/primary key/);
  assert.throws(()=>compileDatabase(categories,[subcategories[0],{...subcategories[0],id:11}],[]));
});
test('normal and tiebreaker constraints remain enforced',()=>{
  assert.throws(()=>compileDatabase(categories,subcategories,[{...question(1),type:'tiebreaker'}]),/null/);
  assert.throws(()=>compileDatabase(categories,subcategories,[{...question(1),question:'English'}]));
  assert.throws(()=>compileDatabase(categories,subcategories,[{...question(1),format:'image',image_path:'/images/questions/a.png'}]));
  const {files}=compileDatabase(categories,subcategories,[{...question(1),type:'tiebreaker',subcategory_id:null,points:0,difficultyLevel:4}]);
  assert.equal(files.get('/data/questions/tiebreaker/questions.json').totalQuestions,1);
});
test('large pools split without dropping, renumbering, or duplicating questions',()=>{
  const rows=Array.from({length:25001},(_,index)=>question(index+1));
  const {files,report}=compileDatabase(categories,subcategories,rows);
  const prefix='/data/questions/normal/general/mixed/';const manifest=files.get(prefix+'questions.json');
  assert.equal(manifest.chunks.length,26);assert.equal(report.regularQuestions,25001);
  const restored=manifest.chunks.flatMap(name=>files.get(prefix+name).questions);
  assert.deepEqual(restored.map(row=>row.id),rows.map(row=>row.id));
  assert.ok(manifest.chunks.every(name=>files.get(prefix+name).questions.length<=1000));
});
test('normalized duplicate prompts across chunk boundaries are rejected',()=>{
  const rows=Array.from({length:1001},(_,index)=>question(index+1));rows[1000].question=rows[0].question;
  assert.throws(()=>compileDatabase(categories,subcategories,rows),/Duplicate question/);
});
