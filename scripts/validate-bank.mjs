import {readFileSync,writeFileSync,readdirSync,lstatSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCategoryTree,parseQuestionFile,questionFile,TIE_FILE} from '../src/services/contentSchema.mjs';

const allowed={200:[1,2],400:[2,3],600:[3,4]};
/** Validate the editable catalog and one-file banks without rewriting source content. Empty banks are intentional. */
export function validateBank(root=process.cwd(),write=true){
  const errors=[];const warnings=[];const pools=[];const declared=new Set(['categories.json','questions/normal/.gitkeep','images/.gitkeep','audio/.gitkeep']);let categories=[];
  const dataRoot=resolve(root,'public/data');
  function read(path){
    try{
      const local=resolve(root,'public'+path);
      if(lstatSync(local).isSymbolicLink())throw Error('Symlinks are not allowed');
      if(lstatSync(local).size>25*1024*1024)throw Error('JSON exceeds 25 MiB');
      return JSON.parse(readFileSync(local,'utf8'));
    }catch(error){errors.push(path+': '+error.message);return undefined;}
  }
  try{categories=parseCategoryTree(read('/data/categories.json'));}catch(error){errors.push(error.message);}
  function pool(category,subcategory,tie=false){
    const path=tie?TIE_FILE:questionFile(category,subcategory);
    declared.add(path.slice('/data/'.length));
    const value=read(path);if(value===undefined)return;
    try{
      const rows=parseQuestionFile(value,category,subcategory);
      const eligible=tie?rows:rows.filter(question=>allowed[question.points].includes(question.difficultyLevel));
      const missing=tie?[]:[200,400,600].filter(points=>!allowed[points].some(level=>eligible.filter(question=>question.points===points&&question.difficultyLevel===level).length>=2));
      const playable=tie?rows.length>=10:missing.length===0;
      const entry={category,subcategory,total:rows.length,eligible:eligible.length,playable,tiebreaker:tie,missingPointPairs:missing};pools.push(entry);
      if(!playable)warnings.push(tie?'Tiebreaker pool needs 10 questions to support all attempt settings':category+'/'+subcategory+': insufficient balanced pairs at '+missing.join(', '));
      if(eligible.length!==rows.length)warnings.push(category+'/'+subcategory+': '+(rows.length-eligible.length)+' incompatible difficulty ratings excluded from play');
      const prompts=new Set();
      for(const question of rows){
        const prompt=question.question.normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/\s+/g,' ').trim();
        if(prompts.has(prompt))errors.push('Duplicate question prompt: '+question.id);prompts.add(prompt);
      }
    }catch(error){errors.push(path+': '+error.message);}
  }
  for(const category of categories)for(const subcategory of category.subcategories)pool(category.id,subcategory.id);
  pool('tiebreakers',null,true);
  function inspect(directory){
    if(!existsSync(directory))return;
    for(const entry of readdirSync(directory,{withFileTypes:true})){
      const path=resolve(directory,entry.name);const name=relative(dataRoot,path).replaceAll('\\','/');
      if(entry.isSymbolicLink()){errors.push('Symlink not allowed: '+name);continue;}
      if(entry.isDirectory())inspect(path);
      else if(!declared.has(name))errors.push('Unexpected or unlisted data file: '+name);
      else if(name.endsWith('/.gitkeep')&&lstatSync(path).size!==0)errors.push('Folder placeholders must be empty: '+name);
    }
  }
  inspect(dataRoot);
  const regular=pools.filter(pool=>!pool.tiebreaker);
  const report={categories:categories.length,subcategories:categories.reduce((count,category)=>count+category.subcategories.length,0),
    regularQuestions:regular.reduce((count,pool)=>count+pool.total,0),tiebreakers:pools.find(pool=>pool.tiebreaker)?.total??0,
    regularPools:regular.length,playablePools:regular.filter(pool=>pool.playable).length,
    playableRegularQuestions:regular.filter(pool=>pool.playable).reduce((count,pool)=>count+pool.eligible,0),
    errors,warnings,pools};
  if(write&&!errors.length){
    mkdirSync(resolve(root,'docs'),{recursive:true});
    writeFileSync(resolve(root,'docs/QUESTION_BANK_VALIDATION.json'),JSON.stringify(report,null,2)+'\n');
  }
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=validateBank(process.cwd(),!process.argv.includes('--check-only'));
  console.log(JSON.stringify(report,null,2));
  if(report.errors.length)process.exitCode=1;
}
