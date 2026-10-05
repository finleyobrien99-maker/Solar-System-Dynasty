import { exportSave, importSave } from './save';
import { disputedInheritance } from './testScenarios';
import { resolveCrisis, successionTick } from './succession';
// Battle wiring for commanders (COMMANDERS-WIRING.patch): these need the
// war.ts hooks Codex integrates, so they travel with that patch.
import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { appointCommander, commanderOf, commandersTick, leadFactor, personalCommand } from './commanders';
import { alive, ch, clanRegions, ruler } from './core';
import type { Character, Clan, GameState } from './types';
import { enemySide, fightBattle, playerSide } from './war';
import { createWorld, rollRuler, startGame } from './world';

function world(seed = 9): GameState {
  const s = createWorld(seed + 400);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(seed, 'mars', 'M', 'Oren'), focus: 'cmd', age: 45, family: 'married' });
  Object.assign(s, { credits: 2000, prestige: 300, fleet: 100 });
  return s;
}

function kid(s: GameState, age: number, cmd = 6): Character {
  const r = ruler(s);
  const c = createCharacter(s, {
    gender: age % 2 ? 'M' : 'F',
    born: s.year - age,
    clanId: s.playerClanId,
    planetId: 'mars',
    fatherId: r.id,
    adultExtras: age >= 16,
  });
  c.base.cmd = cmd;
  c.traits = c.traits.filter((t) => !['brave', 'craven', 'ambitious'].includes(t));
  r.childrenIds.push(c.id);
  return c;
}

function foe(s: GameState): Clan {
  return Object.values(s.clans).find((k) => !k.isPlayer && clanRegions(s, k.id).length > 0 && alive(ch(s, k.headId)))!;
}

function war(s: GameState, k: Clan) {
  const w = { id: 'w-test', enemy: k.id, playerAttacker: true, target: clanRegions(s, k.id)[0].id, cb: 'conquest' as const, score: 0, started: s.year };
  s.wars.push(w);
  return w;
}

describe('a commander fights on their own Command', () => {
  it('borrows no council seat: changing the admiral moves the strength only when nobody is in command', () => {
    const s = world();
    const k = foe(s);
    const w = war(s, k);
    const admiral = kid(s, 30, 12);
    const general = kid(s, 24, 5);
    const without = () => playerSide(s, w, false).strength;
    s.council.admiral = undefined;
    const plain = without();
    s.council.admiral = admiral.id;
    expect(without()).toBeGreaterThan(plain);
    appointCommander(s, s.playerClanId, general.id);
    const led = playerSide(s, w, false).strength;
    s.council.admiral = undefined;
    expect(playerSide(s, w, false).strength).toBe(led);
    expect(led).toBeCloseTo(s.fleet * leadFactor(s, s.playerClanId) * 1.15, 5); // Mars +15%
  });

  it('leading in person still means the ruler leads, whoever commands', () => {
    const s = world();
    const w = war(s, foe(s));
    const before = playerSide(s, w, true).strength;
    appointCommander(s, s.playerClanId, kid(s, 24, 12).id);
    expect(playerSide(s, w, true).strength).toBe(before);
  });

  it('the enemy fights with their commander, not just their lord', () => {
    const s = world();
    const k = foe(s);
    const w = war(s, k);
    commandersTick(s);
    const general = commanderOf(s, k.id);
    expect(general).toBeTruthy();
    const before = enemySide(s, w).strength;
    general!.base.cmd += 6;
    expect(enemySide(s, w).strength).toBeGreaterThan(before);
    expect(personalCommand(s, general!)).toBeGreaterThanOrEqual(6);
  });

  it('never changes how many ships there are: losses are exactly what the battle report says', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = world(seed);
      const k = foe(s);
      const w = war(s, k);
      appointCommander(s, s.playerClanId, kid(s, 24, 8).id);
      commandersTick(s);
      const [mine, theirs] = [s.fleet, k.fleet];
      s.seed = seed * 31;
      const report = fightBattle(s, w.id)!;
      expect(s.fleet).toBe(mine - report.playerLosses);
      expect(k.fleet).toBe(theirs - report.enemyLosses);
    }
  });
});

describe('integrated command and peace consequences', () => {
  it('still applies house fatigue when a named commander replaces the admiral', () => {
    const s = world(),
      w = war(s, foe(s));
    appointCommander(s, s.playerClanId, kid(s, 24, 8).id);
    const rested = playerSide(s, w, false).strength;
    s.warWeariness[s.playerClanId] = 100;
    expect(playerSide(s, w, false).strength).toBeCloseTo(rested * 0.75);
    const before = structuredClone(s);
    playerSide(s, w, false);
    expect(s).toEqual(before);
  });

  it('credits the ruler who fought and died, rather than gifting the war to their successor', () => {
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const s = world(),
        k = foe(s),
        old = s.characters[k.headId];
      old.born = s.year - 40;
      old.traits = [];
      old.base.cmd = 1;
      const heir = createCharacter(s, { clanId: k.id, planetId: k.planetId, born: s.year - 22, fatherId: old.id });
      old.childrenIds.push(heir.id);
      appointCommander(s, k.id, old.id);
      const w = war(s, k);
      w.score = 95;
      s.fleet = 1000;
      k.fleet = 50;
      s.seed = seed;
      const report = fightBattle(s, w.id)!;
      if (old.died === undefined) continue;
      found = true;
      expect(report.won).toBe(true);
      expect(report.enemyCommanderId).toBe(old.id);
      expect(old.reputation!.deeds.battlesLost).toBe(1);
      expect(old.reputation!.deeds.warsLost).toBe(1);
      expect(k.headId).not.toBe(old.id);
      expect(s.characters[k.headId].reputation?.deeds.warsLost ?? 0).toBe(0);
      expect(s.truces).toHaveLength(1);
    }
    expect(found).toBe(true);
  });

  it('a captured commander really vacates the post, including after release and saved reload', () => {
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const s = world(),
        k = foe(s),
        general = kid(s, 24, 6),
        w = war(s, k);
      appointCommander(s, s.playerClanId, general.id);
      s.fleet = 10;
      k.fleet = 1000;
      s.seed = seed;
      fightBattle(s, w.id);
      if (general.prisonerOf !== k.id) continue;
      found = true;
      expect(s.flags?.['commander:' + s.playerClanId]).toBeUndefined();
      general.prisonerOf = undefined;
      expect(commanderOf(s, s.playerClanId)).toBeUndefined();
      expect(commanderOf(importSave(exportSave(s)), s.playerClanId)).toBeUndefined();
    }
    expect(found).toBe(true);
  });

  it('civil-war deaths and captures return surviving detached ships exactly once', () => {
    let deaths = 0,
      captures = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const { s, crisis, heir, claimant } = disputedInheritance();
      s.year = crisis.deadline;
      successionTick(s);
      s.pending = [];
      const homes = new Set([s.playerClanId, ...crisis.contributions.map((p) => p.clanId)]);
      const total = () =>
        [...homes].reduce((n, id) => n + (id === s.playerClanId ? s.fleet : s.clans[id].fleet), 0) +
        s.successionCrises
          .flatMap((c) => c.contributions)
          .filter((p) => homes.has(p.clanId))
          .reduce((n, p) => n + p.ships, 0);
      const before = total();
      s.seed = seed;
      expect(resolveCrisis(s, crisis.id, 'fight')).toBe(true);
      const text = s.log
        .slice()
        .reverse()
        .find((l) => l.t.startsWith('Succession battle'))!.t;
      const losses = text.match(/Loyalists lose (\d+) ships; rebels lose (\d+)/)!;
      expect(total(), 'civil-war fleet ledger at seed ' + seed).toBe(before - Number(losses[1]) - Number(losses[2]));
      expect((claimant.reputation!.deeds.battlesWon ?? 0) + (claimant.reputation!.deeds.battlesLost ?? 0)).toBe(1);
      const after = structuredClone(s);
      expect(resolveCrisis(s, crisis.id, 'fight')).toBe(false);
      expect(s).toEqual(after);
      expect(s.truces).toHaveLength(0);
      deaths += Number(heir.died !== undefined || claimant.died !== undefined);
      captures += Number(!!heir.prisonerOf || !!claimant.prisonerOf);
    }
    expect(deaths).toBeGreaterThan(0);
    expect(captures).toBeGreaterThan(0);
  });
});
