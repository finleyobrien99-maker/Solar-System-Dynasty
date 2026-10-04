import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiTick, prune } from './ai';
import { createCharacter } from './character';
import { clanRegions, fullName, ruler, SAVE_VERSION } from './core';
import { DEED_LABELS, EPITHETS, primaryEpithet } from './epithetDefs';
import { awardEpithets, breakPeace, epithetsTick, recordDeed } from './epithets';
import { EVENT_BY_ID, queueEvent, resolveEvent } from './events';
import { cloneCharacter } from './forge';
import { purgeTrait, releaseTrait } from './genetics';
import { executePrisoner, releasePrisoner } from './intrigue';
import { killCharacter } from './life';
import { developRegion } from './realm';
import * as rng from './rng';
import { addFeeling, forget, lovers } from './relations';
import { exportSave, importSave, migrate } from './save';
import { endWar } from './war';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';

function game(vip = false) {
  const s = createWorld(21),
    clan = scenarioHouses(s, 'mars', 'governor')[0];
  return startGame(s, { clanId: clan.id, ruler: rollRuler(21, 'mars', 'F', 'Ines'), focus: 'dip', age: 35, family: 'kids', vip });
}
function earned(c: ReturnType<typeof ruler>) {
  return c.reputation?.earned.map((e) => e.id) ?? [];
}
function event(s: ReturnType<typeof game>, id: string, choice: number) {
  queueEvent(s, EVENT_BY_ID[id]);
  const p = [...s.pending].reverse().find((p) => p.kind === 'event' && p.eventId === id)!;
  resolveEvent(s, p.uid, choice);
}
afterEach(() => vi.restoreAllMocks());

describe('earned epithets', () => {
  it('has 57 distinct names with meaningful, attainable requirements and a silent empty reputation', () => {
    expect(EPITHETS).toHaveLength(57);
    expect(new Set(EPITHETS.map((t) => t.id)).size).toBe(57);
    expect(new Set(EPITHETS.map((t) => t.name)).size).toBe(57);
    expect(primaryEpithet()).toBeUndefined();
    for (const def of EPITHETS) {
      expect(def.rule.trim()).not.toBe('');
      expect(def.needs.some((n) => (n.min ?? 0) > 0)).toBe(true);
      for (const n of def.needs) expect(DEED_LABELS[n.deed]).toBeTruthy();
    }
  });
  it('does not grant names for personality, starting wealth or inherited land', () => {
    const s = game(),
      r = ruler(s);
    r.traits = ['just', 'cruel', 'genius'];
    s.credits = 100000;
    s.year++;
    epithetsTick(s);
    epithetsTick(s);
    expect(earned(r)).toEqual([]);
    expect(r.reputation!.deeds.rulingYears).toBe(1);
    expect(r.reputation!.deeds.income).toBeUndefined();
    expect(r.reputation!.deeds.regionsTaken).toBeUndefined();
  });
  it('earns the Just through real fair settlements, describes the deed and ignores an unaffordable choice', () => {
    const s = game(),
      r = ruler(s);
    s.credits = 0;
    event(s, 'strike', 0);
    expect(r.reputation!.deeds.justice).toBeUndefined();
    s.pending = [];
    s.credits = 1000;
    for (let i = 0; i < 5; i++) event(s, 'strike', 0);
    expect(earned(r)).toContain('just');
    const entry = r.reputation!.earned.find((e) => e.id === 'just')!;
    expect(entry.why).toContain('Fair judgements: 5');
    expect(entry.year).toBe(s.year);
    expect(EVENT_BY_ID.strike.choices[0].describe({ s, r, data: {} })).toContain('towards reputation');
    expect(fullName(s, r)).toContain('the Just');
  });
  it('builds a cruel reputation from executions and preserves it after a kinder reputation is earned', () => {
    const s = game(),
      r = ruler(s),
      other = Object.values(s.clans).find((k) => !k.isPlayer)!;
    for (let i = 0; i < 5; i++) {
      const c = createCharacter(s, { clanId: other.id, planetId: other.planetId, born: s.year - 20 });
      c.prisonerOf = s.playerClanId;
      executePrisoner(s, c.id);
      executePrisoner(s, c.id);
    }
    expect(r.reputation!.deeds.executions).toBe(5);
    expect(earned(r)).toEqual(expect.arrayContaining(['cruel', 'merciless']));
    s.year++;
    s.credits = 1000;
    for (let i = 0; i < 5; i++) event(s, 'strike', 0);
    expect(earned(r)).toContain('just');
    expect(earned(r)).toContain('cruel');
    const before = r.reputation!.earned.length;
    awardEpithets(s, r);
    expect(r.reputation!.earned).toHaveLength(before);
  });
  it('recognises mercy and family murder using actual prisoner actions', () => {
    const s = game(),
      r = ruler(s),
      other = Object.values(s.clans).find((k) => !k.isPlayer)!;
    for (let i = 0; i < 3; i++) {
      const c = createCharacter(s, { clanId: other.id, planetId: other.planetId, born: s.year - 20 });
      c.prisonerOf = s.playerClanId;
      releasePrisoner(s, c.id);
    }
    expect(earned(r)).toContain('merciful');
    const kid = s.characters[r.childrenIds[0]];
    kid.prisonerOf = s.playerClanId;
    executePrisoner(s, kid.id);
    expect(earned(r)).toContain('kinslayer');
    expect(primaryEpithet(r.reputation)?.id).toBe('kinslayer');
    const sibling = createCharacter(s, { clanId: other.id, planetId: other.planetId, born: s.year - 20, fatherId: r.fatherId });
    sibling.prisonerOf = s.playerClanId;
    executePrisoner(s, sibling.id);
    expect(r.reputation!.deeds.kinslayings).toBe(2);
  });
  it('counts development only after successful construction and counts distinct gene purges', () => {
    const s = game(true),
      r = ruler(s),
      reg = clanRegions(s, s.playerClanId)[0];
    s.credits = 100000;
    reg.dev = 1;
    for (let i = 0; i < 5; i++) {
      s.year++;
      expect(developRegion(s, reg.id)).toBe(true);
      expect(developRegion(s, reg.id)).toBe(false);
    }
    expect(r.reputation!.deeds.development).toBe(5);
    expect(earned(r)).toContain('builder');
    for (let i = 0; i < 5; i++) {
      purgeTrait(s, 'dim');
      releaseTrait(s, 'dim');
    }
    expect(r.reputation!.deeds.purges).toBe(1);
    expect(earned(r)).not.toContain('purifier');
  });
  it('credits actual AI fleet construction and battle wins to the AI ruler, including captured land', () => {
    const s = game(),
      a = Object.values(s.clans).find((k) => !k.isPlayer && clanRegions(s, k.id).length)!;
    const d = Object.values(s.clans).find((k) => !k.isPlayer && k.id !== a.id && clanRegions(s, k.id).length)!;
    const target = clanRegions(s, d.id)[0];
    d.liege = 'none';
    a.fleet = 1000000;
    d.fleet = 0;
    s.aiWars.push({ id: 'test-ai-war', attacker: a.id, defender: d.id, target: target.id, started: s.year, progress: 90 });
    vi.spyOn(rng, 'chance').mockImplementation((_, p) => p > 0.9);
    aiTick(s);
    expect(target.owner).toBe(a.id);
    expect(s.characters[a.headId].reputation!.deeds.battlesWon).toBe(1);
    expect(s.characters[a.headId].reputation!.deeds.warsWon).toBe(1);
    expect(s.characters[a.headId].reputation!.deeds.regionsTaken).toBe(1);
    expect(s.characters[d.headId].reputation!.deeds.shipsBuilt).toBeGreaterThan(0);
    expect(ruler(s).reputation!.deeds.battlesWon).toBeUndefined();
  });
  it('both sides earn war reputations, and an already ended war cannot be counted again', () => {
    const s = game(),
      r = ruler(s),
      a = Object.values(s.clans).find((k) => !k.isPlayer)!;
    for (let i = 0; i < 5; i++) {
      const w = { id: 'war-' + i, enemy: a.id, playerAttacker: true, target: '', cb: 'conquest' as const, score: -100, started: s.year };
      s.wars.push(w);
      endWar(s, w, 'lose');
      endWar(s, w, 'lose');
    }
    expect(earned(s.characters[a.headId])).toContain('vanquisher');
    expect(earned(s.characters[a.headId])).toContain('protector');
    expect(earned(r)).toContain('broken');
  });
  it('titles do not consume dice or confer bonuses, and multiple achievements survive a save round-trip', () => {
    const s = game(),
      r = ruler(s),
      before = { seed: s.seed, credits: s.credits, prestige: s.prestige, faith: s.faith, fleet: s.fleet, base: { ...r.base } };
    recordDeed(s, r, 'justice', 5);
    recordDeed(s, r, 'cruelty', 5);
    s.year++;
    recordDeed(s, r, 'regionsTaken', 5);
    expect({ seed: s.seed, credits: s.credits, prestige: s.prestige, faith: s.faith, fleet: s.fleet, base: r.base }).toEqual(before);
    expect(primaryEpithet(r.reputation)?.id).toBe('conqueror');
    const loaded = importSave(exportSave(s));
    expect(ruler(loaded).reputation).toEqual(r.reputation);
    expect(loaded.version).toBe(SAVE_VERSION);
  });
  it('heirs and clones do not inherit titles; named AI dead remain available after pruning', () => {
    const s = game(true),
      old = ruler(s);
    recordDeed(s, old, 'justice', 5);
    const clone = cloneCharacter(s, old.id)!;
    expect(clone.reputation).toBeUndefined();
    expect(fullName(s, clone)).not.toContain('the Just');
    s.vip!.on = false;
    killCharacter(s, old.id, 'old age');
    expect(ruler(s).id).not.toBe(old.id);
    expect(earned(ruler(s))).not.toContain('just');
    expect(earned(old)).toContain('just');
    const k = Object.values(s.clans).find((k) => !k.isPlayer)!;
    const head = s.characters[k.headId];
    recordDeed(s, head, 'justice', 5);
    killCharacter(s, head.id, 'old age');
    s.year += 5;
    prune(s);
    expect(s.characters[head.id]).toBe(head);
    expect(earned(head)).toContain('just');
  });
  it('a short war interrupts a peaceful reign even if it ends before the yearly tick', () => {
    const s = game(),
      r = ruler(s);
    for (let i = 0; i < 14; i++) {
      s.year++;
      epithetsTick(s);
    }
    expect(earned(r)).not.toContain('peaceful');
    breakPeace(s, r.id);
    s.year++;
    epithetsTick(s);
    expect(r.reputation!.peaceStreak).toBe(1);
    expect(earned(r)).not.toContain('peaceful');
    for (let i = 0; i < 14; i++) {
      s.year++;
      epithetsTick(s);
    }
    expect(earned(r)).toContain('peaceful');
  });
  it('an affair interrupts faithful years even when it ends before the next tick', () => {
    const s = game(),
      r = ruler(s),
      spouse = s.characters[r.spouseId!];
    r.traits = spouse.traits = [];
    r.faithId = spouse.faithId;
    for (let i = 0; i < 14; i++) {
      s.year++;
      epithetsTick(s);
    }
    expect(r.reputation!.marriageStreak).toBe(14);
    const lover = Object.values(s.characters).find((c) => c.id !== r.id && c.id !== spouse.id)!;
    lovers(s, r, lover);
    // The player ends the affair, and the spouse forgives them.
    r.loverId = undefined;
    forget(s, spouse.id, r.id, 'lover');
    addFeeling(s, spouse.id, r.id, { why: 'Forgiven', value: 40, decay: 0 });
    s.year++;
    epithetsTick(s);
    expect(r.reputation!.marriageStreak).toBe(1);
    expect(earned(r)).not.toContain('faithful');
    for (let i = 0; i < 14; i++) {
      s.year++;
      epithetsTick(s);
    }
    expect(earned(r)).toContain('faithful');
  });
  it('a married AI lover cannot earn the Faithful while the affair continues', () => {
    const s = game(),
      r = ruler(s);
    const house = Object.values(s.clans).find((k) => !k.isPlayer && s.characters[k.headId].spouseId)!;
    const ai = s.characters[house.headId],
      spouse = s.characters[ai.spouseId!];
    addFeeling(s, ai.id, spouse.id, { why: 'Happy marriage', value: 80, decay: 0 });
    addFeeling(s, spouse.id, ai.id, { why: 'Happy marriage', value: 80, decay: 0 });
    r.loverId = ai.id;
    lovers(s, r, ai);
    for (let i = 0; i < 15; i++) {
      s.year++;
      epithetsTick(s);
    }
    expect(ai.reputation!.marriageStreak).toBe(0);
    expect(earned(ai)).not.toContain('faithful');
    r.loverId = undefined;
    for (let i = 0; i < 15; i++) {
      s.year++;
      epithetsTick(s);
    }
    expect(earned(ai)).toContain('faithful');
  });
  it('migration creates empty lifetime records once without inventing historic deeds', () => {
    const s = game();
    s.version = 2;
    for (const c of Object.values(s.characters)) delete c.reputation;
    const once = migrate(s);
    expect(ruler(once).reputation!.deeds).toEqual({});
    expect(ruler(once).reputation!.earned).toEqual([]);
    const again = migrate({ ...structuredClone(once), version: 2 });
    expect(again).toEqual(once);
  });
});
