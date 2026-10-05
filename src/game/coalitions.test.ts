import { createCharacter } from './character';
import { describe, expect, it } from 'vitest';
import { appointCommander } from './commanders';
import { alive, ch, clanRegions, setOwner } from './core';
import { makeTruce, truceOf, warWeariness } from './peace';
import { importSave, exportSave, migrate, MIGRATIONS } from './save';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';
import type { FleetContribution, GameState } from './types';
import {
  coalitionCall,
  coalitionLosses,
  coalitionOf,
  coalitionPledgeBlocker,
  coalitionsTick,
  coalitionStrength,
  coalitionTruces,
  committedShips,
  joinCoalition,
  leaveCoalition,
  recallCoalition,
  recordExpansion,
  releaseCoalition,
  threatOf,
  COALITION_LIMIT,
} from './coalitions';

function fixture() {
  const s = createWorld(97),
    home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(97, 'mars', 'F', 'Asha'), focus: 'dip', age: 40, family: 'married' });
  s.pending = [];
  s.fleet = 300;
  for (const c of Object.values(s.characters)) c.spouseId = undefined;
  for (const c of Object.values(s.clans)) {
    c.allied = false;
    c.liege = 'none';
    c.fleet = 100;
    const h = ch(s, c.headId);
    if (alive(h)) {
      h.born = s.year - 40;
      h.prisonerOf = undefined;
    }
  }
  const ai = Object.values(s.clans).filter((c) => !c.isPlayer && alive(ch(s, c.headId)) && clanRegions(s, c.id).length);
  return { s, attacker: ai[0], defender: ai[1], helper: ai[2], other: ai[3] };
}
function pledge(s: GameState, target: string, ids: string[]) {
  s.houseThreat[target] = 75;
  s.coalitions.push({ target, members: ids, formed: s.year });
}
function storeLoan(s: GameState, attacker: string, defender: string, list: FleetContribution[]) {
  s.aiWars.push({ id: 'loan-war', attacker, defender, target: clanRegions(s, defender)[0].id, progress: 0, started: s.year, coalition: list });
}

describe('threat and defensive leagues', () => {
  it('counts actual territorial gains for either house, never peaceful transfers, and caps fear', () => {
    const { s, attacker, defender } = fixture();
    const region = clanRegions(s, defender.id)[0];
    recordExpansion(s, attacker.id, region);
    expect(threatOf(s, attacker.id)).toBe(0);
    setOwner(s, region, attacker.id);
    recordExpansion(s, attacker.id, region, 'claim');
    expect(threatOf(s, attacker.id)).toBe(12 + (region.capital ? 20 : 0));
    const mine = clanRegions(s, s.playerClanId)[0];
    recordExpansion(s, s.playerClanId, mine, 'claim');
    expect(threatOf(s, s.playerClanId)).toBe(12 + (mine.capital ? 20 : 0));
    recordExpansion(s, attacker.id, region, 'independence');
    expect(threatOf(s, attacker.id)).toBe(12 + (region.capital ? 20 : 0));
    for (let i = 0; i < 10; i++) recordExpansion(s, attacker.id, region);
    expect(threatOf(s, attacker.id)).toBe(100);
  });
  it('recovers only in cycles begun without an offensive campaign and stays with the house', () => {
    const { s, attacker, defender } = fixture();
    s.houseThreat[attacker.id] = 70;
    s.aiWars.push({ id: 'war', attacker: attacker.id, defender: defender.id, target: clanRegions(s, defender.id)[0].id, started: s.year, progress: 0 });
    coalitionsTick(s);
    expect(threatOf(s, attacker.id)).toBe(70);
    s.aiWars = [];
    coalitionsTick(s);
    expect(threatOf(s, attacker.id)).toBe(67);
    const replacement = createCharacter(s, { clanId: attacker.id, planetId: attacker.planetId, born: s.year - 30 });
    attacker.headId = replacement.id;
    expect(threatOf(s, attacker.id)).toBe(67);
  });
  it('queries and invalid player pledges are inert, including the random seed', () => {
    const { s, attacker } = fixture();
    const before = structuredClone(s);
    threatOf(s, attacker.id);
    coalitionOf(s, attacker.id);
    coalitionStrength(s, []);
    committedShips(s, attacker.id);
    expect(coalitionPledgeBlocker(s, attacker.id)).toMatch(/alarmed/);
    expect(joinCoalition(s, attacker.id)).toBe(false);
    expect(joinCoalition(s, s.playerClanId)).toBe(false);
    expect(leaveCoalition(s, attacker.id)).toBe(false);
    expect(s).toEqual(before);
  });
  it('forms deterministic bounded AI leagues, never volunteering the player', () => {
    const { s, attacker } = fixture();
    s.houseThreat[attacker.id] = 75;
    const twin = structuredClone(s),
      seed = s.seed;
    coalitionsTick(s);
    coalitionsTick(twin);
    expect(s).toEqual(twin);
    const c = coalitionOf(s, attacker.id)!;
    expect(c.members.length).toBeGreaterThan(0);
    expect(c.members.length).toBeLessThanOrEqual(COALITION_LIMIT);
    expect(c.members).not.toContain(s.playerClanId);
    expect(s.seed).toBe(seed);
  });
  it('starts local, spreads system-wide with fear and dissolves below fifteen', () => {
    const { s, attacker, helper } = fixture();
    const targetRegions = clanRegions(s, attacker.id);
    for (const r of [...targetRegions]) if (r.planetId !== 'mercury') setOwner(s, r, helper.id);
    const mercury = Object.values(s.regions).find((r) => r.planetId === 'mercury')!;
    setOwner(s, mercury, attacker.id);
    s.houseThreat[attacker.id] = 45;
    coalitionsTick(s);
    for (const id of coalitionOf(s, attacker.id)!.members) expect(clanRegions(s, id).some((r) => ['mercury', 'venus'].includes(r.planetId))).toBe(true);
    s.houseThreat[attacker.id] = 14;
    coalitionsTick(s);
    expect(coalitionOf(s, attacker.id)).toBeUndefined();
  });
  it('filters captivity, minority, landlessness, allegiance, alliance, truce and civil-war commitments', () => {
    for (const why of ['captive', 'minor', 'landless', 'subject', 'alliance', 'truce', 'war', 'civil-war'] as const) {
      const { s, attacker, helper, defender } = fixture();
      pledge(s, s.playerClanId, [helper.id]);
      if (why === 'captive') s.characters[helper.headId].prisonerOf = attacker.id;
      if (why === 'minor') s.characters[helper.headId].born = s.year - 10;
      if (why === 'landless') for (const r of [...clanRegions(s, helper.id)]) setOwner(s, r, defender.id);
      if (why === 'subject') {
        const cap = Object.values(s.regions).find((r) => r.capital && r.owner !== helper.id)!;
        setOwner(s, cap, s.playerClanId);
        // A sovereign cannot be a subject, so give away this helper's capitals first.
        for (const r of [...clanRegions(s, helper.id)].filter((r) => r.capital)) setOwner(s, r, defender.id);
        helper.liege = s.playerClanId;
      }
      if (why === 'alliance') helper.allied = true;
      if (why === 'truce') makeTruce(s, helper.id, s.playerClanId);
      if (why === 'war')
        s.aiWars.push({ id: 'busy', attacker: helper.id, defender: defender.id, target: clanRegions(s, defender.id)[0].id, started: s.year, progress: 0 });
      if (why === 'civil-war')
        s.successionCrises.push({
          id: 'c',
          clanId: helper.id,
          predecessorId: '',
          incumbentId: helper.headId,
          claimantId: '',
          started: s.year,
          deadline: s.year + 3,
          stage: 'civil-war',
          reasons: [],
          votes: [],
          backerIds: [],
          contributions: [],
          score: 0,
        });
      const before = structuredClone(s);
      expect(coalitionCall(s, s.playerClanId, attacker.id), why).toEqual([]);
      expect(s, why).toEqual(before);
    }
  });
  it('player joins explicitly, loans real ships, and withdrawal immediately returns survivors', () => {
    const { s, attacker, defender } = fixture();
    s.houseThreat[attacker.id] = 75;
    expect(joinCoalition(s, attacker.id)).toBe(true);
    expect(joinCoalition(s, attacker.id)).toBe(false);
    const list = coalitionCall(s, attacker.id, defender.id);
    expect(list).toEqual([{ clanId: s.playerClanId, ships: 150, sent: 150, commanderId: undefined }]);
    expect(s.fleet).toBe(150);
    storeLoan(s, attacker.id, defender.id, list);
    coalitionLosses(s, list, 0.2);
    expect(leaveCoalition(s, attacker.id)).toBe(true);
    expect(s.fleet).toBe(270);
    expect(committedShips(s, s.playerClanId)).toBe(0);
    const after = structuredClone(s);
    expect(leaveCoalition(s, attacker.id)).toBe(false);
    expect(s).toEqual(after);
  });
  it('does not borrow VIP strength, fleet, prestige or treasury for AI helpers', () => {
    const { s, attacker, defender, helper } = fixture();
    pledge(s, attacker.id, [helper.id]);
    const vip = structuredClone(s);
    vip.vip = { on: true, immortal: true };
    const plainLoan = coalitionCall(s, attacker.id, defender.id),
      vipLoan = coalitionCall(vip, attacker.id, defender.id);
    expect(vipLoan).toEqual(plainLoan);
    expect(coalitionStrength(vip, vipLoan)).toBe(coalitionStrength(s, plainLoan));
    expect(vip.clans[helper.id].fleet).toBe(s.clans[helper.id].fleet);
    expect(vip.credits).toBe(s.credits);
    expect(vip.prestige).toBe(s.prestige);
  });
});

describe('physical coalition fleet ledger', () => {
  it('reserves half a real fleet once, never duplicates members or primary houses and charges losses once', () => {
    const { s, attacker, defender, helper } = fixture();
    pledge(s, attacker.id, [attacker.id, defender.id, helper.id, helper.id]);
    const list = coalitionCall(s, attacker.id, defender.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ clanId: helper.id, sent: 50, ships: 50 });
    expect(helper.fleet).toBe(50);
    storeLoan(s, attacker.id, defender.id, list);
    expect(committedShips(s, helper.id)).toBe(50);
    expect(coalitionCall(s, attacker.id, defender.id)).toEqual([]);
    const casualties = coalitionLosses(s, list, 0.2);
    expect(casualties).toEqual([{ clanId: helper.id, ships: 50, losses: 10 }]);
    expect(helper.fleet).toBe(50);
    expect(list[0].ships).toBe(40);
    expect(warWeariness(s, helper.id)).toBe(7);
    releaseCoalition(s, list);
    expect(helper.fleet).toBe(90);
    const after = structuredClone(s);
    releaseCoalition(s, list);
    expect(s).toEqual(after);
  });
  it('strength explains the actual helper command and own fatigue rather than the primary house', () => {
    const { s, attacker, defender, helper } = fixture();
    pledge(s, attacker.id, [helper.id]);
    expect(appointCommander(s, helper.id, helper.headId)).toBe(true);
    const list = coalitionCall(s, attacker.id, defender.id);
    const fresh = coalitionStrength(s, list);
    s.warWeariness[attacker.id] = 100;
    s.warWeariness[defender.id] = 100;
    expect(coalitionStrength(s, list)).toBe(fresh);
    s.warWeariness[helper.id] = 100;
    expect(coalitionStrength(s, list)).toBeCloseTo(fresh * 0.75);
  });
  it('recall and current invalid eligibility return detached survivors to the correct house exactly once', () => {
    for (const why of ['recall', 'capture', 'truce', 'alliance', 'landless'] as const) {
      const { s, attacker, defender, helper } = fixture();
      pledge(s, attacker.id, [helper.id]);
      const list = coalitionCall(s, attacker.id, defender.id);
      storeLoan(s, attacker.id, defender.id, list);
      coalitionLosses(s, list, 0.2);
      if (why === 'recall') recallCoalition(s, helper.id);
      else {
        if (why === 'capture') s.characters[helper.headId].prisonerOf = attacker.id;
        if (why === 'truce') makeTruce(s, helper.id, attacker.id);
        if (why === 'landless') for (const r of [...clanRegions(s, helper.id)]) setOwner(s, r, defender.id);
        if (why === 'alliance') {
          // Alliance flags describe the player, so use a real marriage pact between these AI heads.
          s.characters[helper.headId].spouseId = attacker.headId;
          s.characters[attacker.headId].spouseId = helper.headId;
        }
        coalitionsTick(s);
      }
      expect(helper.fleet, why).toBe(90);
      expect(list[0].ships, why).toBe(0);
      releaseCoalition(s, list);
      expect(helper.fleet, why).toBe(90);
    }
  });
  it('actual peace protects even crews who were wiped out, but empty invitations create no treaties', () => {
    const { s, attacker, defender, helper, other } = fixture();
    pledge(s, attacker.id, [helper.id]);
    const list = coalitionCall(s, attacker.id, defender.id);
    coalitionLosses(s, list, 1);
    list.push({ clanId: other.id, ships: 0, sent: 0 });
    coalitionTruces(s, attacker.id, list);
    expect(truceOf(s, attacker.id, helper.id)).toBeTruthy();
    expect(truceOf(s, attacker.id, other.id)).toBeUndefined();
    releaseCoalition(s, list);
    expect(helper.fleet).toBe(50);
  });
  it('round-trips exact fear, pledges and detached survivors and keeps old saves free of invented fear', () => {
    const { s, attacker, defender, helper } = fixture();
    pledge(s, attacker.id, [helper.id]);
    const list = coalitionCall(s, attacker.id, defender.id);
    storeLoan(s, attacker.id, defender.id, list);
    coalitionLosses(s, list, 0.2);
    const loaded = importSave(exportSave(s));
    expect(loaded.houseThreat).toEqual(s.houseThreat);
    expect(loaded.coalitions).toEqual(s.coalitions);
    expect(loaded.aiWars).toEqual(s.aiWars);
    recallCoalition(loaded, helper.id);
    expect(loaded.clans[helper.id].fleet).toBe(90);
    const old = fixture().s;
    old.version = 7;
    delete (old as Partial<GameState>).houseThreat;
    delete (old as Partial<GameState>).coalitions;
    migrate(old);
    expect(old.houseThreat).toEqual({});
    expect(old.coalitions).toEqual([]);
    const before = structuredClone(old);
    MIGRATIONS[8](old);
    expect(old).toEqual(before);
  });
  it('preserves the physical ledger over 120 seeded casualty rates and repeated cleanup', () => {
    for (let seed = 0; seed < 120; seed++) {
      const { s, attacker, defender, helper, other } = fixture();
      helper.fleet = 20 + seed;
      other.fleet = 100 + seed;
      pledge(s, attacker.id, [helper.id, other.id]);
      const before = helper.fleet + other.fleet;
      const list = coalitionCall(s, attacker.id, defender.id);
      storeLoan(s, attacker.id, defender.id, list);
      let losses = 0;
      for (let battle = 0; battle < 4; battle++) {
        losses += coalitionLosses(s, list, ((seed * 7 + battle * 3) % 31) / 100).reduce((n, r) => n + r.losses, 0);
        expect(helper.fleet + other.fleet + committedShips(s, helper.id) + committedShips(s, other.id)).toBe(before - losses);
      }
      releaseCoalition(s, list);
      releaseCoalition(s, list);
      expect(helper.fleet + other.fleet).toBe(before - losses);
      expect(s.fleet).toBe(300);
      expect(committedShips(s, helper.id) + committedShips(s, other.id)).toBe(0);
    }
  });
});
