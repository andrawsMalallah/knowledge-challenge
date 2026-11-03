import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compileDatabase} from './database.mjs';
import {buildQuestionList} from '../src/services/questionGuide.mjs';
import {generateGuide} from './generate-guide.mjs';
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
  assert.doesNotThrow(()=>compileDatabase(categories,subcategories,[{...question(1),question:'ما اسم لعبة Minecraft؟',answer:'Minecraft'}]));
  assert.throws(()=>compileDatabase(categories,subcategories,[{...question(1),question:'漢字'}]));
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

test('generated question list contains every normal and tiebreaker question',()=>{
  const questions=[
    question(1),
    {...question(2),type:'tiebreaker',subcategory_id:null,points:0,difficultyLevel:5},
  ];
  const list=buildQuestionList(categories,subcategories,questions);
  assert.match(list,/Question Generation Handoff/);
  assert.match(list,/Expansion and research policy/);
  assert.match(list,/Current Question Bank/);
  assert.match(list,/Total questions: \*\*2\*\* \(1 normal, 1 tiebreakers\)/);
  assert.match(list,/Highest question ID: \*\*2\*\*\. Next available ID: \*\*3\*\*/);
  assert.match(list,/Playable subcategories: \*\*0\/1\*\*/);
  assert.match(list,/\| 1 \| 200 \| 1 \| سؤال 1 \| إجابة \|/);
  assert.match(list,/\| 2 \| 5 \| سؤال 2 \| إجابة \|/);
});

test('catalog follows uploaded names, slugs, and empty subcategories', () => {
  const list = buildQuestionList(
    [{ id: 7, slug: 'updated', name: 'اسم جديد' }],
    [{ id: 20, category_id: 7, slug: 'empty', name: 'فرع فارغ' }],
    [],
  );
  assert.match(list, /Category 7: اسم جديد/);
  assert.match(list, /Slug: `updated`/);
  assert.match(list, /\| 20 \| فرع فارغ \| `empty` \|/);
  assert.match(list, /Highest question ID: \*\*0\*\*/);
  assert.doesNotMatch(list, /Category 1: معلومات عامة/);
});

test('guide escapes table cells and sorts questions without mutating input', () => {
  const rows = [question(9), { ...question(3), question: 'سؤال | جديد\nآخر' }];
  const before = structuredClone(rows);
  const list = buildQuestionList(categories, subcategories, rows);
  assert.ok(list.includes('سؤال \\| جديد آخر'));
  assert.ok(list.indexOf('| 3 | 200') < list.indexOf('| 9 | 200'));
  assert.match(list, /Next available ID: \*\*10\*\*/);
  assert.deepEqual(rows, before);
});

test('local generation only writes the guide and read-only checks detect stale content', context => {
  const root = mkdtempSync(join(tmpdir(), 'trivia-guide-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'database'));
  const sources = { categories, subcategories, questions: [question(1)] };
  for (const [name, rows] of Object.entries(sources)) {
    writeFileSync(join(root, 'database', `${name}.json`), JSON.stringify(rows));
  }
  const guidePath = join(root, 'database', 'QUESTION_BANK_GUIDE.md');
  assert.deepEqual(generateGuide(root, { check: true }), { upToDate: false, written: false });
  assert.equal(existsSync(guidePath), false);
  assert.equal(generateGuide(root).written, true);
  assert.equal(generateGuide(root, { check: true }).upToDate, true);
  const expected = buildQuestionList(categories, subcategories, sources.questions);
  assert.equal(readFileSync(guidePath, 'utf8'), expected);
  writeFileSync(guidePath, expected.replaceAll('\n', '\r\n'));
  assert.equal(generateGuide(root, { check: true }).upToDate, true);
  writeFileSync(guidePath, 'stale');
  assert.equal(generateGuide(root, { check: true }).upToDate, false);
  assert.equal(readFileSync(guidePath, 'utf8'), 'stale');
  generateGuide(root);
  for (const [name, rows] of Object.entries(sources)) {
    assert.equal(readFileSync(join(root, 'database', `${name}.json`), 'utf8'), JSON.stringify(rows));
  }
  writeFileSync(join(root, 'database', 'questions.json'), JSON.stringify([question(1), question(1)]));
  assert.throws(() => generateGuide(root), /primary key/);
  assert.equal(readFileSync(guidePath, 'utf8'), expected);
  assert.equal(existsSync(join(root, 'questions')), false);
});
