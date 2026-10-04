import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { alive, ch, clanRegions } from './core';
import { buildCtx, EVENT_BY_ID, queueEvent } from './events';
import { COURT_EVENTS, courtingHouse, courtship, heldKin } from './eventsCourt';
import { remember } from './memory';
import { addFeeling } from './relations';
import type { Clan, GameState, Pending } from './types';
import { createWorld, rollRuler, startGame } from './world';

function court(): GameState {
  const s = createWorld(83);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(83, 'mars', 'F', 'Asha'), focus: 'dip', age: 45, family: 'married' });
  Object.assign(s, { credits: 2000, prestige: 300, fleet: 120 });
  return s;
}

function aiHouses(s: GameState): Clan[] {
  const out = Object.values(s.clans).filter((x) => !x.isPlayer && clanRegions(s, x.id).length && alive(ch(s, x.headId)));
  for (const k of out) {
    const h = s.characters[k.headId];
    h.born = Math.min(h.born, s.year - 40);
    h.prisonerOf = undefined;
  }
  return out;
}

const SETUP: Record<string, (s: GameState) => void> = {
  kin_ransom: (s) => {
    const [k] = aiHouses(s);
    const son = createCharacter(s, { gender: 'M', born: s.year - 20, clanId: s.playerClanId, planetId: 'mars', fatherId: s.rulerId, adultExtras: true });
    s.characters[s.rulerId].childrenIds.push(son.id);
    son.prisonerOf = k.id;
  },
  alliance_offer: (s) => {
    const [k, foe] = aiHouses(s);
    k.opinion = 60;
    s.feuds.push(foe.id);
    addFeeling(s, k.headId, foe.headId, { why: 'Burned my shipyards', value: -60, decay: 0 });
  },
  call_to_arms: (s) => {
    const [k, foe] = aiHouses(s);
    k.allied = true;
    k.opinion = 50;
    s.aiWars.push({ id: 'aw-test', attacker: foe.id, defender: k.id, target: clanRegions(s, k.id)[0].id, started: s.year, progress: 20 });
  },
};

function event(s: GameState, id: string) {
  const def = EVENT_BY_ID[id];
  expect(queueEvent(s, def)).toBe(true);
  return { def, ctx: buildCtx(s, s.pending[s.pending.length - 1] as Extract<Pending, { kind: 'event' }>) };
}

describe('AI houses deal with you as equals', () => {
  for (const def of COURT_EVENTS) {
    it(`${def.id}: fires in its situation and every option resolves`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const s = court();
        SETUP[def.id](s);
        s.seed = seed * 7919;
        expect(!def.when || def.when(s), `${def.id} should fire`).toBe(true);
        expect(queueEvent(s, def)).toBe(true);
        const p = s.pending[s.pending.length - 1] as Extract<Pending, { kind: 'event' }>;
        expect(def.text(buildCtx(s, p))).not.toMatch(/undefined|NaN/);
        def.choices.forEach((choice, i) => {
          const t = structuredClone(s);
          const ctx = buildCtx(t, t.pending[t.pending.length - 1] as typeof p);
          expect(choice.describe(ctx), `${def.id} #${i}`).not.toMatch(/undefined|NaN|someone/);
          if (choice.available && !choice.available(ctx)) return;
          expect(choice.run(ctx)).not.toMatch(/undefined|NaN/);
        });
      }
    });
  }

  it('paying a ransom brings your kin home and fills their treasury', () => {
    const s = court();
    SETUP.kin_ransom(s);
    const { def, ctx } = event(s, 'kin_ransom');
    const captor = s.clans[String(ctx.data.clan)];
    const [mine, theirs] = [s.credits, captor.credits];
    def.choices[0].run(ctx);
    expect(ctx.subject!.prisonerOf).toBeUndefined();
    expect(heldKin(s)).toBeUndefined();
    expect(s.credits).toBe(mine - Number(ctx.data.amount));
    expect(captor.credits).toBe(theirs + Number(ctx.data.amount));
  });

  it('a ransom demand comes round again if you refuse, but not every cycle', () => {
    const s = court();
    SETUP.kin_ransom(s);
    const def = EVENT_BY_ID.kin_ransom;
    queueEvent(s, def);
    expect(def.when!(s)).toBe(false);
    s.year += 3;
    expect(def.when!(s)).toBe(true);
  });

  it('answering a call to arms costs ships and swings the war', () => {
    const s = court();
    SETUP.call_to_arms(s);
    const { def, ctx } = event(s, 'call_to_arms');
    const fleet = s.fleet;
    def.choices[0].run(ctx);
    expect(s.fleet).toBe(fleet - Number(ctx.data.ships));
    expect(s.aiWars.find((w) => w.id === 'aw-test')!.progress).toBe(20 - 35);
  });

  it('accepting an alliance offer makes them your ally', () => {
    const s = court();
    SETUP.alliance_offer(s);
    const { def, ctx } = event(s, 'alliance_offer');
    def.choices[0].run(ctx);
    expect(s.clans[String(ctx.data.clan)].allied).toBe(true);
    expect(ctx.data.foe).not.toBe('');
  });
});

describe('who asks for your hand', () => {
  it('a house whose lord you wronged, or that dislikes you, never proposes a match', () => {
    const s = court();
    const [a, b, c] = aiHouses(s);
    for (const k of aiHouses(s)) k.opinion = -50;
    a.opinion = 40;
    b.opinion = 40;
    c.opinion = 5;
    addFeeling(s, b.headId, s.rulerId, { why: 'Murdered my wife', value: -90, decay: 0, grave: true });
    expect(courtship(s, a)).toBeGreaterThan(0);
    expect(courtship(s, b)).toBe(0);
    expect(courtship(s, c)).toBe(0);
    for (let seed = 1; seed < 30; seed++) {
      s.seed = seed;
      expect(courtingHouse(s)?.id).toBe(a.id);
    }
  });

  it("accepting a match can't lift a house past the grudge it holds", () => {
    const s = court();
    const [k] = aiHouses(s);
    for (const o of aiHouses(s)) o.opinion = -50;
    k.opinion = 30;
    const son = createCharacter(s, { gender: 'M', born: s.year - 20, clanId: s.playerClanId, planetId: 'mars', fatherId: s.rulerId, adultExtras: true });
    s.characters[s.rulerId].childrenIds.push(son.id);
    const def = EVENT_BY_ID.proposal;
    expect(queueEvent(s, def)).toBe(true);
    const ctx = buildCtx(s, s.pending[s.pending.length - 1] as Extract<Pending, { kind: 'event' }>);
    expect(ctx.data.clan).toBe(k.id);
    remember(s, k.id, 'Executed our heir', -75, undefined, true);
    def.choices[0].run(ctx);
    expect(k.opinion).toBeLessThan(0);
  });
});
