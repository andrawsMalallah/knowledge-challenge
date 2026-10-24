import type { Session } from '../types/game';
import type { TimerState } from './timer';

/**
 * Apply one timer snapshot to the session and any pending tiebreaker question.
 * Keeping both representations in sync prevents resume after navigation from
 * resurrecting a stale, independently-counting timer.
 */
export function withTimerCheckpoint(session: Session, timer: TimerState): Session {
  const expired = timer.phase === 'finished';
  return {
    ...session,
    phase: expired && session.phase === 'question' ? 'scoring'
      : expired && session.phase === 'tie-question' ? 'tie-scoring' : session.phase,
    timer,
    tie: session.tie?.pending
      ? { ...session.tie, status: expired ? 'scoring' : session.tie.status,
        pending: { ...session.tie.pending, timer, revealed: expired || session.tie.pending.revealed } }
      : session.tie
  };
}

/** Pausing is idempotent and never spends or restores time. */
export function pauseQuestionTimer(session: Session): Session {
  if (!session.timer) return session;
  return withTimerCheckpoint(session, { ...session.timer, paused: true });
}

/**
 * Recover only from the saved checkpoint. A pending question on the tiebreaker
 * preparation screen must remain pending, not become an active timer.
 */
export function restorePausedSession(session: Session): Session {
  // A canceled correction must never restart a clock captured before editing.
  if (session.correction) session = { ...session, correction: { ...session.correction,
    original: pauseQuestionTimer(session.correction.original as Session) } };
  const active = session.timer;
  const pending = session.tie?.pending?.timer;
  const timer = active ?? pending;
  if (!timer) return session;
  const stopped = { ...timer, paused: true };
  if (active) return withTimerCheckpoint(session, stopped);
  return {
    ...session,
    tie: session.tie?.pending
      ? { ...session.tie, pending: { ...session.tie.pending, timer: stopped } }
      : session.tie
  };
}
