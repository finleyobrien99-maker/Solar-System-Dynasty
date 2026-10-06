import { describe, expect, it } from 'vitest';
import { creditLines, grossRegionIncome } from './economy';
import { disputedInheritance } from './testScenarios';
import { resolveCrisis, successionTick } from './succession';
import { aiTick, declareHouseWar } from './ai';
import { pactMap } from './aiCourt';
import { createCharacter } from './character';
import { alive, ch, clanRegions, ruler, setOwner } from './core';
import { killCharacter } from './life';
import { opinionLines } from './relations';
import { exportSave, importSave, migrate } from './save';
import { aiDeclareWar, declareIndependence, declareWar, endWar, fightBattle, independenceBlocker, tickPlayerWars, warBlocker } from './war';
import {
  battleWeariness,
  campaignsOf,
  warIncomeFactor,
  warStrengthFactor,
  warWeariness,
  aiMayBreakTruce,
  breakTruce,
  makeTruce,
  OATH_BREAK_COST,
  peaceTick,
  truceBreakBlocker,
  truceLeft,
  truceOf,
  TRUCE_CYCLES,
} from './peace';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';

function fixture() {
  const s = createWorld(97),
    home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(97, 'mars', 'F', 'Asha'), focus: 'dip', age: 40, family: 'married' });
  Object.assign(s, { credits: 2000, prestige: 1000, fleet: 300 });
  const houses = Object.values(s.clans).filter(
    (k) => !k.isPlayer && clanRegions(s, k.id).length && alive(ch(s, k.headId)) && s.year - ch(s, k.headId)!.born >= 16,
  );
  for (const k of houses) k.prestige = 1000;
  const pacts = pactMap(s);
  const enemy = houses.find((k) => !pacts.get(s.playerClanId)?.has(k.id))!;
  const other = houses.find((k) => k.id !== enemy.id && !pacts.get(enemy.id)?.has(k.id))!;
  const target = clanRegions(s, enemy.id)[0];
  s.claims.push(target.id);
  return { s, enemy, other, target };
}

describe('house peace oaths', () => {
  it('victory, defeat and white peace each make exactly one five-cycle bilateral truce', () => {
    for (const outcome of ['win', 'lose', 'white'] as const) {
      const { s, enemy, target } = fixture();
      expect(declareWar(s, target.id, 'claim')).toBe(true);
      const war = s.wars[0];
      endWar(s, war, outcome);
      expect(truceLeft(s, s.playerClanId, enemy.id)).toBe(TRUCE_CYCLES);
      expect(truceOf(s, enemy.id, s.playerClanId)).toEqual(truceOf(s, s.playerClanId, enemy.id));
      const principal = (t: { a: string; b: string }) => [t.a, t.b].includes(enemy.id) && [t.a, t.b].includes(s.playerClanId);
      expect(s.truces.filter(principal)).toHaveLength(1);
      // Realm defenders who actually sailed (realmDefence.ts) get their own truce with you; nobody else does.
      const sailed = new Set((war.realmAid ?? []).filter((p) => p.sent > 0).map((p) => p.clanId));
      expect(s.truces.filter((t) => !principal(t)).every((t) => sailed.has(t.a === s.playerClanId ? t.b : t.a))).toBe(true);
      const after = structuredClone(s);
      endWar(s, war, outcome);
      expect(s).toEqual(after);
    }
  });
  it('keeps a truce across inheritance, saved reload and a change of region owner', () => {
    const { s, enemy, target, other } = fixture();
    makeTruce(s, s.playerClanId, enemy.id);
    const old = ruler(s);
    const heir = createCharacter(s, { clanId: s.playerClanId, planetId: 'mars', born: s.year - 22, motherId: old.id, gender: 'F' });
    old.childrenIds.push(heir.id);
    killCharacter(s, old.id, 'old age');
    expect(s.rulerId).toBe(heir.id);
    setOwner(s, target, other.id);
    const restored = importSave(exportSave(s));
    expect(truceOf(restored, s.playerClanId, enemy.id)).toEqual(truceOf(s, s.playerClanId, enemy.id));
    const another = clanRegions(restored, enemy.id)[0];
    if (another) expect(warBlocker(restored, another)).toMatch(/truce/);
    s.year += TRUCE_CYCLES;
    peaceTick(s);
    expect(truceOf(s, s.playerClanId, enemy.id)).toBeUndefined();
    expect(s.truces).toEqual([]);
  });
  it('truce queries, ordinary attacks and stale invalid actions do not mutate state or RNG', () => {
    const { s, enemy, target } = fixture();
    makeTruce(s, s.playerClanId, enemy.id);
    const before = structuredClone(s);
    expect(warBlocker(s, target)).toMatch(/truce/);
    expect(truceLeft(s, s.playerClanId, enemy.id)).toBe(5);
    expect(aiMayBreakTruce(s, enemy.id, s.playerClanId)).toBeTypeOf('boolean');
    expect(declareWar(s, target.id, 'claim')).toBe(false);
    expect(declareWar(s, 'missing-region', 'claim', true)).toBe(false);
    expect(declareWar(s, target.id, 'feud', true)).toBe(false);
    expect(s).toEqual(before);
  });
  it('requires the full war and oath price before breaking, and honours pending regency/captivity/war limits', () => {
    const { s, enemy, target } = fixture();
    makeTruce(s, s.playerClanId, enemy.id);
    s.prestige = OATH_BREAK_COST + 119;
    const before = structuredClone(s);
    expect(declareWar(s, target.id, 'conquest', true)).toBe(false);
    expect(s).toEqual(before);
    ruler(s).prisonerOf = enemy.id;
    expect(declareWar(s, target.id, 'claim', true)).toBe(false);
    ruler(s).prisonerOf = undefined;
    ruler(s).born = s.year - 12;
    expect(warBlocker(s, target, true)).toMatch(/regency/);
    ruler(s).born = s.year - 40;
    s.wars = ['a', 'b', 'c'].map((id) => ({ id, enemy: 'dummy-' + id, playerAttacker: true, target: '', cb: 'conquest', score: 0, started: s.year }));
    expect(declareWar(s, target.id, 'claim', true)).toBe(false);
    expect(s.truces).toHaveLength(1);
  });
  it('makes an explicit breach cost prestige once and leave actual ruler/house resentment', () => {
    const { s, enemy, other, target } = fixture();
    makeTruce(s, s.playerClanId, enemy.id);
    const r = ruler(s),
      before = s.prestige,
      opinion = other.opinion;
    enemy.allied = true;
    expect(declareWar(s, target.id, 'claim', true)).toBe(true);
    expect(s.prestige).toBe(before - OATH_BREAK_COST);
    expect(enemy.allied).toBe(false);
    expect(r.reputation!.deeds.oathsBroken).toBe(1);
    expect(other.opinion).toBeLessThanOrEqual(opinion - 10);
    expect(enemy.memories?.some((m) => m.text === 'Broke our sworn truce' && m.grave)).toBe(true);
    expect(opinionLines(s, s.characters[enemy.headId], r).some((l) => l.label === 'Broke our sworn truce')).toBe(true);
    expect(truceOf(s, s.playerClanId, enemy.id)).toBeUndefined();
    const after = structuredClone(s);
    expect(declareWar(s, target.id, 'claim', true)).toBe(false);
    expect(breakTruce(s, s.playerClanId, enemy.id)).toBe(false);
    expect(s).toEqual(after);
  });
  it('does not let independence bypass a truce, but allows a paid explicit break', () => {
    const { s, enemy } = fixture();
    s.clans[s.playerClanId].liege = enemy.id;
    makeTruce(s, s.playerClanId, enemy.id);
    expect(independenceBlocker(s)).toMatch(/truce/);
    expect(declareIndependence(s)).toBe(false);
    expect(declareIndependence(s, true)).toBe(true);
    expect(s.wars[0].cb).toBe('independence');
    endWar(s, s.wars[0], 'white');
    expect(truceLeft(s, s.playerClanId, enemy.id)).toBe(5);
  });
  it('uses AI prestige for a deliberate breach, never the player treasury or player-deed record', () => {
    const { s, enemy, target } = fixture();
    const mine = clanRegions(s, s.playerClanId)[0];
    makeTruce(s, enemy.id, s.playerClanId);
    enemy.prestige = 199;
    const before = structuredClone(s);
    expect(aiDeclareWar(s, enemy.id, 'conquest', mine.id, true)).toBe(false);
    expect(s).toEqual(before);
    enemy.prestige = 350;
    const prestige = s.prestige,
      credits = s.credits,
      memories = target.owner === enemy.id ? s.clans[enemy.id].memories : undefined;
    expect(aiDeclareWar(s, enemy.id, 'conquest', mine.id)).toBe(false);
    expect(aiDeclareWar(s, enemy.id, 'conquest', mine.id, true)).toBe(true);
    expect(enemy.prestige).toBe(350 - OATH_BREAK_COST - 120);
    expect(s.prestige).toBe(prestige);
    expect(s.credits).toBe(credits);
    expect(ruler(s).reputation?.deeds.oathsBroken).toBeUndefined();
    expect(s.characters[enemy.headId].reputation!.deeds.oathsBroken).toBe(1);
    expect(enemy.memories).toEqual(memories);
  });
  it('blocks AI-vs-AI truce violations by default and charges the correct house on an explicit breach', () => {
    const { s, enemy, other } = fixture();
    const target = clanRegions(s, other.id)[0];
    makeTruce(s, enemy.id, other.id);
    enemy.prestige = 500;
    expect(declareHouseWar(s, enemy.id, target.id)).toBe(false);
    expect(declareHouseWar(s, enemy.id, target.id, true)).toBe(true);
    expect(enemy.prestige).toBe(500 - OATH_BREAK_COST - 120);
    expect(s.prestige).toBe(1000);
    expect(s.aiWars[0].attacker).toBe(enemy.id);
    expect(s.characters[enemy.headId].reputation!.deeds.oathsBroken).toBe(1);
  });
  it('records AI-vs-AI victory and timeout peace but no peace for a vanished prize', () => {
    for (const outcome of ['victory', 'timeout', 'cancelled']) {
      const { s, enemy, other } = fixture();
      const target = clanRegions(s, other.id)[0];
      expect(declareHouseWar(s, enemy.id, target.id)).toBe(true);
      const w = s.aiWars[0];
      if (outcome === 'victory') w.progress = 200;
      else if (outcome === 'timeout') w.started = s.year - 5;
      else setOwner(s, target, s.playerClanId);
      aiTick(s);
      expect(s.aiWars.some((x) => x.id === w.id)).toBe(false);
      expect(!!truceOf(s, enemy.id, other.id)).toBe(outcome !== 'cancelled');
    }
  });
  it('cancels a stale player war without fabricating peace', () => {
    const { s, enemy, other, target } = fixture();
    declareWar(s, target.id, 'claim');
    setOwner(s, target, other.id);
    tickPlayerWars(s);
    expect(s.wars).toEqual([]);
    expect(truceOf(s, s.playerClanId, enemy.id)).toBeUndefined();
  });
  it('migration starts with no invented treaties and repeated migration preserves genuine treaties', () => {
    const { s, enemy } = fixture();
    s.version = 6;
    delete (s as Partial<typeof s>).truces;
    const oldSeed = s.seed;
    migrate(s);
    expect(s.truces).toEqual([]);
    expect(s.seed).toBe(oldSeed);
    makeTruce(s, s.playerClanId, enemy.id);
    const before = structuredClone(s);
    migrate(s);
    expect(s).toEqual(before);
  });
  it('keeps VIP parity for costs, expiry and AI oath-breaking', () => {
    const { s, enemy, target } = fixture();
    makeTruce(s, s.playerClanId, enemy.id);
    const vip = structuredClone(s);
    vip.vip = { on: true, immortal: true };
    expect(declareWar(s, target.id, 'claim', true)).toBe(true);
    expect(declareWar(vip, target.id, 'claim', true)).toBe(true);
    expect(vip.prestige).toBe(s.prestige);
    expect(vip.truces).toEqual(s.truces);
    expect(vip.seed).toBe(s.seed);
    expect(truceBreakBlocker(s, s.playerClanId, enemy.id)).toMatch(/no active/);
  });
});

describe('war weariness follows real houses and losses', () => {
  it('counts simultaneous campaigns, caps yearly pressure and recovers only in peace', () => {
    const { s, enemy, other, target } = fixture();
    declareWar(s, target.id, 'claim');
    expect(campaignsOf(s, s.playerClanId)).toBe(1);
    peaceTick(s);
    expect(warWeariness(s, s.playerClanId)).toBe(3);
    expect(warWeariness(s, enemy.id)).toBe(3);
    // Only a house that actually sailed to the realm's defence (realmDefence.ts) shares the campaign.
    expect(warWeariness(s, other.id)).toBe(s.wars[0].realmAid?.some((p) => p.clanId === other.id && p.ships > 0) ? 3 : 0);
    s.wars.push({ ...s.wars[0], id: 'second', enemy: other.id });
    peaceTick(s);
    expect(warWeariness(s, s.playerClanId)).toBe(9);
    s.wars = [];
    peaceTick(s);
    expect(warWeariness(s, s.playerClanId)).toBe(1);
    peaceTick(s);
    expect(warWeariness(s, s.playerClanId)).toBe(0);
    expect(s.warWeariness[s.playerClanId]).toBeUndefined();
  });
  it('makes heavy losses matter, clamps to 100 and leaves query calls pure', () => {
    const { s, enemy } = fixture();
    battleWeariness(s, enemy.id, 100, 20);
    expect(warWeariness(s, enemy.id)).toBe(7);
    battleWeariness(s, enemy.id, 100, 100);
    expect(warWeariness(s, enemy.id)).toBe(30);
    for (let i = 0; i < 8; i++) battleWeariness(s, enemy.id, 100, 100);
    expect(warWeariness(s, enemy.id)).toBe(100);
    expect(warStrengthFactor(s, enemy.id)).toBe(0.75);
    expect(warIncomeFactor(s, enemy.id)).toBe(0.85);
    const before = structuredClone(s);
    campaignsOf(s, enemy.id);
    truceLeft(s, enemy.id, s.playerClanId);
    warWeariness(s, enemy.id);
    battleWeariness(s, enemy.id, 0, 0);
    expect(s).toEqual(before);
  });
  it('charges an actual battle once, using physical losses rather than helpers', () => {
    const { s, enemy, target } = fixture();
    declareWar(s, target.id, 'claim');
    const ownBefore = s.fleet,
      enemyBefore = enemy.fleet,
      war = s.wars[0];
    const report = fightBattle(s, war.id)!;
    expect(warWeariness(s, s.playerClanId)).toBe(3 + Math.ceil((20 * report.playerLosses) / ownBefore));
    expect(warWeariness(s, enemy.id)).toBe(3 + Math.ceil((20 * report.enemyLosses) / enemyBefore));
    const after = structuredClone(s);
    expect(fightBattle(s, war.id)).toBeUndefined();
    expect(s).toEqual(after);
  });
  it('shows the regional penalty as an actual negative line and applies the same factor to AI lands', () => {
    const { s, enemy } = fixture();
    const base = creditLines(s),
      aiIncome = grossRegionIncome(s, enemy.id);
    s.warWeariness[s.playerClanId] = 100;
    s.warWeariness[enemy.id] = 100;
    const weary = creditLines(s);
    const regions = base.find((l) => l.label === 'Regions (boosted by Economy)')!.value;
    expect(weary.find((l) => l.label === 'War-weary lands')!.value).toBeLessThanOrEqual(-Math.floor(regions * 0.15));
    expect(grossRegionIncome(s, enemy.id)).toBeCloseTo(aiIncome * 0.85);
    const vip = structuredClone(s);
    vip.vip = { on: true };
    expect(warStrengthFactor(vip, enemy.id)).toBe(warStrengthFactor(s, enemy.id));
    expect(grossRegionIncome(vip, enemy.id)).toBe(grossRegionIncome(s, enemy.id));
  });
  it('round-trips ongoing pressure and repeats the same future battle without minting new ships', () => {
    const { s, enemy, target } = fixture();
    declareWar(s, target.id, 'claim');
    fightBattle(s, s.wars[0].id);
    const restored = importSave(exportSave(s));
    expect(restored.warWeariness).toEqual(s.warWeariness);
    s.year++;
    restored.year++;
    const a = fightBattle(s, s.wars[0].id),
      b = fightBattle(restored, restored.wars[0].id);
    expect(b).toEqual(a);
    expect(restored.seed).toBe(s.seed);
    expect(restored.fleet).toBe(s.fleet);
    expect(restored.clans[enemy.id].fleet).toBe(enemy.fleet);
    expect(restored.warWeariness).toEqual(s.warWeariness);
  });
  it('counts actual civil-war backers and gives the house one combined battle charge', () => {
    const { s, crisis } = disputedInheritance();
    s.year = crisis.deadline;
    successionTick(s);
    expect(crisis.stage).toBe('civil-war');
    const backer = crisis.contributions.find((p) => p.clanId !== s.playerClanId)!;
    const fleet = s.clans[backer.clanId].fleet;
    peaceTick(s);
    expect(warWeariness(s, s.playerClanId)).toBe(3);
    expect(warWeariness(s, backer.clanId)).toBe(3);
    s.pending = [];
    expect(resolveCrisis(s, crisis.id, 'fight')).toBe(true);
    expect(warWeariness(s, s.playerClanId)).toBeGreaterThanOrEqual(6);
    expect(warWeariness(s, s.playerClanId)).toBeLessThanOrEqual(12);
    expect(warWeariness(s, backer.clanId)).toBeGreaterThan(3);
    expect(s.clans[backer.clanId].fleet).toBe(fleet);
  });
});
