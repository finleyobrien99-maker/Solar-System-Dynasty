// The court council: five seats filled from your family. Each seat uses one
// stat and boosts a different part of the realm.

import { ageOf, alive, ch, effStats, isBloodlineClan, log } from './core';
import { chance } from './rng';
import { STAT_NAMES } from './traits';
import type { Character, CouncilRole, GameState, StatKey } from './types';

export interface RoleDef {
  name: string;
  stat: StatKey;
  desc: string;
  effect: (v: number) => string;
}

export const ROLES: Record<CouncilRole, RoleDef> = {
  envoy: {
    name: 'Envoy',
    stat: 'dip',
    desc: 'Smooths things over with every other house.',
    effect: (v) => `+${Math.floor(v / 3)} opinion from every house, +${v}% alliance and peace odds`,
  },
  admiral: {
    name: 'Admiral',
    stat: 'cmd',
    desc: 'Runs the fleet. Commands any battle you don\'t lead in person.',
    effect: (v) => `+${v}% fleet strength; uses their Command when it beats yours`,
  },
  treasurer: {
    name: 'Treasurer',
    stat: 'eco',
    desc: 'Keeps the books and the trade lanes.',
    effect: (v) => `+${v}% region income, +${Math.floor(v / 6)} trade route slot${Math.floor(v / 6) === 1 ? '' : 's'}`,
  },
  spymaster: {
    name: 'Spymaster',
    stat: 'int',
    desc: 'Your knives in the dark, and your shield against theirs.',
    effect: (v) => `+${v}% scheme success, harder for rivals to plot against you`,
  },
  scientist: {
    name: 'Chief Scientist',
    stat: 'sci',
    desc: 'Runs the academies and the Gene-Forge.',
    effect: (v) => `Faster schooling and gene research, safer implants (${STAT_NAMES.sci} ${v})`,
  },
};

export const ROLE_KEYS = Object.keys(ROLES) as CouncilRole[];

export function councillor(s: GameState, role: CouncilRole): Character | undefined {
  const c = ch(s, s.council[role]);
  return alive(c) && !c.prisonerOf ? c : undefined;
}

/** The councillor's relevant stat, or 0 if the seat is empty. */
export function councilStat(s: GameState, role: CouncilRole): number {
  const c = councillor(s, role);
  return c ? effStats(s, c)[ROLES[role].stat] : 0;
}

export function canServe(s: GameState, c: Character): boolean {
  if (!alive(c) || c.prisonerOf || c.id === s.rulerId || ageOf(s, c) < 16) return false;
  if (isBloodlineClan(s, c.clanId)) return true;
  const spouse = ch(s, c.spouseId);
  return !!spouse && alive(spouse) && isBloodlineClan(s, spouse.clanId);
}

export function candidates(s: GameState, role: CouncilRole): Character[] {
  const stat = ROLES[role].stat;
  return Object.values(s.characters)
    .filter((c) => canServe(s, c))
    .sort((a, b) => effStats(s, b)[stat] - effStats(s, a)[stat]);
}

export function appoint(s: GameState, role: CouncilRole, id: string): void {
  const c = s.characters[id];
  if (!c || !canServe(s, c)) return;
  for (const r of ROLE_KEYS) if (s.council[r] === id) delete s.council[r];
  s.council[role] = id;
  log(s, `${c.name} is appointed ${ROLES[role].name}.`, 'info');
}

export function dismiss(s: GameState, role: CouncilRole): void {
  delete s.council[role];
}

export function roleOf(s: GameState, id: string): CouncilRole | undefined {
  return ROLE_KEYS.find((r) => s.council[r] === id);
}

/** Clear empty seats; serving councillors slowly get better at the job. */
export function councilTick(s: GameState): void {
  for (const role of ROLE_KEYS) {
    const id = s.council[role];
    if (!id) continue;
    const c = s.characters[id];
    if (!c || !canServe(s, c)) {
      if (c && c.died !== undefined) log(s, `The seat of ${ROLES[role].name} stands empty after ${c.name}'s death.`, 'info');
      delete s.council[role];
      continue;
    }
    const stat = ROLES[role].stat;
    if (chance(s, 0.25) && c.base[stat] < 15) c.base[stat] += 1;
  }
}
