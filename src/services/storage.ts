import type { Session } from '../types/game';
import { requireGameControl } from './tabControl';
import { validateSession } from './sessionValidation';
import type { QuestionHistory } from './questionHistory.mjs';
import { emptyQuestionHistory, markQuestionUsed, parseQuestionHistory } from './questionHistory.mjs';

/** One database holds the authoritative checkpoint and immutable media snapshots. */
const DATABASE = 'arabic-trivia';
const VERSION = 2;
const SESSIONS = 'sessions';
const MEDIA = 'active-media';
const ACTIVE_KEY = 'active';
const HISTORY_KEY = 'question-history';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SESSIONS)) request.result.createObjectStore(SESSIONS);
      if (!request.result.objectStoreNames.contains(MEDIA)) request.result.createObjectStore(MEDIA);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open storage'));
    request.onblocked = () => reject(new Error('Close other game tabs before updating storage'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
  });
}

/** Serialize all save calls from the UI/timer; a rejected write must not stop future retries. */
let lastWrite: Promise<void> = Promise.resolve();
function saveCheckpoint(session: Session, key: string): Promise<void> {
  requireGameControl();
  validateSession(session);
  const immutable = structuredClone(session);
  const write = lastWrite.catch(() => undefined).then(async () => {
    const db = await openDatabase();
    try {
      requireGameControl();
      const tx = db.transaction(SESSIONS, 'readwrite');
      const done = transactionDone(tx);
      tx.objectStore(SESSIONS).put(immutable, key);
      await done;
    } finally { db.close(); }
  });
  lastWrite = write;
  return write;
}

export function saveSession(session: Session): Promise<void> { return saveCheckpoint(session, ACTIVE_KEY); }
export function savePreparation(session: Session): Promise<void> { return saveCheckpoint(session, 'preparation'); }
export function readSession(): Promise<Session | undefined> { return readCheckpoint(ACTIVE_KEY); }
export function readPreparation(): Promise<Session | undefined> { return readCheckpoint('preparation'); }

function saveCheckpointAndHistory(session:Session,key:string,change:(history:QuestionHistory)=>QuestionHistory):Promise<QuestionHistory>{
  requireGameControl();validateSession(session);const immutable=structuredClone(session);
  const write=lastWrite.catch(()=>undefined).then(async()=>{
    const db=await openDatabase();
    try{
      requireGameControl();const tx=db.transaction(SESSIONS,'readwrite');const done=transactionDone(tx);const store=tx.objectStore(SESSIONS);
      const current=await new Promise<unknown>((resolve,reject)=>{const request=store.get(HISTORY_KEY);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      const history=change(current===undefined?emptyQuestionHistory():parseQuestionHistory(current));
      store.put(immutable,key);store.put(history,HISTORY_KEY);await done;return history;
    }finally{db.close();}
  });
  lastWrite=write.then(()=>undefined);return write;
}

export function savePreparationWithQuestionHistory(session:Session,history:QuestionHistory):Promise<QuestionHistory>{
  const validated=parseQuestionHistory(history);
  return saveCheckpointAndHistory(session,'preparation',()=>validated);
}

export function saveSessionAndMarkQuestionUsed(session:Session,questionId:string):Promise<QuestionHistory>{
  return saveCheckpointAndHistory(session,ACTIVE_KEY,history=>markQuestionUsed(history,questionId));
}

export async function readQuestionHistory():Promise<QuestionHistory>{
  await lastWrite.catch(()=>undefined);const db=await openDatabase();
  try{return await new Promise<QuestionHistory>((resolve,reject)=>{const request=db.transaction(SESSIONS,'readonly').objectStore(SESSIONS).get(HISTORY_KEY);
    request.onsuccess=()=>{try{resolve(request.result===undefined?emptyQuestionHistory():parseQuestionHistory(request.result));}catch(error){reject(error);}};request.onerror=()=>reject(request.error);});}
  finally{db.close();}
}

export function clearQuestionHistory():Promise<void>{
  requireGameControl();const write=lastWrite.catch(()=>undefined).then(async()=>{const db=await openDatabase();try{requireGameControl();const tx=db.transaction(SESSIONS,'readwrite');const done=transactionDone(tx);tx.objectStore(SESSIONS).delete(HISTORY_KEY);await done;}finally{db.close();}});
  lastWrite=write;return write;
}
/** Queue deletion with saves and remove checkpoints/media in one transaction. */
export function deleteSavedGames(): Promise<void> {
  requireGameControl();
  const write = lastWrite.catch(() => undefined).then(async () => {
    const db = await openDatabase();
    try {
      requireGameControl();
      const tx = db.transaction([SESSIONS, MEDIA], 'readwrite');
      const done = transactionDone(tx);
      tx.objectStore(SESSIONS).delete(ACTIVE_KEY);
      tx.objectStore(SESSIONS).delete('preparation');
      tx.objectStore(MEDIA).clear();
      await done;
    } finally { db.close(); }
  });
  lastWrite = write;
  return write;
}
export async function clearPreparation(): Promise<void> {
  await lastWrite.catch(() => undefined);
  requireGameControl();
  const db = await openDatabase();
  try {
    requireGameControl();
    const tx = db.transaction(SESSIONS,'readwrite');
    const done = transactionDone(tx);
    tx.objectStore(SESSIONS).delete('preparation');
    await done;
  } finally { db.close(); }
}
async function readCheckpoint(key: string): Promise<Session | undefined> {
  await lastWrite.catch(() => undefined);
  const db = await openDatabase();
  try {
    return await new Promise<Session | undefined>((resolve, reject) => {
      const tx = db.transaction(SESSIONS, 'readonly');
      const request = tx.objectStore(SESSIONS).get(key);
      request.onsuccess = () => {
        try {
          const value: unknown = request.result;
          if (value !== undefined) validateSession(value);
          resolve(value as Session | undefined);
        } catch (error) { reject(error); }
      };
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

/** Persist only verified image blobs, identified by their immutable source URLs. */
export async function storeMedia(url: string, data: Blob): Promise<void> {
  requireGameControl();
  const db = await openDatabase();
  try {
    requireGameControl();
    const tx = db.transaction(MEDIA, 'readwrite');
    const done = transactionDone(tx);
    tx.objectStore(MEDIA).put(data, url);
    await done;
  } finally { db.close(); }
}

export async function readMedia(url: string): Promise<Blob | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(MEDIA, 'readonly').objectStore(MEDIA).get(url);
      request.onsuccess = () => resolve(request.result as Blob | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

/** Replace both session and dedicated media atomically. Failed imports keep the previous game intact. */
export function installImportedSession(session: Session, media: { source: string; blob: Blob }[], history?:QuestionHistory): Promise<void> {
  requireGameControl();
  validateSession(session);
  const snapshot = structuredClone(session);
  const importedHistory=history===undefined?undefined:parseQuestionHistory(history);
  const write = lastWrite.catch(() => undefined).then(async () => {
    const db = await openDatabase();
    try {
      requireGameControl();
      const tx = db.transaction([SESSIONS, MEDIA], 'readwrite');
      const done = transactionDone(tx);
      tx.objectStore(SESSIONS).put(snapshot, ACTIVE_KEY);
      if(importedHistory)tx.objectStore(SESSIONS).put(importedHistory,HISTORY_KEY);
      const images = tx.objectStore(MEDIA);
      for (const item of media) images.put(item.blob, item.source);
      await done;
    } finally { db.close(); }
  });
  lastWrite = write;
  return write;
}

/** Remove media no longer referenced by the authoritative session.
 * Run only AFTER a replacement has committed; never during preparation.
 * Failure to clean up is non-fatal and cannot roll back a saved game.
 */
export async function pruneUnusedMedia(): Promise<number> {
  await lastWrite.catch(() => undefined);
  requireGameControl();
  const db = await openDatabase();
  try {
    requireGameControl();
    // Read the authoritative checkpoint in the SAME readwrite transaction as cleanup.
    // Never trust a caller snapshot: a newer game could have replaced it already.
    const tx = db.transaction([SESSIONS, MEDIA], 'readwrite');
    const done = transactionDone(tx);
    const saved = await new Promise<Session | undefined>((resolve, reject) => {
      const request = tx.objectStore(SESSIONS).get(ACTIVE_KEY);
      request.onsuccess = () => resolve(request.result as Session | undefined);
      request.onerror = () => reject(request.error ?? new Error('Cannot read current session'));
    });
    if (!saved) { await done; return 0; }
    validateSession(saved);
    const used = new Set<string>();
    for (const category of saved.categories) if (category.image) used.add(category.image);
    for (const tile of saved.tiles) if (tile.question.image) used.add(tile.question.image);
    for (const question of saved.tie?.questions ?? []) if (question.image) used.add(question.image);
    const store = tx.objectStore(MEDIA);
    let deleted = 0;
    const cursorDone = new Promise<void>((resolve, reject) => {
      const request = store.openKeyCursor();
      request.onerror = () => reject(request.error ?? new Error('Media cleanup failed'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(); return; }
        if (typeof cursor.key === 'string' && !used.has(cursor.key)) {
          store.delete(cursor.key);
          deleted++;
        }
        cursor.continue();
      };
    });
    await Promise.all([cursorDone, done]);
    return deleted;
  } finally { db.close(); }
}
