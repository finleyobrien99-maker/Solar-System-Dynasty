import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { alive, ch, clanRegions, ruler, setOwner } from './core';
import { dossier } from './dossier';
import { buildCtx, EVENT_BY_ID, EVENTS, queueEvent } from './events';
import { PETITION_EVENTS } from './eventsPetitions';
import { opinionCeiling, remember } from './memory';
import { feelingsSum } from './relations';
import type { Character, Clan, GameState, Pending } from './types';
import { createWorld, rollRuler, startGame } from './world';

type Pend = Extract<Pending, { kind: 'event' }>;

/** A Mars governor with grown kin, an heir, and lords next door with grown children. */
function court(seed = 3): GameState {
  const s = createWorld(seed + 70);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(seed, 'mars', 'M', 'Oren'), focus: 'dip', age: 46, family: 'married' });
  Object.assign(s, { credits: 3000, faith: 300, prestige: 300, fleet: 120 });
  const r = ruler(s);
  for (const age of [17, 21]) {
    const c = createCharacter(s, {
      gender: age % 2 ? 'M' : 'F',
      born: s.year - age,
      clanId: s.playerClanId,
      planetId: 'mars',
      fatherId: r.id,
      adultExtras: true,
    });
    r.childrenIds.push(c.id);
  }
  for (const k of local(s)) {
    const head = s.characters[k.headId];
    head.born = Math.min(head.born, s.year - 50);
    head.prisonerOf = undefined;
    for (const age of [22, 26]) {
      const c = createCharacter(s, { gender: 'M', born: s.year - age, clanId: k.id, planetId: k.planetId, fatherId: head.id, adultExtras: true });
      head.childrenIds.push(c.id);
    }
  }
  return s;
}

function local(s: GameState): Clan[] {
  return Object.values(s.clans).filter((k) => !k.isPlayer && k.planetId === 'mars' && clanRegions(s, k.id).length > 0 && alive(ch(s, k.headId)));
}

function queued(s: GameState, id: string): Pend {
  const def = EVENT_BY_ID[id];
  expect(!def.when || def.when(s), `${id} should fire`).toBe(true);
  expect(queueEvent(s, def), `${id} should queue`).toBe(true);
  return s.pending[s.pending.length - 1] as Pend;
}

/** Every character the petition names, by id. */
function namedPeople(s: GameState, p: Pend): Character[] {
  const ids = [p.subjectId, ...Object.values(p.data ?? {}).map(String)].filter((x): x is string => !!x && !!s.characters[x]);
  return ids.map((id) => s.characters[id]);
}

describe('justice petitions about real, named people', () => {
  it('has ten distinct petitions in the deck', () => {
    const ids = PETITION_EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(10);
    for (const id of ids)
      expect(
        EVENTS.some((e) => e.id === id),
        id,
      ).toBe(true);
  });

  for (const def of PETITION_EVENTS) {
    it(`${def.id}: fires, names living people, and every option resolves`, () => {
      expect(def.choices.length).toBeGreaterThanOrEqual(3);
      for (let seed = 1; seed <= 8; seed++) {
        const s = court(seed);
        s.seed = seed * 7919;
        const p = queued(s, def.id);
        const people = namedPeople(s, p);
        expect(people.length, `${def.id} should be about somebody real`).toBeGreaterThan(0);
        for (const c of people) {
          expect(alive(c)).toBe(true);
          expect(c.prisonerOf).toBeUndefined();
          expect(c.id).not.toBe(s.rulerId);
        }
        const ctx = buildCtx(s, p);
        expect(def.text(ctx)).not.toMatch(/undefined|NaN|\$\{|a rival house/);
        def.choices.forEach((choice, i) => {
          const t = structuredClone(s);
          const c = buildCtx(t, t.pending[t.pending.length - 1] as Pend);
          if (choice.available && !choice.available(c)) return;
          expect(choice.describe(c), `${def.id} #${i}`).not.toMatch(/undefined|NaN|someone|a rival house/);
          expect(choice.run(c), `${def.id} #${i}`).not.toMatch(/undefined|NaN|\$\{/);
        });
      }
    });

    it(`${def.id}: showing it changes nothing, not even the seed`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const s = court(seed);
        s.seed = seed * 104729;
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
      }
    });
  }

  it("options you can't afford are locked, with a reason", () => {
    let locked = 0;
    for (const def of PETITION_EVENTS) {
      const s = court();
      const p = queued(s, def.id);
      Object.assign(s, { credits: 0, faith: 0, fleet: 0 });
      const ctx = buildCtx(s, p);
      for (const c of def.choices)
        if (c.available && !c.available(ctx)) {
          locked++;
          expect(c.why?.(ctx), `${def.id}: ${c.label}`).toBeTruthy();
        }
    }
    expect(locked).toBeGreaterThanOrEqual(3);
  });

  it('a ruling builds a reputation for justice or caprice', () => {
    const s = court();
    const p = queued(s, 'dock_beating');
    const def = EVENT_BY_ID.dock_beating;
    def.choices[0].run(buildCtx(s, p));
    expect(ruler(s).reputation?.deeds.justice).toBe(1);
    const t = court();
    const q = queued(t, 'dock_beating');
    def.choices[1].run(buildCtx(t, q));
    expect(ruler(t).reputation?.deeds.arbitrary).toBe(1);
  });

  it('a debtor you bail out owes you, and your dossier on them says so', () => {
    const s = court();
    const p = queued(s, 'unpaid_debt');
    EVENT_BY_ID.unpaid_debt.choices[1].run(buildCtx(s, p));
    const debtor = s.characters[p.subjectId!];
    expect(feelingsSum(s, debtor, ruler(s))).toBe(25);
    expect(dossier(s, debtor.id).leverage.some((l) => l.text.startsWith('Owes you: paid my debt'))).toBe(true);
  });

  it('backing one child against the other leaves a grudge inside their house', () => {
    const s = court();
    const p = queued(s, 'inheritance_quarrel');
    const [elder, younger] = [s.characters[String(p.data!.elder)], s.characters[String(p.data!.younger)]];
    expect(elder.born).toBeLessThan(younger.born);
    EVENT_BY_ID.inheritance_quarrel.choices[0].run(buildCtx(s, p));
    expect(feelingsSum(s, younger, elder)).toBe(-20);
  });

  it('a lord you fine remembers it in your dossier on them', () => {
    const s = court();
    const p = queued(s, 'assembly_insult');
    EVENT_BY_ID.assembly_insult.choices[2].run(buildCtx(s, p));
    const lord = s.characters[p.subjectId!];
    expect(feelingsSum(s, lord, ruler(s))).toBe(-20);
    expect(dossier(s, lord.id).facts.find((l) => l.source === 'how they treat you')?.text).toMatch(/fined me for a joke/i);
  });

  it('no ruling can lift a house past the grudge it holds', () => {
    const s = court();
    const p = queued(s, 'boundary_dispute');
    const a = s.clans[String(p.data!.clanA)];
    remember(s, a.id, 'Executed our heir', -75, undefined, true);
    a.opinion = 40;
    EVENT_BY_ID.boundary_dispute.choices[0].run(buildCtx(s, p));
    expect(a.opinion).toBeLessThanOrEqual(opinionCeiling(a)!);
  });

  it('petitions need someone to be about: no houses next door, no boundary dispute', () => {
    const s = court();
    for (const k of local(s)) for (const r of clanRegions(s, k.id)) setOwner(s, r, s.playerClanId);
    expect(EVENT_BY_ID.boundary_dispute.when!(s)).toBe(false);
    expect(EVENT_BY_ID.dock_beating.when!(s)).toBe(false);
  });
});
