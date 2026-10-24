import type { Session } from '../types/game';
import { initialTimer } from './timer';
import { commitPower } from './lifelines';

/** Immutable session changes. Persist successfully before publishing them to the UI. */
export function openSelectedQuestion(game: Session): Session {
  if (game.phase !== 'prequestion' || !game.activeId) throw new Error('لا يوجد سؤال جاهز للعرض');
  return { ...commitPower(game), lastRecord: undefined, phase: 'question', timer: initialTimer(game.timerEnabled) };
}
export function showAnswer(game: Session): Session {
  if (game.phase !== 'question') throw new Error('السؤال غير مفتوح');
  return { ...game, phase: 'scoring', timer: game.timer ? { ...game.timer, paused: true } : undefined };
}
