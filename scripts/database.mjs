import {readFileSync,writeFileSync,mkdirSync,cpSync,rmSync,lstatSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {parseCategoryTree,parseQuestionFile,questionFile,TIE_FILE} from '../src/services/contentSchema.mjs';

const allowed={200:[1,2],400:[2,3],600:[3,4]};
const chunkSize=1000;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function table(rows,fields,name){
  if(!Array.isArray(rows))throw Error(`${name} must be an array`);
  const ids=new Set();
  for(const row of rows){
    if(!object(row)||!Number.isSafeInteger(row.id)||row.id<1||ids.has(row.id))throw Error(`${name}: invalid or duplicate primary key`);
    if(Object.keys(row).some(key=>!fields.includes(key)))throw Error(`${name}: unexpected field on ${row.id}`);
    ids.add(row.id);
  }
}
/** Normalize relational source tables to the existing runtime contract; saved identities stay unchanged. */
export function compileDatabase(categories,subcategories,questions){
  table(categories,['id','slug','name'],'categories');
  table(subcategories,['id','category_id','slug','name'],'subcategories');
  table(questions,['id','subcategory_id','type','points','difficultyLevel','question','answer','format','image_path','audio_path','image_alt'],'questions');
  const categoryMap=new Map(categories.map(row=>[row.id,{id:row.slug,name:row.name,subcategories:[]}]));
  const subcategoryMap=new Map();
  for(const row of subcategories){
    const parent=categoryMap.get(row.category_id);
    if(!parent)throw Error(`Subcategory ${row.id}: unknown category_id`);
    parent.subcategories.push({id:row.slug,name:row.name});
    subcategoryMap.set(row.id,{category:parent.id,subcategory:row.slug,questions:[]});
  }
  const catalog={categories:[...categoryMap.values()]};
  parseCategoryTree(catalog);
  const tie={category:'tiebreakers',subcategory:null,questions:[]};
  for(const row of questions){
    let pool;
    if(row.type==='tiebreaker'){
      if(row.subcategory_id!==null)throw Error(`Question ${row.id}: tiebreaker subcategory_id must be null`);
      pool=tie;
    }else if(row.type==='normal'){
      pool=subcategoryMap.get(row.subcategory_id);
      if(!pool)throw Error(`Question ${row.id}: unknown subcategory_id`);
    }else throw Error(`Question ${row.id}: invalid type`);
    const {type,subcategory_id,...content}=row;
    pool.questions.push(content);
  }
  const files=new Map([['/data/categories.json',catalog]]);const pools=[];const warnings=[];
  for(const pool of [...subcategoryMap.values(),tie]){
    const isTie=pool===tie;
    const path=isTie?TIE_FILE:questionFile(pool.category,pool.subcategory);
    const prompts=new Set();const counts=new Map();let eligible=0;
    // Each generated payload remains bounded by the browser's existing parser limits.
    const chunks=[];
    for(let offset=0;offset<pool.questions.length;offset+=chunkSize){
      const rows=pool.questions.slice(offset,offset+chunkSize);
      const payload={category:pool.category,subcategory:pool.subcategory,totalQuestions:rows.length,questions:rows};
      const parsed=parseQuestionFile(payload,pool.category,pool.subcategory);
      for(const question of parsed){
        const prompt=question.question.normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/\s+/g,' ').trim();
        if(prompts.has(prompt))throw Error(`Duplicate question prompt: ${question.id}`);
        prompts.add(prompt);
        if(isTie||allowed[question.points].includes(question.difficultyLevel)){
          eligible++;const key=`${question.points}/${question.difficultyLevel}`;counts.set(key,(counts.get(key)??0)+1);
        }
      }
      if(Buffer.byteLength(JSON.stringify(payload))>25*1024*1024)throw Error(`Generated chunk exceeds 25 MiB: ${path}`);
      chunks.push(payload);
    }
    if(chunks.length<=1)files.set(path,chunks[0]??{category:pool.category,subcategory:pool.subcategory,totalQuestions:0,questions:[]});
    else{
      const names=chunks.map((payload,index)=>{
        const name=`part-${index+1}.json`;files.set(path.replace('questions.json',name),payload);return name;
      });
      files.set(path,{category:pool.category,subcategory:pool.subcategory,totalQuestions:pool.questions.length,chunks:names});
    }
    const missing=isTie?[]:[200,400,600].filter(points=>!allowed[points].some(level=>(counts.get(`${points}/${level}`)??0)>=2));
    const playable=isTie?pool.questions.length>=10:missing.length===0;
    pools.push({category:pool.category,subcategory:pool.subcategory,total:pool.questions.length,eligible,playable,tiebreaker:isTie,missingPointPairs:missing});
    if(!playable)warnings.push(isTie?'Tiebreaker pool needs 10 questions to support all attempt settings':`${pool.category}/${pool.subcategory}: insufficient balanced pairs at ${missing.join(', ')}`);
    if(eligible!==pool.questions.length)warnings.push(`${path}: ${pool.questions.length-eligible} incompatible difficulty ratings excluded from play`);
  }
  const regular=pools.filter(pool=>!pool.tiebreaker);
  return {files,report:{categories:categories.length,subcategories:subcategories.length,regularQuestions:questions.length-tie.questions.length,tiebreakers:tie.questions.length,regularPools:regular.length,playablePools:regular.filter(pool=>pool.playable).length,playableRegularQuestions:regular.filter(pool=>pool.playable).reduce((sum,pool)=>sum+pool.eligible,0),errors:[],warnings,pools}};
}
export function readDatabase(root=process.cwd()){
  const tables=['categories','subcategories','questions'].map(name=>{
    const path=resolve(root,'database',`${name}.json`);
    if(lstatSync(path).isSymbolicLink())throw Error('Database symlinks are not allowed');
    return JSON.parse(readFileSync(path,'utf8'));
  });
  return compileDatabase(...tables);
}
function rejectSymlinks(directory){
  if(lstatSync(directory).isSymbolicLink())throw Error(`Asset symlinks are not allowed: ${directory}`);
  for(const entry of readdirSync(directory,{withFileTypes:true})){
    if(entry.isSymbolicLink())throw Error(`Asset symlinks are not allowed: ${entry.name}`);
    if(entry.isDirectory())rejectSymlinks(resolve(directory,entry.name));
  }
}
/** Only this disposable generated directory is replaced, never database/ or storage/. */
export function preparePublic(root=process.cwd()){
  const compiled=readDatabase(root);
  for(const directory of ['public','storage'])rejectSymlinks(resolve(root,directory));
  const generated=resolve(root,'.generated');const target=resolve(generated,'public');
  try {if(lstatSync(generated).isSymbolicLink())throw Error('Generated directory cannot be a symlink');}catch(error){if(error.code!=='ENOENT')throw error;}
  rmSync(target,{recursive:true,force:true});mkdirSync(target,{recursive:true});
  cpSync(resolve(root,'public'),target,{recursive:true});
  cpSync(resolve(root,'storage/images'),resolve(target,'images'),{recursive:true,filter:path=>!path.endsWith('.gitkeep')});
  cpSync(resolve(root,'storage/audio'),resolve(target,'audio'),{recursive:true,filter:path=>!path.endsWith('.gitkeep')});
  for(const [url,payload] of compiled.files){
    const path=resolve(target,'.'+url);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(payload)+'\n');
  }
  return compiled.report;
}
