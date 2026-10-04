import { describe, expect, it } from 'vitest';
import { aiAmbition, ambitionHouse } from './aiAmbition';
import { aiMarriages } from './aiCourt';
import { aiPlans, plotChance } from './aiIntrigue';
import { createCharacter } from './character';
import { alive, ch, clanRegions } from './core';
import { addFeeling, murdered } from './relations';
import type { Character, Clan, GameState } from './types';
import { createWorld, rollRuler, startGame } from './world';

const TEMPER = ['ambitious', 'wrathful', 'zealous', 'paranoid', 'craven', 'greedy', 'content', 'kind'];

function world(): GameState {
  const s = createWorld(91);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(91, 'mars', 'M', 'Corin'), focus: 'int', age: 40, family: 'married' });
  for (const k of Object.values(s.clans)) {
    if (k.isPlayer) continue;
    const h = ch(s, k.headId);
    if (!alive(h)) continue;
    h.traits = h.traits.filter((t) => !TEMPER.includes(t));
    h.born = s.year - 35;
    // A grown child each, so nobody is hunting for an heir unless a test says so.
    const kid = createCharacter(s, { gender: 'M', born: s.year - 16, clanId: k.id, planetId: k.planetId, fatherId: h.id });
    h.childrenIds.push(kid.id);
  }
  return s;
}

function landed(s: GameState): Clan[] {
  return Object.values(s.clans).filter((k) => !k.isPlayer && clanRegions(s, k.id).length && alive(ch(s, k.headId)));
}

function headOf(s: GameState, k: Clan): Character {
  return s.characters[k.headId];
}

/** Two landed AI houses on the same planet. */
function neighbours(s: GameState): [Clan, Clan] {
  for (const a of landed(s)) {
    const b = landed(s).find((o) => o.id !== a.id && o.planetId === a.planetId);
    if (b) return [a, b];
  }
  throw new Error('no neighbours');
}

describe('AI lords want things', () => {
  it('a lord whose wife you murdered wants revenge on you above everything', () => {
    const s = world();
    const [k] = landed(s);
    const lord = headOf(s, k);
    const wife = createCharacter(s, { gender: lord.gender === 'M' ? 'F' : 'M', born: s.year - 30, clanId: k.id, planetId: k.planetId, adultExtras: true });
    lord.spouseId = wife.id;
    wife.spouseId = lord.id;
    murdered(s, wife, s.rulerId, true);
    const a = aiAmbition(s, k);
    expect(a.kind).toBe('revenge');
    expect(a.target).toBe(s.rulerId);
    expect(ambitionHouse(s, a)).toBe(s.playerClanId);
    expect(a.text).toContain('murdered');
    expect(plotChance(lord, a.kind)).toBeGreaterThan(plotChance(lord));
  });

  it('an ordinary insult is not a blood feud', () => {
    const s = world();
    const [k] = landed(s);
    addFeeling(s, k.headId, s.rulerId, { why: 'Insulted me', value: -80, decay: 0 });
    expect(aiAmbition(s, k).kind).not.toBe('revenge');
  });

  it('avengers go after the man who did it, even if he is no lord', () => {
    const s = world();
    const [a, b] = landed(s);
    const son = createCharacter(s, { gender: 'M', born: s.year - 25, clanId: b.id, planetId: b.planetId, fatherId: b.headId, adultExtras: true });
    headOf(s, b).childrenIds.push(son.id);
    addFeeling(s, a.headId, son.id, { why: 'Murdered my daughter', value: -90, decay: 0, grave: true });
    a.credits = 1000;
    expect(aiPlans(s, a).some((p) => p.kind === 'assassinate' && p.target.id === son.id)).toBe(true);
  });

  it('an ageing lord with no children sets about finding an heir, and marries fast', () => {
    const s = world();
    const [k] = landed(s);
    const lord = headOf(s, k);
    lord.childrenIds = [];
    lord.spouseId = undefined;
    lord.born = s.year - 58;
    expect(aiAmbition(s, k)).toMatchObject({ kind: 'heir', text: 'Marry and secure an heir' });
    let wed = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const t = structuredClone(s);
      t.seed = seed;
      aiMarriages(t);
      if (alive(ch(t, t.characters[k.headId].spouseId))) wed++;
    }
    expect(wed).toBeGreaterThan(12);
  });

  it('a zealot crusades against a weaker neighbour of another faith', () => {
    const s = world();
    const [a, b] = neighbours(s);
    headOf(s, a).traits.push('zealous');
    a.fleet = 80;
    b.fleet = 30;
    b.faithId = a.faithId === 'solar' ? 'veiled' : 'solar';
    const amb = aiAmbition(s, a);
    expect(amb.kind).toBe('crusade');
  });

  it('an ambitious lord with ships wants the land of the neighbour he hates most', () => {
    const s = world();
    const [a, b] = neighbours(s);
    headOf(s, a).traits.push('ambitious');
    a.fleet = 200;
    addFeeling(s, a.headId, b.headId, { why: 'Insulted me', value: -60, decay: 0 });
    expect(aiAmbition(s, a)).toMatchObject({ kind: 'conquest', target: b.id });
  });

  it('a house under attack just wants to survive', () => {
    const s = world();
    const [a, b] = neighbours(s);
    s.aiWars.push({ id: 'aw-t', attacker: b.id, defender: a.id, target: clanRegions(s, a.id)[0].id, started: s.year, progress: 0 });
    expect(aiAmbition(s, a)).toMatchObject({ kind: 'security', target: b.id });
  });

  it('a lord with nothing pressing prospers in peace, or fills the treasury if greedy', () => {
    const s = world();
    const [k] = landed(s);
    expect(aiAmbition(s, k).kind).toBe('peace');
    headOf(s, k).traits.push('greedy');
    expect(aiAmbition(s, k).kind).toBe('wealth');
  });
});
