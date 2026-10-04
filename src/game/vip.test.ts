import { describe, expect, it } from 'vitest';
import { ageOf, alive, clanRank, clanRegions, effStats, isVip, liegeOf, ruler, sovereignPlanets, vassalsOf } from './core';
import { cloneCharacter, forgeLevel, growVatHeir, splice, spliceBlocker, spliceChance } from './forge';
import { buySlot, lockBlocker, lockTrait, vaultSlots } from './genetics';
import { killCharacter } from './life';
import { memorySum } from './memory';
import { STAT_KEYS, type GameState, type ScenarioId } from './types';
import { TRAITS } from './traits';
import { ageUp } from './tick';
import {
  cleanse,
  disableVip,
  enableVip,
  fillFleet,
  give,
  godGenetics,
  godTraits,
  lockGodGenes,
  makeGodTier,
  setAge,
  setImmortal,
  setStat,
  toggleTrait,
} from './vip';
import { createWorld, emperorWorlds, rollRuler, scenarioHouses, startGame, type StartOpts } from './world';
import { fleetCap } from './economy';

function start(scenario: ScenarioId, extra: Partial<StartOpts> = {}, seed = 11, planet = 'mars'): GameState {
  const s = createWorld(seed);
  const clan = scenarioHouses(s, planet, scenario)[0];
  return startGame(s, { clanId: clan.id, ruler: rollRuler(seed, planet, 'F', 'Ysra'), focus: 'cmd', scenario, ...extra });
}

/** Play a scenario forward, settling any pending pop-ups with their first choice. */
function play(s: GameState, years: number): void {
  for (let i = 0; i < years && !s.gameOver; i++) {
    s.pending = [];
    ageUp(s);
  }
}

describe('starting scenarios', () => {
  it('Governor starts as a minor house sworn to the monarch', () => {
    const s = start('governor');
    expect(clanRank(s, s.playerClanId)).toBe(1);
    expect(liegeOf(s, s.playerClanId)).not.toBeNull();
  });

  it('Viceroy starts with three regions, the title and two vassals', () => {
    const s = start('viceroy');
    expect(clanRegions(s, s.playerClanId).length).toBeGreaterThanOrEqual(3);
    expect(clanRank(s, s.playerClanId)).toBe(2);
    expect(vassalsOf(s, s.playerClanId).length).toBe(2);
    expect(liegeOf(s, s.playerClanId)).not.toBeNull();
  });

  it('Monarch starts as the royal house with every house on the planet as a vassal', () => {
    const s = start('monarch');
    expect(clanRank(s, s.playerClanId)).toBe(3);
    expect(sovereignPlanets(s, s.playerClanId)).toEqual(['mars']);
    const others = Object.values(s.clans).filter((c) => c.planetId === 'mars' && c.id !== s.playerClanId && clanRegions(s, c.id).length);
    expect(others.every((c) => liegeOf(s, c.id) === s.playerClanId)).toBe(true);
  });

  it('Solar Emperor holds three throne-worlds and the deposed houses hold a grudge', () => {
    const s = start('emperor');
    expect(clanRank(s, s.playerClanId)).toBe(4);
    expect(emperorWorlds('mars')).toEqual(['earth', 'ceres']);
    expect(sovereignPlanets(s, s.playerClanId).sort()).toEqual(['ceres', 'earth', 'mars']);
    const deposed = Object.values(s.clans).filter((c) => c.memories?.some((m) => m.text.includes('Solar Throne')));
    expect(deposed.length).toBe(2);
    expect(deposed.every((c) => memorySum(c) < 0)).toBe(true);
  });

  it('every scenario plays 60 cycles; only a governor who never lifts a finger can fall', () => {
    for (const sc of ['governor', 'viceroy', 'monarch', 'emperor'] as ScenarioId[]) {
      const s = start(sc, { family: 'kids', age: 34 }, 21);
      play(s, 60);
      // A governor who builds no ships and answers nothing is fair game for an
      // ambitious neighbour; a house that starts with real power should not be.
      if (sc === 'governor' && s.gameOver) expect(s.gameOver.reason).toMatch(/lost every last region/);
      else expect(s.year).toBeGreaterThan(2550);
    }
  });

  it('honours starting age and family', () => {
    const s = start('governor', { age: 45, family: 'kids' });
    const r = ruler(s);
    expect(ageOf(s, r)).toBe(45);
    expect(r.spouseId).toBeDefined();
    expect(r.childrenIds.length).toBeGreaterThan(0);
    for (const id of r.childrenIds) {
      const k = s.characters[id];
      expect(ageOf(s, k)).toBeLessThanOrEqual(45 - 18);
    }
    expect(r.traits).toContain('edu_cmd_3');
    const single = start('governor', { age: 16, family: 'kids' });
    expect(ruler(single).spouseId).toBeUndefined();
  });
});

describe('VIP mode', () => {
  it('builds a god-tier ruler with every good trait at once', () => {
    const traits = godTraits('cmd');
    expect(traits.length).toBeGreaterThanOrEqual(35);
    expect(traits).toContain('genius');
    expect(traits).toContain('psi_ascendant');
    expect(traits).toContain('ageless');
    expect(traits.some((t) => TRAITS[t].good === false)).toBe(false);
    const s = start('governor', { vip: true, extraTraits: traits, eduTier: 4 }, 5);
    const r = ruler(s);
    expect(isVip(s)).toBe(true);
    for (const t of traits) if (TRAITS[t].cat !== 'genetic' && TRAITS[t].cat !== 'personality') expect(r.traits).toContain(t);
    expect(r.traits).toContain('edu_cmd_4');
  });

  it('edits traits, stats and age on the fly, on anyone', () => {
    const s = start('governor', { vip: true });
    const enemy = Object.values(s.characters).find((c) => alive(c) && c.clanId !== s.playerClanId)!;
    toggleTrait(s, enemy.id, 'dim');
    expect(enemy.traits).toContain('dim');
    toggleTrait(s, enemy.id, 'genius'); // same ladder, replaces Dim
    expect(enemy.traits).toContain('genius');
    expect(enemy.traits).not.toContain('dim');
    toggleTrait(s, enemy.id, 'genius');
    expect(enemy.traits).not.toContain('genius');
    setStat(s, enemy.id, 'dip', 99);
    expect(enemy.base.dip).toBe(30);
    const r = ruler(s);
    setAge(s, r.id, 5);
    expect(ageOf(s, r)).toBe(16); // the ruler stays an adult
    setAge(s, r.id, 60);
    expect(ageOf(s, r)).toBe(60);
    toggleTrait(s, r.id, 'gene_rot');
    cleanse(s, r.id);
    expect(r.traits).not.toContain('gene_rot');
    makeGodTier(s, r.id);
    for (const k of STAT_KEYS) expect(effStats(s, r)[k]).toBeGreaterThan(15);
  });

  it('does nothing when VIP is off', () => {
    const s = start('governor');
    const r = ruler(s);
    const before = [...r.traits];
    toggleTrait(s, r.id, 'genius');
    give(s, 'credits', 1e6);
    expect(r.traits).toEqual(before);
    expect(s.credits).toBe(350);
    expect(forgeLevel(s)).toBe(0);
  });

  it('gives the player an unlimited, free Gene-Forge', () => {
    const s = start('governor', { vip: true }, 8);
    s.credits = 0;
    s.prestige = 0;
    s.faith = 50;
    const r = ruler(s);
    expect(forgeLevel(s)).toBe(2);
    const gene = r.traits.includes('psi_ascendant') ? 'genius' : 'psi_ascendant';
    expect(spliceBlocker(s, r, gene)).toBeNull();
    expect(spliceChance(s, r)).toBe(1);
    expect(splice(s, r.id, gene)).toBe(true);
    expect(r.traits).toContain(gene);
    expect(s.faith).toBe(50); // no heresy
    const kid = growVatHeir(s, r.id, godGenetics());
    expect(kid).toBeDefined();
    for (const g of godGenetics()) expect(kid!.traits).toContain(g);
    expect(cloneCharacter(s, r.id)).toBeDefined();
    expect(s.credits).toBe(0);
    // Faiths that condemn the forge never notice.
    expect(Object.values(s.clans).some((c) => c.memories?.some((m) => m.text.includes('Cloned')))).toBe(false);
  });

  it('opens an unlimited, free vault that needs no carriers', () => {
    const s = start('governor', { vip: true }, 9);
    s.credits = 0;
    s.prestige = 0;
    expect(vaultSlots(s)).toBe(Infinity);
    expect(buySlot(s)).toBe(false);
    for (const id of ['radiant', 'ironblood', 'ageless', 'brave', 'genius']) {
      expect(lockBlocker(s, id)).toBeNull();
      expect(lockTrait(s, id)).toBe(true);
    }
    lockGodGenes(s);
    for (const g of godGenetics()) expect(s.dynasty.locked).toContain(g);
    expect(s.dynasty.locked).toContain('brave');
  });

  it('immortality keeps the ruler alive until switched off', () => {
    const s = start('governor', { vip: true });
    const r = ruler(s);
    setImmortal(s, true);
    killCharacter(s, r.id, 'test');
    expect(alive(s.characters[r.id])).toBe(true);
    setImmortal(s, false);
    killCharacter(s, r.id, 'test');
    expect(alive(s.characters[r.id])).toBe(false);
  });

  it('console tops up resources and can be switched on mid-run', () => {
    const s = start('governor');
    enableVip(s);
    give(s, 'credits', 10000);
    give(s, 'prestige', 5000);
    expect(s.credits).toBe(10350);
    fillFleet(s);
    expect(s.fleet).toBe(fleetCap(s));
    disableVip(s);
    expect(isVip(s)).toBe(false);
    expect(forgeLevel(s)).toBe(0);
  });

  it('a god-tier VIP dynasty survives 80 cycles', () => {
    const s = start('emperor', { vip: true, extraTraits: godTraits('dip'), eduTier: 4, family: 'kids', age: 30 }, 33);
    lockGodGenes(s);
    play(s, 80);
    expect(s.year).toBe(2580);
  });
});
