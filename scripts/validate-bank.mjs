import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDatabase} from './database.mjs';
export function validateBank(root=process.cwd(),write=true){
  try{
    const {report}=readDatabase(root);
    if(write){mkdirSync(resolve(root,'docs'),{recursive:true});writeFileSync(resolve(root,'docs/QUESTION_BANK_VALIDATION.json'),JSON.stringify(report,null,2)+'\n');}
    return report;
  }catch(error){return {errors:[error.message],warnings:[]};}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=validateBank(process.cwd(),!process.argv.includes('--check-only'));
  console.log(JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;
}
