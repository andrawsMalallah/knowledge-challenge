import { parseCategoryTree, parseQuestionFile } from './contentSchema.mjs';
import type { AdminBank, AdminCategory, AdminQuestion, AdminSubcategory } from '../types/admin';

const repository = 'andrawsMalallah/knowledge-challenge';
const paths = ['database/categories.json', 'database/subcategories.json', 'database/questions.json'] as const;
const api = `https://api.github.com/repos/${repository}`;
type GitTree = { path: string; sha: string; type: string }[];
export type Snapshot = { bank: AdminBank; guide: string | null; head: string; tree: string };

export function validateGitHubToken(token:string):void {
  if (!token.trim()) throw new Error('أدخل رمز GitHub للمتابعة.');
  // HTTP headers cannot carry Arabic text, spaces, or control characters.
  if (!/^[\x21-\x7e]+$/.test(token.trim())) throw new Error('النص المدخل ليس بصيغة رمز GitHub. انسخ الرمز من GitHub وألصقه دون مسافات أو نص إضافي.');
}
async function github<T>(token: string, path: string, options: RequestInit = {}): Promise<T> {
  validateGitHubToken(token);
  let response:Response;
  try {
    response = await fetch(`${api}${path}`, { ...options, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers } });
  } catch {
    throw new Error('تعذر الاتصال بـ GitHub. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.');
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error('رمز GitHub غير صحيح أو منتهي الصلاحية. تحقق منه أو أنشئ رمزاً جديداً.');
    if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) throw new Error('تم تجاوز حد طلبات GitHub مؤقتاً. انتظر قليلاً ثم حاول مرة أخرى.');
    if (response.status === 403) throw new Error('رفض GitHub الطلب. تحقق من صلاحية الرمز للوصول إلى المستودع وتعديل محتواه، ومن إعدادات حماية الفرع.');
    if (response.status === 404) throw new Error('تعذر العثور على المستودع أو الملف المطلوب. تأكد من اسم المستودع ومن أن الرمز لديه صلاحية الوصول إليه.');
    if (response.status === 409 || response.status === 422) throw new Error('تعذر حفظ التغييرات بسبب تعارض أو رفض من GitHub. أعد تحميل الملفات وتحقق من إعدادات المستودع.');
    if (response.status >= 500) throw new Error('خدمة GitHub غير متاحة مؤقتاً. حاول مرة أخرى لاحقاً.');
    throw new Error(`تعذر إكمال طلب GitHub (رمز الخطأ ${response.status}). حاول مرة أخرى.`);
  }
  try { return await response.json() as T; }
  catch { throw new Error('تعذر قراءة استجابة GitHub. حاول مرة أخرى.'); }
}
function decodeBase64(value: string): string {
  const bytes = Uint8Array.from(atob(value.replace(/\s/g, '')), character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
export async function loadBank(token: string): Promise<Snapshot> {
  const repo = await github<{default_branch:string}>(token, '');
  if (repo.default_branch !== 'main') throw new Error('الفرع الافتراضي ليس main؛ تحقق من إعدادات المستودع.');
  const reference = await github<{object:{sha:string}}>(token, '/git/ref/heads/main');
  const commit = await github<{tree:{sha:string}}>(token, `/git/commits/${reference.object.sha}`);
  const tree = await github<{tree:GitTree;truncated:boolean}>(token, `/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated) throw new Error('تعذر قراءة شجرة المستودع كاملة.');
  const tables = await Promise.all(paths.map(async path => {
    const entry = tree.tree.find(item => item.path === path && item.type === 'blob');
    if (!entry) throw new Error(`الملف غير موجود: ${path}`);
    const blob = await github<{content:string;encoding:string}>(token, `/git/blobs/${entry.sha}`);
    if (blob.encoding !== 'base64') throw new Error(`تعذر قراءة ${path}`);
    return JSON.parse(decodeBase64(blob.content)) as unknown;
  }));
  const guideEntry = tree.tree.find(item => item.path === 'database/QUESTION_BANK_GUIDE.md' && item.type === 'blob');
  let guide:string | null = null;
  if (guideEntry) {
    const guideBlob = await github<{content:string;encoding:string}>(token, `/git/blobs/${guideEntry.sha}`);
    if (guideBlob.encoding !== 'base64') throw new Error('تعذر قراءة دليل الأسئلة');
    guide = decodeBase64(guideBlob.content);
  }
  const bank = { categories: tables[0] as AdminCategory[], subcategories: tables[1] as AdminSubcategory[], questions: tables[2] as AdminQuestion[] };
  validateBank(bank);
  return { bank, guide, head: reference.object.sha, tree: commit.tree.sha };
}
export function validateBank(bank: AdminBank): void {
  const validTable = (rows: unknown, fields: string[], name: string) => {
    if (!Array.isArray(rows)) throw new Error(`${name}: يجب أن يكون مصفوفة`);
    const ids = new Set<number>();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || !Number.isSafeInteger(row.id) || row.id < 1 || ids.has(row.id)) throw new Error(`${name}: معرف مكرر أو غير صالح`);
      if (Object.keys(row).some(key => !fields.includes(key))) throw new Error(`${name}: حقل غير معروف في ${row.id}`);
      ids.add(row.id);
    }
  };
  validTable(bank.categories, ['id','slug','name'], 'التصنيفات');
  validTable(bank.subcategories, ['id','category_id','slug','name'], 'التصنيفات الفرعية');
  validTable(bank.questions, ['id','subcategory_id','type','points','difficultyLevel','question','answer','format','image_path','audio_path','image_alt'], 'الأسئلة');
  const catalog = bank.categories.map(category => ({ id:category.slug, name:category.name, subcategories:bank.subcategories.filter(sub => sub.category_id === category.id).map(sub => ({id:sub.slug,name:sub.name})) }));
  parseCategoryTree({categories:catalog});
  for (const sub of bank.subcategories) if (!bank.categories.some(category => category.id === sub.category_id)) throw new Error(`التصنيف الفرعي ${sub.id}: التصنيف الرئيسي غير موجود`);
  const pools = new Map<string, AdminQuestion[]>();
  for (const row of bank.questions) {
    let key: string;
    if (row.type === 'tiebreaker' && row.subcategory_id === null) key = 'tiebreakers';
    else if (row.type === 'normal' && bank.subcategories.some(sub => sub.id === row.subcategory_id)) key = String(row.subcategory_id);
    else throw new Error(`السؤال ${row.id}: النوع أو التصنيف غير صالح`);
    const pool = pools.get(key) ?? []; pool.push(row); pools.set(key, pool);
  }
  for (const [key, rows] of pools) {
    const sub = bank.subcategories.find(item => String(item.id) === key);
    const category = sub && bank.categories.find(item => item.id === sub.category_id);
    const categorySlug = category?.slug ?? 'tiebreakers'; const subSlug = sub?.slug ?? null;
    const prompts = new Set<string>();
    for (const row of rows) {
      const normalized = typeof row.question === 'string' ? row.question.normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/\s+/g, ' ').trim() : '';
      if (prompts.has(normalized)) throw new Error(`السؤال ${row.id}: نص مكرر`);
      prompts.add(normalized);
    }
    for (let offset = 0; offset < rows.length; offset += 1000) {
      const chunk = rows.slice(offset, offset + 1000).map(({type: _type, subcategory_id: _subcategoryId, ...row}) => row);
      parseQuestionFile({category:categorySlug,subcategory:subSlug,totalQuestions:chunk.length,questions:chunk}, categorySlug, subSlug);
    }
  }
}
export async function publishBank(token:string, snapshot:Snapshot, bank:AdminBank, guide:string | null = snapshot.guide):Promise<string> {
  validateBank(bank);
  const current = await github<{object:{sha:string}}>(token, '/git/ref/heads/main');
  if (current.object.sha !== snapshot.head) throw new Error('تغير المستودع منذ تحميله. نزّل ملفات المسودة ثم أعد التحميل لتجنب فقدان التغييرات.');
  const data = [bank.categories, bank.subcategories, bank.questions];
  const original = [snapshot.bank.categories, snapshot.bank.subcategories, snapshot.bank.questions];
  const changed: {path:string;content:string;unchanged:boolean}[] = data.map((rows,index)=>({path:paths[index],content:JSON.stringify(rows,null,2)+'\n',unchanged:JSON.stringify(rows)===JSON.stringify(original[index])})).filter(entry=>!entry.unchanged);
  if (guide !== null && guide !== snapshot.guide) changed.push({path:'database/QUESTION_BANK_GUIDE.md',content:guide,unchanged:false});
  if (!changed.length) throw new Error('لا توجد تغييرات للنشر');
  const changes = await Promise.all(changed.map(async ({path,content}) => {
    const blob = await github<{sha:string}>(token, '/git/blobs', {method:'POST',body:JSON.stringify({content:encodeBase64(content),encoding:'base64'})});
    return {path,mode:'100644',type:'blob',sha:blob.sha};
  }));
  const tree = await github<{sha:string}>(token, '/git/trees', {method:'POST',body:JSON.stringify({base_tree:snapshot.tree,tree:changes})});
  const commit = await github<{sha:string}>(token, '/git/commits', {method:'POST',body:JSON.stringify({message:'Update trivia content',tree:tree.sha,parents:[snapshot.head]})});
  await github(token, '/git/refs/heads/main', {method:'PATCH',body:JSON.stringify({sha:commit.sha,force:false})});
  return commit.sha;
}
export type BankTable = 'categories' | 'subcategories' | 'questions';
export const bankFilenames: Record<BankTable,string> = {categories:'categories.json',subcategories:'subcategories.json',questions:'questions.json'};
export async function readReplacement(file:File, table:BankTable):Promise<unknown[]> {
  const expected = bankFilenames[table];
  if (file.name !== expected) throw new Error(`اسم الملف غير مطابق. اختر ${expected}`);
  if (file.size > 15 * 1024 * 1024) throw new Error('حجم الملف يتجاوز 15 ميغابايت');
  let data:unknown;
  try { data=JSON.parse(await file.text()); } catch { throw new Error(`تعذر قراءة ${expected}: تأكد من صحة JSON`); }
  if (!Array.isArray(data)) throw new Error(`يجب أن يحتوي ${expected} على مصفوفة JSON`);
  return data;
}
export const guideFilename = 'QUESTION_BANK_GUIDE.md';
export async function readGuideReplacement(file:File):Promise<string> {
  if (file.name !== guideFilename) throw new Error(`اسم الملف غير مطابق. اختر ${guideFilename}`);
  if (file.size > 15 * 1024 * 1024) throw new Error('حجم الملف يتجاوز 15 ميغابايت');
  const guide=await file.text();
  if (!guide.trim()) throw new Error('ملف الدليل فارغ');
  return guide;
}