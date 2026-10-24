import type { Power, Session, TeamId, Tier } from '../types/game';
import { eligibility, opposite, scoreDelta } from './rules';

export const POWER_LABELS: Record<Power, string> = {
  risk: 'مخاطرة النقاط', gift: 'الهدية المسمومة', steal: 'خطف السؤال'
};

export function available(game: Session, power: Power, actor: TeamId): boolean {
  if (game.phase !== 'board' && game.phase !== 'prequestion') return false;
  if (game.teams[actor].used.includes(power)) return false;
  const selected = !!game.activeId;
  const hasOwn600 = game.tiles.some(t => t.owner === actor && t.question.points === 600 && !t.completed);
  if (power === 'steal') {
    return game.phase === 'prequestion' && selected && actor === opposite(game.turn) &&
      (!game.activePower || (game.activePower === 'steal' && game.activePowerTeam === actor));
  }
  return eligibility(power, actor, game.turn, hasOwn600, selected,
    !!game.activePower && (game.activePower === 'steal' || game.activePowerTeam !== actor));
}

/** Provisional Gift +200 is a real persisted score while selected, refunded on cancellation. */
export function togglePower(game: Session, power: Power, actor: TeamId): Session {
  if (game.activePower === power && game.activePowerTeam === actor) {
    if (!['board', 'prequestion'].includes(game.phase)) throw new Error('لا يمكن إلغاء قوة ملتزمة');
    return clearPower(game);
  }
  if (!available(game, power, actor)) throw new Error('هذه القوة غير متاحة الآن');
  const cleared = clearPower(game);
  const teams = power === 'gift' ? {
    ...cleared.teams,
    [opposite(actor)]: { ...cleared.teams[opposite(actor)], score: cleared.teams[opposite(actor)].score + 200 }
  } : cleared.teams;
  return { ...cleared, teams, activePower: power, activePowerTeam: actor };
}

export function clearPower(game: Session): Session {
  if (game.activePower !== 'gift' || !game.activePowerTeam) {
    return { ...game, activePower: undefined, activePowerTeam: undefined };
  }
  const recipient = opposite(game.activePowerTeam);
  return { ...game, activePower: undefined, activePowerTeam: undefined,
    teams: { ...game.teams, [recipient]: { ...game.teams[recipient], score: game.teams[recipient].score - 200 } }
  };
}

export function selectOwnTile(game: Session, id: string): Session {
  if (game.phase !== 'board' || game.activeId) throw new Error('لا يمكن اختيار سؤال الآن');
  const tile = game.tiles.find(t => t.question.id === id);
  if (!tile || tile.completed || tile.owner !== game.turn) throw new Error('هذا السؤال ليس متاحًا لفريقك');
  if (game.activePower === 'gift' && tile.question.points !== 600) throw new Error('الهدية المسمومة تتطلب سؤال 600');
  return { ...game, activeId: id, phase: 'prequestion' };
}

export function cancelSelection(game: Session): Session {
  if (game.phase !== 'prequestion') throw new Error('لا يوجد سؤال مختار');
  // Steal locks the selection until the opposing team explicitly cancels it.
  if (game.activePower === 'steal') throw new Error('يجب إلغاء خطف السؤال أولًا');
  return { ...clearPower(game), activeId: undefined, phase: 'board' };
}

export function commitPower(game: Session): Session {
  if (!game.activePower || !game.activePowerTeam) return game;
  const team = game.activePowerTeam;
  if (game.teams[team].used.includes(game.activePower)) throw new Error('استخدمت هذه القوة سابقًا');
  return { ...game, teams: { ...game.teams,
    [team]: { ...game.teams[team], used: [...game.teams[team].used, game.activePower] } } };
}

export function additionalDelta(game: Session, points: Tier, outcome: TeamId | 'neither'): Record<TeamId,number> {
  const original = scoreDelta(points, game.turn, outcome, game.activePower, game.activePowerTeam);
  if (game.activePower === 'gift' && game.activePowerTeam) original[opposite(game.activePowerTeam)] -= 200;
  return original;
}
