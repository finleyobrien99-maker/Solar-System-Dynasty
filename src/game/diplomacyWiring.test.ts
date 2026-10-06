// Treaties wired into the game (WAVE-5 slice 2): declarations honour promises,
// treaty partners answer a realm call with real ships, your answers and
// breaches have their costs, money shows in your accounts, and Age Up runs it.
import { describe, expect, it } from 'vitest';
import { declareHouseWar } from './ai';
import { ch, clanRegions } from './core';
import type { TreatyTerms } from './diplomacyTypes';
import { creditLines } from './economy';
import { EVENT_BY_ID } from './events';
import { trustOf } from './houseRelations';
import { pendingRealmCall } from './realmDefence';
import { ageUp } from './tick';
import { BREACH_PRESTIGE, termsFor, treatiesOf, treatyBetween, TRUST_PER_CYCLE } from './treaties';
import type { Clan, GameState } from './types';
import { answerRealm, declareWar, warBlocker } from './war';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';

const PERSONAL = ['brave', 'craven', 'wrathful', 'honest', 'deceitful', 'ambitious', 'paranoid', 'greedy', 'arrogant'];

function world(seed = 61): GameState {
  const s = createWorld(seed);
  const home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(seed, 'mars', 'F', 'Asha'), focus: 'cmd', age: 40, family: 'married' });
  Object.assign(s, { credits: 5000, prestige: 1000, fleet: 120, pending: [] });
  for (const k of Object.values(s.clans)) {
    if (k.isPlayer) continue;
    const head = ch(s, k.headId);
    if (head) {
      head.born = Math.min(head.born, s.year - 35);
      head.prisonerOf = undefined;
      head.traits = head.traits.filter((t) => !PERSONAL.includes(t));
    }
    k.fleet = 100;
    k.allied = false;
  }
  return s;
}
function on(s: GameState, planet: string, skip: string[] = []): Clan {
  return Object.values(s.clans).find(
    (k) => !k.isPlayer && k.planetId === planet && clanRegions(s, k.id).length && !clanRegions(s, k.id).some((r) => r.capital) && !skip.includes(k.id),
  )!;
}
function sign(s: GameState, terms: TreatyTerms) {
  s.diplomacy!.treaties.push({ ...terms, id: 'tw' + s.diplomacy!.treaties.length, signed: s.year, until: s.year + terms.years });
  return s.diplomacy!.treaties.at(-1)!;
}

describe('treaties in play', () => {
  it('a new game starts with an empty diplomacy record, and the offer event is in the deck', () => {
    const s = world();
    expect(s.diplomacy).toEqual({ treaties: [], proposals: [], memories: [], trust: {}, trustYear: {} });
    expect(EVENT_BY_ID.treaty_offer).toBeTruthy();
  });

  it('a non-aggression pact stops your declaration until you break your word, which costs prestige and trust', () => {
    const s = world();
    const b = on(s, 'venus');
    sign(s, termsFor(s, 'nonAggression', s.playerClanId, b.id));
    const region = clanRegions(s, b.id)[0];
    expect(warBlocker(s, region)).toMatch(/non-aggression/);
    expect(declareWar(s, region.id, 'conquest')).toBe(false);
    const prestige = s.prestige;
    expect(declareWar(s, region.id, 'conquest', true)).toBe(true);
    expect(treatyBetween(s, s.playerClanId, b.id)).toBeUndefined();
    expect(trustOf(s, b.id, s.playerClanId)).toBeLessThan(0);
    expect(prestige - s.prestige).toBeGreaterThanOrEqual(BREACH_PRESTIGE);
  });

  it('an honest AI lord keeps his pact; a deceitful one may break it, and then every promise between them is gone', () => {
    const s = world();
    const a = on(s, 'venus');
    a.liege = 'none';
    const d = on(s, 'earth');
    sign(s, termsFor(s, 'nonAggression', a.id, d.id));
    ch(s, a.headId)!.traits.push('honest');
    expect(declareHouseWar(s, a.id, clanRegions(s, d.id)[0].id)).toBe(false);
    expect(treatyBetween(s, a.id, d.id)).toBeTruthy();
    let broke = false;
    for (let seed = 1; seed < 200 && !broke; seed++) {
      const t = world();
      const x = on(t, 'venus');
      x.liege = 'none';
      const y = on(t, 'earth');
      sign(t, termsFor(t, 'nonAggression', x.id, y.id));
      ch(t, x.headId)!.traits.push('deceitful', 'ambitious');
      t.seed = seed;
      if (!declareHouseWar(t, x.id, clanRegions(t, y.id)[0].id)) continue;
      broke = true;
      expect(treatyBetween(t, x.id, y.id)).toBeUndefined();
      expect(trustOf(t, y.id, x.id)).toBeLessThan(0);
    }
    expect(broke).toBe(true);
  });

  it('a defensive partner on another world answers the call with real ships', () => {
    const s = world();
    const attacker = on(s, 'jupiter');
    attacker.liege = 'none';
    const d = on(s, 'venus');
    const partner = on(s, 'earth');
    partner.liege = 'none';
    sign(s, termsFor(s, 'defensive', partner.id, d.id));
    let answered = false;
    for (let seed = 1; seed < 40 && !answered; seed++) {
      const t = structuredClone(s);
      t.seed = seed;
      expect(declareHouseWar(t, attacker.id, clanRegions(t, d.id)[0].id)).toBe(true);
      const w = t.aiWars.at(-1)!;
      const call = w.realmCalls!.find((x) => x.clanId === partner.id)!;
      expect(call.role).toBe('pact');
      if (call.answer !== 'accepted') {
        // Staying home broke the pact.
        expect(treatyBetween(t, partner.id, d.id)).toBeUndefined();
        continue;
      }
      answered = true;
      expect(w.realmAid!.find((p) => p.clanId === partner.id)?.sent).toBe(50);
      expect(t.clans[partner.id].fleet).toBe(50);
    }
    expect(answered).toBe(true);
  });

  it('when your partner is attacked you are asked; staying home breaks the pact, going sends real ships', () => {
    for (const accept of [true, false]) {
      const s = world();
      const attacker = on(s, 'jupiter');
      attacker.liege = 'none';
      const d = on(s, 'venus');
      const t = sign(s, termsFor(s, 'defensive', s.playerClanId, d.id));
      expect(declareHouseWar(s, attacker.id, clanRegions(s, d.id)[0].id)).toBe(true);
      const w = s.aiWars.at(-1)!;
      expect(pendingRealmCall(s)?.answer).toMatchObject({ role: 'pact', treatyId: t.id });
      expect(answerRealm(s, w.id, accept)).toBe(true);
      if (accept) {
        expect(w.realmAid!.find((p) => p.clanId === s.playerClanId)?.sent).toBe(60);
        expect(treatyBetween(s, s.playerClanId, d.id)).toBeTruthy();
      } else {
        expect(treatyBetween(s, s.playerClanId, d.id)).toBeUndefined();
        expect(d.memories?.some((m) => m.grave)).toBe(true);
      }
    }
  });

  it('treaty money appears in your accounts, and Age Up keeps the treaty growing trust', () => {
    const s = world();
    const b = on(s, 'venus');
    sign(s, termsFor(s, 'trade', s.playerClanId, b.id));
    expect(creditLines(s).some((l) => l.label === `Trade with House ${b.name}` && l.value > 0)).toBe(true);
    ageUp(s);
    expect(trustOf(s, b.id, s.playerClanId)).toBeGreaterThanOrEqual(TRUST_PER_CYCLE);
    expect(treatiesOf(s, s.playerClanId).some((t) => t.b === b.id)).toBe(true);
  });
});
