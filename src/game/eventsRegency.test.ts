import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { canAct, ch, clanRegions, ruler } from './core';
import { getFlag, setFlag } from './eventKit';
import { buildCtx, EVENT_BY_ID, EVENTS, queueEvent } from './events';
import { REGENCY_EVENTS } from './eventsRegency';
import { prisoners } from './intrigue';
import { killCharacter } from './life';
import { CHALLENGE_FLAG, regencyOf, regencyTick, regentOf } from './regency';
import type { Character, GameState, Pending } from './types';
import { createWorld, rollRuler, startGame } from './world';

type Pend = Extract<Pending, { kind: 'event' }>;

const PERSONAL = ['ambitious', 'content', 'greedy', 'generous', 'honest', 'deceitful', 'humble', 'arrogant', 'kind', 'cruel'];

function world(seed = 4): GameState {
  const s = createWorld(seed + 900);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(seed, 'mars', 'M', 'Oren'), focus: 'dip', age: 36, family: 'married' });
  Object.assign(s, { credits: 2000, prestige: 300, fleet: 60 });
  s.pending = [];
  return s;
}

/** The ruler dies, leaving a daughter of `age`, her mother and an uncle; the regency begins. */
function orphan(s: GameState, age: number) {
  const r = ruler(s);
  const mother = s.characters[r.spouseId!];
  const ward = createCharacter(s, { gender: 'F', born: s.year - age, clanId: s.playerClanId, planetId: 'mars', fatherId: r.id, motherId: mother.id });
  r.childrenIds.push(ward.id);
  mother.childrenIds.push(ward.id);
  let gf = ch(s, r.fatherId);
  if (!gf) {
    gf = createCharacter(s, { gender: 'M', born: s.year - 72, clanId: s.playerClanId, planetId: 'mars', adultExtras: true });
    gf.childrenIds.push(r.id);
    r.fatherId = gf.id;
  }
  const uncle = createCharacter(s, { gender: 'M', born: s.year - 41, clanId: s.playerClanId, planetId: 'mars', fatherId: gf.id, adultExtras: true });
  gf.childrenIds.push(uncle.id);
  for (const c of [mother, uncle]) c.traits = c.traits.filter((t) => !PERSONAL.includes(t));
  killCharacter(s, r.id, 'a test');
  s.pending = [];
  regencyTick(s);
  return { ward, mother, uncle };
}

function regentFlag(s: GameState) {
  return getFlag(s, 'regent:' + s.playerClanId)!;
}

function makeRegent(s: GameState, c: Character, traits: string[]) {
  c.traits.push(...traits);
  regentFlag(s).data.id = c.id;
}

const SETUP: Record<string, (s: GameState) => void> = {
  regency_choice: (s) => {
    orphan(s, 7);
  },
  regent_ledger: (s) => {
    const { uncle } = orphan(s, 12);
    makeRegent(s, uncle, ['greedy']);
    regentFlag(s).data.skimmed = 140;
  },
  regent_lessons: (s) => {
    orphan(s, 10);
  },
  regent_clings: (s) => {
    const { uncle } = orphan(s, 15);
    makeRegent(s, uncle, ['ambitious', 'greedy']);
    s.year += 1;
    regentFlag(s).data.until = s.year + 2;
    setFlag(s, CHALLENGE_FLAG, s.year);
  },
};

function fitting(id: string, seed = 4): GameState {
  const s = world(seed);
  SETUP[id](s);
  return s;
}

function queued(s: GameState, id: string): Pend {
  const def = EVENT_BY_ID[id];
  expect(!def.when || def.when(s), `${id} should fire`).toBe(true);
  expect(queueEvent(s, def), `${id} should queue`).toBe(true);
  return s.pending[s.pending.length - 1] as Pend;
}

describe('regencies in play', () => {
  it('registers all four events', () => {
    for (const def of REGENCY_EVENTS)
      expect(
        EVENTS.some((e) => e.id === def.id),
        def.id,
      ).toBe(true);
    expect(REGENCY_EVENTS).toHaveLength(4);
  });

  for (const def of REGENCY_EVENTS) {
    it(`${def.id}: fires for a child ruler (or one still under a regent), and every option resolves`, () => {
      for (let seed = 1; seed <= 6; seed++) {
        const s = fitting(def.id, seed);
        expect(canAct(s)).toBe(false);
        s.seed = seed * 7919;
        const p = queued(s, def.id);
        expect(def.text(buildCtx(s, p))).not.toMatch(/undefined|NaN|\$\{/);
        def.choices.forEach((choice, i) => {
          const t = structuredClone(s);
          const c = buildCtx(t, t.pending[t.pending.length - 1] as Pend);
          if (choice.show && !choice.show(c)) return;
          if (choice.available && !choice.available(c)) return;
          expect(choice.describe(c), `${def.id} #${i}`).not.toMatch(/undefined|NaN|someone/);
          expect(choice.run(c), `${def.id} #${i}`).not.toMatch(/undefined|NaN/);
        });
      }
    });

    it(`${def.id}: showing it changes nothing, not even the seed`, () => {
      const s = fitting(def.id);
      const p = queued(s, def.id);
      const ctx = buildCtx(s, p);
      const before = JSON.stringify(s);
      def.text(ctx);
      for (const c of def.choices) {
        c.describe(ctx);
        c.available?.(ctx);
        c.why?.(ctx);
        c.show?.(ctx);
      }
      expect(JSON.stringify(s)).toBe(before);
    });
  }

  it('the choice fires once; overruling the council seats someone else, and the one passed over minds', () => {
    const s = fitting('regency_choice');
    const p = queued(s, 'regency_choice');
    expect(EVENT_BY_ID.regency_choice.when!(s)).toBe(false);
    const ctx = buildCtx(s, p);
    const i = EVENT_BY_ID.regency_choice.choices.findIndex((c) => c.label.startsWith('Another of the family') && (!c.show || c.show(ctx)));
    expect(i).toBeGreaterThan(0);
    const first = regentOf(s, s.playerClanId)!;
    EVENT_BY_ID.regency_choice.choices[i].run(ctx);
    expect(regentOf(s, s.playerClanId)!.id).toBe(String(p.data!.kin));
    expect(regentOf(s, s.playerClanId)!.id).not.toBe(first.id);
  });

  it('a ledger only turns up once there is something to find', () => {
    const s = fitting('regent_ledger');
    regentFlag(s).data.skimmed = 0;
    expect(EVENT_BY_ID.regent_ledger.when!(s)).toBe(false);
  });

  it('buying a clinging regent out ends the regency and the ruler can act', () => {
    const s = fitting('regent_clings');
    const p = queued(s, 'regent_clings');
    const buy = EVENT_BY_ID.regent_clings.choices.findIndex((c) => c.label === 'Buy them out');
    const before = s.credits;
    EVENT_BY_ID.regent_clings.choices[buy].run(buildCtx(s, p));
    expect(s.credits).toBe(before - Number(p.data!.price));
    expect(regencyOf(s, s.playerClanId)).toBeUndefined();
    expect(canAct(s)).toBe(true);
  });

  it('an arrested regent ends up in your cells', () => {
    let done = false;
    for (let seed = 1; seed < 60 && !done; seed++) {
      const s = fitting('regent_clings', seed % 6);
      s.seed = seed * 31;
      const p = queued(s, 'regent_clings');
      const regent = regentOf(s, s.playerClanId)!;
      const arrest = EVENT_BY_ID.regent_clings.choices.findIndex((c) => c.label === 'Have them arrested');
      EVENT_BY_ID.regent_clings.choices[arrest].run(buildCtx(s, p));
      if (regencyOf(s, s.playerClanId)) continue;
      done = true;
      expect(prisoners(s).map((c) => c.id)).toContain(regent.id);
      expect(canAct(s)).toBe(true);
    }
    expect(done).toBe(true);
  });
});
