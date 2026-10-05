import { learnSecret, recordMurder } from './secrets';
// Realism: some things can't be bought back. Murder a lord's wife, get
// caught, then spend twenty years being charming and generous: he and his
// house should still hate you. An ordinary insult, though, can be mended.

import { describe, expect, it } from 'vitest';
import { opinionDrift } from './ai';
import { alive, ch, clanRegions, ruler } from './core';
import { createCharacter } from './character';
import { runScheme, sendGift } from './intrigue';
import { isRival, memorySum, memoryTick, remember } from './memory';
import { feelingsSum, opinionOf, relationsTick } from './relations';
import type { Clan, GameState } from './types';
import { createWorld, rollRuler, startGame } from './world';

function charmingRuler(): GameState {
  const s = createWorld(41);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(41, 'mars', 'F', 'Ines'), focus: 'dip', age: 40 });
  const r = ruler(s);
  r.base.dip = 10;
  r.base.int = 10;
  r.traits.push('kind', 'just', 'generous');
  Object.assign(s, { credits: 100000, prestige: 3000 });
  return s;
}

/** A house whose head is married. */
function marriedHouse(s: GameState): Clan {
  const k = Object.values(s.clans).find((x) => !x.isPlayer && alive(ch(s, x.headId)))!;
  const head = s.characters[k.headId];
  if (!alive(ch(s, head.spouseId))) {
    const wife = createCharacter(s, {
      gender: head.gender === 'M' ? 'F' : 'M',
      born: s.year - 35,
      clanId: k.id,
      planetId: k.planetId,
      faithId: k.faithId,
      adultExtras: true,
    });
    head.spouseId = wife.id;
    wife.spouseId = head.id;
  }
  return k;
}

/** Twenty years of charm offensives: a gift and a sway every cycle. */
function charmFor(s: GameState, k: Clan, years: number): void {
  for (let i = 0; i < years; i++) {
    s.year += 1;
    sendGift(s, k.id);
    remember(s, k.id, 'Charmed us', 20, 0.15);
    memoryTick(s);
    relationsTick(s);
    opinionDrift(s);
  }
}

describe('grudges that stick', () => {
  it("murdering a lord's wife is not forgiven, however charming you are", () => {
    let s: GameState | undefined;
    let k: Clan | undefined;
    // Find dice where the assassination works and you are caught.
    for (let seed = 1; seed < 2000 && !s; seed++) {
      const t = charmingRuler();
      const house = marriedHouse(t);
      const wife = t.characters[t.characters[house.headId].spouseId!];
      t.seed = seed;
      const ok = runScheme(t, 'assassinate', wife.id);
      if (ok && house.memories?.some((m) => m.text.startsWith('Murdered'))) {
        s = t;
        k = house;
      }
    }
    expect(s, 'found a caught assassination').toBeDefined();
    const head = s!.characters[k!.headId];
    const r = ruler(s!);
    expect(feelingsSum(s!, head, r)).toBe(-90);

    charmFor(s!, k!, 20);

    expect(feelingsSum(s!, head, r), 'the widower never forgets').toBe(-90);
    expect(opinionOf(s!, head, r)).toBeLessThanOrEqual(-50);
    expect(isRival(k!), 'still a sworn rival').toBe(true);
    expect(k!.opinion, 'the house still hates you').toBeLessThanOrEqual(-30);
  });

  it('an ordinary insult can be mended with charm', () => {
    const s = charmingRuler();
    const k = marriedHouse(s);
    remember(s, k.id, 'Publicly insulted our house', -35, 0.04);
    charmFor(s, k, 20);
    expect(isRival(k)).toBe(false);
    expect(k.opinion).toBeGreaterThan(0);
  });

  it('favours offset ordinary grudges in full but only a quarter of grave ones', () => {
    const s = charmingRuler();
    const k = marriedHouse(s);
    k.memories = [
      { text: 'Murdered our lord', year: s.year, value: -60, decay: 0.012, grave: true },
      { text: 'Sent us gifts', year: s.year, value: 100, decay: 0.15 },
    ];
    expect(memorySum(k)).toBe(-45);
    k.memories = [
      { text: 'Insulted us', year: s.year, value: -20, decay: 0.05 },
      { text: 'Sent us gifts', year: s.year, value: 30, decay: 0.15 },
    ];
    expect(memorySum(k)).toBe(10);
  });

  it('a house nursing a grave grudge sends your gifts back nearly unopened', () => {
    const s = charmingRuler();
    const k = marriedHouse(s);
    remember(s, k.id, 'Murdered our heir', -60, undefined, true);
    remember(s, k.id, 'Sent us gifts', 20);
    expect(k.memories!.find((m) => m.text === 'Sent us gifts')!.value).toBe(5);
  });

  it('blackmail leaves the victim and their house bitter for years', () => {
    let found = false;
    for (let seed = 1; seed < 500 && !found; seed++) {
      const s = charmingRuler();
      const k = marriedHouse(s);
      s.seed = seed;
      const headWithSecret = s.characters[k.headId];
      const victim = createCharacter(s, { clanId: k.id, born: s.year - 30, planetId: k.planetId });
      victim.died = s.year;
      learnSecret(s, recordMurder(s, headWithSecret, victim).id, s.rulerId);
      if (!runScheme(s, 'blackmail', k.id)) continue;
      found = true;
      const head = s.characters[k.headId];
      expect(feelingsSum(s, head, ruler(s))).toBe(-50);
      expect(k.memories!.find((m) => m.text === 'Blackmailed us')?.grave).toBe(true);
      charmFor(s, k, 10);
      expect(k.opinion).toBeLessThan(0);
    }
    expect(found).toBe(true);
  });
});
