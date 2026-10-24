/** Small non-authoritative UI preferences. Game progress remains in IndexedDB. */
export interface SetupPreferences {
  teamAName: string;
  teamBName: string;
  teamAColor: string;
  teamBColor: string;
  timerEnabled: boolean;
  tieLimit: number;
  categoryCount: 4 | 6 | 8;
  categoryIds: string[];
}
const KEY = 'arabic-trivia:setup:v1';
const COLOR = /^#[0-9a-fA-F]{6}$/;
const CATEGORY = /^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?$/;

export function loadSetupPreferences(): SetupPreferences | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
    const p = value as Record<string, unknown>;
    if (typeof p.teamAName !== 'string' || typeof p.teamBName !== 'string' ||
        p.teamAName.length > 35 || p.teamBName.length > 35 ||
        typeof p.teamAColor !== 'string' || !COLOR.test(p.teamAColor) ||
        typeof p.teamBColor !== 'string' || !COLOR.test(p.teamBColor) ||
        p.teamAColor === p.teamBColor || typeof p.timerEnabled !== 'boolean' ||
        !Number.isInteger(p.tieLimit) || (p.tieLimit as number) < 1 || (p.tieLimit as number) > 5 ||
        ![4, 6, 8].includes(p.categoryCount as number) || !Array.isArray(p.categoryIds) ||
        p.categoryIds.length > 8 || p.categoryIds.some(id => typeof id !== 'string' || !CATEGORY.test(id)) ||
        new Set(p.categoryIds).size !== p.categoryIds.length) return;
    // Select supported fields so retired preferences are dropped on the next save.
    return { teamAColor:p.teamAColor, teamBColor:p.teamBColor, timerEnabled:p.timerEnabled,
      tieLimit:p.tieLimit, categoryCount:p.categoryCount, categoryIds:p.categoryIds,
      // Refreshes restore preferences; migrate only the former default names.
      teamAName: p.teamAName === 'الفريق الأول' ? 'فريق التحدي' : p.teamAName,
      teamBName: p.teamBName === 'الفريق الثاني' ? 'فريق المعرفة' : p.teamBName } as unknown as SetupPreferences;
  } catch { return; }
}

/** A blocked/full localStorage must not stop game play or IndexedDB saves. */
export function saveSetupPreferences(value: SetupPreferences): void {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* optional preference only */ }
}
