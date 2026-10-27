const QUESTION_ID = /^(?:normal\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*|tiebreakers)\/[1-9][0-9]*$/;
const MAX_USED_QUESTIONS = 200_000;

export function emptyQuestionHistory() {
  return {version:1,used:[]};
}

export function parseQuestionHistory(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !['version','used'].includes(key)) ||
      value.version !== 1 || !Array.isArray(value.used) || value.used.length > MAX_USED_QUESTIONS ||
      value.used.some(id => typeof id !== 'string' || !QUESTION_ID.test(id)) ||
      new Set(value.used).size !== value.used.length) {
    throw new Error('سجل الأسئلة المستخدمة غير صالح');
  }
  return {version:1,used:[...value.used].sort()};
}

export function markQuestionUsed(history, questionId) {
  const valid = parseQuestionHistory(history);
  if (!QUESTION_ID.test(questionId)) throw new Error('معرّف السؤال المستخدم غير صالح');
  if (valid.used.includes(questionId)) return valid;
  return parseQuestionHistory({version:1,used:[...valid.used,questionId]});
}

export function resetQuestionPools(history, questionIds) {
  const valid = parseQuestionHistory(history);
  const reset = new Set(questionIds);
  return {version:1,used:valid.used.filter(id=>!reset.has(id))};
}
