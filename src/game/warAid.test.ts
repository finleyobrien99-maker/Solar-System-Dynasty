import { describe, expect, it } from 'vitest';
import { appointCommander } from './commanders';
import {
  coalitionBattleNotes,
  coalitionCall,
  coalitionLosses,
  coalitionStrength,
  coalitionTruces,
  committedShips as coalitionCommitted,
  recallCoalition,
  releaseCoalition,
  snapshotCoalition,
} from './coalitions';
import { alive, ch, ruler } from './core';
import { createCharacter } from './character';
import { truceOf, warWeariness } from './peace';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';
import {
  aidBattleNotes,
  aidLosses,
  aidStrength,
  aidTruces,
  committedShips,
  homeFleet,
  recallAid,
  releaseAid,
  reserveAid,
  snapshotAid,
  warAid,
  warContributions,
} from './warAid';
import type { FleetContribution, GameState } from './types';

function fixture() {
  const s = createWorld(97),
    home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(97, 'mars', 'F', 'Asha'), focus: 'dip', age: 40, family: 'married' });
  const houses = Object.values(s.clans).filter((c) => !c.isPlayer && alive(ch(s, c.headId)));
  const [attacker, defender, helper] = houses;
  const head = s.characters[helper.headId];
  head.born = s.year - 40;
  head.prisonerOf = undefined;
  head.traits = head.traits.filter((id) => id !== 'craven');
  helper.fleet = 200;
  s.fleet = 300;
  return { s, attacker, defender, helper, head };
}
function attach(s: GameState, attacker: string, defender: string, coalition: FleetContribution[], realmAid: FleetContribution[] = []) {
  // Structural future support without changing the current saved War or AiWar interfaces.
  const war = { id: 'aid-war', attacker, defender, target: '', started: s.year, progress: 0, coalition, realmAid };
  s.aiWars.push(war);
  return war;
}

describe('common war aid ledger', () => {
  it('collects actual reservation references from both pools and both war types without dropping a repeated house', () => {
    const { s, attacker, defender, helper } = fixture();
    const coalition = reserveAid(s, helper.id, 40)!,
      realm = reserveAid(s, helper.id, 30)!;
    const war = attach(s, attacker.id, defender.id, [coalition], [realm]);
    const player = reserveAid(s, s.playerClanId, 50)!;
    s.wars.push({ id: 'p-war', enemy: attacker.id, playerAttacker: false, target: '', cb: 'conquest', score: 0, started: s.year, coalition: [player] });
    const before = structuredClone(s),
      seed = s.seed;
    const list = warContributions(war);
    expect(list).toHaveLength(2);
    expect(list[0]).toBe(coalition);
    expect(list[1]).toBe(realm);
    expect(warAid(s)).toHaveLength(3);
    expect(committedShips(s, helper.id)).toBe(70);
    expect(coalitionCommitted(s, helper.id)).toBe(70);
    expect(committedShips(s, s.playerClanId)).toBe(50);
    expect(warContributions({})).toEqual([]);
    expect(s).toEqual(before);
    expect(s.seed).toBe(seed);
  });
  it('reserves an exact real count and leaves invalid attempts entirely inert', () => {
    const { s, helper } = fixture();
    const before = structuredClone(s);
    for (const n of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 201]) expect(reserveAid(s, helper.id, n)).toBeUndefined();
    expect(reserveAid(s, 'missing-house', 10)).toBeUndefined();
    expect(s).toEqual(before);
    const p = reserveAid(s, helper.id, 75)!;
    expect(p).toMatchObject({ clanId: helper.id, ships: 75, sent: 75 });
    expect(homeFleet(s, helper.id)).toBe(125);
    expect(homeFleet(s, s.playerClanId)).toBe(300);
    releaseAid(s, [p]);
    releaseAid(s, [p]);
    expect(helper.fleet).toBe(200);
    expect(p.sent).toBe(75);
  });
  it('excludes a just-reserved realm helper before either aid pool is attached to its war', () => {
    const { s, attacker, defender, helper } = fixture();
    for (const c of Object.values(s.characters)) c.spouseId = undefined;
    helper.liege = 'none';
    s.houseThreat[attacker.id] = 75;
    s.coalitions.push({ target: attacker.id, formed: s.year, members: [helper.id] });
    const realmLoan = reserveAid(s, helper.id, 50)!;
    const before = structuredClone(s);
    expect(coalitionCall(s, attacker.id, defender.id, new Set([realmLoan.clanId]))).toEqual([]);
    expect(s).toEqual(before);
    expect(helper.fleet + realmLoan.ships).toBe(200);
  });
  it('preserves coalition-only recall while direct-attack recall returns every aid pool', () => {
    const { s, attacker, defender, helper } = fixture();
    const co = reserveAid(s, helper.id, 40)!,
      realm = reserveAid(s, helper.id, 30)!;
    attach(s, attacker.id, defender.id, [co], [realm]);
    recallCoalition(s, helper.id);
    expect(helper.fleet).toBe(170);
    expect(co.ships).toBe(0);
    expect(realm.ships).toBe(30);
    expect(committedShips(s, helper.id)).toBe(30);
    recallAid(s, helper.id);
    recallAid(s, helper.id);
    expect(helper.fleet).toBe(200);
    expect(committedShips(s, helper.id)).toBe(0);
  });
  it('charges every distinct reservation and one fatigue calculation for the house total', () => {
    const { s, helper } = fixture();
    const list = [reserveAid(s, helper.id, 40)!, reserveAid(s, helper.id, 30)!];
    const casualties = aidLosses(s, list, 0.2);
    expect(casualties).toEqual([{ clanId: helper.id, ships: 70, losses: 14 }]);
    expect(list.map((p) => p.ships)).toEqual([32, 24]);
    expect(warWeariness(s, helper.id)).toBe(7);
    expect(helper.fleet).toBe(130);
    releaseAid(s, list);
    expect(helper.fleet).toBe(186);
    const after = structuredClone(s);
    releaseAid(s, list);
    expect(s).toEqual(after);
  });
  it('keeps existing coalition loss, strength, peace and return wrappers equivalent', () => {
    const { s, attacker, helper } = fixture();
    expect(appointCommander(s, helper.id, helper.headId)).toBe(true);
    const co = reserveAid(s, helper.id, 50)!,
      twin = structuredClone(s),
      twinLoan = structuredClone(co);
    expect(coalitionStrength(s, [co])).toBe(aidStrength(twin, [twinLoan]));
    expect(coalitionLosses(s, [co], 0.2)).toEqual(aidLosses(twin, [twinLoan], 0.2));
    coalitionTruces(s, attacker.id, [co]);
    aidTruces(twin, attacker.id, [twinLoan]);
    expect(s).toEqual(twin);
    releaseCoalition(s, [co]);
    releaseAid(twin, [twinLoan]);
    expect(s).toEqual(twin);
  });
  it('includes wiped-out participants in real peace, but never invents aid or peace for zero invitations', () => {
    const { s, attacker, defender, helper } = fixture();
    const p = reserveAid(s, helper.id, 50)!;
    aidLosses(s, [p], 1);
    aidTruces(s, attacker.id, [p, { clanId: defender.id, ships: 0, sent: 0 }]);
    expect(truceOf(s, attacker.id, helper.id)).toBeTruthy();
    expect(truceOf(s, attacker.id, defender.id)).toBeUndefined();
    releaseAid(s, [p]);
    expect(helper.fleet).toBe(150);
  });
  it('does not use primary-house fatigue or VIP bonuses for a helper', () => {
    const { s, attacker, helper } = fixture();
    expect(appointCommander(s, helper.id, helper.headId)).toBe(true);
    const list = [reserveAid(s, helper.id, 50)!],
      fresh = aidStrength(s, list);
    s.warWeariness[attacker.id] = 100;
    s.vip = { on: true, immortal: true };
    expect(aidStrength(s, list)).toBe(fresh);
    s.warWeariness[helper.id] = 100;
    expect(aidStrength(s, list)).toBeCloseTo(fresh * 0.75);
  });
  it('conserves every real pool through seeded losses, independent coalition withdrawal and repeat cleanup', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { s, attacker, defender, helper } = fixture();
      helper.fleet = 200 + seed;
      const initial = helper.fleet,
        co = reserveAid(s, helper.id, 40 + seed)!,
        realm = reserveAid(s, helper.id, 30 + seed)!;
      const war = attach(s, attacker.id, defender.id, [co], [realm]);
      let losses = 0;
      for (let battle = 0; battle < 3; battle++) {
        losses += aidLosses(s, warContributions(war), ((seed * 7 + battle * 3) % 31) / 100).reduce((n, row) => n + row.losses, 0);
        expect(helper.fleet + committedShips(s, helper.id)).toBe(initial - losses);
      }
      recallCoalition(s, helper.id);
      expect(helper.fleet + realm.ships).toBe(initial - losses);
      recallAid(s, helper.id);
      releaseAid(s, warContributions(war));
      expect(helper.fleet).toBe(initial - losses);
      expect(committedShips(s, helper.id)).toBe(0);
      expect(s.fleet).toBe(300);
    }
  });
});

describe('ephemeral pre-battle aid snapshots', () => {
  it('reads current original rulers and commanders without changing saved state or seed', () => {
    const { s, helper, head } = fixture();
    expect(appointCommander(s, helper.id, head.id)).toBe(true);
    const loan = reserveAid(s, helper.id, 50)!;
    loan.commanderId = 'historical-saved-id';
    const before = structuredClone(s);
    const snapshot = snapshotAid(s, [loan]);
    expect(snapshot[0]).toMatchObject({ clanId: helper.id, rulerId: head.id, commanderId: head.id, ships: 50 });
    expect(snapshot[0].contribution).toBe(loan);
    expect(s).toEqual(before);
    expect(loan.commanderId).toBe('historical-saved-id');
    loan.ships = 30;
    expect(snapshot[0].ships).toBe(50);
  });
  it('credits an original living ruler exactly once after the crown changes before helper consequences', () => {
    const { s, attacker, helper, head } = fixture();
    expect(appointCommander(s, helper.id, head.id)).toBe(true);
    const list = [reserveAid(s, helper.id, 50)!],
      snapshot = snapshotAid(s, list);
    const successor = createCharacter(s, { clanId: helper.id, planetId: helper.planetId, born: s.year - 22 });
    helper.headId = successor.id;
    const before = head.reputation?.deeds.battlesWon ?? 0;
    aidBattleNotes(s, snapshot, attacker.id, false, aidLosses(s, list, 0.1), 0);
    expect(head.reputation!.deeds.battlesWon).toBe(before + 1);
    expect(successor.reputation?.deeds.battlesWon ?? 0).toBe(0);
  });
  it('credits an original fallen ruler and does not hand the successor a free battle', () => {
    const { s, attacker, helper, head } = fixture();
    const list = [reserveAid(s, helper.id, 50)!],
      snapshot = snapshotAid(s, list);
    const successor = createCharacter(s, { clanId: helper.id, planetId: helper.planetId, born: s.year - 22 });
    head.died = s.year;
    helper.headId = successor.id;
    aidBattleNotes(s, snapshot, attacker.id, true, aidLosses(s, list, 0.2), 0);
    expect(head.reputation!.deeds.battlesLost).toBe(1);
    expect(successor.reputation?.deeds.battlesLost ?? 0).toBe(0);
  });
  it('legacy coalition snapshot callers retain saved commander IDs and original helper deeds', () => {
    const { s, attacker, helper, head } = fixture();
    expect(appointCommander(s, helper.id, head.id)).toBe(true);
    const list = [reserveAid(s, helper.id, 50)!];
    const before = head.reputation?.deeds.battlesWon ?? 0;
    const snapshot = snapshotCoalition(s, list);
    expect(list[0].commanderId).toBe(head.id);
    expect(snapshot[0].rulerId).toBe(head.id);
    const successor = createCharacter(s, { clanId: helper.id, planetId: helper.planetId, born: s.year - 22 });
    helper.headId = successor.id;
    coalitionBattleNotes(s, list, attacker.id, false, coalitionLosses(s, list, 0.1), 0);
    expect(head.reputation!.deeds.battlesWon).toBe(before + 1);
    expect(successor.reputation?.deeds.battlesWon ?? 0).toBe(0);
  });
  it('keeps the player ruler snapshot when an AI war is fought during a player inheritance', () => {
    const { s, attacker } = fixture();
    const old = ruler(s),
      list = [reserveAid(s, s.playerClanId, 50)!],
      snapshot = snapshotAid(s, list);
    const successor = createCharacter(s, { clanId: s.playerClanId, planetId: old.planetId, born: s.year - 22 });
    s.rulerId = successor.id;
    s.clans[s.playerClanId].headId = successor.id;
    aidBattleNotes(s, snapshot, attacker.id, true, aidLosses(s, list, 0.2), 0);
    expect(old.reputation!.deeds.battlesLost).toBe(1);
    expect(successor.reputation?.deeds.battlesLost ?? 0).toBe(0);
  });
});

describe('recorded loan history', () => {
  it('distinguishes casualties from returned survivors and leaves legacy totals unknown', () => {
    const { s, helper } = fixture(),
      p = reserveAid(s, helper.id, 50)!;
    aidLosses(s, [p], 0.2);
    releaseAid(s, [p]);
    releaseAid(s, [p]);
    expect(p).toMatchObject({ ships: 0, sent: 50, lost: 10, returned: 40 });
    const old = { clanId: helper.id, sent: 80, ships: 20 };
    aidLosses(s, [old], 0.1);
    releaseAid(s, [old]);
    expect(old).not.toHaveProperty('lost');
    expect(old).not.toHaveProperty('returned');
  });
});

it('does not reroll or credit a leader already processed on the primary side', () => {
  const { s, attacker, helper, head } = fixture();
  appointCommander(s, helper.id, head.id);
  const list = [reserveAid(s, helper.id, 50)!],
    snapshot = snapshotAid(s, list),
    losses = aidLosses(s, list, 0.1);
  const before = structuredClone(s);
  expect(aidBattleNotes(s, snapshot, attacker.id, false, losses, 1, { commanderIds: new Set([head.id]), rulerIds: new Set([head.id]) })).toEqual([]);
  expect(s).toEqual(before);
});
