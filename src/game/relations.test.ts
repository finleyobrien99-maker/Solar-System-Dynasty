import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { clanRegions, ruler } from './core';
import { designateHeir } from './family';
import {
  addFeeling,
  feelingNow,
  lovers,
  marriageMood,
  neglectedFor,
  opinionLines,
  opinionOf,
  relationOf,
  relationsTick,
  spendTime,
  timeBlocker,
  TIME_PER_CYCLE,
} from './relations';
import { executePrisoner } from './intrigue';
import type { Character, GameState } from './types';
import { createWorld, rollRuler, startGame } from './world';

function game(): GameState {
  const s = createWorld(21);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(21, 'mars', 'F', 'Ines'), focus: 'dip', age: 35, family: 'married' });
  return s;
}

function kid(s: GameState, age: number, traits: string[] = []): Character {
  const r = ruler(s);
  const c = createCharacter(s, { born: s.year - age, clanId: s.playerClanId, planetId: 'mars', motherId: r.id, traits });
  r.childrenIds.push(c.id);
  return c;
}

/** Let cycles pass for relationships only, without the rest of the world moving. */
function cycles(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) {
    s.year += 1;
    relationsTick(s);
  }
}

describe('relationships', () => {
  it('starts from personality, family, faith and looks', () => {
    const s = game();
    const r = ruler(s);
    r.traits = ['brave', 'calm'];
    const c = kid(s, 20, ['brave', 'wrathful', 'comely']);
    c.faithId = r.faithId;
    const lines = Object.fromEntries(opinionLines(s, r, c).map((l) => [l.label, l.value]));
    expect(lines).toEqual({ 'Both Brave': 5, 'Calm vs Wrathful': -10, 'My child': 20, 'Shares my faith': 10, Comely: 3 });
    expect(opinionOf(s, r, c)).toBe(28);
    c.faithId = 'machine';
    r.traits.push('zealous');
    expect(opinionLines(s, r, c).find((l) => l.label === 'A different faith')?.value).toBe(-20);
  });

  it('remembers feelings that fade, and replaces a feeling with the same key', () => {
    const s = game();
    const r = ruler(s);
    const c = kid(s, 20);
    const base = opinionOf(s, c, r);
    addFeeling(s, c.id, r.id, { why: 'A grudge', value: -30, decay: 2, key: 'grudge' });
    expect(opinionOf(s, c, r)).toBe(base - 30);
    cycles(s, 5);
    expect(opinionOf(s, c, r)).toBe(base - 20);
    addFeeling(s, c.id, r.id, { why: 'A bigger grudge', value: -50, decay: 0, key: 'grudge' });
    expect(relationOf(s, c.id, r.id)!.feelings).toHaveLength(1);
    expect(feelingNow({ why: '', value: 10, decay: 3, year: 0 }, 5)).toBe(0);
  });

  it('a child ignored for 10 cycles turns hostile, and time together wins them back', () => {
    const s = game();
    const r = ruler(s);
    const c = kid(s, 4);
    const fond = opinionOf(s, c, r);
    expect(fond).toBeGreaterThan(0);
    cycles(s, 10);
    expect(neglectedFor(s, c)).toBeGreaterThanOrEqual(10);
    expect(opinionOf(s, c, r)).toBeLessThan(0);
    expect(spendTime(s, c.id, 'dinner')).toBe(true);
    expect(opinionLines(s, c, r).some((l) => l.label === 'Neglected me')).toBe(false);
    expect(opinionOf(s, c, r)).toBeGreaterThan(fond);
    expect(timeBlocker(s, c.id)).toBe('You already saw them this cycle.');
  });

  it('limits how many people the ruler can see each cycle', () => {
    const s = game();
    const kids = Array.from({ length: TIME_PER_CYCLE + 1 }, () => kid(s, 10));
    for (const k of kids.slice(0, TIME_PER_CYCLE)) expect(spendTime(s, k.id, 'stargazing')).toBe(true);
    expect(spendTime(s, kids[TIME_PER_CYCLE].id, 'stargazing')).toBe(false);
  });

  it('the spouse resents a lover', () => {
    const s = game();
    const r = ruler(s);
    const spouse = s.characters[r.spouseId!];
    const before = opinionOf(s, spouse, r);
    const lover = createCharacter(s, {
      born: s.year - 30,
      clanId: Object.keys(s.clans).find((k) => k !== s.playerClanId)!,
      planetId: 'venus',
      adultExtras: true,
    });
    r.loverId = lover.id;
    lovers(s, r, lover);
    expect(opinionOf(s, spouse, r)).toBe(before - 40);
    relationsTick(s);
    expect(relationOf(s, r.id, lover.id)?.kind).toBe('lover');
  });

  it('whoever is passed over as heir resents it', () => {
    const s = game();
    const r = ruler(s);
    const elder = kid(s, 20);
    const younger = kid(s, 17);
    s.dynasty.law = 'designated';
    const before = opinionOf(s, elder, r);
    designateHeir(s, younger.id);
    expect(opinionOf(s, elder, r)).toBe(before - 30);
    expect(opinionLines(s, younger, r).some((l) => l.label === 'Passed over as heir')).toBe(false);
  });

  it('the family of an executed prisoner will not forget', () => {
    const s = game();
    const other = Object.values(s.clans).find((k) => !k.isPlayer)!;
    const mum = createCharacter(s, { born: s.year - 50, clanId: other.id, planetId: other.planetId, adultExtras: true });
    const son = createCharacter(s, { born: s.year - 25, clanId: other.id, planetId: other.planetId, motherId: mum.id, adultExtras: true });
    mum.childrenIds.push(son.id);
    son.prisonerOf = s.playerClanId;
    executePrisoner(s, son.id);
    const grief = opinionLines(s, mum, ruler(s)).find((l) => l.label === `Executed ${son.name}`);
    expect(grief?.value).toBe(-75);
    cycles(s, 20);
    // Executions barely fade: 0.2 a cycle.
    expect(opinionLines(s, mum, ruler(s)).find((l) => l.label === `Executed ${son.name}`)?.value).toBe(-71);
  });

  it('settles friends and rivals, at most three of each, and forgets the long dead', () => {
    const s = game();
    const r = ruler(s);
    const kids = Array.from({ length: 5 }, () => kid(s, 20));
    for (const k of kids) {
      addFeeling(s, r.id, k.id, { why: 'Loyal service', value: 60, decay: 0 });
      relationOf(s, r.id, k.id)!.together = s.year;
    }
    relationsTick(s);
    expect(kids.filter((k) => relationOf(s, r.id, k.id)?.kind === 'friend')).toHaveLength(3);
    const foe = kid(s, 20);
    addFeeling(s, r.id, foe.id, { why: 'Insulted me', value: -80, decay: 0 });
    relationsTick(s);
    expect(relationOf(s, r.id, foe.id)?.kind).toBe('rival');
    foe.died = s.year;
    cycles(s, 11);
    expect(relationOf(s, r.id, foe.id)).toBeUndefined();
  });

  it('measures a marriage by the colder partner', () => {
    const s = game();
    const r = ruler(s);
    const spouse = s.characters[r.spouseId!];
    addFeeling(s, spouse.id, r.id, { why: 'Cruelty', value: -90, decay: 0 });
    expect(marriageMood(s, r, spouse)).toBe(opinionOf(s, spouse, r));
    expect(marriageMood(s, r, spouse)).toBeLessThan(-40);
  });
});
