import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { ageOf, alive, canAct, ch, clanRegions, regentHolding, ruler } from './core';
import { getFlag } from './eventKit';
import { activityBlocker } from './activities';
import { abdicationBlocker, killCharacter, regencyActive } from './life';
import {
  CHALLENGE_FLAG,
  CHOICE_FLAG,
  clingChance,
  clinging,
  extendRegency,
  gripOf,
  guardianBlocker,
  guardianWard,
  majorityYear,
  MAX_CLING,
  nameGuardian,
  namedGuardian,
  regencyOf,
  regencyTick,
  regentCandidates,
  regentOf,
  skimRate,
} from './regency';
import { feelingsSum } from './relations';
import type { Character, Clan, GameState } from './types';
import { warBlocker } from './war';
import { createWorld, rollRuler, startGame } from './world';

const PERSONAL = [
  'ambitious',
  'content',
  'greedy',
  'generous',
  'honest',
  'deceitful',
  'humble',
  'arrogant',
  'kind',
  'cruel',
  'wrathful',
  'patient',
  'paranoid',
  'gregarious',
];

function world(seed = 3): GameState {
  const s = createWorld(seed + 700);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(seed, 'mars', 'M', 'Oren'), focus: 'dip', age: 34, family: 'married' });
  Object.assign(s, { credits: 1000, prestige: 300, fleet: 60 });
  s.pending = [];
  return s;
}

function plain(c: Character, traits: string[] = []): Character {
  c.traits = [...c.traits.filter((t) => !PERSONAL.includes(t)), ...traits];
  return c;
}

/** The ruler's only child, and a grown brother of the ruler (an uncle to the child). */
function family(s: GameState, age: number) {
  const r = ruler(s);
  const mother = s.characters[r.spouseId!];
  const ward = createCharacter(s, { gender: 'F', born: s.year - age, clanId: s.playerClanId, planetId: 'mars', fatherId: r.id, motherId: mother.id });
  r.childrenIds.push(ward.id);
  mother.childrenIds.push(ward.id);
  let grandfather = ch(s, r.fatherId);
  if (!grandfather) {
    grandfather = createCharacter(s, { gender: 'M', born: s.year - 70, clanId: s.playerClanId, planetId: 'mars', adultExtras: true });
    grandfather.childrenIds.push(r.id);
    r.fatherId = grandfather.id;
  }
  const uncle = createCharacter(s, { gender: 'M', born: s.year - 40, clanId: s.playerClanId, planetId: 'mars', fatherId: grandfather.id, adultExtras: true });
  grandfather.childrenIds.push(uncle.id);
  return { ward, mother: plain(mother), uncle: plain(uncle) };
}

/** The ruler dies and a child inherits; the regency begins at the next tick. */
function orphan(s: GameState, age = 8) {
  const f = family(s, age);
  killCharacter(s, s.rulerId, 'a test');
  s.pending = [];
  expect(s.rulerId).toBe(f.ward.id);
  regencyTick(s);
  return f;
}

/** Make `who` the regent whatever the council would pick. */
function force(s: GameState, who: Character) {
  const f = getFlag(s, 'regent:' + s.playerClanId)!;
  f.data.id = who.id;
}

function grow(s: GameState, ward: Character) {
  while (ageOf(s, ward) < 16) {
    s.year += 1;
    regencyTick(s);
  }
}

describe('who rules for a child', () => {
  it('a child who inherits gets a named regent from the family, and the council lets you overrule it', () => {
    const s = world();
    const { ward, mother, uncle } = orphan(s);
    const reg = regencyOf(s, s.playerClanId)!;
    expect(reg.ward.id).toBe(ward.id);
    expect(reg.regent.id).toBe(mother.id);
    expect(regentCandidates(s, s.playerClanId, ward).map((c) => c.id)).toEqual(expect.arrayContaining([mother.id, uncle.id]));
    expect(getFlag(s, CHOICE_FLAG)?.due).toBe(s.year);
    expect(canAct(s)).toBe(false);
    expect(regencyActive(s)).toBe(true);
  });

  it('a guardian you named in advance takes the chair as you asked, with no council vote', () => {
    const s = world();
    const { ward, uncle } = family(s, 6);
    expect(guardianWard(s)?.id).toBe(ward.id);
    expect(guardianBlocker(s, s.rulerId)).toMatch(/not be there/);
    expect(nameGuardian(s, uncle.id)).toBe(true);
    expect(namedGuardian(s)?.id).toBe(uncle.id);
    killCharacter(s, s.rulerId, 'a test');
    s.pending = [];
    regencyTick(s);
    expect(regentOf(s, s.playerClanId)?.id).toBe(uncle.id);
    expect(getFlag(s, CHOICE_FLAG)).toBeUndefined();
    expect(s.pending.some((p) => p.kind === 'notice' && p.title === 'The Late Ruler’s Wish')).toBe(true);
  });

  it('nobody needs a guardian for a grown heir', () => {
    const s = world();
    const { ward, uncle } = family(s, 18);
    void ward;
    expect(guardianWard(s)).toBeUndefined();
    expect(nameGuardian(s, uncle.id)).toBe(false);
  });

  it('a regent who dies is replaced by the next best, with word sent', () => {
    const s = world();
    const { mother } = orphan(s);
    s.pending = [];
    killCharacter(s, mother.id, 'a test');
    s.year += 1;
    regencyTick(s);
    const next = regentOf(s, s.playerClanId);
    expect(next).toBeTruthy();
    expect(next!.id).not.toBe(mother.id);
    expect(s.pending.some((p) => p.kind === 'notice' && p.title === 'A New Regent')).toBe(true);
  });

  it('an old save with a child ruler and no regent gets one at the next cycle, and nobody fit means the old faceless council', () => {
    const s = world();
    const { ward, mother, uncle } = family(s, 8);
    killCharacter(s, s.rulerId, 'a test');
    for (const c of [mother, uncle, ...Object.values(s.characters).filter((c) => c.id !== ward.id)])
      if (c.clanId === s.playerClanId || c.id === mother.id) c.prisonerOf = 'nobody';
    for (const role of Object.keys(s.council)) delete s.council[role as keyof typeof s.council];
    regencyTick(s);
    expect(regencyOf(s, s.playerClanId)).toBeUndefined();
    expect(regencyActive(s)).toBe(true);
  });
});

describe('what a regent does', () => {
  it('a greedy regent quietly skims the treasury, capped; an honest one takes nothing', () => {
    const s = world();
    const { mother, uncle } = orphan(s);
    plain(uncle, ['greedy', 'deceitful']);
    force(s, uncle);
    expect(skimRate(uncle)).toBeCloseTo(0.08);
    const before = s.credits;
    s.year += 1;
    regencyTick(s);
    const taken = before - s.credits;
    expect(taken).toBeGreaterThan(0);
    expect(regencyOf(s, s.playerClanId)!.skimmed).toBe(taken);
    expect(regencyOf(s, s.playerClanId)!.exposed).toBe(false);
    plain(mother, ['honest', 'greedy']);
    expect(skimRate(mother)).toBe(0);
  });

  it('the child comes to love a kind regent and resent a cruel one', () => {
    const s = world();
    const { ward, uncle } = orphan(s);
    force(s, plain(uncle, ['cruel', 'wrathful']));
    for (let i = 0; i < 4; i++) {
      s.year += 1;
      regencyTick(s);
    }
    expect(feelingsSum(s, ward, uncle)).toBeLessThan(0);
    const t = world(5);
    const f = orphan(t);
    force(t, plain(f.uncle, ['kind', 'generous']));
    for (let i = 0; i < 4; i++) {
      t.year += 1;
      regencyTick(t);
    }
    expect(feelingsSum(t, f.ward, f.uncle)).toBeGreaterThan(0);
  });

  it('reading the regency, its candidates and its grip never changes anything', () => {
    const s = world();
    const { ward, uncle } = orphan(s);
    const before = JSON.stringify(s);
    regencyOf(s, s.playerClanId);
    regentCandidates(s, s.playerClanId, ward);
    gripOf(s, uncle, ward);
    guardianWard(s);
    regentHolding(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('coming of age', () => {
  it('an honest parent hands over the seal at sixteen', () => {
    const s = world();
    const { ward, mother } = orphan(s, 12);
    plain(mother, ['honest', 'content']);
    expect(clingChance(gripOf(s, mother, ward, s.year - 20))).toBe(0);
    s.pending = [];
    grow(s, ward);
    expect(regencyOf(s, s.playerClanId)).toBeUndefined();
    expect(canAct(s)).toBe(true);
    expect(s.pending.some((p) => p.kind === 'notice' && p.title === 'The Regent Steps Down')).toBe(true);
    expect(feelingsSum(s, ward, mother)).toBeGreaterThan(0);
  });

  it('an ambitious regent can cling on: the grown ruler still cannot act, until their time is up', () => {
    let seen = false;
    for (let seed = 1; seed < 40 && !seen; seed++) {
      const s = world(seed);
      const { ward, uncle } = orphan(s, 10);
      force(s, plain(uncle, ['ambitious', 'greedy', 'deceitful']));
      s.seed = seed * 101;
      grow(s, ward);
      if (!clinging(s, s.playerClanId)) continue;
      seen = true;
      const reg = regencyOf(s, s.playerClanId)!;
      expect(reg.until).toBeGreaterThan(s.year);
      expect(reg.until).toBeLessThanOrEqual(majorityYear(ward) + MAX_CLING);
      expect(ageOf(s, ward)).toBe(16);
      expect(canAct(s)).toBe(false);
      expect(regentHolding(s)).toBe(true);
      expect(getFlag(s, CHALLENGE_FLAG)?.due).toBe(s.year);
      const enemy = clanRegions(s, Object.values(s.clans).find((k) => !k.isPlayer && clanRegions(s, k.id).length)!.id)[0];
      expect(warBlocker(s, enemy)).toMatch(/regency/);
      expect(activityBlocker(s, 'gala')).toMatch(/regent/i);
      expect(abdicationBlocker(s)).toBeTruthy();
      expect(feelingsSum(s, ward, uncle)).toBeLessThan(0);
      while (regencyOf(s, s.playerClanId)) {
        s.year += 1;
        regencyTick(s);
      }
      expect(s.year).toBe(reg.until);
      expect(canAct(s)).toBe(true);
      expect(s.pending.some((p) => p.kind === 'notice' && p.title === 'At Last')).toBe(true);
    }
    expect(seen).toBe(true);
  });

  it('a failed challenge keeps them on a cycle longer, but never past the limit', () => {
    let done = false;
    for (let seed = 1; seed < 40 && !done; seed++) {
      const s = world(seed);
      const { ward, uncle } = orphan(s, 10);
      force(s, plain(uncle, ['ambitious', 'greedy', 'deceitful']));
      s.seed = seed * 101;
      grow(s, ward);
      if (!clinging(s, s.playerClanId)) continue;
      done = true;
      for (let i = 0; i < 6; i++) extendRegency(s);
      expect(regencyOf(s, s.playerClanId)!.until).toBe(majorityYear(ward) + MAX_CLING + 1);
    }
    expect(done).toBe(true);
  });
});

describe('AI houses have regents too', () => {
  function aiChild(s: GameState, age: number): { k: Clan; ward: Character; uncle: Character } {
    const k = Object.values(s.clans).find((x) => !x.isPlayer && clanRegions(s, x.id).length > 0 && alive(ch(s, x.headId)))!;
    const old = s.characters[k.headId];
    const ward = createCharacter(s, { gender: 'M', born: s.year - age, clanId: k.id, planetId: k.planetId, fatherId: old.id });
    old.childrenIds = [ward.id];
    const uncle = createCharacter(s, { gender: 'M', born: s.year - 38, clanId: k.id, planetId: k.planetId, adultExtras: true });
    const gf = createCharacter(s, { gender: 'M', born: s.year - 75, clanId: k.id, planetId: k.planetId, adultExtras: true });
    gf.childrenIds = [old.id, uncle.id];
    old.fatherId = gf.id;
    uncle.fatherId = gf.id;
    killCharacter(s, old.id, 'a test');
    k.headId = ward.id;
    return { k, ward, uncle: plain(uncle) };
  }

  it('a child lord gets a regent from the family', () => {
    const s = world();
    const { k, ward } = aiChild(s, 9);
    regencyTick(s);
    const reg = regencyOf(s, k.id);
    expect(reg?.ward.id).toBe(ward.id);
    expect(reg?.regent.id).not.toBe(ward.id);
  });

  it('an ambitious AI regent can keep the house; the child they set aside never forgets', () => {
    let seen = false;
    for (let seed = 1; seed < 200 && !seen; seed++) {
      const s = world(seed % 7);
      const { k, ward, uncle } = aiChild(s, 12);
      regencyTick(s);
      const f = getFlag(s, 'regent:' + k.id)!;
      f.data.id = uncle.id;
      f.data.since = s.year - 14;
      plain(uncle, ['ambitious', 'greedy', 'deceitful']);
      s.seed = seed * 37;
      for (let i = 0; i < 4; i++) {
        s.year += 1;
        regencyTick(s);
      }
      if (k.headId !== uncle.id) continue;
      seen = true;
      expect(regencyOf(s, k.id)).toBeUndefined();
      expect(feelingsSum(s, ward, uncle)).toBeLessThanOrEqual(-60);
      expect(alive(ward)).toBe(true);
    }
    expect(seen).toBe(true);
  });
});
