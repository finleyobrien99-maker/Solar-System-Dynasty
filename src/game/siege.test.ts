import { describe, expect, it } from 'vitest';
import { aiDeclareWar, canFightBattle, conductSiege, endWar, fightBattle, siegeOptions } from './war';
import { declareHouseWar, tickAiWars } from './ai';
import { alive, ch, clanRegions, ruler, setOwner } from './core';
import { appointCommander } from './commanders';
import { createCharacter } from './character';
import { performSiege, siegeBlocker } from './siege';
import { exportSave, importSave } from './save';
import { peaceCampaign } from './testScenarios';

function ready() {
  const f = peaceCampaign();
  f.s.year++;
  // Orbital control must come from a real battle.
  if (f.war.score < 25) {
    fightBattle(f.s, f.war.id);
    f.s.year++;
  }
  f.s.pending = [];
  return f;
}

describe('siege orders', () => {
  it('previews and blocked calls leave state and RNG untouched', () => {
    const { s, war } = ready();
    const before = structuredClone(s);
    expect(siegeOptions(s, war.id).map((o) => o.kind)).toEqual(['starve', 'assault', 'bribe', 'sabotage']);
    expect(siegeOptions(s, 'missing')).toEqual([]);
    expect(conductSiege(s, 'missing', 'starve')).toBeUndefined();
    expect(s).toEqual(before);
    for (const why of ['control', 'fleet', 'credits', 'captive', 'minor', 'target', 'gate', 'ended'] as const) {
      const state = structuredClone(s),
        w = state.wars[0];
      if (why === 'control') w.score = 24;
      if (why === 'fleet') state.fleet = 9;
      if (why === 'credits') state.credits = 0;
      if (why === 'captive') ruler(state).prisonerOf = war.enemy;
      if (why === 'minor') ruler(state).born = state.year - 15;
      if (why === 'target') setOwner(state, state.regions[w.target], state.playerClanId);
      if (why === 'gate') w.lastPlayerBattle = state.year;
      if (why === 'ended') state.gameOver = { reason: 'Ended', year: state.year };
      const original = structuredClone(state);
      expect(siegeBlocker(state, w.id, 'starve'), why).toBeTruthy();
      expect(conductSiege(state, w.id, 'starve'), why).toBeUndefined();
      expect(state, why).toEqual(original);
    }
  });

  it('pays for a blockade, loses actual own ships and shares the battle gate across reload', () => {
    const { s, war, target } = ready();
    const [money, fleet, score] = [s.credits, s.fleet, war.score];
    const r = conductSiege(s, war.id, 'starve')!;
    expect(r.success).toBe(true);
    expect(r.cost).toBe(20 + 4 * target.dev);
    expect(r.progress).toBeGreaterThanOrEqual(5);
    expect(r.progress).toBeLessThanOrEqual(9);
    expect(s.credits).toBe(money - r.cost);
    expect(s.fleet).toBe(fleet - r.losses);
    expect(war.score).toBe(score + r.progress);
    expect(target.owner).toBe(war.enemy);
    expect(canFightBattle(s, war)).toBe(false);
    const loaded = importSave(exportSave(s)),
      before = structuredClone(loaded);
    expect(conductSiege(loaded, war.id, 'bribe')).toBeUndefined();
    expect(fightBattle(loaded, war.id)).toBeUndefined();
    expect(loaded).toEqual(before);
  });

  it('bribes and sabotage pay on failed attempts, with the advertised setback and real attrition', () => {
    for (const kind of ['bribe', 'sabotage'] as const) {
      const { s, war } = ready();
      let failures = 0,
        successes = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const state = structuredClone(s);
        state.seed = seed * 100003;
        const score = state.wars[0].score;
        const result = conductSiege(state, war.id, kind)!;
        expect(state.credits).toBe(s.credits - result.cost);
        expect(state.fleet).toBe(s.fleet - result.losses);
        expect(state.wars[0].score).toBe(score + result.progress);
        if (result.success) successes++;
        else {
          failures++;
          expect(result.progress).toBe(kind === 'bribe' ? -4 : -8);
        }
      }
      expect(failures).toBeGreaterThan(0);
      expect(successes).toBeGreaterThan(0);
    }
  });

  it('assault is precisely one ordinary battle, with identical costs, deeds, rolls and commander fate', () => {
    const { s, war } = ready(),
      head = ruler(s);
    const child = createCharacter(s, { clanId: s.playerClanId, born: s.year - 25, motherId: head.id, planetId: 'mars' });
    head.childrenIds.push(child.id);
    appointCommander(s, s.playerClanId, child.id);
    const ordinary = structuredClone(s),
      assault = structuredClone(s);
    const report = fightBattle(ordinary, war.id)!;
    const result = conductSiege(assault, war.id, 'assault')!;
    expect(result).toMatchObject({ kind: 'assault', cost: 0, losses: report.playerLosses, success: report.won, leaderId: child.id });
    const aWar = assault.wars.find((w) => w.id === war.id);
    if (aWar) delete aWar.siege;
    expect(assault).toEqual(ordinary);
    expect(performSiege(s, war.id, 'assault')).toBeUndefined();
  });

  it('siege completion uses the existing settlement once and records a real territorial gain', () => {
    const { s, war, target } = ready();
    war.score = 98;
    const result = conductSiege(s, war.id, 'starve')!;
    expect(result.progress).toBe(2);
    expect(target.owner).toBe(s.playerClanId);
    expect(s.wars).toHaveLength(0);
    expect(s.houseThreat[s.playerClanId]).toBe(12 + (target.capital ? 20 : 0));
    const after = structuredClone(s);
    expect(conductSiege(s, war.id, 'starve')).toBeUndefined();
    endWar(s, war, 'win');
    expect(s).toEqual(after);
  });

  it('an AI attacking the player spends its own treasury and changes score in the right direction', () => {
    const { s, war, enemy } = ready();
    endWar(s, war, 'white');
    s.truces = [];
    s.pending = [];
    const target = clanRegions(s, s.playerClanId)[0];
    expect(aiDeclareWar(s, enemy.id, 'conquest', target.id)).toBe(true);
    const w = s.wars[0];
    w.score = -35;
    enemy.fleet = 100;
    enemy.credits = 1000;
    const playerMoney = s.credits,
      playerShips = s.fleet;
    const before = structuredClone(s);
    expect(conductSiege(s, w.id, 'bribe')).toBeUndefined();
    expect(s).toEqual(before);
    const result = conductSiege(s, w.id, 'starve', true)!;
    expect(enemy.credits).toBe(1000 - result.cost);
    expect(enemy.fleet).toBe(100 - result.losses);
    expect(s.credits).toBe(playerMoney);
    expect(s.fleet).toBe(playerShips);
    expect(w.score).toBe(-35 - result.progress);
    const after = structuredClone(s);
    expect(fightBattle(s, w.id, true)).toBeUndefined();
    expect(conductSiege(s, w.id, 'sabotage', true)).toBeUndefined();
    expect(s).toEqual(after);
    expect(canFightBattle(s, w)).toBe(true); // The defender still has their own allowance.
  });

  it('AI house campaigns replace their battle with one operation, keep their own costs and respect the cycle gate', () => {
    const { s, war } = ready();
    endWar(s, war, 'white');
    const houses = Object.values(s.clans).filter((c) => !c.isPlayer && clanRegions(s, c.id).length && alive(ch(s, c.headId)) && !ch(s, c.headId)!.prisonerOf);
    const [a, d] = houses;
    a.fleet = 200;
    a.credits = 1000;
    ch(s, a.headId)!.born = s.year - 40;
    for (const c of Object.values(s.characters)) c.spouseId = undefined;
    expect(declareHouseWar(s, a.id, clanRegions(s, d.id)[0].id)).toBe(true);
    const w = s.aiWars[0];
    w.progress = 40;
    const result = performSiege(s, w.id, 'starve', true)!;
    expect(result.attacker).toBe(a.id);
    expect(a.credits).toBe(1000 - result.cost);
    const after = structuredClone(s);
    tickAiWars(s);
    expect(s).toEqual(after);
  });
});
