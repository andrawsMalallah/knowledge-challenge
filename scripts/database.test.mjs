import test from 'node:test';
import assert from 'node:assert/strict';
import {compileDatabase} from './database.mjs';
import {buildQuestionList,formatInspection,inspectMigration,validateBatchFilenameAndRows,validateQuestionRow} from './migrate-questions.mjs';
const categories=[{id:1,slug:'general',name:'معلومات عامة'}];
const subcategories=[{id:10,category_id:1,slug:'mixed',name:'منوعات'}];
const question=id=>({id,subcategory_id:10,type:'normal',points:200,difficultyLevel:1,question:`سؤال ${id}`,answer:'إجابة',format:'text',image_path:null,audio_path:null});
test('empty tables and pools remain valid but non-playable',()=>{
  const empty=compileDatabase([],[],[]);assert.equal(empty.report.categories,0);assert.equal(empty.report.tiebreakers,0);
  const {files,report}=compileDatabase(categories,subcategories,[]);
  assert.equal(report.playablePools,0);assert.equal(files.get('/data/questions/normal/general/mixed/questions.json').totalQuestions,0);
  assert.equal(files.get('/data/categories.json').categories[0].subcategories[0].questionCount,0);
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
  assert.doesNotThrow(()=>compileDatabase(categories,subcategories,[{...question(1),question:'سؤال لـ«أفاتار»'}]));
});
test('generated catalog exposes only eligible questions in each subcategory count',()=>{
  const rows=[question(1),{...question(2),difficultyLevel:5}];
  const {files}=compileDatabase(categories,subcategories,rows);
  assert.equal(files.get('/data/categories.json').categories[0].subcategories[0].questionCount,1);
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

test('migrated question list contains every normal and tiebreaker question',()=>{
  const questions=[
    question(1),
    {...question(2),type:'tiebreaker',subcategory_id:null,points:0,difficultyLevel:5},
  ];
  const list=buildQuestionList(categories,subcategories,questions);
  assert.match(list,/Total migrated questions: \*\*2\*\* \(1 normal, 1 tiebreakers\)/);
  assert.match(list,/Question IDs: \*\*1-2\*\*\. Next available ID: \*\*3\*\*/);
  assert.match(list,/Playable subcategories: \*\*0\/1\*\*/);
  assert.match(list,/\| 1 \| 200 \| 1 \| سؤال 1 \| إجابة \|/);
  assert.match(list,/\| 2 \| 5 \| سؤال 2 \| إجابة \|/);
});

test('migration batch filename identifies the related category and subcategory',()=>{
  const result=validateBatchFilenameAndRows('general_mixed_001.json',[question(1)],categories,subcategories);
  assert.equal(result.batchNumber,1);
  assert.equal(result.category.id,1);
  assert.equal(result.subcategory.id,10);
});

test('migration rejects malformed or mismatched batch filenames',()=>{
  assert.throws(()=>validateBatchFilenameAndRows('general-mixed-001.json',[question(1)],categories,subcategories),/expected/);
  assert.throws(()=>validateBatchFilenameAndRows('general_mixed_000.json',[question(1)],categories,subcategories),/positive/);
  assert.throws(()=>validateBatchFilenameAndRows('missing_mixed_001.json',[question(1)],categories,subcategories),/unknown category/);
  assert.throws(()=>validateBatchFilenameAndRows('general_missing_001.json',[question(1)],categories,subcategories),/not a subcategory/);
  assert.throws(()=>validateBatchFilenameAndRows('general_mixed_001.json',[{...question(1),subcategory_id:99}],categories,subcategories),/subcategory_id 10/);
});

test('migration quality feedback identifies the exact invalid character and row',()=>{
  const errors=validateQuestionRow({...question(1722),question:'سؤال Avatar'},{
    filename:'movies_avatar_001.json',
    rowNumber:2,
    subcategoryId:10,
  });
  assert.equal(errors.length,1);
  assert.match(errors[0],/row 2 \(id 1722\), question/);
  assert.match(errors[0],/"A" \(U\+0041\)/);
  assert.match(errors[0],/Arabic wording/);
});

test('migration report explains that failures make no changes',()=>{
  const output=formatInspection({
    files:[{filename:'general_mixed_001.json',total:1,normal:1,tiebreakers:0,tiers:{200:1,400:0,600:0},errors:['problem']}],
    errors:['general_mixed_001.json: problem'],
    incomingQuestions:[question(1)],
  });
  assert.match(output,/\[FAIL\].*normal tiers: 200=1, 400=0, 600=0/);
  assert.match(output,/Nothing was migrated/);
  assert.match(output,/npm run migrate:questions:check/);
});

test('migration explains when the project questions folder was moved or removed',()=>{
  const report=inspectMigration('__definitely_missing_knowledge_challenge_root__');
  assert.deepEqual(report.errors,[
    'questions: folder not found in the project. Restore it at <project>/questions before running question migration.',
  ]);
  assert.match(formatInspection(report),/Nothing was migrated/);
});
