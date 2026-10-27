import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyQuestionHistory,
  markQuestionUsed,
  parseQuestionHistory,
  resetQuestionPools,
} from '../src/services/questionHistory.mjs';

test('question history starts empty and records a question only once',()=>{
  const empty=emptyQuestionHistory();
  const used=markQuestionUsed(empty,'normal/movies/avatar/1');
  assert.deepEqual(used,{version:1,used:['normal/movies/avatar/1']});
  assert.deepEqual(markQuestionUsed(used,'normal/movies/avatar/1'),used);
});

test('question history resets only the exhausted pool IDs',()=>{
  const history=parseQuestionHistory({version:1,used:[
    'normal/movies/avatar/1',
    'normal/movies/avatar/2',
    'normal/movies/titanic/3',
    'tiebreakers/4',
  ]});
  assert.deepEqual(resetQuestionPools(history,[
    'normal/movies/avatar/1',
    'normal/movies/avatar/2',
  ]),{version:1,used:['normal/movies/titanic/3','tiebreakers/4']});
});

test('question history rejects malformed, duplicate, or unbounded IDs',()=>{
  assert.throws(()=>parseQuestionHistory({version:2,used:[]}),/غير صالح/);
  assert.throws(()=>parseQuestionHistory({version:1,used:['bad id']}),/غير صالح/);
  assert.throws(()=>parseQuestionHistory({version:1,used:['tiebreakers/1','tiebreakers/1']}),/غير صالح/);
  assert.throws(()=>markQuestionUsed(emptyQuestionHistory(),'normal/movies/avatar/0'),/غير صالح/);
});
