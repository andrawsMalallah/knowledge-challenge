import type { Outcome, Power, TeamId, Tier } from '../types/game';
export const opposite = (team: TeamId): TeamId => team === 'A' ? 'B' : 'A';
export const tiers: Tier[] = [200,400,600];
export const allowedDifficulty: Record<Tier, readonly number[]> = { 200:[1,2], 400:[2,3], 600:[3,4] };
export function scoreDelta(points: Tier, owner: TeamId, outcome: Outcome, power?: Power, powerTeam: TeamId = owner): Record<TeamId,number> {
  const delta = { A: 0, B: 0 };
  if (power === 'risk') {
    if (outcome === powerTeam) delta[powerTeam] += points * 2;
    else { delta[powerTeam] -= points; if (outcome !== 'neither') delta[outcome] += points; }
  } else if (power === 'gift') {
    // Includes the provisional +200 exactly once; commit applies this net delta once.
    delta[opposite(powerTeam)] += 200;
    if (outcome === powerTeam) delta[powerTeam] += 1200;
    else if (outcome !== 'neither') delta[outcome] += points;
  } else if (outcome !== 'neither') delta[outcome] += points;
  return delta;
}
export function eligibility(power: Power, actor: TeamId, turn: TeamId, hasOwn600: boolean, selectedTile: boolean, otherPowerActive: boolean): boolean {
  if (otherPowerActive) return false;
  if (power === 'steal') return actor !== turn && selectedTile;
  return actor === turn && !selectedTile && (power !== 'gift' || hasOwn600);
}
