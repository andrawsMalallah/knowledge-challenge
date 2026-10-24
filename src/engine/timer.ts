/** Pure countdown transitions. All durations are seconds and never depend on wall-clock time. */
export type TimerPhase = 'primary' | 'steal' | 'finished';
export interface TimerState {
  phase: TimerPhase;
  remainingMs: number;
  revealLockMs: number;
  paused: boolean;
}
export const PRIMARY_MS = 60_000;
export const STEAL_MS = 15_000;
export const REVEAL_LOCK_MS = 0;
export function initialTimer(enabled: boolean): TimerState {
  return { phase: 'primary', remainingMs: enabled ? PRIMARY_MS : 0, revealLockMs: enabled ? REVEAL_LOCK_MS : 0, paused: !enabled };
}
export function tickTimer(state: TimerState, elapsedMs: number, allowSteal = true): TimerState {
  if (state.paused || state.phase === 'finished' || elapsedMs <= 0) return state;
  const lock = Math.max(0, state.revealLockMs - elapsedMs);
  if (elapsedMs < state.remainingMs) return { ...state, remainingMs: state.remainingMs - elapsedMs, revealLockMs: lock };
  if (state.phase === 'primary' && allowSteal) {
    const remainingSteal = STEAL_MS - (elapsedMs - state.remainingMs);
    return remainingSteal > 0
      ? { phase: 'steal', remainingMs: remainingSteal, revealLockMs: 0, paused: false }
      : { phase: 'finished', remainingMs: 0, revealLockMs: 0, paused: true };
  }
  return { phase: 'finished', remainingMs: 0, revealLockMs: 0, paused: true };
}
export function timerLabel(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
