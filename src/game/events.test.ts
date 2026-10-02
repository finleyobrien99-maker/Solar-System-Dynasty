import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { ageOf, clanRegions, ruler } from './core';
import { EVENTS, EVENT_BY_ID, buildCtx, queueEvent, resolveEvent, rollEvents } from './events';
import { setFlag } from './eventKit';
import { MORE_EVENTS } from './eventsMore';
import { theFaith } from './planets';
import { addTrait } from './traits';
import type { GameState } from './types';
import { createWorld, rollRuler, startGame } from './world';

/** A rich adult ruler with a spouse, young children, an ill courtier and a dead predecessor. */
function court(seed = 11): GameState {
  const s = createWorld(seed);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(seed, 'mars', 'F', 'Ines'), focus: 'dip', age: 34, family: 'kids' });
  const r = ruler(s);
  for (const age of [6, 9, 12]) {
    const kid = createCharacter(s, { born: s.year - age, clanId: s.playerClanId, planetId: 'mars', motherId: r.id });
    r.childrenIds.push(kid.id);
  }
  r.traits = addTrait(r.traits, 'ill');
  s.dynasty.rulers.unshift({ id: 'ghost', name: 'Old Varro', from: s.year - 40, to: s.year - 1, title: 'Governor of Somewhere' });
  s.credits = 5000;
  s.fleet = 120;
  s.prestige = 500;
  s.faith = 500;
  return s;
}

function finite(s: GameState) {
  for (const v of [s.credits, s.fleet, s.prestige, s.faith]) expect(Number.isFinite(v)).toBe(true);
  for (const c of Object.values(s.characters)) {
    expect(Number.isFinite(c.health)).toBe(true);
    for (const v of Object.values(c.base)) expect(Number.isFinite(v)).toBe(true);
  }
}

describe('event deck', () => {
  it('has unique ids', () => {
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
  });

  it('every choice of every event resolves cleanly', () => {
    const hit = new Set<string>();
    for (const def of EVENTS) {
      for (let i = 0; i < def.choices.length; i++) {
        const s = court();
        if (def.id === 'hatchling_grown') setFlag(s, 'hatchling', s.year, { keeper: ruler(s).childrenIds[0], pet: 'Pip' });
        if (def.id === 'loan_repaid') setFlag(s, 'loan', s.year, { name: 'Tam', gender: 'M', ok: 1 });
        if (def.id === 'loan_lost') setFlag(s, 'loan', s.year, { name: 'Tam', gender: 'M', ok: 0 });
        if (def.id === 'heir_of_age') continue; // needs a sixteen-year-old heir; covered below
        if (def.when && !def.when(s)) continue;
        if (!queueEvent(s, def)) continue;
        const p = s.pending[s.pending.length - 1];
        if (p.kind !== 'event') throw new Error('expected an event');
        const ctx = buildCtx(s, p);
        const text = def.text(ctx);
        expect(text, def.id).not.toMatch(/undefined|NaN|\bthe The\b/);
        const c = def.choices[i];
        if ((c.show && !c.show(ctx)) || (c.available && !c.available(ctx))) continue;
        const before = s.pending.length;
        resolveEvent(s, p.uid, i);
        expect(s.pending.length, `${def.id} #${i}`).toBe(before); // event swapped for its outcome notice
        const notice = s.pending[0];
        expect(notice.kind).toBe('notice');
        if (notice.kind === 'notice') expect(notice.text, `${def.id} #${i}`).not.toMatch(/undefined|NaN/);
        finite(s);
        hit.add(def.id);
      }
    }
    const untested = MORE_EVENTS.map((e) => e.id).filter((id) => id !== 'heir_of_age' && !hit.has(id));
    expect(untested).toEqual([]);
  });

  it('marks the heir coming of age', () => {
    const s = court();
    const r = ruler(s);
    const heir = createCharacter(s, { born: s.year - 16, clanId: s.playerClanId, planetId: 'mars', fatherId: r.id });
    r.childrenIds.push(heir.id);
    for (const c of Object.values(s.characters)) if (c.id !== heir.id && (c.fatherId === r.id || c.motherId === r.id)) c.born = s.year - 3;
    const def = EVENT_BY_ID.heir_of_age;
    expect(def.when!(s)).toBe(true);
    expect(queueEvent(s, def)).toBe(true);
    const p = s.pending[s.pending.length - 1];
    resolveEvent(s, p.uid, 1);
    expect(heir.base.cmd).toBeGreaterThan(0);
    expect(ageOf(s, heir)).toBe(16);
  });

  it('follow-ups fire when their story comes due', () => {
    const s = court();
    s.pending = [];
    setFlag(s, 'loan', s.year, { name: 'Tam', gender: 'F', ok: 1 });
    rollEvents(s);
    const ids = s.pending.map((p) => (p.kind === 'event' ? p.eventId : ''));
    expect(ids).toContain('loan_repaid');
    expect(s.flags?.loan).toBeUndefined();
  });

  it('a stored harvest saves the realm from blight', () => {
    const s = court();
    const harvest = EVENT_BY_ID.harvest;
    queueEvent(s, harvest);
    resolveEvent(s, s.pending[s.pending.length - 1].uid, 2);
    expect(s.flags?.granary).toBeTruthy();
    s.pending = [];
    queueEvent(s, EVENT_BY_ID.blight);
    const p = s.pending[0];
    if (p.kind !== 'event') throw new Error('expected an event');
    expect(EVENT_BY_ID.blight.choices[0].show!(buildCtx(s, p))).toBe(true);
    resolveEvent(s, p.uid, 0);
    expect(s.flags?.granary).toBeUndefined();
  });

  it('never leaves a cycle without an event while the deck has options', () => {
    const s = court();
    for (let i = 0; i < 40; i++) {
      s.pending = [];
      s.year += 1;
      rollEvents(s);
      expect(s.pending.length).toBeGreaterThan(0);
    }
  });

  it('names faiths without doubling "the"', () => {
    expect(theFaith('red')).toBe('the Red Codex');
    expect(theFaith('solar')).toBe('the Solar Orthodoxy');
  });
});
