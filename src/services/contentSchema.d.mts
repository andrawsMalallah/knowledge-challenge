import type { Question, TieQuestion } from '../types/game';
export const NORMAL_ID: RegExp;
export interface SourceCategory { id:string; name:string; subcategories:{id:string;name:string;questionCount?:number}[] }
export function parseCategoryTree(value: unknown): SourceCategory[];
export function questionFile(category: string, subcategory: string): string;
export const TIE_FILE: string;
export function parseQuestionFile(value: unknown, category: string, subcategory: string | null): (Question | TieQuestion)[];
