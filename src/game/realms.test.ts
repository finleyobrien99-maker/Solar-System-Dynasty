/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { decompressFromBase64 } from 'lz-string';
import { describe, expect, it } from 'vitest';
import { capitalOf, clanRank, clanRegions, liegeOf, planetRegions, SAVE_VERSION } from './core';
import { PLANETS, LEGACY_REGION_COUNTS, neighbourPlanets } from './planets';
import { exportSave, importSave, migrate, MIGRATIONS } from './save';
import { checkInvariants, drain } from './testkit';
import { ageUp } from './tick';
import type { GameState, ScenarioId } from './types';
import { createWorld, emperorWorlds, rollRuler, scenarioHouses, startGame } from './world';
import { GOODS, openRoute, routeValue } from './trade';

function legacy(): GameState {
  const envelope = JSON.parse(readFileSync(new URL('./__fixtures__/save-v12-realm-campaign.json', import.meta.url), 'utf8'));
  return JSON.parse(decompressFromBase64(envelope.data));
}

describe('twelve solar realms', () => {
  it('gives every realm twelve named, separated regions and six landed households', () => {
    const s = createWorld(7331);
    expect(PLANETS).toHaveLength(12);
    expect(Object.keys(s.regions)).toHaveLength(144);
    expect(Object.keys(s.clans)).toHaveLength(72);
    expect(createWorld(7331)).toEqual(s);
    for (const p of PLANETS) {
      const regions = planetRegions(s, p.id);
      const houses = Object.values(s.clans).filter((c) => c.planetId === p.id);
      expect(regions).toHaveLength(12);
      expect(new Set(regions.map((r) => r.name)).size).toBe(12);
      expect(regions.filter((r) => r.capital)).toHaveLength(1);
      for (const region of regions) {
        expect(s.clans[region.owner]).toBeTruthy();
        expect(region.site.every(Number.isFinite)).toBe(true);
        for (const other of regions.filter((r) => r.id !== region.id))
          expect(Math.hypot(region.site[0] - other.site[0], region.site[1] - other.site[1])).toBeGreaterThan(0.08);
      }
      expect(houses).toHaveLength(6);
      for (const house of houses) {
        expect(clanRegions(s, house.id).length).toBeGreaterThan(0);
        expect(s.characters[house.headId]?.died).toBeUndefined();
        expect(house.fleet).toBeGreaterThan(0);
      }
    }
  });

  for (const planet of ['sun', 'moon']) {
    for (const scenario of ['governor', 'viceroy', 'monarch', 'emperor'] as ScenarioId[]) {
      it(`${planet} supports ${scenario}, ordinary succession, trade and reload`, () => {
        const w = createWorld(321);
        const house = scenarioHouses(w, planet, scenario)[0];
        const s = startGame(w, { clanId: house.id, ruler: rollRuler(321, planet, 'F'), focus: 'dip', scenario, family: 'kids' });
        expect(clanRank(s, s.playerClanId)).toBe(['governor', 'viceroy', 'monarch', 'emperor'].indexOf(scenario) + 1);
        if (scenario !== 'emperor') expect(clanRegions(s, s.playerClanId).filter((r) => r.capital)).toHaveLength(scenario === 'monarch' ? 1 : 0);
        expect(GOODS[planet]).toBeTruthy();
        const partner = Object.values(s.clans).find((c) => c.planetId === 'earth' && !c.isPlayer)!;
        partner.opinion = 100;
        s.credits = 1000;
        const from = clanRegions(s, s.playerClanId)[0];
        expect(routeValue(s, from.id, partner.id, 'earth')).toBeGreaterThan(0);
        expect(openRoute(s, from.id, partner.id)).toBeTruthy();
        for (let i = 0; i < 10 && !s.gameOver; i++) {
          drain(s, { seed: i });
          ageUp(s);
          checkInvariants(s);
        }
        expect(importSave(exportSave(s))).toEqual(JSON.parse(JSON.stringify(s)));
      });
    }
  }

  it('treats Earth and the Moon as neighbours, and starts emperors near their home realm', () => {
    expect(neighbourPlanets('earth')).toEqual(expect.arrayContaining(['venus', 'moon', 'mars']));
    expect(neighbourPlanets('moon')).toEqual(expect.arrayContaining(['earth', 'venus', 'mars']));
    expect(neighbourPlanets('sun')).toEqual(['mercury']);
    expect(emperorWorlds('moon')).toEqual(['earth', 'venus']);
    expect(emperorWorlds('sun')).toEqual(['mercury', 'venus']);
  });
});

describe('geography save upgrade', () => {
  it('adds real households and land while preserving every existing region, person, house and pending war', () => {
    const old = legacy();
    const before = structuredClone(old);
    // Populate the ownership cache before changing the world.
    expect(planetRegions(old, 'earth')).toHaveLength(LEGACY_REGION_COUNTS.earth);
    const upgraded = migrate(old);
    expect(upgraded.version).toBe(SAVE_VERSION);
    expect(upgraded.seed).toBe(before.seed);
    expect(upgraded.rulerId).toBe(before.rulerId);
    expect(upgraded.playerClanId).toBe(before.playerClanId);
    for (const [id, r] of Object.entries(before.regions)) expect(upgraded.regions[id]).toEqual(r);
    for (const [id, c] of Object.entries(before.characters)) expect(upgraded.characters[id]).toEqual(c);
    for (const [id, c] of Object.entries(before.clans)) expect(upgraded.clans[id]).toEqual(c);
    for (const key of ['credits', 'fleet', 'prestige', 'faith', 'wars', 'aiWars', 'pending', 'diplomacy', 'dynasty', 'relations', 'log'] as const)
      expect(upgraded[key]).toEqual(before[key]);
    expect(clanRank(upgraded, upgraded.playerClanId)).toBe(clanRank(before, before.playerClanId));
    for (const p of PLANETS) {
      expect(planetRegions(upgraded, p.id)).toHaveLength(12);
      if (LEGACY_REGION_COUNTS[p.id]) expect(capitalOf(upgraded, p.id)).toEqual(capitalOf(before, p.id));
    }
    for (const r of Object.values(upgraded.regions).filter((r) => !before.regions[r.id])) {
      expect(before.clans[r.owner]).toBeUndefined();
      expect(upgraded.clans[r.owner].fleet).toBeGreaterThan(0);
      if (LEGACY_REGION_COUNTS[r.planetId]) expect(liegeOf(upgraded, r.owner)).toBe(capitalOf(upgraded, r.planetId)?.owner);
    }
    for (const c of Object.values(upgraded.characters).filter((c) => !before.characters[c.id])) {
      expect(upgraded.clans[c.clanId]).toBeTruthy();
      for (const id of [c.fatherId, c.motherId, c.spouseId, ...c.childrenIds].filter(Boolean)) expect(upgraded.characters[id!]).toBeTruthy();
    }
    const once = structuredClone(upgraded);
    MIGRATIONS[13](upgraded);
    expect(upgraded).toEqual(once);
    expect(importSave(exportSave(upgraded))).toEqual(once);
    expect(migrate(structuredClone(before))).toEqual(once);
    for (let i = 0; i < 10 && !upgraded.gameOver; i++) {
      drain(upgraded, { seed: i });
      ageUp(upgraded);
      checkInvariants(upgraded);
    }
  });
});
