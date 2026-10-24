import type { Session } from '../types/game';
import { validOptionalExplanation } from '../engine/questionContent';
import { validImagePath } from './imageValidation';
import { shootoutResult } from '../engine/tiebreaker';

/** Validate untrusted session data before it can replace an existing checkpoint. */
export function validateSession(value: unknown, depth = 0): asserts value is Session {
  const invalid = (message: string): never => { throw new Error(`بيانات اللعبة غير صالحة: ${message}`); };
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const string = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
  const teamId = (v: unknown): v is 'A' | 'B' => v === 'A' || v === 'B';
  const outcome = (v: unknown): boolean => teamId(v) || v === 'neither';
  const power = (v: unknown): boolean => v === 'risk' || v === 'gift' || v === 'steal';
  const timer = (v: unknown): boolean => object(v) && ['primary', 'steal', 'finished'].includes(String(v.phase)) &&
    typeof v.paused === 'boolean' && Number.isFinite(v.remainingMs) && Number.isFinite(v.revealLockMs) &&
    (v.remainingMs as number) >= 0 && (v.remainingMs as number) <= 60000 &&
    (v.revealLockMs as number) >= 0 && (v.revealLockMs as number) <= 5000 &&
    (v.phase !== 'steal' || ((v.remainingMs as number) <= 15000 && v.revealLockMs === 0)) &&
    (v.phase !== 'finished' || (v.remainingMs === 0 && v.revealLockMs === 0 && v.paused === true));
  const image = (v: unknown): boolean => v === undefined || (typeof v === 'string' && validImagePath(v));
  if (depth > 2) invalid('تصحيح متداخل');
  if (!object(value)) invalid('التعريف الرئيسي');
  const session = value as unknown as Session;
  if (session.version !== 1 || !teamId(session.turn) || typeof session.timerEnabled !== 'boolean' ||
      !Number.isInteger(session.tieLimit) || (session.tieLimit as number) < 1 || (session.tieLimit as number) > 5 ||
      !['board', 'prequestion', 'question', 'scoring', 'correction', 'tiebreaker', 'result', 'tie-intro', 'tie-ready', 'tie-question', 'tie-scoring', 'tie-correction'].includes(String(session.phase))) invalid('التعريف الرئيسي');
  if (!object(session.teams)) invalid('الفرق');
  if (session.boardScrollY !== undefined && (!Number.isFinite(session.boardScrollY) || session.boardScrollY < 0)) invalid('موضع اللوحة');
  for (const id of ['A', 'B'] as const) {
    const team = session.teams[id];
    if (!object(team) || team.id !== id || !string(team.name) || !/^#[0-9a-fA-F]{6}$/.test(String(team.color)) ||
        !Number.isSafeInteger(team.score) || !Array.isArray(team.used) || team.used.some(p => !power(p)) ||
        new Set(team.used).size !== team.used.length) invalid(`الفريق ${id}`);
  }
  if (session.teams.A.color.toLowerCase() === session.teams.B.color.toLowerCase()) invalid('ألوان الفرق');
  if (!Array.isArray(session.categories) || ![4, 6, 8].includes(session.categories.length) ||
      session.categories.some(c => !object(c) || !string(c.id) || !string(c.name) || !image(c.image)) ||
      new Set(session.categories.map(c => c.id)).size !== session.categories.length) invalid('التصنيفات');
  if (!Array.isArray(session.tiles) || session.tiles.length !== session.categories.length * 6) invalid('عدد الأسئلة');
  const ids = new Set<string>();
  const grid = new Set<string>();
  const cats = new Set(session.categories.map(c => c.id));
  for (const tile of session.tiles) {
    if (!object(tile) || !teamId(tile.owner) || typeof tile.completed !== 'boolean' || !object(tile.question)) invalid('سؤال غير صالح');
    const q = tile.question;
    if (!string(q.id) || ids.has(q.id) || !cats.has(q.categoryId) || ![200,400,600].includes(q.points) ||
        ![1,2,3,4,5].includes(q.difficultyLevel) || !string(q.question) || !string(q.answer) || !image(q.image) || !validOptionalExplanation(q.explanation)) invalid('محتوى السؤال');
    if ((q.points === 200 && ![1,2].includes(Number(q.difficultyLevel))) ||
        (q.points === 400 && ![2,3].includes(Number(q.difficultyLevel))) ||
        (q.points === 600 && ![3,4].includes(Number(q.difficultyLevel)))) invalid('صعوبة السؤال');
    const key = `${q.categoryId}:${tile.owner}:${q.points}`;
    if (grid.has(key) || (!tile.completed && tile.outcome !== undefined) || (tile.completed && !outcome(tile.outcome))) invalid('توزيع الأسئلة');
    ids.add(q.id); grid.add(key);
  }
  if (session.activeId !== undefined && (!ids.has(session.activeId) || session.tiles.find(t => t.question.id === session.activeId)?.completed)) invalid('السؤال النشط');
  if (session.activePower !== undefined && (!power(session.activePower) || !teamId(session.activePowerTeam))) invalid('القوة الخاصة');
  if (session.activePower === undefined && session.activePowerTeam !== undefined) invalid('صاحب القوة');
  if (session.activePower === 'gift' && session.activeId && session.tiles.find(tile=>tile.question.id===session.activeId)?.question.points !== 600) invalid('قيمة سؤال الهدية');
  if (['prequestion','question','scoring'].includes(session.phase) && !session.activeId) invalid('السؤال النشط مفقود');
  if (session.phase === 'result' && !outcome(session.result)) invalid('نتيجة نهائية مفقودة');
  if (session.phase.startsWith('tie-') && !session.tie) invalid('الجولة الفاصلة مفقودة');
  if (session.phase === 'correction' && (!session.correction || !session.lastRecord)) invalid('تصحيح مفقود');
  if (session.phase === 'question' && session.timerEnabled && !session.timer) invalid('مؤقت مفقود');
  if (session.timer !== undefined && !timer(session.timer)) invalid('المؤقت');
  if (session.result !== undefined && !outcome(session.result)) invalid('النتيجة');
  if (session.history !== undefined && (!Array.isArray(session.history) || session.history.length > session.tiles.length ||
      new Set(session.history.map(record => record?.questionId)).size !== session.history.length)) invalid('سجل الأسئلة');
  for (const r of [...(session.history ?? []), ...(session.lastRecord ? [session.lastRecord] : [])]) {
    if (!object(r) || !ids.has(r.questionId) || !outcome(r.outcome) || !teamId(r.turnBefore) ||
        !object(r.before) || !object(r.after) || !['A','B'].every(id => Number.isSafeInteger((r.before as Record<string,unknown>)[id]) && Number.isSafeInteger((r.after as Record<string,unknown>)[id])) ||
        typeof r.corrected !== 'boolean' || (r.power !== undefined && (!power(r.power) || !teamId(r.powerTeam)))) invalid('سجل النقاط');
  }
  if (session.correction !== undefined && (!object(session.correction) || !object(session.correction.original) ||
      (session.correction.selected !== undefined && !outcome(session.correction.selected)))) invalid('التصحيح');
  if (session.correction) validateSession({ ...session, ...session.correction.original, correction: undefined }, depth + 1);
  if (!session.tie) invalid('بنك الجولة الفاصلة مفقود');
  if (session.tie !== undefined) {
    const t = session.tie;
    if (!object(t) || (t.format !== undefined && t.format !== 'shootout') || !Array.isArray(t.questions) || t.questions.length !== session.tieLimit * (t.format === 'shootout' ? 2 : 1) ||
        !Array.isArray(t.confirmed) || t.confirmed.length > t.questions.length || !teamId(t.first) ||
        typeof t.earlyDraw !== 'boolean' || !['intro','ready','question','scoring','correction','finished'].includes(String(t.status)) ||
        t.questions.some(q => !object(q) || !string(q.id) || ids.has(q.id) || 'points' in q || ![4,5].includes(q.difficultyLevel) || !string(q.question) || !string(q.answer) || !image(q.image) || !validOptionalExplanation(q.explanation)) ||
        new Set(t.questions.map(q => q.id)).size !== t.questions.length || t.confirmed.some(o => !outcome(o))) invalid('الجولة الفاصلة');
    if (t.pending !== undefined && (!object(t.pending) || t.pending.index !== t.confirmed.length ||
        (t.pending.timer !== undefined && !timer(t.pending.timer)) ||
        (t.pending.revealed !== undefined && typeof t.pending.revealed !== 'boolean'))) invalid('السؤال الفاصل المعلق');
    if (t.format === 'shootout') {
      if (t.confirmed.some((answer,index)=>answer !== 'neither' && answer !== (index % 2 === 0 ? t.first : t.first === 'A' ? 'B' : 'A'))) invalid('إجابة الفريق الآخر');
      for (let index=1;index<t.confirmed.length;index++) if (shootoutResult({...t,confirmed:t.confirmed.slice(0,index)}) !== undefined) invalid('استمرار الجولة بعد الفوز');
      if (session.phase === 'result' && !t.earlyDraw && t.status === 'finished' && session.result !== shootoutResult(t)) invalid('نتيجة الجولة الفاصلة');
      if (session.phase === 'tie-question' && session.timer?.phase === 'steal') invalid('فرصة الفريق الآخر');
    } else if (t.confirmed.slice(0,-1).some(answer=>answer!=='neither')) invalid('استمرار الجولة بعد الفوز');
    if (['tie-question','tie-scoring'].includes(session.phase) && (!t.pending || t.pending.index >= t.questions.length)) invalid('سؤال فاصل مفقود');
    if (t.correction !== undefined && (!object(t.correction) || !object(t.correction.original) ||
        (t.correction.selected !== undefined && !outcome(t.correction.selected)))) invalid('تصحيح الجولة الفاصلة');
    if (t.correction) validateSession({ ...session, phase: t.correction.original.status === 'finished' ? 'result' : 'tie-ready',
      result: t.correction.original.status === 'finished' ? shootoutResult(t.correction.original) : undefined,
      tie: t.correction.original, correction: undefined }, depth + 1);
  }
}
