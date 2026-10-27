/** Shared by the browser loader and build validator: one source of content rules. */
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const NORMAL_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function arabicText(value) {
  return typeof value === 'string' && value.trim().length > 0 && /[\p{L}\p{N}]/u.test(value) &&
    [...value].every(character => !/\p{L}/u.test(character) || /\p{Script=Arabic}/u.test(character) || character === '\u0640');
}
// Catalog titles may retain original Latin names; question/answer language stays Arabic.
function categoryName(value) {
  return typeof value === 'string' && value.trim().length > 0 && /[\p{L}\p{N}]/u.test(value) &&
    [...value].every(character => !/\p{L}/u.test(character) || /[\p{Script=Arabic}\p{Script=Latin}]/u.test(character));
}
function exactKeys(value, allowed) { return Object.keys(value).every(key => allowed.includes(key)); }
export function parseCategoryTree(value) {
  if (!isObject(value) || !exactKeys(value,['categories']) || !Array.isArray(value.categories) || value.categories.length > 500) throw Error('فهرس التصنيفات غير صالح');
  const ids = new Set();
  return value.categories.map(category => {
    if (!isObject(category) || !exactKeys(category,['id','name','subcategories']) || typeof category.id !== 'string' || !SLUG.test(category.id) || category.id === 'tiebreakers' || ids.has(category.id) || !categoryName(category.name) || !Array.isArray(category.subcategories) || category.subcategories.length > 1000) throw Error('بيانات التصنيف الرئيسي غير صالحة');
    ids.add(category.id);
    const subIds = new Set();
    return {id:category.id,name:category.name,subcategories:category.subcategories.map(subcategory => {
      if (!isObject(subcategory) || !exactKeys(subcategory,['id','name','questionCount']) || typeof subcategory.id !== 'string' || !SLUG.test(subcategory.id) || subIds.has(subcategory.id) || !categoryName(subcategory.name) || ('questionCount' in subcategory && (!Number.isSafeInteger(subcategory.questionCount) || subcategory.questionCount < 0))) throw Error('بيانات التصنيف الفرعي غير صالحة');
      subIds.add(subcategory.id);
      return {id:subcategory.id,name:subcategory.name,questionCount:'questionCount' in subcategory?subcategory.questionCount:undefined};
    })};
  });
}
export function questionFile(category, subcategory) {
  if (typeof category !== 'string' || typeof subcategory !== 'string' || !SLUG.test(category) || !SLUG.test(subcategory)) throw Error('معرّف التصنيف غير صالح');
  return `/data/questions/normal/${category}/${subcategory}/questions.json`;
}
export const TIE_FILE = '/data/questions/tiebreaker/questions.json';
export function parseQuestionFile(value, category, subcategory) {
  const tie = category === 'tiebreakers' && subcategory === null;
  if (!tie && (typeof category !== 'string' || typeof subcategory !== 'string' || !SLUG.test(category) || !SLUG.test(subcategory))) throw Error('معرّف التصنيف غير صالح');
  if (!isObject(value) || !exactKeys(value,['category','subcategory','totalQuestions','questions']) || value.category !== category || value.subcategory !== subcategory || !Number.isSafeInteger(value.totalQuestions) || value.totalQuestions < 0 || value.totalQuestions > 1000 || !Array.isArray(value.questions) || value.questions.length !== value.totalQuestions) throw Error('بنية ملف الأسئلة أو العدد أو التصنيف غير مطابق');
  const ids = new Set();
  return value.questions.map(row => {
    if (!isObject(row) || !exactKeys(row,['id','points','difficultyLevel','question','answer','format','image_path','audio_path','image_alt']) || !Number.isSafeInteger(row.id) || row.id < 1 || ids.has(row.id)) throw Error('معرّف سؤال مكرر أو غير صالح');
    ids.add(row.id);
    if (!arabicText(row.question) || !arabicText(row.answer)) throw Error('يجب أن يكون السؤال والإجابة بالعربية');
    if (!Number.isInteger(row.difficultyLevel) || !(tie ? [4,5] : [1,2,3,4,5]).includes(row.difficultyLevel) || !(tie ? [0] : [200,400,600]).includes(row.points)) throw Error('نقاط السؤال أو مستوى الصعوبة غير صالح');
    if (row.format !== 'text' || row.image_path !== null || row.audio_path !== null || (row.image_alt !== undefined && row.image_alt !== null)) throw Error(tie ? 'الأسئلة الفاصلة نصية فقط دائمًا' : 'الأسئلة النصية فقط مدعومة حاليًا؛ يجب أن تكون مسارات الوسائط فارغة');
    // Namespaced internal identities preserve the existing session/backup engine while disk IDs stay numeric.
    return {id:tie ? `tiebreakers/${row.id}` : `normal/${category}/${subcategory}/${row.id}`,
      ...(tie ? {} : {categoryId:`${category}/${subcategory}`,points:row.points}),
      difficultyLevel:row.difficultyLevel,question:row.question,answer:row.answer};
  });
}
