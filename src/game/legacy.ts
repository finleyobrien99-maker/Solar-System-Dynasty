// A factual summary of one ruler, without invented ratings or dynasty-wide totals.
import { ageOf, fullName } from './core';
import { DEED_LABELS, type Deed } from './epithetDefs';
import type { Character, GameState } from './types';

const PRIORITIES: readonly Deed[] = [
  'kinslayings',
  'oathsBroken',
  'capitalsTaken',
  'independence',
  'regionsTaken',
  'warsWon',
  'warsLost',
  'battlesWon',
  'defensiveWins',
  'assassinations',
  'executions',
  'cruelty',
  'arbitrary',
  'kindness',
  'justice',
  'pardons',
  'development',
  'research',
  'splices',
  'vats',
  'clones',
  'charity',
  'shipsBuilt',
  'schemes',
  'familyVisits',
  'studies',
  'pilgrimages',
];
const HIGHLIGHTS = [...new Set<Deed>([...PRIORITIES, ...(Object.keys(DEED_LABELS) as Deed[])])].filter(
  (deed) => !['age', 'rulingYears', 'children', 'grandchildren'].includes(deed),
);
export function rulerLegacy(s: GameState, c: Character) {
  const reigns = s.dynasty.rulers.filter((r) => r.id === c.id);
  const rep = c.reputation;
  const end = c.died ?? s.year;
  const rulingYears = reigns.length ? reigns.reduce((n, r) => n + Math.max(0, (r.to ?? end) - r.from), 0) : (rep?.deeds.rulingYears ?? 0);
  const children = rep?.deeds.children ?? c.childrenIds.length;
  const grandchildren = rep?.deeds.grandchildren ?? new Set(c.childrenIds.flatMap((id) => s.characters[id]?.childrenIds ?? [])).size;
  const highlights = HIGHLIGHTS.map((deed) => ({ deed, label: DEED_LABELS[deed], value: rep?.deeds[deed] ?? 0 }))
    .filter((x) => Number.isFinite(x.value) && x.value > 0)
    .slice(0, 8);
  return { name: fullName(s, c), age: ageOf(s, c), rulingYears, children, grandchildren, highlights, recordedSince: rep?.since };
}
