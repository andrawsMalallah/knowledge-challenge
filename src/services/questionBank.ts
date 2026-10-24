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


export async function loadCategoryCatalog(): Promise<CategoryCatalog> {
  return parseCatalog(await getJson('/data/categories.json'));
}
async function loadCategoryQuestions(category: Category): Promise<Question[]> {
  if (!NORMAL_ID.test(category.id) || category.isPlayable === false) throw Error('التصنيف غير متاح للعب');
  const [main, subcategory]=category.id.split('/');
  const path=questionFile(main,subcategory);
  if (category.questionFile !== path) throw Error('مسار ملف الأسئلة لا يطابق التصنيف');
  const rows=parseQuestionFile(await getJson(path),main,subcategory) as Question[];
  const questions=rows.filter(question=>allowedDifficulty[question.points].includes(question.difficultyLevel));
  const issues=validateQuestions([category],questions,[]);
  if (issues.length) throw Error(issues.join('؛ '));
  assignBalanced([category],questions,()=>0.5);
  return questions;
}
export async function loadSelectedQuestions(selected: Category[]): Promise<Question[]> {
  if (new Set(selected.map(category=>category.id)).size !== selected.length) throw Error('تصنيفات مكررة');
  const questions: Question[]=[];
  for (const category of selected) questions.push(...await loadCategoryQuestions(category));
  const issues=validateQuestions(selected,questions,[]);
  if (issues.length) throw Error(issues.join('؛ '));
  return questions;
}
export async function loadTiebreakerQuestions(): Promise<TieQuestion[]> {
  const questions=parseQuestionFile(await getJson(TIE_FILE),'tiebreakers',null) as TieQuestion[];
  const issues=validateQuestions([],[],questions);
  if (issues.length) throw Error(issues.join('؛ '));
  return questions;
}
