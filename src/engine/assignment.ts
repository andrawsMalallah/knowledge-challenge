import type { Category, Question, TeamId, Tile, TieQuestion } from '../types/game';
import { allowedDifficulty, tiers } from './rules';
import { validOptionalExplanation } from './questionContent';
import { validImagePath } from '../services/imageValidation';

const imagePath = (value: unknown): boolean => value === undefined || (
  typeof value === 'string' && validImagePath(value)
);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** Validate untrusted JSON at runtime, rather than relying on TypeScript casts. */
export function validateQuestions(categories: Category[], questions: Question[], ties: TieQuestion[]): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const catIds = new Set(categories.map(c => c.id));
  for (const candidate of [...questions, ...ties]) {
    if (!candidate || typeof candidate !== 'object') { issues.push('سجل سؤال غير صالح'); continue; }
    const q = candidate as Question | TieQuestion;
    if (!nonEmpty(q.id) || ids.has(q.id)) issues.push(`معرّف سؤال مكرر أو مفقود: ${String(q.id)}`);
    if (nonEmpty(q.id)) ids.add(q.id);
    if (!nonEmpty(q.question) || !nonEmpty(q.answer)) issues.push(`سؤال غير مكتمل: ${String(q.id)}`);
    if (!imagePath(q.image)) issues.push(`مسار صورة غير صالح: ${String(q.id)}`);
    if (!validOptionalExplanation(q.explanation)) issues.push(`شرح الإجابة غير صالح: ${String(q.id)}`);
    if ('points' in q) {
      if (!catIds.has(q.categoryId)) issues.push(`تصنيف غير معروف: ${String(q.id)}`);
      if (!allowedDifficulty[q.points]?.includes(q.difficultyLevel)) issues.push(`مستوى غير مناسب: ${String(q.id)}`);
    } else if (q.difficultyLevel !== 4 && q.difficultyLevel !== 5) {
      issues.push(`سؤال فاصل غير صعب: ${String(q.id)}`);
    }
  }
  return issues;
}

/** Fisher-Yates: unlike sort(() => random() - .5), each ordering is unbiased for a uniform RNG. */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('مصدر الاختيار العشوائي غير صالح');
    const j = Math.floor(roll * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function assignBalanced(categories: Category[], questions: Question[], random: () => number = Math.random): Tile[] {
  return assignBalancedAvoiding(categories,questions,new Set(),random).tiles;
}

export function assignBalancedAvoiding(categories: Category[], questions: Question[], usedIds: ReadonlySet<string>, random: () => number = Math.random): {tiles:Tile[];resetIds:string[]} {
  const issues = validateQuestions(categories, questions, []);
  if (issues.length) throw new Error(issues.join('؛ '));
  const tiles: Tile[] = [];
  const resetIds = new Set<string>();
  for (const cat of categories) for (const points of tiers) {
    const eligible = questions.filter(q => q.categoryId === cat.id && q.points === points && allowedDifficulty[points].includes(q.difficultyLevel));
    let selectable = eligible.filter(question=>!usedIds.has(question.id));
    let groups = new Map<number, Question[]>();
    // Append in place to avoid repeatedly copying large difficulty pools.
    for (const question of selectable) {
      const group=groups.get(question.difficultyLevel);
      if(group)group.push(question);
      else groups.set(question.difficultyLevel,[question]);
    }
    let matchedGroups = [...groups.values()].filter(group => group.length >= 2);
    if (!matchedGroups.length) {
      selectable=eligible;
      groups=new Map<number,Question[]>();
      for(const question of selectable){
        const group=groups.get(question.difficultyLevel);
        if(group)group.push(question);else groups.set(question.difficultyLevel,[question]);
        resetIds.add(question.id);
      }
      matchedGroups=[...groups.values()].filter(group=>group.length>=2);
    }
    if (!matchedGroups.length) throw new Error(`التصنيف ${cat.name} يفتقر إلى سؤالين متوازنين لفئة ${points}`);
    const groupIndex = Math.floor(random() * matchedGroups.length);
    if (groupIndex < 0 || groupIndex >= matchedGroups.length) throw new Error('مصدر الاختيار العشوائي غير صالح');
    const pair = shuffle(matchedGroups[groupIndex], random).slice(0, 2);
    const owners: TeamId[] = random() < 0.5 ? ['A', 'B'] : ['B', 'A'];
    pair.forEach((question, index) => tiles.push({ question, owner: owners[index], completed: false }));
  }
  if (new Set(tiles.map(tile => tile.question.id)).size !== tiles.length) throw new Error('تكرار معرّفات الأسئلة');
  return {tiles,resetIds:[...resetIds]};
}

export function selectTiebreakers(pool: TieQuestion[], maximum: number, random: () => number = Math.random): TieQuestion[] {
  return selectTiebreakersAvoiding(pool,maximum,new Set(),random).questions;
}

export function selectTiebreakersAvoiding(pool: TieQuestion[], maximum: number, usedIds:ReadonlySet<string>, random: () => number = Math.random): {questions:TieQuestion[];resetIds:string[]} {
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 10) throw new Error('عدد أسئلة الجولة الفاصلة يجب أن يكون بين 1 و10');
  const issues = validateQuestions([], [], pool);
  if (issues.length) throw new Error(issues.join('؛ '));
  if (pool.length < maximum) throw new Error('مخزون الجولة الفاصلة غير كافٍ');
  const unused=pool.filter(question=>!usedIds.has(question.id));
  const resetIds=unused.length<maximum?pool.map(question=>question.id):[];
  return {questions:shuffle(unused.length>=maximum?unused:pool, random).slice(0, maximum),resetIds};
}
