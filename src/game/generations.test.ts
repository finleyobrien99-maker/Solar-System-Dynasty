import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { alive, ruler, vassalsOf } from './core';
import { canServe, ROLE_KEYS } from './council';
import { recordDeed } from './epithets';
import { designateHeir } from './family';
import { rulerLegacy } from './legacy';
import { abdicate, abdicationBlocker, currentHeir, killCharacter, lineOfSuccession, retiredRuler } from './life';
import { exportSave, importSave } from './save';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';

function game(vip = false) {
  const w = createWorld(21),
    house = scenarioHouses(w, 'mars', 'monarch')[0];
  const s = startGame(w, { clanId: house.id, ruler: rollRuler(21, 'mars', 'F', 'Ines'), age: 45, focus: 'dip', family: 'kids', vip });
  s.pending = [];
  currentHeir(s)!.born = s.year - 25;
  return s;
}

describe('generational handovers', () => {
  it('blocked decisions change nothing: no heir, child heir, regent, prison, pending events and ended games', () => {
    for (const reason of ['none', 'young', 'regent', 'prison', 'heir-prison', 'pending', 'ended']) {
      const s = game();
      if (reason === 'none') for (const c of Object.values(s.characters)) if (c.id !== s.rulerId && c.clanId === s.playerClanId) c.died = s.year - 1;
      if (reason === 'young') currentHeir(s)!.born = s.year - 15;
      if (reason === 'regent') ruler(s).born = s.year - 12;
      if (reason === 'prison') ruler(s).prisonerOf = 'enemy';
      if (reason === 'heir-prison') currentHeir(s)!.prisonerOf = 'enemy';
      if (reason === 'pending') s.pending.push({ kind: 'notice', uid: 'test', title: 'Wait', text: 'Wait' });
      if (reason === 'ended') s.gameOver = { year: s.year, reason: 'Ended' };
      const before = JSON.stringify(s);
      expect(abdicationBlocker(s), reason).toBeTruthy();
      expect(abdicate(s), reason).toBe(false);
      expect(JSON.stringify(s), reason).toBe(before);
    }
  });
  it('an immortal ruler retires alive, keeps their deeds and becomes a councillor without copying their titles to the heir', () => {
    const s = game(true),
      old = ruler(s),
      heir = currentHeir(s)!;
    s.vip!.immortal = true;
    recordDeed(s, old, 'justice', 5);
    s.pending = [];
    s.council.envoy = heir.id;
    s.prestige = 1000;
    const before = { seed: s.seed, credits: s.credits, fleet: s.fleet, traits: [...old.traits], spouse: old.spouseId };
    const opinions = new Map(vassalsOf(s, s.playerClanId).map((k) => [k.id, k.opinion]));
    expect(abdicate(s)).toBe(true);
    expect(s.rulerId).toBe(heir.id);
    expect(alive(old)).toBe(true);
    expect(retiredRuler(s, old.id)).toBe(true);
    expect(s.council.envoy).toBe(old.id);
    expect(canServe(s, old)).toBe(true);
    expect(Object.values(s.council)).not.toContain(heir.id);
    expect(old.reputation!.earned.some((e) => e.id === 'just')).toBe(true);
    expect(heir.reputation?.earned ?? []).toEqual([]);
    expect({ seed: s.seed, credits: s.credits, fleet: s.fleet, traits: old.traits, spouse: old.spouseId }).toEqual(before);
    expect(s.prestige).toBe(900);
    for (const [id, op] of opinions) expect(s.clans[id].opinion).toBe(op - 10);
    expect(s.dynasty.rulers.at(-2)?.to).toBe(s.year);
    expect(s.pending.at(-1)).toMatchObject({ kind: 'succession', deadId: old.id, heirId: heir.id });
    const loaded = importSave(exportSave(s));
    expect(retiredRuler(loaded, old.id)).toBe(true);
    expect(loaded.rulerId).toBe(heir.id);
  });
  it('preserves occupied council seats and prevents retired rulers returning through succession or designation', () => {
    const s = game(),
      old = ruler(s);
    for (const role of ROLE_KEYS) {
      const c = createCharacter(s, { clanId: s.playerClanId, planetId: 'mars', born: s.year - 30 });
      s.council[role] = c.id;
    }
    const council = { ...s.council };
    expect(abdicate(s)).toBe(true);
    expect(s.council).toEqual(council);
    expect(lineOfSuccession(s).map((c) => c.id)).not.toContain(old.id);
    s.dynasty.law = 'designated';
    designateHeir(s, old.id);
    expect(s.dynasty.designatedHeir).not.toBe(old.id);
  });
  it('death clears the incoming ruler from the council immediately', () => {
    const s = game(),
      old = ruler(s),
      heir = currentHeir(s)!;
    s.council.admiral = heir.id;
    killCharacter(s, old.id, 'old age');
    expect(s.rulerId).toBe(heir.id);
    expect(s.council.admiral).toBeUndefined();
    expect(old.died).toBe(s.year);
    expect(s.pending).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'succession', deadId: old.id, heirId: heir.id })]));
  });
  it('an abdicated ruler cannot become the fallback heir when their successor dies', () => {
    const s = game(),
      old = ruler(s);
    abdicate(s);
    s.pending = [];
    const next = ruler(s);
    for (const c of Object.values(s.characters)) if (c.clanId === s.playerClanId && c.id !== old.id && c.id !== next.id) c.died = s.year - 1;
    killCharacter(s, next.id, 'old age');
    expect(alive(old)).toBe(true);
    expect(s.gameOver).toBeTruthy();
    expect(s.rulerId).not.toBe(old.id);
  });
});

describe('ruler legacies', () => {
  it('uses personal deeds, keeps death age and reign length fixed, and never mutates state or dice', () => {
    const s = game(),
      old = ruler(s);
    const children = old.childrenIds.length;
    s.year += 12;
    s.stats.battlesWon = 1000;
    recordDeed(s, old, 'justice', 5);
    s.pending = [];
    killCharacter(s, old.id, 'old age');
    s.year += 80;
    const before = JSON.stringify(s),
      legacy = rulerLegacy(s, old);
    expect(legacy.name).toContain('the Just');
    expect(legacy.age).toBe(57);
    expect(legacy.rulingYears).toBe(12);
    expect(legacy.children).toBe(children);
    expect(legacy.highlights).toContainEqual({ deed: 'justice', label: 'Fair judgements', value: 5 });
    expect(legacy.highlights.some((h) => h.deed === 'battlesWon')).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('AI profiles use only observed deeds and old saves never acquire invented achievements', () => {
    const s = game(),
      house = Object.values(s.clans).find((k) => !k.isPlayer)!;
    const ai = s.characters[house.headId];
    recordDeed(s, ai, 'regionsTaken', 5);
    ai.reputation!.deeds.rulingYears = 20;
    expect(rulerLegacy(s, ai).rulingYears).toBe(20);
    expect(rulerLegacy(s, ai).highlights).toContainEqual({ deed: 'regionsTaken', label: 'Regions conquered', value: 5 });
    const old = s.characters[s.dynasty.rulers[0].id];
    delete old.reputation;
    expect(rulerLegacy(s, old).highlights).toEqual([]);
    expect(rulerLegacy(s, old).rulingYears).toBeGreaterThan(0);
  });
});
