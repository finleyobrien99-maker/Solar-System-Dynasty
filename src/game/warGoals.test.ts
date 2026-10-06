import { describe, expect, it } from 'vitest';
import { ch, clanRegions, liegeOf, setOwner, SAVE_VERSION } from './core';
import { declareWithGoal, declareWar, aiDeclareWar, endWar, fightBattle, answerRealm } from './war';
import { declareHouseWar, tickAiWars } from './ai';
import { acceptPeace, makeTruce, offerPeace, peaceAcceptance, peaceTerms, settlePeace, truceOf } from './peace';
import { goalBlocker, goalCampaignValid, houseFunds, peaceTributeTick, recordRefusedDemand, settleDemand, type WarGoal } from './warGoals';
import { diplomacyTick, breakTreatiesForWar, diplomacyCreditLines } from './treaties';
import { migrate, exportSave, importSave } from './save';
import { siegeOptions } from './siege';
import { pactMap } from './aiCourt';
import { goalWorld } from './warGoalScenarios';
import type { GameState } from './types';

function pair(s: GameState) {
  const ai = Object.values(s.clans).filter((k) => !k.isPlayer && clanRegions(s, k.id).length);
  const pacts = pactMap(s);
  const a = ai[0],
    b = ai.find((k) => k.id !== a.id && !pacts.get(a.id)?.has(k.id))!;
  return { a, b, other: ai.find((k) => k.id !== a.id && k.id !== b.id)! };
}
const snapshot = (s: GameState) => JSON.stringify(s);

describe('exact war goals and terms', () => {
  it('rejects invalid, mismatched and unknown goals without any mutation or roll', () => {
    const s = goalWorld(),
      { b } = pair(s);
    for (const goal of [
      { kind: 'tribute', amount: NaN, years: 5 },
      { kind: 'tribute', amount: 10, years: 21 },
      { kind: 'humiliate', prestige: 0 },
      { kind: 'liberate', vassalId: b.id },
      { kind: 'cede', regionId: clanRegions(s, s.playerClanId)[0].id },
    ] as WarGoal[]) {
      const before = snapshot(s);
      expect(declareWithGoal(s, s.playerClanId, b.id, goal)).toBe(false);
      expect(snapshot(s)).toBe(before);
    }
  });
  it('a regional claim cannot justify another prize or a non-territorial goal', () => {
    const s = goalWorld(),
      { b } = pair(s),
      region = clanRegions(s, b.id)[0].id;
    s.claims.push(region);
    const before = snapshot(s);
    expect(declareWar(s, region, 'claim', false, { kind: 'tribute', amount: 25, years: 3 })).toBe(false);
    expect(snapshot(s)).toBe(before);
    expect(declareWar(s, region, 'claim', false, { kind: 'cede', regionId: clanRegions(s, s.playerClanId)[0].id })).toBe(false);
    expect(snapshot(s)).toBe(before);
  });
  it('a refused ultimatum justifies exactly its recorded goal once, not arbitrary conquest', () => {
    const s = goalWorld(),
      { b } = pair(s),
      goal: WarGoal = { kind: 'tribute', amount: 25, years: 5 };
    expect(recordRefusedDemand(s, 'real-demand', s.playerClanId, b.id, goal, s.year + 3)).toBe(true);
    s.prestige = 0;
    const before = snapshot(s);
    expect(declareWithGoal(s, s.playerClanId, b.id, { kind: 'humiliate', prestige: 100 }, { justification: 'real-demand' })).toBe(false);
    expect(snapshot(s)).toBe(before);
    expect(declareWithGoal(s, s.playerClanId, b.id, goal, { justification: 'real-demand' })).toBe(true);
    expect(s.prestige).toBe(0);
    expect(s.wars[0].goal).toEqual(goal);
    endWar(s, s.wars[0], 'white');
    s.truces = [];
    const after = snapshot(s);
    expect(declareWithGoal(s, s.playerClanId, b.id, goal, { justification: 'real-demand' })).toBe(false);
    expect(snapshot(s)).toBe(after);
  });
  it('every low-level declaration consumes its exact refused demand only on success', () => {
    for (const mode of ['player-ai', 'ai-player', 'ai-ai']) {
      const s = goalWorld(),
        { a, b } = pair(s);
      const from = mode === 'player-ai' ? s.playerClanId : a.id,
        to = mode === 'ai-player' ? s.playerClanId : b.id;
      const goal: WarGoal = { kind: 'tribute', amount: 25, years: 3 },
        target = clanRegions(s, to)[0].id;
      recordRefusedDemand(s, 'exact', from, to, goal, s.year + 3);
      const declare = () =>
        mode === 'player-ai'
          ? declareWar(s, target, 'conquest', false, goal, 'exact')
          : mode === 'ai-player'
            ? aiDeclareWar(s, from, 'conquest', target, false, goal, 'exact')
            : declareHouseWar(s, from, target, false, goal, 'exact');
      expect(declare()).toBe(true);
      expect(s.warJustifications?.[0].used).toBe(true);
      expect([...s.wars, ...s.aiWars][0].cb).toBe('feud');
      s.wars = [];
      s.aiWars = [];
      s.truces = [];
      const before = snapshot(s);
      expect(declare()).toBe(false);
      expect(snapshot(s)).toBe(before);
    }
  });
  it('unaffordable combined war, truce and promise costs leave both houses unchanged', () => {
    for (const mode of ['player-ai', 'ai-player', 'ai-ai']) {
      const s = goalWorld(),
        { a, b } = pair(s),
        from = mode === 'player-ai' ? s.playerClanId : a.id,
        to = mode === 'ai-player' ? s.playerClanId : b.id;
      makeTruce(s, from, to);
      s.diplomacy!.treaties.push({ id: 'oath', a: from, b: to, kind: 'nonAggression', years: 10, signed: s.year, until: s.year + 10 });
      if (from === s.playerClanId) s.prestige = 369;
      else s.clans[from].prestige = 369;
      const before = snapshot(s);
      expect(declareWithGoal(s, from, to, { kind: 'tribute', amount: 25, years: 3 }, { breakOath: true })).toBe(false);
      expect(snapshot(s)).toBe(before);
    }
  });
  it('justification cannot override a truce, expiry, changed allegiance or a new recipient', () => {
    const s = goalWorld(),
      { a, b, other } = pair(s),
      goal: WarGoal = { kind: 'liberate', vassalId: other.id };
    other.liege = b.id;
    expect(recordRefusedDemand(s, 'u', a.id, b.id, goal, s.year + 2)).toBe(true);
    makeTruce(s, a.id, b.id);
    const before = snapshot(s);
    expect(declareWithGoal(s, a.id, b.id, goal, { justification: 'u' })).toBe(false);
    expect(snapshot(s)).toBe(before);
    s.truces = [];
    other.liege = 'none';
    expect(declareWithGoal(s, a.id, b.id, goal, { justification: 'u' })).toBe(false);
    other.liege = b.id;
    s.year += 2;
    expect(declareWithGoal(s, a.id, b.id, goal, { justification: 'u' })).toBe(false);
  });
  for (const kind of ['cede', 'tribute', 'humiliate', 'liberate'] as const) {
    it(kind + ' settles the same physical goal for player-AI, AI-player and AI-AI', () => {
      for (const mode of ['player-ai', 'ai-player', 'ai-ai']) {
        const s = goalWorld(),
          { a, b, other } = pair(s);
        const attacker = mode === 'player-ai' ? s.playerClanId : a.id,
          defender = mode === 'ai-player' ? s.playerClanId : b.id;
        const goal: WarGoal =
          kind === 'cede'
            ? { kind, regionId: clanRegions(s, defender)[0].id }
            : kind === 'tribute'
              ? { kind, amount: 25, years: 3 }
              : kind === 'humiliate'
                ? { kind, prestige: 100 }
                : { kind, vassalId: other.id };
        if (kind === 'liberate') {
          other.liege = defender;
          other.cadetOf = defender;
        }
        const owners = Object.values(s.regions).map((r) => r.owner);
        expect(declareWithGoal(s, attacker, defender, goal), mode).toBe(true);
        const w = [...s.wars, ...s.aiWars][0];
        expect(w.goal).toEqual(goal);
        expect(w.target).toBe(kind === 'cede' ? (goal.kind === 'cede' ? goal.regionId : '') : '');
        if ('enemy' in w) endWar(s, w, w.playerAttacker ? 'win' : 'lose');
        else {
          w.progress = 100;
          tickAiWars(s);
        }
        expect(s.wars.length + s.aiWars.length).toBe(0);
        expect(truceOf(s, attacker, defender)).toBeTruthy();
        if (goal.kind === 'cede') expect(s.regions[goal.regionId].owner).toBe(attacker);
        else expect(Object.values(s.regions).map((r) => r.owner)).toEqual(owners);
        if (goal.kind === 'liberate') expect(liegeOf(s, goal.vassalId)).toBeNull();
        if (goal.kind === 'tribute') expect(s.peaceTributes?.[0]).toMatchObject({ from: defender, to: attacker, amount: 25 });
        const after = snapshot(s);
        expect(settlePeace(s, w, { kind: 'goal', winner: attacker, goal })).toBe(false);
        expect(snapshot(s)).toBe(after);
      }
    });
  }
  it('a player pact defender answers a non-territorial campaign with real ships, once', () => {
    const s = goalWorld(),
      { a, b } = pair(s);
    s.diplomacy!.treaties.push({ id: 'protect', kind: 'guarantee', a: s.playerClanId, b: b.id, years: 10, signed: s.year, until: s.year + 10 });
    expect(declareWithGoal(s, a.id, b.id, { kind: 'humiliate', prestige: 100 })).toBe(true);
    const w = s.aiWars[0],
      before = s.fleet;
    expect(w.realmCalls?.find((x) => x.clanId === s.playerClanId)?.answer).toBe('pending');
    expect(answerRealm(s, w.id, true, 0.5)).toBe(true);
    expect(w.realmAid?.find((x) => x.clanId === s.playerClanId)?.ships).toBe(before / 2);
    expect(s.fleet).toBe(before / 2);
    const after = snapshot(s);
    expect(answerRealm(s, w.id, true, 0.5)).toBe(false);
    expect(snapshot(s)).toBe(after);
    expect(settlePeace(s, w, { kind: 'white' })).toBe(true);
    expect(s.fleet).toBe(before);
    expect(truceOf(s, a.id, s.playerClanId)).toBeTruthy();
  });
  it('non-territorial campaigns battle, survive unrelated land changes and offer no siege', () => {
    const s = goalWorld(),
      { b } = pair(s);
    expect(declareWithGoal(s, s.playerClanId, b.id, { kind: 'tribute', amount: 25, years: 3 })).toBe(true);
    const w = s.wars[0];
    expect(goalCampaignValid(s, w)).toBe(true);
    expect(siegeOptions(s, w.id).every((o) => !o.ok)).toBe(true);
    expect(fightBattle(s, w.id)).toBeTruthy();
    expect(importSave(exportSave(s)).wars[0].goal).toEqual(w.goal);
  });
  it('changed cession target cancels without invented settlement or peace and returns survivors once', () => {
    const s = goalWorld(),
      { b, other } = pair(s),
      target = clanRegions(s, b.id)[0];
    expect(declareWar(s, target.id, 'conquest')).toBe(true);
    const w = s.wars[0];
    setOwner(s, target, other.id);
    const credits = s.credits;
    endWar(s, w, 'win');
    expect(s.wars).toHaveLength(0);
    expect(s.credits).toBe(credits);
    expect(truceOf(s, s.playerClanId, b.id)).toBeUndefined();
  });
  it('peace queries and unavailable terms are pure; war score explains stronger acceptance', () => {
    const s = goalWorld(),
      { b } = pair(s);
    declareWithGoal(s, s.playerClanId, b.id, { kind: 'humiliate', prestige: 100 });
    const w = s.wars[0],
      terms = { kind: 'goal' as const, winner: s.playerClanId, goal: w.goal! };
    const before = snapshot(s);
    peaceTerms(s, w);
    goalBlocker(s, s.playerClanId, b.id, w.goal!);
    expect(snapshot(s)).toBe(before);
    w.score = -60;
    const bad = peaceAcceptance(s, w, terms, b.id);
    w.score = 60;
    expect(peaceAcceptance(s, w, terms, b.id).chance).toBeGreaterThan(bad.chance);
    const unchanged = snapshot(s);
    expect(offerPeace(s, w, { kind: 'goal', winner: s.playerClanId, goal: { kind: 'cede', regionId: clanRegions(s, b.id)[0].id } })).toBe(false);
    expect(snapshot(s)).toBe(unchanged);
  });
  it('an incoming offer waits for explicit consent, round-trips and cannot settle twice', () => {
    const s = goalWorld(),
      { b } = pair(s);
    declareWithGoal(s, s.playerClanId, b.id, { kind: 'humiliate', prestige: 100 });
    const w = s.wars[0],
      seed = s.seed;
    expect(offerPeace(s, w, { kind: 'reparations', winner: s.playerClanId, amount: 60 }, b.id)).toBe(true);
    expect(s.seed).toBe(seed);
    expect(w.peaceOffer?.to).toBe(s.playerClanId);
    const loaded = importSave(exportSave(s));
    loaded.clans[b.id].credits = 7;
    const balance = loaded.credits;
    expect(acceptPeace(loaded, w.id, true)).toBe(true);
    expect(loaded.credits).toBe(balance + 7);
    expect(loaded.clans[b.id].credits).toBe(0);
    const after = snapshot(loaded);
    expect(acceptPeace(loaded, w.id, true)).toBe(false);
    expect(snapshot(loaded)).toBe(after);
  });
  it('stale and changed liberation offers are inert, including rejection by the wrong recipient', () => {
    const s = goalWorld(),
      { b, other } = pair(s);
    other.liege = b.id;
    declareWithGoal(s, s.playerClanId, b.id, { kind: 'liberate', vassalId: other.id });
    const w = s.wars[0];
    offerPeace(s, w, { kind: 'goal', winner: s.playerClanId, goal: w.goal! }, b.id);
    other.liege = 'none';
    const before = snapshot(s);
    expect(acceptPeace(s, w, true)).toBe(false);
    expect(acceptPeace(s, w, false, b.id)).toBe(false);
    expect(snapshot(s)).toBe(before);
  });
  it('blocked recipients cannot receive terms, identically for player and AI, without consuming an envoy', () => {
    for (const toPlayer of [true, false]) {
      const s = goalWorld(),
        { a, b } = pair(s),
        from = a.id,
        to = toPlayer ? s.playerClanId : b.id;
      expect(declareWithGoal(s, from, to, { kind: 'humiliate', prestige: 100 })).toBe(true);
      const w = [...s.wars, ...s.aiWars][0];
      ch(s, s.clans[to].headId)!.prisonerOf = from;
      const before = snapshot(s);
      expect(offerPeace(s, w, { kind: 'white' }, from)).toBe(false);
      expect(snapshot(s)).toBe(before);
    }
  });
  it('the AI makes one acceptance roll and one envoy attempt per war/cycle', () => {
    const s = goalWorld(),
      { a, b } = pair(s);
    declareWithGoal(s, a.id, b.id, { kind: 'humiliate', prestige: 100 });
    const w = s.aiWars[0];
    w.progress = -90;
    s.seed = 1;
    offerPeace(s, w, { kind: 'goal', winner: a.id, goal: w.goal! }, a.id);
    const after = snapshot(s);
    expect(offerPeace(s, w, { kind: 'goal', winner: a.id, goal: w.goal! }, a.id)).toBe(false);
    expect(snapshot(s)).toBe(after);
  });
  it('legacy wars migrate with no invented goal, offer or obligation', () => {
    const s = goalWorld(),
      { b } = pair(s);
    declareWar(s, clanRegions(s, b.id)[0].id, 'conquest');
    delete s.wars[0].goal;
    s.version = 10;
    const loaded = migrate(s);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.wars[0].goal).toBeUndefined();
    expect(loaded.peaceTributes).toEqual([]);
    expect(migrate(structuredClone(loaded))).toEqual(loaded);
  });
});

describe('physical payments and reviewed treaties', () => {
  it('imposed tribute pays exactly N future cycles, never twice, and caps player/AI funds', () => {
    for (const fromPlayer of [true, false]) {
      const s = goalWorld(),
        { a, b } = pair(s),
        from = fromPlayer ? s.playerClanId : b.id,
        to = fromPlayer ? a.id : s.playerClanId;
      expect(settleDemand(s, to, from, { kind: 'tribute', amount: 25, years: 2 })).toBe(true);
      for (let i = 0; i < 3; i++) {
        if (fromPlayer) s.credits = 7;
        else s.clans[from].credits = 7;
        const before = houseFunds(s, to);
        s.year++;
        peaceTributeTick(s);
        expect(houseFunds(s, to) - before).toBe(i < 2 ? 7 : 0);
        const after = snapshot(s);
        peaceTributeTick(s);
        expect(snapshot(s)).toBe(after);
      }
    }
  });
  it('humiliation and treaty tribute transfer only actual funds, including an empty payer', () => {
    const s = goalWorld(),
      { a, b } = pair(s);
    b.prestige = 3;
    const before = a.prestige;
    expect(settleDemand(s, a.id, b.id, { kind: 'humiliate', prestige: 100 })).toBe(true);
    expect(a.prestige - before).toBe(3);
    expect(b.prestige).toBe(0);
    s.diplomacy!.treaties.push({ id: 'tribute', kind: 'tribute', a: s.playerClanId, b: b.id, amount: 25, years: 3, signed: s.year, until: s.year + 3 });
    b.credits = 4;
    const balance = s.credits;
    s.year++;
    diplomacyTick(s);
    expect(s.credits - balance).toBe(4);
    expect(b.credits).toBe(0);
    expect(diplomacyCreditLines(s, false).every((l) => !l.label.includes('Tribute'))).toBe(true);
  });
  it('a failed promise decision does not consume an existing truce or debit an oath cost', () => {
    const s = goalWorld(),
      { a, b } = pair(s);
    makeTruce(s, a.id, b.id);
    s.diplomacy!.treaties.push({ id: 'p', kind: 'nonAggression', a: a.id, b: b.id, years: 10, signed: s.year, until: s.year + 10 });
    ch(s, a.headId)!.traits.push('honest');
    s.seed = 1;
    const prestige = a.prestige,
      truces = structuredClone(s.truces);
    expect(declareHouseWar(s, a.id, clanRegions(s, b.id)[0].id, true)).toBe(false);
    expect(a.prestige).toBe(prestige);
    expect(s.truces).toEqual(truces);
    expect(s.diplomacy!.treaties).toHaveLength(1);
  });
  it('overlapping promises have one declaration breach charge, identically for AI and player', () => {
    for (const player of [true, false]) {
      const s = goalWorld(),
        { a, b } = pair(s),
        id = player ? s.playerClanId : a.id;
      for (const kind of ['defensive', 'nonAggression'] as const)
        s.diplomacy!.treaties.push({ id: kind, kind, a: id, b: b.id, years: 10, signed: s.year, until: s.year + 10 });
      const before = houseFunds(s, id, 'prestige');
      expect(breakTreatiesForWar(s, id, b.id)).toBe(2);
      expect(before - houseFunds(s, id, 'prestige')).toBe(50);
    }
  });
});
