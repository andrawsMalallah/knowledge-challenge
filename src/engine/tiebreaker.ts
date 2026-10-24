import type { Outcome, Session, TieBreakerState, TieQuestion, TeamId } from '../types/game';
import { opposite } from './rules';
import { initialTimer } from './timer';

/** The selected questions are frozen at setup, in their original order. */
export function createTieState(pool: TieQuestion[], limit: number, first: TeamId, shootout = true): TieBreakerState {
  if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw new Error('حد الجولة الفاصلة غير صالح');
  const count = limit * (shootout ? 2 : 1);
  if (new Set(pool.map(q=>q.id)).size !== pool.length || pool.length < count) throw new Error('بنك الجولة الفاصلة غير كافٍ');
  if (pool.some(q=>!q.question.trim() || !q.answer.trim() || ![4,5].includes(q.difficultyLevel))) throw new Error('سؤال فاصل غير صالح');
  return { ...(shootout ? {format:'shootout' as const} : {}), questions: structuredClone(pool.slice(0,count)), confirmed: [], first, status:'intro', earlyDraw:false };
}
/** A lead wins only when the opponent's remaining attempts cannot equal it. */
export function shootoutResult(tie: TieBreakerState): Outcome | undefined {
  if (tie.format !== 'shootout') return tie.confirmed.at(-1) !== 'neither' || tie.confirmed.length === tie.questions.length ? tie.confirmed.at(-1) : undefined;
  const limit = tie.questions.length / 2;
  const scores = { A:0, B:0 }; const attempts = { A:0, B:0 };
  tie.confirmed.forEach((answer,index) => {
    const team = index % 2 === 0 ? tie.first : opposite(tie.first);
    attempts[team]++; if (answer === team) scores[team]++;
  });
  if (scores.A > scores.B + limit - attempts.B) return 'A';
  if (scores.B > scores.A + limit - attempts.A) return 'B';
  return tie.confirmed.length === tie.questions.length ? 'neither' : undefined;
}
export function tieStarter(tie: TieBreakerState): TeamId {
  return tie.confirmed.length % 2 === 0 ? tie.first : opposite(tie.first);
}
export function tieQuestion(tie: TieBreakerState): TieQuestion | undefined { return tie.questions[tie.confirmed.length]; }
export function beginTie(game: Session, random: () => number = Math.random): Session {
  if (game.phase !== 'tie-intro' || !game.tie) throw new Error('الجولة الفاصلة غير جاهزة');
  return { ...game, phase:'tie-ready', tie:{...game.tie,first:game.tie.format === 'shootout' ? (random() < 0.5 ? 'A' : 'B') : game.tie.first,status:'ready'} };
}
export function openTieQuestion(game: Session): Session {
  if (game.phase !== 'tie-ready' || !game.tie || game.tie.confirmed.length >= game.tie.questions.length) throw new Error('السؤال الفاصل غير متاح');
  const tie=game.tie;
  // A pending question retains its saved phase/time. Opening the *next* question expires prior undo.
  const timer=tie.pending?.timer ?? initialTimer(game.timerEnabled);
  const revealed=!!tie.pending?.revealed;
  return { ...game, phase:revealed?'tie-scoring':'tie-question', tie:{...tie,correctionEligible:false,status:revealed?'scoring':'question',pending:{index:tie.confirmed.length,timer,revealed}}, timer };
}
export function returnToTiePreparation(game: Session): Session {
  if (game.phase !== 'tie-question' || !game.tie?.pending) throw new Error('لا يوجد سؤال فاصل مفتوح');
  const timer=game.timer ? {...game.timer,paused:true}:undefined;
  return {...game,phase:'tie-ready',timer:undefined,tie:{...game.tie,status:'ready',pending:{...game.tie.pending,timer}}};
}
export function revealTieAnswer(game: Session): Session {
  if(!['tie-question','tie-scoring'].includes(game.phase) || !game.tie?.pending) throw new Error('لا يوجد سؤال فاصل مفتوح');
  const timer = game.timer ? { ...game.timer, paused: true } : game.tie.pending.timer;
  return {...game,phase:'tie-scoring',timer,tie:{...game.tie,status:'scoring',pending:{...game.tie.pending,timer,revealed:true}}};
}
export function confirmTieAnswer(game:Session, outcome:Outcome): Session {
  const tie=game.tie;
  if(game.phase!=='tie-scoring'|| !tie?.pending || tie.pending.index!==tie.confirmed.length) throw new Error('لا يوجد سؤال فاصل للتقييم');
  const confirmed=[...tie.confirmed,outcome];
  if (tie.format === 'shootout' && outcome !== 'neither' && outcome !== tieStarter(tie)) throw new Error('الفريق الآخر لا يجيب عن هذا السؤال');
  const result=shootoutResult({...tie,confirmed});
  const finished=result !== undefined;
  return {...game,phase:finished?'result':'tie-ready',timer:undefined,
    result,
    tie:{...tie,confirmed,correctionEligible:true,pending:undefined,status:finished?'finished':'ready',earlyDraw:false}};
}
export function resumeEarlyDraw(game:Session):Session {
  if(game.phase!=='result'||!game.tie?.earlyDraw)throw new Error('لا توجد جولة فاصلة قابلة للاستئناف');
  return {...game,phase:'tie-ready',result:undefined,tie:{...game.tie,earlyDraw:false,status:'ready'}};
}
export function beginTieCorrection(game:Session):Session {
  if(!game.tie || game.tie.correctionEligible === false || !['tie-ready','result'].includes(game.phase) || !game.tie.confirmed.length || game.tie.earlyDraw) throw new Error('لا توجد نتيجة فاصلة للتصحيح');
  if(game.phase==='tie-ready' && game.tie.pending) throw new Error('هناك سؤال فاصل قيد التنفيذ');
  const tie=game.tie;
  return {...game,phase:'tie-correction',tie:{...tie,status:'correction',correction:{original:structuredClone(tie),selected:tie.confirmed.at(-1)}}};
}
export function setTieCorrection(game:Session,selected:Outcome):Session {
  if(game.phase!=='tie-correction'||!game.tie?.correction)throw new Error('لا يوجد تصحيح فاصل');
  return {...game,tie:{...game.tie,correction:{...game.tie.correction,selected}}};
}
export function cancelTieCorrection(game:Session):Session {
  if(game.phase!=='tie-correction'||!game.tie?.correction)throw new Error('لا يوجد تصحيح فاصل');
  const original=game.tie.correction.original;
  return {...game,tie:original,phase:original.status==='finished'?'result':'tie-ready',result:original.status==='finished'?shootoutResult(original):undefined};
}
export function confirmTieCorrection(game:Session):Session {
  if(game.phase!=='tie-correction'||!game.tie?.correction?.selected)throw new Error('اختر النتيجة');
  const { original,selected }=game.tie.correction;
  const confirmed=[...original.confirmed.slice(0,-1),selected];
  const owner = (confirmed.length - 1) % 2 === 0 ? original.first : opposite(original.first);
  if (original.format === 'shootout' && selected !== 'neither' && selected !== owner) throw new Error('الفريق الآخر لا يجيب عن هذا السؤال');
  const result=shootoutResult({...original,confirmed});
  const finished=result !== undefined;
  return {...game,phase:finished?'result':'tie-ready',result,
    tie:{...original,confirmed,status:finished?'finished':'ready',earlyDraw:false}};
}
