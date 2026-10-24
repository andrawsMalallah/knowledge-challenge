import type { Outcome, ScoreRecord, Session, SessionSnapshot, TeamId } from '../types/game';
import { additionalDelta } from './lifelines';
import { opposite } from './rules';
import { createTieState } from './tiebreaker';
import { pauseQuestionTimer } from './timerSession';

/** Store only immutable, serializable state needed to replay the latest result. */
function snapshot(game: Session): SessionSnapshot {
  return { teams: structuredClone(game.teams), tiles: structuredClone(game.tiles),
    turn: game.turn, phase: game.phase, activeId: game.activeId,
    activePower: game.activePower, activePowerTeam: game.activePowerTeam,
    timer: game.timer ? { ...game.timer } : undefined, result: game.result,
    lastRecord: game.lastRecord ? structuredClone(game.lastRecord) : undefined,
    tie: game.tie ? structuredClone(game.tie) : undefined };
}

export function confirmScoring(game: Session, outcome: Outcome): Session {
  if (game.phase !== 'scoring' || !game.activeId) throw new Error('لا يوجد سؤال للتقييم');
  const tile = game.tiles.find(t => t.question.id === game.activeId);
  if (!tile || tile.completed) throw new Error('السؤال مكتمل');
  const delta = additionalDelta(game, tile.question.points, outcome);
  const before: Record<TeamId, number> = { A: game.teams.A.score, B: game.teams.B.score };
  const after: Record<TeamId, number> = { A: before.A + delta.A, B: before.B + delta.B };
  const record: ScoreRecord = { questionId: tile.question.id, outcome, before, after,
    power: game.activePower, powerTeam: game.activePowerTeam, turnBefore: game.turn, corrected: false };
  const completed=game.tiles.every(t=>t.completed || t.question.id === tile.question.id);
  const tied=after.A===after.B;
  const nextPhase=completed ? (tied ? 'tie-intro' : 'result') : 'board';
  const tie=completed && tied && game.tie ? createTieState(game.tie.questions,game.tieLimit,opposite(game.turn),game.tie.format === 'shootout') : game.tie;
  return { ...game, tie, history: [...(game.history ?? []), record], result: completed && !tied ? (after.A>after.B?'A':'B') : undefined, lastRecord: record, activeId: undefined, activePower: undefined,
    activePowerTeam: undefined, timer: undefined, pendingOutcome: undefined,
    phase: nextPhase, turn: opposite(game.turn),
    teams: { A: { ...game.teams.A, score: after.A }, B: { ...game.teams.B, score: after.B } },
    tiles: game.tiles.map(t => t.question.id === tile.question.id ? { ...t, completed: true, outcome } : t) };
}

export function beginCorrection(game: Session): Session {
  if (game.correction || !game.lastRecord || !['board', 'result', 'tie-intro', 'tie-ready', 'tie-question', 'tie-scoring'].includes(game.phase))
    throw new Error('لا توجد نتيجة أخيرة قابلة للتصحيح');
  const paused = pauseQuestionTimer(game);
  const original = snapshot(paused);
  return { ...paused, phase: 'correction', correction: { original, selected: game.lastRecord.outcome } };
}

export function cancelCorrection(game: Session): Session {
  if (game.phase !== 'correction' || !game.correction) throw new Error('لا يوجد تصحيح');
  const { original } = game.correction;
  return { ...game, ...structuredClone(original), correction: undefined };
}

export function setCorrectionOutcome(game: Session, selected: Outcome): Session {
  if (game.phase !== 'correction' || !game.correction) throw new Error('لا يوجد تصحيح');
  return { ...game, correction: { ...game.correction, selected } };
}

/** Recalculate from original pre-answer scores; the Gift prepaid +200 is already in `before`. */
export function confirmCorrection(game: Session): Session {
  if (game.phase !== 'correction' || !game.correction?.selected) throw new Error('اختر الإجابة');
  const { original, selected } = game.correction;
  const record = original.lastRecord;
  if (!record) throw new Error('لا توجد نتيجة');
  const tile = original.tiles.find(t => t.question.id === record.questionId);
  if (!tile) throw new Error('السؤال غير موجود');
  const scoringContext: Session = { ...game, turn: record.turnBefore,
    activePower: record.power, activePowerTeam: record.powerTeam };
  const delta = additionalDelta(scoringContext, tile.question.points, selected);
  const after: Record<TeamId, number> = { A: record.before.A + delta.A, B: record.before.B + delta.B };
  const completed=original.tiles.every(t=>t.completed) || original.phase !== 'board';
  const tied=after.A===after.B;
  const resultChanged=selected !== record.outcome;
  // Editing the last regular result during sudden death invalidates downstream
  // tiebreaker answers only when the regular result actually changed.
  let nextPhase: Session['phase'];
  let nextTie = original.tie;
  let nextResult: Outcome | undefined;
  if (!completed) {
    nextPhase = 'board';
  } else if (!tied) {
    nextPhase = 'result';
    nextResult = after.A > after.B ? 'A' : 'B';
    if (resultChanged && nextTie) nextTie = createTieState(nextTie.questions, game.tieLimit, original.turn, nextTie.format === 'shootout');
  } else if (resultChanged || !nextTie) {
    nextPhase = 'tie-intro';
    const selectedQuestions = original.tie?.questions ?? game.tie?.questions;
    if (!selectedQuestions) throw new Error('أسئلة الجولة الفاصلة غير متاحة');
    nextTie = createTieState(selectedQuestions, game.tieLimit, original.turn, (original.tie ?? game.tie)?.format === 'shootout');
  } else {
    // A no-op correction should not rewind an already played tiebreaker.
    nextPhase = original.phase;
    nextResult = original.result;
  }
  return { ...game, ...structuredClone(original), correction: undefined,
    phase: nextPhase, result: nextResult, tie: nextTie,
    teams: { A: { ...original.teams.A, score: after.A }, B: { ...original.teams.B, score: after.B } },
    tiles: original.tiles.map(t => t.question.id === record.questionId ? { ...t, outcome: selected } : t),
    lastRecord: { ...record, outcome: selected, after,
      corrected: record.corrected || resultChanged },
    history: game.history?.map(entry => entry.questionId === record.questionId
      ? { ...record, outcome: selected, after, corrected: record.corrected || resultChanged } : entry) };
}
