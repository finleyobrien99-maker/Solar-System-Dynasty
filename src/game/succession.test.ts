import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { alive, ch, ruler } from './core';
import { abdicate, killCharacter } from './life';
import { recordMurder, learnSecret, hooksOf } from './secrets';
import {
  beginSuccessionCrisis,
  crisisBlocker,
  hearingChance,
  rebelFleet,
  resolveCrisis,
  settlementCost,
  successionClaimants,
  successionCrisis,
  successionTick,
} from './succession';
import { ambitionChoices, chooseAmbition } from './ambitions';
import { exportSave, importSave, MIGRATIONS } from './save';
import { disputedInheritance } from './testScenarios';
import type { GameState } from './types';

function totalShips(s: GameState): number {
  return (
    s.fleet +
    Object.values(s.clans)
      .filter((k) => k.id !== s.playerClanId)
      .reduce((n, k) => n + k.fleet, 0) +
    s.successionCrises.reduce((n, c) => n + rebelFleet(c), 0)
  );
}

describe('contested inheritance', () => {
  it('starts from a real death, an adult heir and a resentful legitimate relative', () => {
    const { s, old, heir, claimant, crisis } = disputedInheritance();
    expect(alive(old)).toBe(false);
    expect(s.rulerId).toBe(heir.id);
    expect(crisis.claimantId).toBe(claimant.id);
    expect(crisis.reasons.join(' ')).toMatch(/neglected/);
    expect(successionClaimants(s, old.id, heir.id)[0].risk).toBeLessThanOrEqual(0.35);
  });
  it('never invents a claimant from a surname, a minor or voluntary retirement', () => {
    const { s, old, heir, claimant } = disputedInheritance();
    s.successionCrises = [];
    old.died = undefined;
    s.rulerId = old.id;
    s.clans[old.clanId].headId = old.id;
    old.childrenIds = [heir.id];
    claimant.motherId = undefined;
    expect(beginSuccessionCrisis(s, old.id, heir.id)).toBe(false);
    old.died = s.year;
    expect(beginSuccessionCrisis(s, old.id, heir.id)).toBe(false);
    old.died = undefined;
    s.dynasty.rulers = s.dynasty.rulers.filter((r) => r.id !== heir.id);
    const oldReign = s.dynasty.rulers.find((r) => r.id === old.id)!;
    oldReign.to = undefined;
    oldReign.end = undefined;
    old.childrenIds.push(claimant.id);
    claimant.motherId = old.id;
    heir.born = s.year - 15;
    expect(successionClaimants(s, old.id, heir.id)).toEqual([]);
    heir.born = s.year - 28;
    s.pending = [];
    expect(abdicate(s)).toBe(true);
    expect(s.successionCrises).toEqual([]);
    expect(s.dynasty.rulers.find((r) => r.id === old.id)?.end).toBe('abdication');
  });
  it('queries are pure and stale decisions spend neither cash, hooks nor dice', () => {
    const { s, claimant, crisis } = disputedInheritance();
    const before = JSON.stringify(s);
    successionClaimants(s, crisis.predecessorId, crisis.incumbentId);
    hearingChance(s, crisis);
    settlementCost(s, crisis);
    crisisBlocker(s, crisis.id, 'settle');
    expect(JSON.stringify(s)).toBe(before);
    claimant.prisonerOf = s.playerClanId;
    const stale = JSON.stringify(s);
    for (const action of ['settle', 'hearing', 'hook', 'concede', 'fight'] as const) expect(resolveCrisis(s, crisis.id, action)).toBe(false);
    expect(JSON.stringify(s)).toBe(stale);
  });
  it('an affordable settlement pays exactly once and closes the claim', () => {
    const { s, crisis } = disputedInheritance();
    const cost = settlementCost(s, crisis);
    s.credits = cost - 1;
    expect(resolveCrisis(s, crisis.id, 'settle')).toBe(false);
    expect(s.credits).toBe(cost - 1);
    s.credits = cost + 20;
    expect(resolveCrisis(s, crisis.id, 'settle')).toBe(true);
    expect(s.credits).toBe(20);
    expect(resolveCrisis(s, crisis.id, 'settle')).toBe(false);
    expect(s.credits).toBe(20);
  });
  it('only the incumbent personal hook can compel withdrawal, and consumes it', () => {
    const { s, old, heir, claimant, crisis } = disputedInheritance();
    const victim = createCharacter(s, { clanId: s.playerClanId, planetId: 'mars', born: s.year - 22 });
    const evidence = recordMurder(s, claimant, victim);
    // The late ruler held this leverage before death; it does not pass with the crown.
    old.died = undefined;
    learnSecret(s, evidence.id, old.id);
    old.died = s.year;
    expect(s.hooks.some((h) => h.holderId === old.id && h.targetId === claimant.id)).toBe(true);
    expect(resolveCrisis(s, crisis.id, 'hook')).toBe(false);
    learnSecret(s, evidence.id, heir.id);
    const hook = hooksOf(s, heir.id).find((h) => h.targetId === claimant.id)!;
    expect(resolveCrisis(s, crisis.id, 'hook')).toBe(true);
    expect(hook.usedYear).toBe(s.year);
    expect(hooksOf(s, heir.id)).not.toContainEqual(hook);
    expect(evidence.knownTo).toContain(heir.id);
  });
  it('a hearing is attempted at most once, and council loyalty changes its odds', () => {
    const { s, crisis, claimant } = disputedInheritance();
    const voter = createCharacter(s, { clanId: s.playerClanId, planetId: 'mars', born: s.year - 25 });
    crisis.votes = [{ id: voter.id, side: 'incumbent', reason: 'Loyal' }];
    const loyal = hearingChance(s, crisis);
    crisis.votes[0].side = 'claimant';
    expect(hearingChance(s, crisis)).toBeLessThan(loyal);
    s.characters[crisis.incumbentId].base.dip = 0;
    claimant.base.dip = 100;
    // Find a failing roll without mocking the engine RNG.
    const copy = structuredClone(s);
    for (let seed = 1; seed < 100; seed++) {
      Object.assign(s, structuredClone(copy));
      s.seed = seed;
      resolveCrisis(s, crisis.id, 'hearing');
      if (successionCrisis(s)) break;
    }
    s.pending = [];
    expect(successionCrisis(s)?.heard).toBe(true);
    const before = JSON.stringify(s);
    expect(resolveCrisis(s, crisis.id, 'hearing')).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('civil war detaches actual ships and refunds only survivors, even if cancelled', () => {
    const { s, crisis, claimant, backer } = disputedInheritance();
    const total = totalShips(s),
      original = backer.fleet;
    s.year = crisis.deadline;
    successionTick(s);
    expect(crisis.stage).toBe('civil-war');
    expect(rebelFleet(crisis)).toBeGreaterThan(0);
    expect(s.fleet).toBe(210);
    expect(backer.fleet).toBeLessThan(original);
    expect(totalShips(s)).toBe(total);
    s.pending = [];
    expect(resolveCrisis(s, crisis.id, 'fight')).toBe(true);
    const afterBattle = totalShips(s);
    expect(afterBattle).toBeLessThan(total);
    expect(resolveCrisis(s, crisis.id, 'fight')).toBe(false);
    claimant.prisonerOf = backer.id;
    successionTick(s);
    expect(successionCrisis(s)).toBeUndefined();
    expect(totalShips(s)).toBe(afterBattle);
  });
  it('a victorious ruler imprisons the claimant without creating ships', () => {
    const { s, crisis, heir, claimant } = disputedInheritance();
    s.year = crisis.deadline;
    successionTick(s);
    s.pending = [];
    s.fleet = 10000;
    const total = totalShips(s);
    resolveCrisis(s, crisis.id, 'fight');
    s.year++;
    s.pending = [];
    successionTick(s);
    expect(s.rulerId).toBe(heir.id);
    expect(claimant.prisonerOf).toBe(s.playerClanId);
    expect(successionCrisis(s)).toBeUndefined();
    expect(totalShips(s)).toBeLessThan(total);
  });
  it('losing or conceding continues as the actual claimant and closes the old vow', () => {
    const { s, crisis, heir, claimant } = disputedInheritance();
    chooseAmbition(s, ambitionChoices(s)[0]);
    s.prestige = 500;
    s.council.envoy = claimant.id;
    s.dynasty.designatedHeir = claimant.id;
    expect(resolveCrisis(s, crisis.id, 'concede')).toBe(true);
    expect(s.rulerId).toBe(claimant.id);
    expect(s.clans[s.playerClanId].headId).toBe(claimant.id);
    expect(alive(heir)).toBe(true);
    expect(s.gameOver).toBeUndefined();
    expect(s.prestige).toBe(400);
    expect(heir.ambition?.status).toBe('failed');
    expect(claimant.ambition).toBeUndefined();
    expect(s.council.envoy).toBeUndefined();
    expect(s.dynasty.designatedHeir).toBeUndefined();
    expect(s.dynasty.rulers.find((r) => r.id === heir.id)?.end).toBe('deposed');
  });
  it('a stronger rebel fleet can depose the ruler in real battles', () => {
    const { s, crisis, backer, claimant } = disputedInheritance();
    s.fleet = 10;
    backer.fleet = 10000;
    s.year = crisis.deadline;
    successionTick(s);
    s.pending = [];
    resolveCrisis(s, crisis.id, 'fight');
    s.year++;
    s.pending = [];
    successionTick(s);
    expect(s.rulerId).toBe(claimant.id);
    expect(s.gameOver).toBeUndefined();
    expect(successionCrisis(s)).toBeUndefined();
  });
  it('AI houses pay their own settlement and never borrow the player or VIP treasury', () => {
    const { s, house, crisis, old } = disputedInheritance(true);
    s.vip = { on: true };
    s.credits = 12345;
    house.credits = settlementCost(s, crisis) + 5;
    expect(resolveCrisis(s, crisis.id, 'settle')).toBe(true);
    expect(house.credits).toBe(5);
    expect(s.credits).toBe(12345);
    expect(ch(s, house.headId)?.id).not.toBe(old.id);
  });
  it('an imprisoned heir inherits the crown without magically escaping a foreign captor', () => {
    const { s, heir, claimant, backer } = disputedInheritance();
    claimant.prisonerOf = backer.id;
    s.dynasty.law = 'designated';
    s.dynasty.designatedHeir = claimant.id;
    killCharacter(s, heir.id, 'old age');
    expect(s.rulerId).toBe(claimant.id);
    expect(claimant.prisonerOf).toBe(backer.id);
    expect(successionCrisis(s)).toBeUndefined();
    expect(s.gameOver).toBeUndefined();
  });
  it('VIP fleets, stats and councillors never affect a foreign succession battle', () => {
    const { s, house, crisis } = disputedInheritance(true);
    house.credits = 0;
    crisis.heard = true;
    const vip = structuredClone(s);
    vip.vip = { on: true };
    vip.fleet = 1000000;
    vip.credits = 1000000;
    vip.characters[vip.rulerId].base.cmd = 1000;
    vip.council.admiral = vip.rulerId;
    const deadline = crisis.deadline;
    for (const state of [s, vip]) {
      state.year = deadline;
      successionTick(state);
      resolveCrisis(state, crisis.id, 'fight');
    }
    expect(vip.clans[house.id]).toEqual(s.clans[house.id]);
    expect(vip.successionCrises).toEqual(s.successionCrises);
    expect(s.clans[house.id].fleet).toBeLessThan(300);
  });
  it('saving during a civil war preserves budgets and future seeded outcomes', () => {
    const { s, crisis } = disputedInheritance();
    s.year = crisis.deadline;
    successionTick(s);
    s.pending = [];
    const restored = importSave(exportSave(s));
    expect(restored).toEqual(JSON.parse(JSON.stringify(s)));
    for (const state of [s, restored]) {
      resolveCrisis(state, crisis.id, 'fight');
      state.pending = [];
      state.year++;
      successionTick(state);
    }
    expect(restored).toEqual(JSON.parse(JSON.stringify(s)));
    MIGRATIONS[6](restored);
    expect(restored.successionCrises).toEqual(s.successionCrises);
    expect(alive(ruler(restored))).toBe(true);
  });
});
