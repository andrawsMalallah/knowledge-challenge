import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBank, loadBank, publishBank, readReplacement, readGuideReplacement } from '../src/services/admin.ts';
import type { AdminBank } from '../src/types/admin.ts';

const bank: AdminBank = {
  categories:[{id:1,slug:'general',name:'عام'}],
  subcategories:[{id:1,category_id:1,slug:'mixed',name:'منوعات'}],
  questions:[{id:1,subcategory_id:1,type:'normal',points:200,difficultyLevel:1,question:'ما العاصمة؟',answer:'بغداد',format:'text',image_path:null,audio_path:null}]
};
test('validates table relationships, IDs, and duplicate prompts',()=>{
  assert.doesNotThrow(()=>validateBank(bank));
  assert.throws(()=>validateBank({...bank,questions:[...bank.questions,{...bank.questions[0],id:2,question:'ما العاصمة؟'}]}),/مكرر/);
  assert.throws(()=>validateBank({...bank,questions:[...bank.questions,{...bank.questions[0],id:2,subcategory_id:99}]}),/التصنيف/);
  assert.throws(()=>validateBank({...bank,questions:[...bank.questions,bank.questions[0]]}),/معرف/);
});
test('does not publish over a changed branch',async()=>{
  const previous=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({object:{sha:'new-head'}});};
  try {await assert.rejects(publishBank('test-token',{bank,guide:'old guide',head:'old-head',tree:'old-tree'},bank),/تغير المستودع/);assert.equal(calls,1);}
  finally {globalThis.fetch=previous;}
});
test('requires the exact original filename and a JSON array',async()=>{
  for (const [name,table] of [['categories.json','categories'],['subcategories.json','subcategories'],['questions.json','questions']] as const) {
    assert.deepEqual(await readReplacement(new File(['[]'],name),table),[]);
    await assert.rejects(readReplacement(new File(['[]'],'wrong.json'),table),/اسم الملف غير مطابق/);
    await assert.rejects(readReplacement(new File(['{}'],name),table),/مصفوفة/);
    await assert.rejects(readReplacement(new File(['bad'],name),table),/JSON/);
  }
});
test('publishes one changed table in one non-forced commit',async()=>{
  const previous=globalThis.fetch;const requests:{url:string;method:string;body:any}[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=String(input);const method=init?.method ?? 'GET';const body=init?.body?JSON.parse(String(init.body)):undefined;requests.push({url,method,body});
    if(url.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:'head'}});
    if(url.endsWith('/git/blobs'))return Response.json({sha:'new-blob'});
    if(url.endsWith('/git/trees'))return Response.json({sha:'new-tree'});
    if(url.endsWith('/git/commits'))return Response.json({sha:'new-commit'});
    if(url.endsWith('/git/refs/heads/main'))return Response.json({object:{sha:'new-commit'}});
    throw Error('Unexpected request');
  };
  try {
    const changed:AdminBank={...bank,questions:[...bank.questions,{...bank.questions[0],id:2,question:'سؤال جديد'}]};
    const result=await publishBank('test-token',{bank,guide:'old guide',head:'head',tree:'tree'},changed);
    assert.equal(result,'new-commit');
    const tree=requests.find(request=>request.url.endsWith('/git/trees'))!.body;
    assert.equal(tree.base_tree,'tree');assert.deepEqual(tree.tree.map((item:{path:string})=>item.path),['database/questions.json']);
    const blob=requests.find(request=>request.url.endsWith('/git/blobs'))!.body;
    assert.equal(JSON.parse(Buffer.from(blob.content,'base64').toString('utf8'))[1].question,'سؤال جديد');
    const update=requests.find(request=>request.url.endsWith('/git/refs/heads/main'))!.body;
    assert.deepEqual(update,{sha:'new-commit',force:false});
  } finally {globalThis.fetch=previous;}
});

test('guide upload requires its exact filename and non-empty content',async()=>{
  const guide='دليل الأسئلة\n';
  assert.equal(await readGuideReplacement(new File([guide],'QUESTION_BANK_GUIDE.md')),guide);
  await assert.rejects(readGuideReplacement(new File([guide],'guide.md')),/اسم الملف غير مطابق/);
  await assert.rejects(readGuideReplacement(new File(['  '],'QUESTION_BANK_GUIDE.md')),/فارغ/);
});
test('publishes the questions and guide together in the same tree',async()=>{
  const previous=globalThis.fetch;const requests:{url:string;body:any}[]=[];let counter=0;
  globalThis.fetch=async(input,init)=>{
    const url=String(input);const body=init?.body?JSON.parse(String(init.body)):undefined;requests.push({url,body});
    if(url.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:'head'}});
    if(url.endsWith('/git/blobs'))return Response.json({sha:`blob-${++counter}`});
    if(url.endsWith('/git/trees'))return Response.json({sha:'new-tree'});
    if(url.endsWith('/git/commits'))return Response.json({sha:'new-commit'});
    if(url.endsWith('/git/refs/heads/main'))return Response.json({object:{sha:'new-commit'}});
    throw Error('Unexpected request');
  };
  try {
    const changed:AdminBank={...bank,questions:[...bank.questions,{...bank.questions[0],id:2,question:'سؤال جديد'}]};
    await publishBank('test-token',{bank,guide:'old guide',head:'head',tree:'tree'},changed,'دليل جديد');
    const tree=requests.find(request=>request.url.endsWith('/git/trees'))!.body;
    assert.deepEqual(tree.tree.map((item:{path:string})=>item.path),['database/questions.json','database/QUESTION_BANK_GUIDE.md']);
    const contents=requests.filter(request=>request.url.endsWith('/git/blobs')).map(request=>Buffer.from(request.body.content,'base64').toString('utf8'));
    assert.ok(contents.includes('دليل جديد'));
    assert.equal(requests.filter(request=>request.url.endsWith('/git/refs/heads/main')).length,1);
  } finally {globalThis.fetch=previous;}
});
test('loads the current UTF-8 guide alongside the database',async()=>{
  const previous=globalThis.fetch;const entries=[['categories',bank.categories],['subcategories',bank.subcategories],['questions',bank.questions],['guide','دليل الأسئلة']];
  globalThis.fetch=async(input)=>{
    const url=String(input);
    if(url.endsWith('/knowledge-challenge'))return Response.json({default_branch:'main'});
    if(url.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:'head'}});
    if(url.endsWith('/git/commits/head'))return Response.json({tree:{sha:'tree'}});
    if(url.includes('/git/trees/tree'))return Response.json({truncated:false,tree:entries.map(([name])=>({path:name==='guide'?'database/QUESTION_BANK_GUIDE.md':`database/${name}.json`,sha:name,type:'blob'}))});
    if(url.includes('/git/blobs/')){
      const entry=entries.find(([name])=>url.endsWith(`/git/blobs/${name}`));if(!entry)throw Error('missing mock blob');
      const value=entry[0]==='guide'?String(entry[1]):JSON.stringify(entry[1]);
      return Response.json({encoding:'base64',content:Buffer.from(value,'utf8').toString('base64')});
    }
    throw Error('Unexpected request');
  };
  try {const snapshot=await loadBank('test-token');assert.equal(snapshot.guide,'دليل الأسئلة');assert.deepEqual(snapshot.bank,bank);}
  finally {globalThis.fetch=previous;}
});
test('loads the bank when the guide is absent on GitHub',async()=>{
  const previous=globalThis.fetch;const entries=[['categories',bank.categories],['subcategories',bank.subcategories],['questions',bank.questions]] as const;
  globalThis.fetch=async(input)=>{
    const url=String(input);
    if(url.endsWith('/knowledge-challenge'))return Response.json({default_branch:'main'});
    if(url.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:'head'}});
    if(url.endsWith('/git/commits/head'))return Response.json({tree:{sha:'tree'}});
    if(url.includes('/git/trees/tree'))return Response.json({truncated:false,tree:entries.map(([name])=>({path:`database/${name}.json`,sha:name,type:'blob'}))});
    if(url.includes('/git/blobs/')){const entry=entries.find(([name])=>url.endsWith(`/git/blobs/${name}`));if(!entry)throw Error('unexpected blob');return Response.json({encoding:'base64',content:Buffer.from(JSON.stringify(entry[1]),'utf8').toString('base64')});}
    throw Error('Unexpected request');
  };
  try{const snapshot=await loadBank('test-token');assert.equal(snapshot.guide,null);assert.deepEqual(snapshot.bank,bank);}
  finally{globalThis.fetch=previous;}
});
test('creates the guide in one commit when it was previously missing',async()=>{
  const previous=globalThis.fetch;let tree:any;
  globalThis.fetch=async(input,init)=>{
    const url=String(input);const body=init?.body?JSON.parse(String(init.body)):undefined;
    if(url.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:'head'}});
    if(url.endsWith('/git/blobs'))return Response.json({sha:'guide-blob'});
    if(url.endsWith('/git/trees')){tree=body;return Response.json({sha:'new-tree'});}
    if(url.endsWith('/git/commits'))return Response.json({sha:'new-commit'});
    if(url.endsWith('/git/refs/heads/main'))return Response.json({object:{sha:'new-commit'}});
    throw Error('Unexpected request');
  };
  try{await publishBank('test-token',{bank,guide:null,head:'head',tree:'tree'},bank,'دليل جديد');assert.deepEqual(tree.tree.map((item:{path:string})=>item.path),['database/QUESTION_BANK_GUIDE.md']);}
  finally{globalThis.fetch=previous;}
});

test('rejects pasted Arabic text before making a GitHub request',async()=>{
  const previous=globalThis.fetch;let called=false;
  globalThis.fetch=async()=>{called=true;throw Error('unexpected request');};
  try {
    await assert.rejects(loadBank('الملف غير موجود: database/QUESTION_BANK_GUIDE.md'),/النص المدخل ليس بصيغة رمز GitHub/);
    assert.equal(called,false);
  } finally {globalThis.fetch=previous;}
});
test('explains common GitHub and network errors without exposing token values',async()=>{
  const previous=globalThis.fetch;
  const cases=[
    {status:401,message:/غير صحيح أو منتهي الصلاحية/},
    {status:403,message:/صلاحية الرمز/},
    {status:404,message:/المستودع أو الملف/},
    {status:429,message:/حد طلبات GitHub/},
    {status:503,message:/غير متاحة مؤقتاً/},
  ];
  try {
    for(const entry of cases){
      globalThis.fetch=async()=>new Response('',{status:entry.status});
      await assert.rejects(loadBank('secret-token'),(error:Error)=>{assert.match(error.message,entry.message);assert.ok(!error.message.includes('secret-token'));return true;});
    }
    globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
    await assert.rejects(loadBank('secret-token'),/تحقق من اتصال الإنترنت/);
    globalThis.fetch=async()=>new Response('',{status:403,headers:{'x-ratelimit-remaining':'0'}});
    await assert.rejects(loadBank('secret-token'),/حد طلبات GitHub/);
  } finally {globalThis.fetch=previous;}
});
