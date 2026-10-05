import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { alive, ch, clanRegions, ruler } from './core';
import { buildCtx, EVENT_BY_ID, EVENTS, queueEvent } from './events';
import { WARD_EVENTS } from './eventsWards';
import { prisoners } from './intrigue';
import type { Character, Clan, GameState, Pending } from './types';
import { appointMentor, hostWard, mentorshipOf, sendAsWard, wardshipOf } from './wards';
import { createWorld, rollRuler, startGame } from './world';

type Pend = Extract<Pending, { kind: 'event' }>;

function world(seed = 5): GameState {
  const s = createWorld(seed + 300);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(seed, 'mars', 'M', 'Oren'), focus: 'dip', age: 42, family: 'married' });
  Object.assign(s, { credits: 2000, prestige: 300, faith: 200, fleet: 100 });
  for (const k of Object.values(s.clans)) if (!k.isPlayer) k.opinion = 40;
  return s;
}

function child(s: GameState, age: number, clanId = s.playerClanId, parentId = s.rulerId): Character {
  const parent = s.characters[parentId];
  const c = createCharacter(s, { gender: age % 2 ? 'M' : 'F', born: s.year - age, clanId, planetId: parent.planetId, fatherId: parent.id });
  parent.childrenIds.push(c.id);
  return c;
}

function host(s: GameState): Clan {
  const k = Object.values(s.clans).find((x) => !x.isPlayer && clanRegions(s, x.id).length > 0 && alive(ch(s, x.headId)))!;
  const lord = s.characters[k.headId];
  lord.born = Math.min(lord.born, s.year - 45);
  lord.prisonerOf = undefined;
  return k;
}

function war(s: GameState, k: Clan): void {
  s.wars.push({ id: 'w-test', enemy: k.id, playerAttacker: false, target: clanRegions(s, s.playerClanId)[0].id, cb: 'feud', score: 0, started: s.year });
}

const SETUP: Record<string, (s: GameState) => void> = {
  ward_returns: (s) => {
    const kid = child(s, 8);
    sendAsWard(s, kid.id, host(s).id, true);
    s.year = kid.born + 16;
  },
  ward_goes_home: (s) => {
    const k = host(s);
    const theirs = child(s, 8, k.id, k.headId);
    hostWard(s, theirs.id);
    s.year = theirs.born + 16;
  },
  mentor_done: (s) => {
    const kid = child(s, 9);
    appointMentor(s, kid.id, ruler(s).spouseId!);
    s.year = kid.born + 16;
  },
  ward_detained: (s) => {
    const k = host(s);
    sendAsWard(s, child(s, 9).id, k.id, true);
    war(s, k);
  },
  hostage_choice: (s) => {
    const k = host(s);
    hostWard(s, child(s, 9, k.id, k.headId).id);
    war(s, k);
  },
  foster_offer: (s) => void child(s, 8),
  ward_offered: (s) => {
    const k = host(s);
    child(s, 8, k.id, k.headId);
  },
  ward_letter: (s) => {
    sendAsWard(s, child(s, 9).id, host(s).id, true);
  },
  ward_trouble: (s) => {
    child(s, 10);
    const k = host(s);
    hostWard(s, child(s, 9, k.id, k.headId).id);
  },
};

function fitting(id: string, seed = 5): GameState {
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

describe('wards and mentors in play', () => {
  it('registers every event in the deck', () => {
    for (const def of WARD_EVENTS)
      expect(
        EVENTS.some((e) => e.id === def.id),
        def.id,
      ).toBe(true);
    expect(WARD_EVENTS.length).toBe(9);
  });

  for (const def of WARD_EVENTS) {
    it(`${def.id}: fires in its situation and every option resolves`, () => {
      expect(def.choices.length).toBeGreaterThanOrEqual(2);
      for (let seed = 1; seed <= 6; seed++) {
        const s = fitting(def.id, seed);
        s.seed = seed * 7919;
        const p = queued(s, def.id);
        const ctx = buildCtx(s, p);
        expect(def.text(ctx)).not.toMatch(/undefined|NaN|\$\{/);
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
    for (const def of WARD_EVENTS) {
      const s = fitting(def.id);
      const p = queued(s, def.id);
      Object.assign(s, { credits: 0, faith: 0 });
      const ctx = buildCtx(s, p);
      for (const c of def.choices)
        if (c.available && !c.available(ctx)) {
          locked++;
          expect(c.why?.(ctx)).toBeTruthy();
        }
    }
    expect(locked).toBeGreaterThanOrEqual(3);
  });

  it('a homecoming ends the wardship and does not fire twice', () => {
    const s = fitting('ward_returns');
    const p = queued(s, 'ward_returns');
    EVENT_BY_ID.ward_returns.choices[1].run(buildCtx(s, p));
    expect(wardshipOf(s, p.subjectId!)).toBeUndefined();
    expect(EVENT_BY_ID.ward_returns.when!(s)).toBe(false);
  });

  it('leaving a ward to the war makes them a hostage their family can ransom', () => {
    const s = fitting('ward_detained');
    const p = queued(s, 'ward_detained');
    EVENT_BY_ID.ward_detained.choices[1].run(buildCtx(s, p));
    const kid = s.characters[p.subjectId!];
    expect(kid.prisonerOf).toBe(String(p.data!.host));
    expect(EVENT_BY_ID.kin_ransom.when!(s)).toBe(true);
  });

  it('you can keep an enemy’s ward as a hostage, or send them home and be thanked for it', () => {
    const s = fitting('hostage_choice');
    const p = queued(s, 'hostage_choice');
    EVENT_BY_ID.hostage_choice.choices[0].run(buildCtx(s, p));
    expect(prisoners(s).map((c) => c.id)).toContain(p.subjectId);
    const t = fitting('hostage_choice');
    const q = queued(t, 'hostage_choice');
    EVENT_BY_ID.hostage_choice.choices[1].run(buildCtx(t, q));
    expect(t.characters[q.subjectId!].prisonerOf).toBeUndefined();
    expect(t.clans[String(q.data!.home)].memories?.some((m) => m.text === 'Sent our child home in wartime')).toBe(true);
  });

  it('accepting a foster offer sends your child to that court', () => {
    const s = fitting('foster_offer');
    const p = queued(s, 'foster_offer');
    EVENT_BY_ID.foster_offer.choices[0].run(buildCtx(s, p));
    expect(wardshipOf(s, p.subjectId!)?.hostId).toBe(String(p.data!.clan));
  });

  it('taking in another house’s child makes you their guardian', () => {
    const s = fitting('ward_offered');
    const p = queued(s, 'ward_offered');
    EVENT_BY_ID.ward_offered.choices[0].run(buildCtx(s, p));
    expect(wardshipOf(s, p.subjectId!)?.hostId).toBe(s.playerClanId);
  });

  it('a mentor who dies ends the lessons early, and the event says so', () => {
    const s = world();
    const kid = child(s, 9);
    const spouse = ch(s, ruler(s).spouseId)!;
    appointMentor(s, kid.id, spouse.id);
    s.year += 3;
    spouse.died = s.year;
    const p = queued(s, 'mentor_done');
    expect(EVENT_BY_ID.mentor_done.text(buildCtx(s, p))).toMatch(/is gone/);
    EVENT_BY_ID.mentor_done.choices[1].run(buildCtx(s, p));
    expect(mentorshipOf(s, kid.id)).toBeUndefined();
  });

  it('children away as wards are left out of everyday court events', () => {
    const s = world();
    const kid = child(s, 11);
    expect(EVENT_BY_ID.first_flight.when!(s)).toBe(true);
    sendAsWard(s, kid.id, host(s).id, true);
    expect(EVENT_BY_ID.first_flight.when!(s)).toBe(false);
  });
});
