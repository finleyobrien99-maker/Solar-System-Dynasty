import { describe, expect, it } from 'vitest';
import { ch, clanRegions } from './core';
import type { TreatyTerms } from './diplomacyTypes';
import { buildCtx, queueEvent } from './events';
import { DIPLOMACY_EVENTS } from './eventsDiplomacy';
import { diplomacyOf, houseMemoriesOf, houseMemorySum, houseRelation, migrateDiplomacy, rememberHouse, trustOf, type WithDiplomacy } from './houseRelations';
import { makeTruce } from './peace';
import { realmOf } from './realmDefence';
import { relationOf } from './relations';
import {
  answerTreaty,
  bestDeal,
  BREACH_EVERYONE,
  BREACH_PRESTIGE,
  BREACH_VICTIM,
  breakTreatiesForWar,
  breakTreaty,
  diplomacyCreditLines,
  diplomacyTick,
  offerBlocker,
  OFFER_YEARS,
  offersToYou,
  pactDefenders,
  proposeTreaty,
  termsFor,
  tradeIncomeOf,
  treatiesOf,
  treatyAcceptance,
  treatyBetween,
  treatyBlocker,
  treatyWarBlocker,
  TRUST_PER_CYCLE,
} from './treaties';
import type { Clan, GameState, Pending } from './types';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';

type Pend = Extract<Pending, { kind: 'event' }>;
const PERSONAL = ['brave', 'craven', 'wrathful', 'honest', 'deceitful', 'greedy', 'arrogant', 'ambitious', 'paranoid'];

/** You govern on Mars; every landed AI ruler is a free adult with 100 ships and a clean slate. */
function world(seed = 61): GameState {
  const s = createWorld(seed);
  const home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(seed, 'mars', 'F', 'Asha'), focus: 'dip', age: 40, family: 'married' });
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
    k.credits = 500;
  }
  migrateDiplomacy(s);
  return s;
}
function on(s: GameState, planet: string, skip: string[] = []): Clan {
  return Object.values(s.clans).find((k) => !k.isPlayer && k.planetId === planet && clanRegions(s, k.id).length && !skip.includes(k.id))!;
}
/** Sign directly, as if both had agreed. */
function signed(s: GameState, terms: TreatyTerms) {
  const before = diplomacyOf(s).treaties.length;
  (s as WithDiplomacy).diplomacy!.treaties.push({ ...terms, id: 't-' + before, signed: s.year, until: s.year + terms.years });
  return (s as WithDiplomacy).diplomacy!.treaties.at(-1)!;
}

describe('how houses regard each other', () => {
  it('between AI houses: rulers’ regard, world, faith, marriage, memories, trust, treaties and war, every reason shown', () => {
    const s = world();
    const a = on(s, 'neptune');
    const b = on(s, 'neptune', [a.id]);
    const r = houseRelation(s, a.id, b.id);
    expect(r.reasons.some((x) => x.label === 'Share a world')).toBe(true);
    expect(r.value).toBe(
      Math.max(
        -100,
        Math.min(
          100,
          r.reasons.reduce((n, x) => n + (x.value ?? 0), 0),
        ),
      ),
    );
    rememberHouse(s, a.id, b.id, { text: 'Burned our docks', value: -50 });
    expect(houseRelation(s, a.id, b.id).value).toBeLessThan(r.value);
    expect(houseRelation(s, a.id, b.id).reasons.find((x) => x.label === 'What they remember of them')?.value).toBe(-50);
  });

  it('of you, an AI house’s existing standing is the one authority: nothing is counted twice', () => {
    const s = world();
    const a = on(s, 'venus');
    a.opinion = 23;
    const r = houseRelation(s, a.id, s.playerClanId);
    expect(r.reasons[0]).toEqual({ label: 'Their standing with your house', value: 23 });
    const before = a.memories?.length ?? 0;
    rememberHouse(s, a.id, s.playerClanId, { text: 'Sent us wine', value: 10 });
    expect(a.memories!.length).toBe(before + 1);
    expect(diplomacyOf(s).memories).toHaveLength(0);
  });

  it('grave wrongs between houses outweigh favours: gifts buy back only a quarter', () => {
    const s = world();
    const a = on(s, 'venus');
    const b = on(s, 'earth');
    rememberHouse(s, a.id, b.id, { text: 'Murdered our heir', value: -60 });
    rememberHouse(s, a.id, b.id, { text: 'Sent a gift', value: 40 });
    expect(houseMemoriesOf(s, a.id, b.id).find((m) => m.text === 'Sent a gift')?.value).toBe(10);
    expect(houseMemorySum(s, a.id, b.id)).toBeLessThan(-40);
  });

  it('reading relations, trust, odds and deals never changes anything', () => {
    const s = world();
    const a = on(s, 'venus');
    const b = on(s, 'earth');
    const before = JSON.stringify(s);
    houseRelation(s, a.id, b.id);
    trustOf(s, a.id, b.id);
    treatyAcceptance(s, a.id, b.id, termsFor(s, 'trade', a.id, b.id));
    bestDeal(s, a.id);
    pactDefenders(s, a.id, b.id);
    offersToYou(s);
    diplomacyCreditLines(s);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('an old save without a diplomacy record reads as empty and migrates to empty, twice over', () => {
    const s = world();
    delete (s as WithDiplomacy).diplomacy;
    expect(diplomacyOf(s).treaties).toEqual([]);
    migrateDiplomacy(s);
    migrateDiplomacy(s);
    expect((s as WithDiplomacy).diplomacy).toEqual({ treaties: [], proposals: [], memories: [], trust: {}, trustYear: {} });
  });
});

describe('making treaties', () => {
  it('blocks what cannot be agreed: war, a duplicate, a weak protector, a regency', () => {
    const s = world();
    const a = on(s, 'venus');
    const b = on(s, 'earth');
    expect(treatyBlocker(s, a.id, b.id, termsFor(s, 'trade', a.id, b.id))).toBeNull();
    signed(s, termsFor(s, 'trade', a.id, b.id));
    expect(treatyBlocker(s, a.id, b.id, termsFor(s, 'trade', a.id, b.id))).toMatch(/already stands/);
    expect(treatyBlocker(s, a.id, b.id, termsFor(s, 'guarantee', a.id, b.id, a.id))).toMatch(/much stronger/);
    a.fleet = 300;
    expect(treatyBlocker(s, a.id, b.id, termsFor(s, 'guarantee', a.id, b.id, a.id))).toBeNull();
    s.aiWars.push({ id: 'aw-x', attacker: a.id, defender: b.id, target: clanRegions(s, b.id)[0].id, started: s.year, progress: 0 });
    expect(treatyBlocker(s, a.id, b.id, termsFor(s, 'nonAggression', a.id, b.id))).toMatch(/war/);
    s.aiWars = [];
    ch(s, b.headId)!.born = s.year - 10;
    expect(treatyBlocker(s, a.id, b.id, termsFor(s, 'nonAggression', a.id, b.id))).toMatch(/regent/);
  });

  it('your offer is answered at once at the odds shown; an AI offer to you waits for your answer', () => {
    const s = world();
    const b = on(s, 'venus');
    s.seed = 3;
    const odds = treatyAcceptance(s, s.playerClanId, b.id, termsFor(s, 'trade', s.playerClanId, b.id));
    expect(odds.chance).toBeGreaterThan(0);
    expect(odds.reasons.some((r) => r.label === 'Base')).toBe(true);
    const result = proposeTreaty(s, s.playerClanId, b.id, termsFor(s, 'trade', s.playerClanId, b.id));
    expect(['signed', 'refused']).toContain(result);
    expect(proposeTreaty(s, s.playerClanId, b.id, termsFor(s, 'nonAggression', s.playerClanId, b.id))).toBeNull();
    const c = on(s, 'earth');
    expect(proposeTreaty(s, c.id, s.playerClanId, termsFor(s, 'trade', c.id, s.playerClanId))).toBe('pending');
    expect(treatyBetween(s, c.id, s.playerClanId)).toBeUndefined();
    expect(offersToYou(s)).toHaveLength(1);
  });

  it('answering an offer revalidates it; declining is always allowed and a little resented', () => {
    const s = world();
    const c = on(s, 'earth');
    proposeTreaty(s, c.id, s.playerClanId, termsFor(s, 'trade', c.id, s.playerClanId));
    const offer = offersToYou(s)[0];
    s.wars.push({ id: 'w-x', enemy: c.id, playerAttacker: true, target: clanRegions(s, c.id)[0].id, cb: 'conquest', score: 0, started: s.year });
    expect(offerBlocker(s, offer.id)).toMatch(/war/);
    expect(answerTreaty(s, offer.id, true)).toBe(false);
    expect(answerTreaty(s, offer.id, false)).toBe(true);
    expect(offersToYou(s)).toHaveLength(0);
    expect(c.memories?.some((m) => m.text.startsWith('Turned down'))).toBe(true);
  });

  it('offers lapse unanswered after two cycles', () => {
    const s = world();
    const c = on(s, 'earth');
    proposeTreaty(s, c.id, s.playerClanId, termsFor(s, 'trade', c.id, s.playerClanId));
    const first = offersToYou(s)[0].id;
    s.year += OFFER_YEARS;
    diplomacyTick(s);
    expect(offersToYou(s).some((p) => p.id === first)).toBe(false);
  });
});

describe('keeping and breaking promises', () => {
  it('trust grows once a cycle per pair while a treaty holds, and a treaty run to its end earns a little more', () => {
    const s = world();
    const a = on(s, 'venus');
    const b = on(s, 'earth');
    signed(s, termsFor(s, 'trade', a.id, b.id));
    signed(s, termsFor(s, 'nonAggression', a.id, b.id));
    s.year += 1;
    diplomacyTick(s);
    diplomacyTick(s);
    expect(trustOf(s, a.id, b.id)).toBe(TRUST_PER_CYCLE);
    expect(trustOf(s, b.id, a.id)).toBe(TRUST_PER_CYCLE);
  });

  it('a broken promise costs the victim’s trust, every house’s trust and your prestige, and is remembered', () => {
    const s = world();
    const b = on(s, 'venus');
    const witness = on(s, 'earth');
    const t = signed(s, termsFor(s, 'defensive', s.playerClanId, b.id));
    const prestige = s.prestige;
    expect(breakTreaty(s, s.playerClanId, t.id)).toBe(true);
    expect(trustOf(s, b.id, s.playerClanId)).toBe(BREACH_VICTIM);
    expect(trustOf(s, witness.id, s.playerClanId)).toBe(BREACH_EVERYONE);
    expect(s.prestige).toBe(prestige - BREACH_PRESTIGE);
    expect(b.memories?.some((m) => m.text.startsWith('Broke the defensive pact') && m.grave)).toBe(true);
    expect(treatyBetween(s, s.playerClanId, b.id)).toBeUndefined();
    expect(breakTreaty(s, s.playerClanId, t.id)).toBe(false);
  });

  it('a non-aggression pact stops a declaration until broken, and declaring anyway breaks every treaty between you', () => {
    const s = world();
    const b = on(s, 'venus');
    signed(s, termsFor(s, 'nonAggression', s.playerClanId, b.id));
    signed(s, termsFor(s, 'trade', s.playerClanId, b.id));
    expect(treatyWarBlocker(s, s.playerClanId, b.id)).toMatch(/non-aggression/);
    expect(breakTreatiesForWar(s, s.playerClanId, b.id)).toBe(2);
    expect(treatyWarBlocker(s, s.playerClanId, b.id)).toBeNull();
    expect(treatiesOf(s, b.id)).toHaveLength(0);
  });

  it('a tribute recipient swore not to attack its payer, and defends it', () => {
    const s = world();
    const big = on(s, 'venus');
    const small = on(s, 'earth');
    big.fleet = 400;
    const t = signed(s, termsFor(s, 'tribute', big.id, small.id, big.id));
    expect(t).toMatchObject({ a: big.id, b: small.id });
    expect(treatyWarBlocker(s, big.id, small.id)).toMatch(/tribute/);
    expect(treatyWarBlocker(s, small.id, big.id)).toBeNull();
    const attacker = on(s, 'jupiter');
    expect(pactDefenders(s, small.id, attacker.id).map((d) => d.clanId)).toEqual([big.id]);
  });
});

describe('defending a treaty partner', () => {
  it('a defensive partner is called with explained odds; a partner sworn to peace with the attacker, or in its realm, is blocked', () => {
    const s = world();
    const a = on(s, 'venus');
    const b = on(s, 'earth');
    const attacker = on(s, 'jupiter');
    const t = signed(s, termsFor(s, 'defensive', a.id, b.id));
    const [d] = pactDefenders(s, b.id, attacker.id);
    expect(d).toMatchObject({ clanId: a.id, treatyId: t.id, kind: 'defensive', proposedShips: 50 });
    expect(d.chance).toBeGreaterThan(0.5);
    expect(d.reasons[0].label).toBe('Defensive pact with House ' + b.name);
    makeTruce(s, a.id, attacker.id);
    expect(pactDefenders(s, b.id, attacker.id)[0].blocker).toMatch(/peace/);
    const sameRealm = Object.values(s.clans).find((k) => !k.isPlayer && k.id !== a.id && clanRegions(s, k.id).length && realmOf(s, k.id) === realmOf(s, a.id))!;
    s.truces = [];
    expect(pactDefenders(s, b.id, sameRealm.id)[0].blocker).toMatch(/realm/);
  });

  it('you are asked, never rolled for, when your partner is attacked', () => {
    const s = world();
    const b = on(s, 'venus');
    signed(s, termsFor(s, 'defensive', s.playerClanId, b.id));
    const [d] = pactDefenders(s, b.id, on(s, 'jupiter').id);
    expect(d).toMatchObject({ clanId: s.playerClanId, yours: true, proposedShips: 60 });
  });
});

describe('money', () => {
  it('trade pays both sides each cycle; tribute moves from payer to recipient; your side shows as credit lines', () => {
    const s = world();
    const a = on(s, 'venus');
    const b = on(s, 'earth');
    const t = signed(s, termsFor(s, 'trade', a.id, b.id));
    const [ca, cb] = [a.credits, b.credits];
    s.year += 1;
    diplomacyTick(s);
    expect(a.credits).toBeGreaterThanOrEqual(ca + tradeIncomeOf(s, t));
    expect(b.credits).toBeGreaterThanOrEqual(cb + tradeIncomeOf(s, t));
    const c = on(s, 'jupiter');
    c.fleet = 50;
    signed(s, termsFor(s, 'tribute', s.playerClanId, c.id, s.playerClanId));
    signed(s, termsFor(s, 'trade', s.playerClanId, a.id));
    const lines = diplomacyCreditLines(s);
    expect(lines.find((l) => l.label.startsWith('Tribute from'))?.value).toBeGreaterThan(0);
    expect(lines.find((l) => l.label.startsWith('Trade with'))?.value).toBeGreaterThan(0);
  });
});

describe('AI houses make their own deals', () => {
  it('over time AI houses sign treaties with each other, deterministically, and only between living landed houses', () => {
    const run = () => {
      const s = world(7);
      for (let i = 0; i < 30; i++) {
        s.year += 1;
        diplomacyTick(s);
      }
      return s;
    };
    const s = run();
    const treaties = diplomacyOf(s).treaties;
    expect(treaties.length).toBeGreaterThan(0);
    for (const t of treaties) {
      expect(clanRegions(s, t.a).length).toBeGreaterThan(0);
      expect(clanRegions(s, t.b).length).toBeGreaterThan(0);
      expect(t.until).toBeGreaterThan(s.year);
    }
    for (const k of Object.values(s.clans)) expect(treatiesOf(s, k.id).length).toBeLessThanOrEqual(8);
    expect(JSON.stringify(diplomacyOf(run()))).toBe(JSON.stringify(diplomacyOf(s)));
  });

  it('a frightened weak house offers tribute to a hostile giant next door', () => {
    const s = world();
    const weak = on(s, 'venus');
    const giant = on(s, 'venus', [weak.id]);
    giant.fleet = 900;
    weak.fleet = 40;
    ch(s, weak.headId)!.traits.push('craven');
    const gh = ch(s, giant.headId)!,
      wh = ch(s, weak.headId)!;
    relationOf(s, gh.id, wh.id, true)!.feelings.push({ why: 'Despises them', value: -80, decay: 0, year: s.year });
    const deal = bestDeal(s, weak.id);
    expect(deal?.terms).toMatchObject({ kind: 'tribute', a: giant.id, b: weak.id });
  });
});

describe('the offer event', () => {
  it('only weighty offers interrupt you; trade and non-aggression offers wait quietly', () => {
    const def = DIPLOMACY_EVENTS[0];
    const s = world();
    const c = on(s, 'earth');
    proposeTreaty(s, c.id, s.playerClanId, termsFor(s, 'trade', c.id, s.playerClanId));
    expect(offersToYou(s)).toHaveLength(1);
    expect(def.when!(s)).toBe(false);
  });

  it('fires while a weighty offer waits, every option resolves, and describing it changes nothing', () => {
    const def = DIPLOMACY_EVENTS[0];
    for (const i of def.choices.keys()) {
      const s = world();
      const c = on(s, 'earth');
      proposeTreaty(s, c.id, s.playerClanId, termsFor(s, 'defensive', c.id, s.playerClanId));
      expect(def.when!(s)).toBe(true);
      expect(queueEvent(s, def)).toBe(true);
      const ctx = buildCtx(s, s.pending.at(-1) as Pend);
      expect(def.text(ctx)).not.toMatch(/undefined|NaN/);
      const before = JSON.stringify(s);
      for (const ch of def.choices) {
        ch.describe(ctx);
        ch.available?.(ctx);
        ch.why?.(ctx);
      }
      expect(JSON.stringify(s)).toBe(before);
      expect(def.choices[i].run(ctx)).not.toMatch(/undefined|NaN/);
      expect(offersToYou(s)).toHaveLength(0);
      expect(treatyBetween(s, c.id, s.playerClanId)?.kind).toBe(i === 0 ? 'defensive' : undefined);
    }
  });
});
