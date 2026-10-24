import type { Category, Question, TieQuestion } from '../types/game';
import { readMedia, storeMedia } from './storage';
import { validateImageBlob, validImagePath } from './imageValidation';

export interface PreparationProgress { completed: number; total: number; label: string }

function validateQuestions(questions: (Question | TieQuestion)[]): void {
  if (!questions.length) throw new Error('لا توجد أسئلة كافية للعبة');
  const ids = new Set<string>();
  for (const question of questions) {
    if (!question.id || ids.has(question.id) || !question.question.trim() || !question.answer.trim() || ![1,2,3,4,5].includes(question.difficultyLevel)) {
      throw new Error('توجد أسئلة مكررة أو غير صالحة');
    }
    ids.add(question.id);
  }
}

/** Prepare images before starting; never substitute a different asset for a missing one. */
export async function prepareGameAssets(
  questions: Question[],
  tieQuestions: TieQuestion[],
  onProgress: (progress: PreparationProgress) => void = () => undefined,
  categories: Category[] = [],
  signal?: AbortSignal,
): Promise<void> {
  validateQuestions([...questions, ...tieQuestions]);
  const urls = [...new Set([...questions, ...tieQuestions, ...categories].map(item => item.image).filter((image): image is string => !!image))];
  onProgress({ completed: 0, total: urls.length, label: 'فحص صور الأسئلة' });
  for (const [index, path] of urls.entries()) {
    signal?.throwIfAborted();
    if (!validImagePath(path)) throw new Error('مسار صورة غير صالح');
    const existing = await readMedia(path);
    let cachedValid = false;
    if (existing) { try { await validateImageBlob(existing, path); cachedValid = true; } catch { /* Re-fetch invalid cache. */ } }
    if (!cachedValid) {
      let response: Response;
      try { response = await fetch(path, { cache: 'no-store', signal }); }
      catch { throw new Error(`الصورة غير متاحة: ${path}`); }
      if (!response.ok) throw new Error(`الصورة غير متاحة: ${path}`);
      const blob = await response.blob();
      await validateImageBlob(blob, path);
      await storeMedia(path, blob);
    }
    onProgress({ completed: index + 1, total: urls.length, label: 'تجهيز صور الأسئلة' });
  }
}
