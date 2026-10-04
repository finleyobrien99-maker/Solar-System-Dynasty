import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { alive, ch, clanRegions, ruler } from './core';
import { buildCtx, EVENT_BY_ID, EVENTS, queueEvent } from './events';
import { EXPANSION_EVENTS } from './eventsExpansion';
import { opinionCeiling, remember } from './memory';
import { feelingsSum } from './relations';
import type { Character, GameState, Pending } from './types';
import { createWorld, rollRuler, startGame } from './world';

type Pend = Extract<Pending, { kind: 'event' }>;

const PLANET_OF: Record<string, string> = {
  sunside_fires: 'mercury',
  acid_storm: 'venus',
  sunken_ruins: 'earth',
  dust_storm: 'mars',
  water_war: 'ceres',
  helium_skimmer: 'jupiter',
  ring_disputation: 'saturn',
  seer_prophecy: 'uranus',
  cryo_cult: 'neptune',
  long_night: 'pluto',
};

function world(planet: string, seed = 5): GameState {
  const s = createWorld(seed + 40);
  const mine = Object.values(s.clans).filter((c) => c.planetId === planet && clanRegions(s, c.id).length > 0);
  const clan = mine.find((c) => !clanRegions(s, c.id).some((r) => r.capital)) ?? mine[0];
  startGame(s, { clanId: clan.id, ruler: rollRuler(seed, planet, 'M', 'Oren'), focus: 'dip', age: 42, family: 'married' });
  Object.assign(s, { credits: 3000, faith: 300, prestige: 300, fleet: 120 });
  for (const k of Object.values(s.clans)) if (!k.isPlayer) k.opinion = 10;
  return s;
}

function addChild(s: GameState, age: number): Character {
  const r = ruler(s);
  const c = createCharacter(s, {
    gender: age % 2 ? 'M' : 'F',
    born: s.year - age,
    clanId: s.playerClanId,
    planetId: r.planetId,
    fatherId: r.gender === 'M' ? r.id : undefined,
    motherId: r.gender === 'F' ? r.id : undefined,
    adultExtras: age >= 16,
  });
  r.childrenIds.push(c.id);
  return c;
}

function addParent(s: GameState, age = 72): Character {
  const r = ruler(s);
  const father = createCharacter(s, { gender: 'M', born: s.year - age, clanId: s.playerClanId, planetId: r.planetId, adultExtras: true });
  father.childrenIds.push(r.id);
  r.fatherId = father.id;
  return father;
}

function addSibling(s: GameState, age = 34): Character {
  const r = ruler(s);
  const father = ch(s, r.fatherId) ?? addParent(s);
  const sib = createCharacter(s, { gender: 'F', born: s.year - age, clanId: s.playerClanId, planetId: r.planetId, fatherId: father.id, adultExtras: true });
  father.childrenIds.push(sib.id);
  return sib;
}

function addNephew(s: GameState, age: number): Character {
  const sib = addSibling(s);
  const c = createCharacter(s, { gender: 'M', born: s.year - age, clanId: s.playerClanId, planetId: sib.planetId, motherId: sib.id });
  sib.childrenIds.push(c.id);
  return c;
}

/** The situation each event needs, on the right world. */
const SETUP: Record<string, (s: GameState) => void> = {
  first_flight: (s) => void addChild(s, 11),
  cousin_rivalry: (s) => {
    addChild(s, 11);
    addNephew(s, 11);
  },
  imaginary_friend: (s) => void addChild(s, 6),
  stowaway: (s) => void addChild(s, 12),
  tutor_opinions: (s) => void addChild(s, 10),
  runs_away: (s) => void addChild(s, 12),
  rite_of_passage: (s) => void addChild(s, 15),
  hangar_prank: (s) => void addChild(s, 10),
  bad_company: (s) => void addChild(s, 15),
  night_terrors: (s) => void addChild(s, 6),
  drunk_councillor: (s) => {
    s.council.envoy = addChild(s, 22).id;
  },
  portrait_commission: () => undefined,
  guest_overstays: () => undefined,
  parent_forgetting: (s) => void addParent(s, 72),
  sibling_debts: (s) => void addSibling(s, 34),
  unequal_match: (s) => void addChild(s, 22),
  court_feud: (s) => {
    addChild(s, 20);
    addChild(s, 24);
  },
  ancestor_gallery: (s) => {
    for (const [i, name] of ['Old Varro', 'Ketha the Stern'].entries())
      s.dynasty.rulers.unshift({ id: `ghost${i}`, name, from: s.year - 80 + i * 20, to: s.year - 60 + i * 20, title: 'Governor of Somewhere' });
  },
  dowry_dispute: (s) => {
    const sp = ch(s, ruler(s).spouseId)!;
    sp.clanId = Object.values(s.clans).find((k) => !k.isPlayer && clanRegions(s, k.id).length > 0)!.id;
  },
  old_soldier: () => undefined,
  seer_prophecy: (s) => void addChild(s, 8),
};

function fitting(id: string, seed = 5): GameState {
  const s = world(PLANET_OF[id] ?? 'mars', seed);
  SETUP[id]?.(s);
  return s;
}

function queued(s: GameState, id: string): { def: (typeof EVENT_BY_ID)[string]; p: Pend } {
  const def = EVENT_BY_ID[id];
  expect(!def.when || def.when(s), `${id} should fire here`).toBe(true);
  expect(queueEvent(s, def), `${id} should queue`).toBe(true);
  return { def, p: s.pending[s.pending.length - 1] as Pend };
}

describe('thirty events that make the dynasty feel alive', () => {
  it('has thirty distinct events in the deck: ten childhood, ten court, ten worlds', () => {
    const ids = EXPANSION_EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(30);
    for (const id of ids)
      expect(
        EVENTS.some((e) => e.id === id),
        id,
      ).toBe(true);
    expect(ids.filter((id) => id in PLANET_OF)).toHaveLength(10);
    expect(new Set(Object.values(PLANET_OF)).size).toBe(10);
  });

  for (const def of EXPANSION_EVENTS) {
    it(`${def.id}: fires in its situation, has real choices, and every option resolves`, () => {
      expect(def.choices.length, `${def.id} needs at least two options`).toBeGreaterThanOrEqual(2);
      for (let seed = 1; seed <= 8; seed++) {
        const s = fitting(def.id, seed);
        s.seed = seed * 7919;
        const { p } = queued(s, def.id);
        const ctx = buildCtx(s, p);
        expect(def.text(ctx), def.id).not.toMatch(/undefined|NaN|\bthe The\b|\$\{/);
        def.choices.forEach((choice, i) => {
          const t = structuredClone(s);
          const c = buildCtx(t, t.pending[t.pending.length - 1] as Pend);
          if (choice.show && !choice.show(c)) return;
          if (choice.available && !choice.available(c)) return;
          expect(choice.describe(c), `${def.id} #${i}`).not.toMatch(/undefined|NaN|someone/);
          const out = choice.run(c);
          expect(out, `${def.id} #${i}`).not.toMatch(/undefined|NaN|\$\{/);
          for (const v of [t.credits, t.fleet, t.prestige, t.faith]) expect(Number.isFinite(v)).toBe(true);
          for (const ch2 of Object.values(t.characters)) expect(Number.isFinite(ch2.health)).toBe(true);
        });
      }
    });

    it(`${def.id}: rendering the text and tooltips changes nothing, not even the seed`, () => {
      for (let seed = 1; seed <= 6; seed++) {
        const s = fitting(def.id, seed);
        s.seed = seed * 104729;
        const { p } = queued(s, def.id);
        const ctx = buildCtx(s, p);
        const before = JSON.stringify(s);
        def.text(ctx);
        for (const choice of def.choices) {
          choice.describe(ctx);
          choice.show?.(ctx);
          choice.available?.(ctx);
          choice.why?.(ctx);
        }
        expect(JSON.stringify(s), `${def.id} changed the game just by being shown`).toBe(before);
      }
    });

    it(`${def.id}: an option you can't afford is locked, with a reason`, () => {
      const s = fitting(def.id, 3);
      const { p } = queued(s, def.id);
      const t = structuredClone(s);
      Object.assign(t, { credits: 0, faith: 0, fleet: 0 });
      const ctx = buildCtx(t, p);
      for (const choice of def.choices)
        if (choice.available && !choice.available(ctx)) {
          expect(choice.why?.(ctx), `${def.id}: "${choice.label}" locked without a reason`).toBeTruthy();
        }
    });
  }

  it('across the deck, poverty really does lock options', () => {
    let locked = 0;
    for (const def of EXPANSION_EVENTS) {
      const s = fitting(def.id, 3);
      queued(s, def.id);
      Object.assign(s, { credits: 0, faith: 0, fleet: 0 });
      const ctx = buildCtx(s, s.pending[s.pending.length - 1] as Pend);
      locked += def.choices.filter((c) => c.available && !c.available(ctx)).length;
    }
    expect(locked).toBeGreaterThan(25);
  });

  it('each world event only fires where you hold land on that world', () => {
    for (const [id, planet] of Object.entries(PLANET_OF)) {
      const here = fitting(id);
      expect(EVENT_BY_ID[id].when!(here), `${id} on ${planet}`).toBe(true);
      const elsewhere = world(planet === 'mars' ? 'venus' : 'mars');
      SETUP[id]?.(elsewhere);
      expect(EVENT_BY_ID[id].when!(elsewhere), `${id} away from ${planet}`).toBe(false);
    }
  });

  it('events about children never pick the captive, the dead or the wrong age', () => {
    const young = [
      'first_flight',
      'imaginary_friend',
      'stowaway',
      'tutor_opinions',
      'runs_away',
      'rite_of_passage',
      'hangar_prank',
      'bad_company',
      'night_terrors',
    ];
    for (const id of young) {
      const s = fitting(id);
      expect(EVENT_BY_ID[id].when!(s), id).toBe(true);
      for (const kidId of ruler(s).childrenIds) {
        const k = s.characters[kidId];
        if (k.clanId === s.playerClanId && s.year - k.born < 18) k.prisonerOf = Object.values(s.clans).find((c) => !c.isPlayer)!.id;
      }
      expect(EVENT_BY_ID[id].when!(s), `${id} with the child in a cell`).toBe(false);
      const d = fitting(id);
      for (const kidId of ruler(d).childrenIds) {
        const k = d.characters[kidId];
        if (d.year - k.born < 18) {
          k.died = d.year - 1;
        }
      }
      expect(EVENT_BY_ID[id].when!(d), `${id} with the child dead`).toBe(false);
      const old = fitting(id);
      for (const kidId of ruler(old).childrenIds) old.characters[kidId].born -= 30;
      expect(EVENT_BY_ID[id].when!(old), `${id} with the child grown`).toBe(false);
    }
  });

  it('childhood choices shape the child: a trait, a stat or a feeling changes for the subject', () => {
    const young = [
      'first_flight',
      'cousin_rivalry',
      'imaginary_friend',
      'stowaway',
      'tutor_opinions',
      'runs_away',
      'rite_of_passage',
      'hangar_prank',
      'bad_company',
      'night_terrors',
    ];
    for (const id of young) {
      const def = EVENT_BY_ID[id];
      let shaped = 0;
      for (let seed = 1; seed <= 20; seed++) {
        for (let i = 0; i < def.choices.length; i++) {
          const s = fitting(id, 1 + (seed % 5));
          s.seed = seed * 31337;
          const { p } = queued(s, id);
          const kid = s.characters[p.subjectId!];
          const before = JSON.stringify([kid.traits, kid.base, kid.health, s.relations[kid.id] ?? {}]);
          const c = buildCtx(s, p);
          if ((def.choices[i].show && !def.choices[i].show!(c)) || (def.choices[i].available && !def.choices[i].available!(c))) continue;
          def.choices[i].run(c);
          if (JSON.stringify([kid.traits, kid.base, kid.health, s.relations[kid.id] ?? {}]) !== before) shaped++;
        }
      }
      expect(shaped, `${id} should be able to change the child`).toBeGreaterThan(5);
    }
  });

  it('sitting with a frightened child earns their trust', () => {
    const s = fitting('night_terrors');
    const { def, p } = queued(s, 'night_terrors');
    const kid = s.characters[p.subjectId!];
    expect(feelingsSum(s, kid, ruler(s))).toBe(0);
    def.choices[0].run(buildCtx(s, p));
    expect(feelingsSum(s, kid, ruler(s))).toBe(25);
  });

  it('a sibling you turn away remembers it', () => {
    const s = fitting('sibling_debts');
    const { def, p } = queued(s, 'sibling_debts');
    const sib = s.characters[p.subjectId!];
    def.choices[2].run(buildCtx(s, p));
    expect(feelingsSum(s, sib, ruler(s))).toBe(-30);
  });

  it('paying a sibling’s debt costs exactly what the text said', () => {
    const s = fitting('sibling_debts');
    const { def, p } = queued(s, 'sibling_debts');
    const owed = Number(p.data!.amount);
    const before = s.credits;
    def.choices[0].run(buildCtx(s, p));
    expect(s.credits).toBe(before - owed);
  });

  it('backing a side in the water war cannot lift a house past the grudge it holds', () => {
    const s = fitting('water_war');
    const { def, p } = queued(s, 'water_war');
    const a = s.clans[String(p.data!.a)];
    remember(s, a.id, 'Executed our heir', -75, undefined, true);
    a.opinion = 30;
    def.choices[0].run(buildCtx(s, p));
    const ceiling = opinionCeiling(a);
    expect(ceiling).not.toBeNull();
    expect(a.opinion).toBeLessThanOrEqual(ceiling!);
  });

  it('the dowry dispute is about your spouse’s own family', () => {
    const s = fitting('dowry_dispute');
    const { p } = queued(s, 'dowry_dispute');
    expect(p.subjectId).toBe(ruler(s).spouseId);
    expect(alive(ch(s, p.subjectId))).toBe(true);
    expect(s.clans[String(p.data!.clan)].isPlayer).toBeFalsy();
  });
});
