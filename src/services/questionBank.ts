import type { Category, Question, TieQuestion } from '../types/game';
import { assignBalanced, validateQuestions } from '../engine/assignment';
import type { CategoryCatalog } from '../types/catalog';
import { allowedDifficulty } from '../engine/rules';
import { parseCatalog } from './categoryCatalog';
import { NORMAL_ID, parseQuestionFile, questionFile, TIE_FILE } from './contentSchema.mjs';

const MAX_JSON_BYTES = 25 * 1024 * 1024;
async function getJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`تعذر تحميل ملف الأسئلة: ${path}`);
  if (Number(response.headers.get('content-length')) > MAX_JSON_BYTES) throw new Error('ملف البيانات أكبر من الحد المسموح');
  if (!response.body) throw new Error('ملف بيانات فارغ');
  const reader=response.body.getReader();
  const decoder=new TextDecoder('utf-8',{fatal:true});
  const chunks:string[]=[];
  let size=0;
  try {
    while(true){
      const chunk=await reader.read();
      if(chunk.done)break;
      size+=chunk.value.byteLength;
      if(size>MAX_JSON_BYTES)throw new Error('ملف البيانات أكبر من الحد المسموح');
      chunks.push(decoder.decode(chunk.value,{stream:true}));
    }
    chunks.push(decoder.decode());
    return JSON.parse(chunks.join('')) as unknown;
  } finally { await reader.cancel(); }
}


/** Large pools use a manifest of bounded, same-directory chunks. */
async function loadPool(path:string, category:string, subcategory:string|null):Promise<(Question|TieQuestion)[]> {
  const value=await getJson(path);
  if (!value || typeof value!=='object' || !('chunks' in value)) return parseQuestionFile(value,category,subcategory);
  const manifest=value as Record<string,unknown>;
  if (Object.keys(manifest).some(key=>!['category','subcategory','totalQuestions','chunks'].includes(key)) ||
      manifest.category!==category || manifest.subcategory!==subcategory ||
      !Number.isSafeInteger(manifest.totalQuestions) || (manifest.totalQuestions as number)<1 ||
      !Array.isArray(manifest.chunks) || manifest.chunks.length===0 || manifest.chunks.length>10000 ||
      !manifest.chunks.every((name,index)=>name===`part-${index+1}.json`)) throw Error('فهرس أجزاء الأسئلة غير صالح');
  const questions:(Question|TieQuestion)[]=[];
  const identities=new Set<string>();
  for (const name of manifest.chunks) {
    const rows=parseQuestionFile(await getJson(path.replace('questions.json',name)),category,subcategory);
    for (const question of rows) {
      if(identities.has(question.id))throw Error('معرّف سؤال مكرر بين الأجزاء');
      identities.add(question.id);questions.push(question);
    }
  }
  if(questions.length!==manifest.totalQuestions)throw Error('عدد الأسئلة لا يطابق الفهرس');
  return questions;
}

export async function loadCategoryCatalog(): Promise<CategoryCatalog> {
  return parseCatalog(await getJson('/data/categories.json'));
}
async function loadCategoryQuestions(category: Category): Promise<Question[]> {
  if (!NORMAL_ID.test(category.id) || category.isPlayable === false) throw Error('التصنيف غير متاح للعب');
  const [main, subcategory]=category.id.split('/');
  const path=questionFile(main,subcategory);
  if (category.questionFile !== path) throw Error('مسار ملف الأسئلة لا يطابق التصنيف');
  const rows=await loadPool(path,main,subcategory) as Question[];
  const questions=rows.filter(question=>allowedDifficulty[question.points].includes(question.difficultyLevel));
  const issues=validateQuestions([category],questions,[]);
  if (issues.length) throw Error(issues.join('؛ '));
  assignBalanced([category],questions,()=>0.5);
  return questions;
}
export async function loadSelectedQuestions(selected: Category[]): Promise<Question[]> {
  if (new Set(selected.map(category=>category.id)).size !== selected.length) throw Error('تصنيفات مكررة');
  const questions: Question[]=[];
  for (const category of selected) {
    for (const question of await loadCategoryQuestions(category)) questions.push(question);
  }
  const issues=validateQuestions(selected,questions,[]);
  if (issues.length) throw Error(issues.join('؛ '));
  return questions;
}
export async function loadTiebreakerQuestions(): Promise<TieQuestion[]> {
  const questions=await loadPool(TIE_FILE,'tiebreakers',null) as TieQuestion[];
  const issues=validateQuestions([],[],questions);
  if (issues.length) throw Error(issues.join('؛ '));
  return questions;
}
