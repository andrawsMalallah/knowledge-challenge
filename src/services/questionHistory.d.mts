export interface QuestionHistory { version:1; used:string[] }
export function emptyQuestionHistory():QuestionHistory;
export function parseQuestionHistory(value:unknown):QuestionHistory;
export function markQuestionUsed(history:QuestionHistory,questionId:string):QuestionHistory;
export function resetQuestionPools(history:QuestionHistory,questionIds:Iterable<string>):QuestionHistory;
