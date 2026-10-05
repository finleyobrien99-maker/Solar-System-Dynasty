import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { appointCommander, commanderOf } from './commanders';
import { clanRegions, ruler } from './core';
import { setFlag } from './eventKit';
import { buildCtx, EVENT_BY_ID, EVENTS, queueEvent } from './events';
import { COMMANDER_EVENTS } from './eventsCommanders';
import { feelingsSum } from './relations';
import type { Character, GameState, Pending } from './types';
import { createWorld, rollRuler, startGame } from './world';

type Pend = Extract<Pending, { kind: 'event' }>;

function world(seed = 4): GameState {
  const s = createWorld(seed + 500);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(seed, 'mars', 'F', 'Asha'), focus: 'dip', age: 48, family: 'married' });
  Object.assign(s, { credits: 2000, prestige: 300, fleet: 100 });
  return s;
}

function kid(s: GameState, age: number, cmd: number, traits: string[] = []): Character {
  const r = ruler(s);
  const c = createCharacter(s, {
    gender: age % 2 ? 'M' : 'F',
    born: s.year - age,
    clanId: s.playerClanId,
    planetId: 'mars',
    motherId: r.id,
    adultExtras: true,
  });
  c.base.cmd = cmd;
  c.traits = [...c.traits.filter((t) => !['brave', 'craven', 'ambitious'].includes(t)), ...traits];
  r.childrenIds.push(c.id);
  return c;
}

const SETUP: Record<string, (s: GameState) => void> = {
  vanguard_request: (s) => {
    appointCommander(s, s.playerClanId, kid(s, 30, 3).id);
    kid(s, 22, 9, ['brave']);
  },
  fallen_commander: (s) => {
    const fallen = kid(s, 26, 7);
    const widow = createCharacter(s, { gender: 'F', born: s.year - 25, clanId: s.playerClanId, planetId: 'mars', adultExtras: true });
    fallen.spouseId = widow.id;
    widow.spouseId = fallen.id;
    fallen.died = s.year;
    setFlag(s, 'fallen_commander', s.year, { id: fallen.id, kin: widow.id });
  },
  commander_triumph: (s) => {
    const c = kid(s, 28, 8);
    appointCommander(s, s.playerClanId, c.id);
    c.reputation!.deeds.battlesWon = 4;
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

describe('commanders in play', () => {
  it('registers all three events', () => {
    for (const def of COMMANDER_EVENTS)
      expect(
        EVENTS.some((e) => e.id === def.id),
        def.id,
      ).toBe(true);
    expect(COMMANDER_EVENTS).toHaveLength(3);
  });

  for (const def of COMMANDER_EVENTS) {
    it(`${def.id}: fires, and every option resolves`, () => {
      for (let seed = 1; seed <= 6; seed++) {
        const s = fitting(def.id, seed);
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

  it("options you can't afford are locked, with a reason", () => {
    let locked = 0;
    for (const def of COMMANDER_EVENTS) {
      const s = fitting(def.id);
      const p = queued(s, def.id);
      s.credits = 0;
      const ctx = buildCtx(s, p);
      for (const c of def.choices)
        if (c.available && !c.available(ctx)) {
          locked++;
          expect(c.why?.(ctx)).toBeTruthy();
        }
    }
    expect(locked).toBeGreaterThanOrEqual(2);
  });

  it('giving the eager one the fleet makes them commander, and they remember who trusted them', () => {
    const s = fitting('vanguard_request');
    const p = queued(s, 'vanguard_request');
    EVENT_BY_ID.vanguard_request.choices[0].run(buildCtx(s, p));
    expect(commanderOf(s, s.playerClanId)?.id).toBe(p.subjectId);
    expect(feelingsSum(s, s.characters[p.subjectId!], ruler(s))).toBe(15);
  });

  it('nobody eager is better than the commander you have: no request', () => {
    const s = world();
    appointCommander(s, s.playerClanId, kid(s, 30, 30).id);
    kid(s, 22, 9, ['brave']);
    expect(EVENT_BY_ID.vanguard_request.when!(s)).toBe(false);
  });

  it('a fallen commander’s family remember how you mourned them, and the event fires once', () => {
    const s = fitting('fallen_commander');
    const p = queued(s, 'fallen_commander');
    expect(EVENT_BY_ID.fallen_commander.when!(s)).toBe(false);
    EVENT_BY_ID.fallen_commander.choices[2].run(buildCtx(s, p));
    const widow = s.characters[String(p.data!.kin)];
    expect(feelingsSum(s, widow, ruler(s))).toBe(-20);
  });

  it('only a commander with real victories gets celebrated', () => {
    const s = world();
    const c = kid(s, 28, 8);
    appointCommander(s, s.playerClanId, c.id);
    c.reputation!.deeds.battlesWon = 2;
    expect(EVENT_BY_ID.commander_triumph.when!(s)).toBe(false);
    c.reputation!.deeds.battlesWon = 3;
    expect(EVENT_BY_ID.commander_triumph.when!(s)).toBe(true);
  });
});
