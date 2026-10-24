/** A browser-wide exclusive gameplay lock. The browser releases it on tab crash/close.
 * Tabs that cannot prove ownership remain read-only; there is never a force takeover.
 * Web Locks remain held when a document is merely backgrounded.
 */
export type ControlState = 'checking' | 'owner' | 'read-only' | 'unsupported';
const LOCK = 'arabic-trivia:active-session';
const CHANNEL = 'arabic-trivia:control';
let state: ControlState = 'checking';
let unlock: (() => void) | undefined;
let pending: Promise<boolean> | undefined;
const listeners = new Set<(state: ControlState) => void>();
const takeoverListeners = new Set<() => Promise<void>>();
const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(CHANNEL);
function transition(next: ControlState): void { state = next; for (const notify of listeners) notify(next); }
export function hasGameControl(): boolean { return state === 'owner'; }
export function requireGameControl(): void { if (!hasGameControl()) throw new Error('اللعبة مفتوحة في تبويب آخر؛ هذا التبويب للقراءة فقط'); }
export function observeGameControl(notify: (state: ControlState) => void): () => void {
  listeners.add(notify); notify(state); return () => {listeners.delete(notify);};
}
export function onTransferRequest(handler: () => Promise<void>): () => void {
  takeoverListeners.add(handler); return () => {takeoverListeners.delete(handler);};
}
channel?.addEventListener('message', event => {
  if (event.data?.type !== 'request-control' || !hasGameControl()) return;
  // The owner must save a paused checkpoint before yielding the lock.
  void (async () => { for (const handler of takeoverListeners) await handler(); })().catch(() => {
    // Never relinquish the lock if a checkpoint cannot be saved.
  });
});
export async function acquireGameControl(): Promise<boolean> {
  if (hasGameControl()) return true;
  if (pending) return pending;
  if (!navigator.locks?.request) { transition('unsupported'); return false; }
  transition('checking');
  pending = new Promise<boolean>(resolve => {
    void navigator.locks.request(LOCK, {mode:'exclusive', ifAvailable:true}, async lock => {
      if (!lock) { transition('read-only'); resolve(false); return; }
      await new Promise<void>(done => {
        unlock = done;
        transition('owner');
        resolve(true);
      });
      unlock = undefined;
      transition('read-only');
    }).catch(() => { transition('read-only'); resolve(false); });
  }).finally(() => { pending = undefined; });
  return pending;
}
export function releaseGameControl(): void {
  if (!hasGameControl()) return;
  // Writes must stop synchronously, before the held lock is released.
  transition('read-only');
  unlock?.();
}
export async function requestGameControl(): Promise<boolean> {
  if (await acquireGameControl()) return true;
  channel?.postMessage({type:'request-control'});
  // The owner may be active and require time to persist its paused state.
  for (let attempt=0; attempt<12; attempt++) {
    await new Promise<void>(resolve => setTimeout(resolve, 350));
    if (await acquireGameControl()) return true;
  }
  return false;
}
