import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import {
  commandersTick,
  appointCommander,
  battleRecord,
  commandBlocker,
  commandedBattleFates,
  commanderFor,
  onCommandedBattle,
  commanderOf,
  dismissCommander,
  eligibleCommanders,
  leadFactor,
} from './commanders';
import { alive, ch, clanRegions, ruler } from './core';
import { getFlag } from './eventKit';
import { heldKin } from './eventsCourt';
import { prisoners } from './intrigue';
import { feelingsSum } from './relations';
import type { Character, Clan, GameState } from './types';
import { playerSide } from './war';
import { sendAsWard } from './wards';
import { createWorld, rollRuler, startGame } from './world';

/** One battle for a house's commander against another house's, through the integration API; returns that commander's fate. */
function commanderAfterBattle(s: GameState, house: string, won: boolean, enemy: string) {
  const mine = commanderOf(s, house)?.id;
  const fates = commandedBattleFates(s, {
    id: 't' + s.seed,
    attacker: house,
    defender: enemy,
    attackerCommanderId: mine,
    defenderCommanderId: commanderOf(s, enemy)?.id,
    attackerWon: won,
  });
  return fates.find((f) => f.who === mine);
}

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

describe('who can command a fleet', () => {
  it('your grown close family and councillors, never the ruler (who leads in person), a child, a captive or a ward abroad', () => {
    const s = world();
    const son = kid(s, 22);
    const young = kid(s, 12);
    const pool = eligibleCommanders(s, s.playerClanId).map((c) => c.id);
    expect(pool).toContain(son.id);
    expect(pool).not.toContain(s.rulerId);
    expect(pool).not.toContain(young.id);
    expect(commandBlocker(s, s.playerClanId, s.rulerId)).toMatch(/lead in person/);
    expect(commandBlocker(s, s.playerClanId, young.id)).toMatch(/at least 16/);
    son.prisonerOf = foe(s).id;
    expect(eligibleCommanders(s, s.playerClanId).map((c) => c.id)).not.toContain(son.id);
    const ward = kid(s, 14);
    sendAsWard(s, ward.id, foe(s).id, true);
    ward.born = s.year - 16;
    expect(eligibleCommanders(s, s.playerClanId).map((c) => c.id)).not.toContain(ward.id);
  });

  it('one commander per house; replacing or dismissing them is felt', () => {
    const s = world();
    const a = kid(s, 22);
    const b = kid(s, 25);
    expect(appointCommander(s, s.playerClanId, a.id)).toBe(true);
    expect(commanderOf(s, s.playerClanId)?.id).toBe(a.id);
    expect(appointCommander(s, s.playerClanId, b.id)).toBe(true);
    expect(commanderOf(s, s.playerClanId)?.id).toBe(b.id);
    expect(feelingsSum(s, a, ruler(s))).toBe(-10);
    b.traits.push('ambitious');
    dismissCommander(s, s.playerClanId);
    expect(commanderOf(s, s.playerClanId)).toBeUndefined();
    expect(feelingsSum(s, b, ruler(s))).toBe(-20);
  });

  it('AI houses put their best kin in command, the lord included', () => {
    const s = world();
    commandersTick(s);
    for (const k of Object.values(s.clans)) {
      if (k.isPlayer || !clanRegions(s, k.id).length || !eligibleCommanders(s, k.id).length) continue;
      const c = commanderOf(s, k.id);
      expect(c, k.name).toBeTruthy();
      expect(c!.clanId).toBe(k.id);
    }
  });
});

describe('the integration API (WAVE-3-CONTRACT.md)', () => {
  it('commanderFor gives the ruler when you lead in person, otherwise your commander, and never changes anything', () => {
    const s = world();
    const son = kid(s, 22);
    appointCommander(s, s.playerClanId, son.id);
    const before = JSON.stringify(s);
    expect(commanderFor(s, s.playerClanId)?.id).toBe(son.id);
    expect(commanderFor(s, s.playerClanId, true)?.id).toBe(s.rulerId);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('consequences land on whoever was snapshotted, even if the post changed hands since', () => {
    const s = world();
    const k = foe(s);
    const first = kid(s, 22);
    appointCommander(s, s.playerClanId, first.id);
    const snapshot = commanderOf(s, s.playerClanId)!.id;
    appointCommander(s, s.playerClanId, kid(s, 25).id);
    s.seed = 5;
    onCommandedBattle(s, { id: 'b1', attacker: s.playerClanId, defender: k.id, attackerCommanderId: snapshot, attackerWon: true });
    expect(first.reputation?.deeds.personalBattles).toBe(1);
  });

  it('heavy losses put a commander in more danger than a clean victory', () => {
    let hurtHeavy = 0;
    let hurtLight = 0;
    for (let seed = 1; seed <= 400; seed++) {
      for (const [losses, tally] of [
        [40, 'heavy'],
        [2, 'light'],
      ] as const) {
        const s = world();
        const k = foe(s);
        const c = kid(s, 24);
        s.seed = seed;
        const fates = commandedBattleFates(s, {
          id: 'x',
          attacker: s.playerClanId,
          defender: k.id,
          attackerCommanderId: c.id,
          attackerWon: false,
          attackerShips: 100,
          attackerLosses: losses,
        });
        if (fates.length && tally === 'heavy') hurtHeavy++;
        else if (fates.length) hurtLight++;
      }
    }
    expect(hurtHeavy).toBeGreaterThan(hurtLight);
  });

  it('fleet numbers are only read, never changed', () => {
    const s = world();
    const k = foe(s);
    const [mine, theirs] = [s.fleet, k.fleet];
    onCommandedBattle(s, {
      id: 'b2',
      attacker: s.playerClanId,
      defender: k.id,
      attackerCommanderId: kid(s, 24).id,
      attackerWon: false,
      attackerShips: 100,
      attackerLosses: 30,
    });
    expect([s.fleet, k.fleet]).toEqual([mine, theirs]);
  });
});

describe('what battles do to commanders', () => {
  it('builds a record of battles led, win or lose', () => {
    const s = world();
    const k = foe(s);
    const general = kid(s, 24);
    appointCommander(s, s.playerClanId, general.id);
    for (let i = 0; i < 5; i++) {
      s.seed = 1000 + i;
      if (!commanderOf(s, s.playerClanId)) break;
      commanderAfterBattle(s, s.playerClanId, i % 2 === 0, k.id);
    }
    const r = battleRecord(general);
    expect(r.won + r.lost).toBeGreaterThan(0);
    expect(general.reputation?.deeds.personalBattles).toBeGreaterThan(0);
  });

  it('wounds, capture in defeat, and death, each with consequences', () => {
    const seen = { wounded: false, captured: false, died: false };
    for (let seed = 1; seed < 600 && !(seen.wounded && seen.captured && seen.died); seed++) {
      const s = world();
      const k = foe(s);
      commandersTick(s);
      const enemyGeneral = commanderOf(s, k.id)!;
      const general = kid(s, 24);
      const grandson = createCharacter(s, { gender: 'M', born: s.year - 3, clanId: s.playerClanId, planetId: 'mars', fatherId: general.id });
      general.childrenIds.push(grandson.id);
      appointCommander(s, s.playerClanId, general.id);
      s.seed = seed;
      const fate = commanderAfterBattle(s, s.playerClanId, false, k.id);
      if (fate?.wounded) {
        seen.wounded = true;
        expect(general.traits).toContain('wounded');
        expect(general.reputation?.deeds.battleWounds).toBe(1);
      }
      if (fate?.captured) {
        seen.captured = true;
        expect(general.prisonerOf).toBe(k.id);
        expect(commanderOf(s, s.playerClanId)).toBeUndefined();
        expect(heldKin(s)?.id).toBe(general.id);
      }
      if (fate?.died) {
        seen.died = true;
        expect(alive(general)).toBe(false);
        expect(commanderOf(s, s.playerClanId)).toBeUndefined();
        expect(feelingsSum(s, grandson, enemyGeneral)).toBe(-40);
        expect(getFlag(s, 'fallen_commander')?.data.id).toBe(general.id);
      }
    }
    expect(seen).toEqual({ wounded: true, captured: true, died: true });
  });

  it('an enemy commander you capture ends up in your cells', () => {
    let done = false;
    for (let seed = 1; seed < 400 && !done; seed++) {
      const s = world();
      const k = foe(s);
      commandersTick(s);
      const theirs = commanderOf(s, k.id)!;
      s.seed = seed;
      if (commanderAfterBattle(s, k.id, false, s.playerClanId)?.captured) {
        done = true;
        expect(prisoners(s).map((c) => c.id)).toContain(theirs.id);
      }
    }
    expect(done).toBe(true);
  });

  it('a lord leading their own fleet is not counted twice for the battle', () => {
    const s = world();
    const k = foe(s);
    const lord = s.characters[k.headId];
    lord.prisonerOf = undefined;
    lord.born = Math.min(lord.born, s.year - 40);
    appointCommander(s, k.id, lord.id);
    const before = battleRecord(lord).won;
    s.seed = 77;
    commanderAfterBattle(s, k.id, true, s.playerClanId);
    expect(battleRecord(lord).won).toBe(before);
  });

  it('an old save with nobody in command plays exactly as before', () => {
    const s = world();
    const w = war(s, foe(s));
    expect(commanderOf(s, s.playerClanId)).toBeUndefined();
    expect(leadFactor(s, s.playerClanId)).toBe(1);
    expect(playerSide(s, w, false).strength).toBeGreaterThan(0);
  });
});
