// Creating characters: looks, stats, starting traits.

import { ageOf, newId } from './core';
import { makeName, PLANET_BY_ID } from './planets';
import { chance, clamp, int, pick, rand, weighted, type Seeded } from './rng';
import { addTrait, conflicts, GENETIC, PERSONALITY, TRAITS } from './traits';
import { STAT_KEYS, type Appearance, type Character, type GameState, type Gender, type StatKey } from './types';

// Rough skin-tone lean per world, so each culture has a recognisable look.
const SKIN_BIAS: Record<string, [number, number]> = {
  mercury: [2, 6],
  venus: [1, 5],
  earth: [0, 7],
  mars: [2, 6],
  ceres: [0, 7],
  jupiter: [1, 5],
  saturn: [0, 5],
  uranus: [0, 3],
  neptune: [1, 6],
  pluto: [0, 3],
};

export function randomLooks(s: Seeded, planetId: string): Appearance {
  const [lo, hi] = SKIN_BIAS[planetId] ?? [0, 7];
  return {
    skin: int(s, lo, hi),
    hair: chance(s, 0.12) ? 7 : int(s, 0, 6),
    hairStyle: int(s, 0, 7),
    eyes: chance(s, 0.08) ? 6 : int(s, 0, 5),
    face: int(s, 0, 3),
    nose: int(s, 0, 3),
    mouth: int(s, 0, 3),
    brow: int(s, 0, 2),
    beard: int(s, 0, 3),
  };
}

export function inheritLooks(s: Seeded, a: Appearance | undefined, b: Appearance | undefined, planetId: string): Appearance {
  if (!a || !b) return randomLooks(s, planetId);
  const from = (k: keyof Appearance) => (rand(s) < 0.5 ? a[k] : b[k]);
  return {
    skin: clamp(Math.round((a.skin + b.skin) / 2 + (rand(s) - 0.5) * 1.6), 0, 7),
    hair: chance(s, 0.06) ? int(s, 0, 7) : from('hair'),
    hairStyle: int(s, 0, 7),
    eyes: chance(s, 0.06) ? int(s, 0, 6) : from('eyes'),
    face: from('face'),
    nose: from('nose'),
    mouth: from('mouth'),
    brow: from('brow'),
    beard: int(s, 0, 3),
  };
}

export function randomGenetic(s: Seeded, count: number, existing: string[] = []): string[] {
  let traits = existing.slice();
  for (let i = 0; i < count; i++) {
    const options = GENETIC.filter((t) => !traits.some((x) => conflicts(x, t.id))).map((t) => [t.id, t.mutation ?? 1] as const);
    if (!options.length) break;
    traits = addTrait(traits, weighted(s, options));
  }
  return traits;
}

const FOCUS_BIAS: Record<StatKey, string[]> = {
  dip: ['gregarious', 'generous', 'honest', 'kind', 'calm'],
  cmd: ['brave', 'wrathful', 'impatient', 'ambitious', 'cruel'],
  eco: ['diligent', 'greedy', 'just', 'patient', 'content'],
  int: ['deceitful', 'paranoid', 'cruel', 'ambitious', 'cynical'],
  sci: ['patient', 'shy', 'diligent', 'cynical', 'humble'],
};

export function randomPersonality(s: Seeded, target: number, existing: string[], focus?: StatKey, banned: string[] = []): string[] {
  const traits = existing.slice();
  let guard = 0;
  while (traits.filter((t) => TRAITS[t]?.cat === 'personality').length < target && guard++ < 40) {
    const pool = focus && rand(s) < 0.45 ? FOCUS_BIAS[focus] : PERSONALITY.map((t) => t.id);
    const id = pick(s, pool);
    if (banned.includes(id)) continue;
    if (traits.some((t) => conflicts(t, id))) continue;
    traits.push(id);
  }
  return traits;
}

export function eduTrait(focus: StatKey, tier: number): string {
  return `edu_${focus}_${clamp(tier, 1, 4)}`;
}

export interface CreateOpts {
  gender?: Gender;
  born: number;
  clanId: string;
  planetId: string;
  faithId?: string;
  fatherId?: string;
  motherId?: string;
  traits?: string[];
  looks?: Appearance;
  name?: string;
  /** Generate adult extras (education, personality) for NPCs created as adults. */
  adultExtras?: boolean;
  geneticCount?: number;
}

export function createCharacter(s: GameState, o: CreateOpts): Character {
  const gender = o.gender ?? (chance(s, 0.5) ? 'M' : 'F');
  const r = () => rand(s);
  const base = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) base[k] = int(s, 1, 7);
  let traits = o.traits ? o.traits.slice() : randomGenetic(s, o.geneticCount ?? (chance(s, 0.55) ? 1 : chance(s, 0.4) ? 2 : 0));
  const c: Character = {
    id: newId(s, 'c'),
    name: o.name ?? makeName(o.planetId, gender, r),
    gender,
    born: o.born,
    clanId: o.clanId,
    planetId: o.planetId,
    faithId: o.faithId ?? PLANET_BY_ID[o.planetId]?.faithId ?? 'solar',
    fatherId: o.fatherId,
    motherId: o.motherId,
    childrenIds: [],
    traits: [],
    base,
    health: 100,
    looks: o.looks ?? randomLooks(s, o.planetId),
  };
  if (o.adultExtras && ageOf(s, c) >= 16) {
    const focus = pick(s, STAT_KEYS);
    traits = randomPersonality(s, 3, traits, focus);
    const tier = weighted(s, [
      [1, 30],
      [2, 40],
      [3, 22],
      [4, 8],
    ] as const);
    traits.push(eduTrait(focus, tier));
    base[focus] += 2;
  }
  c.traits = traits;
  c.health = 100;
  s.characters[c.id] = c;
  return c;
}
