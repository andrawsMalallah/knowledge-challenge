export type TeamId = 'A' | 'B';
export type Outcome = TeamId | 'neither';
export type Tier = 200 | 400 | 600;
export type Power = 'risk' | 'gift' | 'steal';
export type Difficulty = 1 | 2 | 3 | 4 | 5;
import type { TimerState } from '../engine/timer';
export interface Question { id: string; categoryId: string; points: Tier; difficultyLevel: Difficulty; question: string; answer: string; image?: string; explanation?: string; }
export interface TieQuestion { id: string; difficultyLevel: 4 | 5; question: string; answer: string; image?: string; explanation?: string; }
export interface Category { id: string; name: string; image?: string; }
export interface Category { questionFile?: string; isPlayable?: boolean; }
export interface Question { imageAlt?:string; }
export interface TieQuestion { imageAlt?:string; }
export interface Team { id: TeamId; name: string; color: string; score: number; used: Power[]; }
export interface Tile { question: Question; owner: TeamId; completed: boolean; outcome?: Outcome; }
export interface ScoreRecord {
  questionId: string;
  outcome: Outcome;
  before: Record<TeamId, number>;
  after: Record<TeamId, number>;
  power?: Power;
  powerTeam?: TeamId;
  turnBefore: TeamId;
  corrected: boolean;
}
export interface CorrectionState { original: SessionSnapshot; selected?: Outcome; }
export interface SessionSnapshot {
  teams: Record<TeamId, Team>;
  tiles: Tile[];
  turn: TeamId;
  phase: Session['phase'];
  activeId?: string;
  activePower?: Power;
  activePowerTeam?: TeamId;
  timer?: TimerState;
  result?: Outcome;
  lastRecord?: ScoreRecord;
  tie?: TieBreakerState;
}
export interface TieBreakerState {
  format?: 'shootout';
  correctionEligible?: boolean;
  questions: TieQuestion[];
  confirmed: Outcome[];
  first: TeamId;
  status: 'intro'|'ready'|'question'|'scoring'|'correction'|'finished';
  pending?: { index: number; timer?: TimerState; revealed?: boolean };
  earlyDraw: boolean;
  correction?: { original: TieBreakerState; selected?: Outcome };
}
export interface Session {
  boardScrollY?: number;
  history?: ScoreRecord[];
}
export interface Session { version: 1; teams: Record<TeamId,Team>; categories: Category[]; tiles: Tile[]; turn: TeamId; timerEnabled: boolean; tieLimit: number; phase: 'board'|'prequestion'|'question'|'scoring'|'tiebreaker'|'result'|'correction'|'tie-intro'|'tie-ready'|'tie-question'|'tie-scoring'|'tie-correction'; tie?: TieBreakerState; activeId?: string; activePower?: Power; activePowerTeam?: TeamId; result?: Outcome; pendingOutcome?: Outcome; timer?: TimerState; lastRecord?: ScoreRecord; correction?: CorrectionState; }
