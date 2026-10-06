import { describe, expect, it } from 'vitest';
import { ch, clanRegions, setOwner } from './core';
import type { TreatyTerms } from './diplomacyTypes';
import { buildCtx, EVENT_BY_ID, queueEvent } from './events';
import { ENVOY_GAP } from './eventsDiplomacy';
import {
  answerUltimatum,
  defendedMight,
  demandableRegion,
  fearedNeighbour,
  foreignPolicyTick,
  foreignPolicyOf,
  issueUltimatum,
  migrateForeignPolicy,
  pendingUltimatum,
  predecessorTreaty,
  repudiateBlocker,
  repudiateTreaty,
  REPUDIATE_TRUST,
  REPUDIATE_WINDOW,
  risingPower,
  rivalsOf,
  stanceOf,
  ultimatumAcceptance,
  ultimatumBlocker,
  ultimatumTarget,
  type WithForeignPolicy,
} from './foreignPolicy';
import { houseRelation, migrateDiplomacy, rememberHouse, trustOf } from './houseRelations';
import { aiPlans } from './aiIntrigue';
import { realmOf } from './realmDefence';
import { declareWithGoal } from './war';
import { peaceTributeTick } from './warGoals';
import { chance } from './rng';
import { aiResolvePromises, bestDeal, proposeTreaty, termsFor, treatyBetween } from './treaties';
import type { Clan, GameState, Pending } from './types';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';

type Pend = Extract<Pending, { kind: 'event' }>;
const PERSONAL = [
  'brave',
  'craven',
  'wrathful',
  'honest',
  'deceitful',
  'greedy',
  'arrogant',
  'ambitious',
  'paranoid',
  'just',
  'content',
  'shy',
  'zealous',
  'diligent',
];

/** You govern on Mars; every landed AI ruler is a free adult with 100 ships and no strong leanings. */
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
    k.liege = 'none';
  }
  migrateDiplomacy(s);
  migrateForeignPolicy(s);
  return s;
}
/** Give yourself a second Mars region, so one can be demanded of you. */
function secondRegion(s: GameState, not: string) {
  if (clanRegions(s, s.playerClanId).length >= 2) return;
  const extra = Object.values(s.regions).find((r) => r.planetId === 'mars' && !r.capital && r.owner !== s.playerClanId && r.owner !== not)!;
  setOwner(s, extra, s.playerClanId);
}
const visible = (def: (typeof EVENT_BY_ID)[string], ctx: ReturnType<typeof buildCtx>) => def.choices.filter((c) => !c.show || c.show(ctx)).map((c) => c.label);
/** A landed AI house of the planet with at least two regions (so one can be demanded). */
function on(s: GameState, planet: string, skip: string[] = []): Clan {
  return Object.values(s.clans).find((k) => !k.isPlayer && k.planetId === planet && clanRegions(s, k.id).length >= 2 && !skip.includes(k.id))!;
}
function lord(s: GameState, k: Clan, ...traits: string[]) {
  ch(s, k.headId)!.traits.push(...traits);
}
function sign(s: GameState, terms: TreatyTerms) {
  s.diplomacy!.treaties.push({ ...terms, id: 'tf' + s.diplomacy!.treaties.length, signed: s.year, until: s.year + terms.years });
}
/** A bully and a victim on the same world, the bully ambitious, wrathful and four times stronger. */
function bully(s: GameState) {
  const big = on(s, 'venus');
  const small = on(s, 'venus', [big.id]);
  big.fleet = 400;
  lord(s, big, 'ambitious', 'wrathful');
  return { big, small };
}

describe('stances', () => {
  it('a house’s stance comes from its lord, with reasons; you have none', () => {
    const s = world();
    const k = on(s, 'venus');
    expect(stanceOf(s, k.id)?.kind).toBe('cautious');
    lord(s, k, 'ambitious', 'wrathful');
    expect(stanceOf(s, k.id)).toMatchObject({ kind: 'expansionist' });
    expect(stanceOf(s, k.id)!.reasons.map((r) => r.label)).toEqual(expect.arrayContaining(['Ambitious', 'Wrathful']));
    const m = on(s, 'earth');
    lord(s, m, 'greedy');
    expect(stanceOf(s, m.id)?.kind).toBe('mercantile');
    expect(stanceOf(s, s.playerClanId)).toBeUndefined();
  });

  it('an honourable lord all but never breaks a pact to attack', () => {
    let broke = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = world();
      const a = on(s, 'venus');
      const d = on(s, 'earth');
      lord(s, a, 'honest', 'just');
      sign(s, termsFor(s, 'nonAggression', a.id, d.id));
      s.seed = seed;
      if (aiResolvePromises(s, a.id, d.id)) broke++;
    }
    expect(stanceOf(world(), on(world(), 'venus').id)).toBeTruthy();
    expect(broke).toBeLessThanOrEqual(4);
  });
});

describe('the balance of power', () => {
  it('a house far stronger than the rest is a rising power its neighbours fear', () => {
    const s = world();
    const { big } = bully(s);
    expect(risingPower(s, big.id)).toBe(true);
    const neighbour = on(s, 'venus', [big.id]);
    expect(fearedNeighbour(s, neighbour.id)).toBe(big.id);
    expect(houseRelation(s, neighbour.id, big.id).reasons.some((r) => r.label === 'Fears their growing power')).toBe(true);
  });

  it('neighbours of a rising power look for a defensive pact with each other', () => {
    const s = world();
    const { big } = bully(s);
    const pair = Object.values(s.clans).filter((k) => !k.isPlayer && k.id !== big.id && k.planetId === 'venus' && clanRegions(s, k.id).length);
    const deals = pair.map((k) => bestDeal(s, k.id)).filter(Boolean);
    expect(deals.some((d) => d!.terms.kind === 'defensive')).toBe(true);
  });

  it('reading stances, power and demands changes nothing', () => {
    const s = world();
    const { big, small } = bully(s);
    const before = JSON.stringify(s);
    stanceOf(s, big.id);
    risingPower(s, big.id);
    ultimatumTarget(s, big.id);
    ultimatumAcceptance(s, big.id, small.id, { kind: 'tribute', amount: 30, years: 10 });
    pendingUltimatum(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('ultimatums', () => {
  it('an expansionist bully picks a weak neighbour; a neighbour with a strong treaty partner is spared', () => {
    const s = world();
    const { big, small } = bully(s);
    expect(ultimatumTarget(s, big.id)?.to).toBeTruthy();
    for (const k of Object.values(s.clans)) if (k.id !== big.id && k.planetId === 'venus') k.fleet = 100;
    const target = ultimatumTarget(s, big.id)!.to;
    const protector = on(s, 'earth');
    protector.fleet = 900;
    sign(s, termsFor(s, 'defensive', protector.id, target));
    expect(defendedMight(s, target, big.id)).toBeGreaterThan(400);
    expect(ultimatumTarget(s, big.id)?.to).not.toBe(target);
    void small;
  });

  it('a victim who gives in loses the region (or pays tribute); one who refuses is remembered, never attacked over something else', () => {
    let seen = { cede: false, tribute: false, refused: false };
    for (let seed = 1; seed < 200 && !(seen.cede && seen.tribute && seen.refused); seed++) {
      const s = world();
      const { big, small } = bully(s);
      const region = demandableRegion(s, small.id)!;
      const kind = seed % 2 ? 'cede' : 'tribute';
      const demand = kind === 'cede' ? ({ kind, regionId: region.id } as const) : ({ kind, amount: 40, years: 10 } as const);
      s.seed = seed;
      const result = issueUltimatum(s, big.id, small.id, demand);
      if (result === 'yielded' && kind === 'cede') {
        seen.cede = true;
        expect(s.regions[region.id].owner).toBe(big.id);
        expect(small.memories?.length ?? 0).toBe(0); // AI-to-AI memories live in the diplomacy record
        expect(s.diplomacy!.memories.some((m) => m.observer === small.id && m.subject === big.id && m.text.includes('Yielded'))).toBe(true);
      }
      if (result === 'yielded' && demand.kind === 'tribute') {
        seen.tribute = true;
        expect(treatyBetween(s, big.id, small.id, 'tribute')).toBeUndefined();
        expect(s.peaceTributes).toEqual([expect.objectContaining({ from: small.id, to: big.id, amount: 40, until: s.year + demand.years + 1 })]);
      }
      if (result === 'refused') {
        seen.refused = true;
        expect(s.diplomacy!.memories.some((m) => m.observer === big.id && m.subject === small.id && m.text === 'Defied our demands')).toBe(true);
        // The war over exactly this demand is the war lane's (declareWithGoal); no other war stands in for it.
        expect(s.aiWars.find((w) => w.attacker === big.id && w.defender === small.id)).toMatchObject({ goal: demand, cb: 'feud' });
        expect(s.warJustifications).toEqual([expect.objectContaining({ from: big.id, to: small.id, goal: demand, used: true })]);
      }
      expect(ultimatumBlocker(s, big.id, small.id, demand)).toBeTruthy(); // their cooldown
    }
    seen = { ...seen };
    expect(seen).toEqual({ cede: true, tribute: true, refused: true });
  });

  it('you are asked: give in and the region goes; refuse and they remember it', () => {
    for (const give of [true, false]) {
      const s = world();
      const big = on(s, 'earth');
      big.fleet = 600;
      lord(s, big, 'ambitious', 'wrathful');
      const mine = clanRegions(s, s.playerClanId);
      if (mine.length < 2) {
        // Give yourself a second region so one can be demanded.
        const extra = Object.values(s.regions).find((r) => r.planetId === 'mars' && !r.capital && r.owner !== s.playerClanId && r.owner !== big.id)!;
        setOwner(s, extra, s.playerClanId);
      }
      const region = demandableRegion(s, s.playerClanId)!;
      expect(realmOf(s, big.id)).not.toBe(realmOf(s, s.playerClanId));
      expect(issueUltimatum(s, big.id, s.playerClanId, { kind: 'cede', regionId: region.id })).toBe('pending');
      const def = EVENT_BY_ID.ultimatum;
      expect(def.when!(s)).toBe(true);
      expect(queueEvent(s, def)).toBe(true);
      const ctx = buildCtx(s, s.pending.at(-1) as Pend);
      expect(def.text(ctx)).not.toMatch(/undefined|NaN/);
      const before = JSON.stringify(s);
      for (const c of def.choices) c.describe(ctx);
      expect(JSON.stringify(s)).toBe(before);
      def.choices[give ? 0 : 1].run(ctx);
      expect(pendingUltimatum(s)).toBeUndefined();
      if (give) expect(s.regions[region.id].owner).toBe(big.id);
      else {
        expect(s.regions[region.id].owner).toBe(s.playerClanId);
        expect(big.memories?.some((m) => m.text === 'Defied our demands')).toBe(true);
        expect(s.wars.find((w) => w.enemy === big.id)).toMatchObject({ goal: { kind: 'cede', regionId: region.id }, cb: 'feud', playerAttacker: false });
      }
    }
  });

  it('your own demand: they give in, or refuse (no free claim: the war lane justifies a war over exactly it)', () => {
    let seen = { gave: false, refused: false };
    for (let seed = 1; seed < 80 && !(seen.gave && seen.refused); seed++) {
      const s = world();
      const target = on(s, 'venus');
      s.fleet = 500;
      const region = demandableRegion(s, target.id)!;
      s.seed = seed;
      const r = issueUltimatum(s, s.playerClanId, target.id, { kind: 'cede', regionId: region.id });
      if (r === 'yielded') {
        seen.gave = true;
        expect(s.regions[region.id].owner).toBe(s.playerClanId);
      }
      if (r === 'refused') {
        seen.refused = true;
        expect(s.claims).not.toContain(region.id);
        expect(s.regions[region.id].owner).toBe(target.id);
        const justification = s.warJustifications!.find((j) => j.from === s.playerClanId && j.to === target.id)!;
        expect(justification.goal).toEqual({ kind: 'cede', regionId: region.id });
        expect(s.wars).toEqual([]);
        const prestige = s.prestige;
        expect(declareWithGoal(s, s.playerClanId, target.id, justification.goal, { justification: justification.id })).toBe(true);
        expect(s.prestige).toBe(prestige);
        expect(justification.used).toBe(true);
      }
    }
    seen = { ...seen };
    expect(seen).toEqual({ gave: true, refused: true });
  });

  it('you cannot threaten a treaty partner or a house of your own realm', () => {
    const s = world();
    const partner = on(s, 'venus');
    sign(s, termsFor(s, 'nonAggression', s.playerClanId, partner.id));
    expect(ultimatumBlocker(s, s.playerClanId, partner.id, { kind: 'tribute', amount: 30, years: 10 })).toMatch(/treaty/);
    const sworn = Object.values(s.clans).find((k) => !k.isPlayer && clanRegions(s, k.id).length && realmOf(s, k.id) === realmOf(s, s.playerClanId));
    if (sworn) expect(ultimatumBlocker(s, s.playerClanId, sworn.id, { kind: 'tribute', amount: 30, years: 10 })).toMatch(/realm/);
  });

  it('a captive ruler makes no demands, and the council answers those made of you', () => {
    const s = world();
    const big = on(s, 'earth');
    big.fleet = 600;
    secondRegion(s, big.id);
    const target = on(s, 'venus');
    s.characters[s.rulerId].prisonerOf = big.id;
    expect(ultimatumBlocker(s, s.playerClanId, target.id, { kind: 'tribute', amount: 30, years: 10 })).toMatch(/captive/);
    expect(['yielded', 'refused']).toContain(issueUltimatum(s, big.id, s.playerClanId, { kind: 'tribute', amount: 30, years: 10 }));
    expect(s.pending.some((p) => p.kind === 'notice' && p.title === 'Your Council Answers')).toBe(true);
    expect(pendingUltimatum(s)).toBeUndefined();
  });

  it('a regent answers for a child ruler, by the same odds', () => {
    const s = world();
    const big = on(s, 'earth');
    big.fleet = 600;
    s.characters[s.rulerId].born = s.year - 10;
    const extra = Object.values(s.regions).find((r) => r.planetId === 'mars' && !r.capital && r.owner !== s.playerClanId && r.owner !== big.id)!;
    setOwner(s, extra, s.playerClanId);
    const result = issueUltimatum(s, big.id, s.playerClanId, { kind: 'tribute', amount: 30, years: 10 });
    expect(['yielded', 'refused']).toContain(result);
    expect(s.pending.some((p) => p.kind === 'notice' && p.title === 'Your Regent Answers')).toBe(true);
    expect(answerUltimatum(s, true)).toBe(false);
  });
});

describe('the ultimatum record', () => {
  it('stale and repeated answers change nothing, and roll no dice', () => {
    const s = world();
    const big = on(s, 'earth');
    big.fleet = 600;
    secondRegion(s, big.id);
    const region = demandableRegion(s, s.playerClanId)!;
    expect(issueUltimatum(s, big.id, s.playerClanId, { kind: 'cede', regionId: region.id })).toBe('pending');
    const id = pendingUltimatum(s)!.id;
    let before = JSON.stringify(s);
    expect(answerUltimatum(s, false, 'ul-none')).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
    expect(answerUltimatum(s, true, id)).toBe(true);
    expect(s.regions[region.id].owner).toBe(big.id);
    before = JSON.stringify(s);
    expect(answerUltimatum(s, true, id)).toBe(false);
    expect(answerUltimatum(s, false, id)).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('a demand overtaken by events lapses: the event offers only a harmless way out', () => {
    const s = world();
    const big = on(s, 'earth');
    big.fleet = 600;
    secondRegion(s, big.id);
    const region = demandableRegion(s, s.playerClanId)!;
    issueUltimatum(s, big.id, s.playerClanId, { kind: 'cede', regionId: region.id });
    const def = EVENT_BY_ID.ultimatum;
    queueEvent(s, def);
    const ctx = buildCtx(s, s.pending.at(-1) as Pend);
    expect(visible(def, ctx)).toEqual(['Give in', 'Refuse']);
    setOwner(s, region, big.id); // they took it anyway
    expect(pendingUltimatum(s)).toBeUndefined();
    expect(visible(def, ctx)).toEqual(['Send the envoys home']);
    const before = JSON.stringify(s);
    def.choices.find((c) => c.label === 'Send the envoys home')!.run(ctx);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('two houses can each wait for your answer', () => {
    const s = world();
    const a = on(s, 'earth');
    const b = on(s, 'venus');
    a.fleet = b.fleet = 600;
    secondRegion(s, a.id);
    expect(issueUltimatum(s, a.id, s.playerClanId, { kind: 'tribute', amount: 30, years: 10 })).toBe('pending');
    expect(issueUltimatum(s, b.id, s.playerClanId, { kind: 'tribute', amount: 40, years: 10 })).toBe('pending');
    const first = pendingUltimatum(s)!;
    expect(first.from).toBe(a.id);
    answerUltimatum(s, true, first.id);
    expect(pendingUltimatum(s)?.from).toBe(b.id);
  });

  it('an old save gains an empty record, and migrating twice changes nothing', () => {
    const s = world();
    delete (s as WithForeignPolicy).foreignPolicy;
    expect(foreignPolicyOf(s).ultimatums).toEqual([]);
    migrateForeignPolicy(s);
    const once = JSON.stringify(s);
    migrateForeignPolicy(s);
    expect(JSON.stringify(s)).toBe(once);
    expect((s as WithForeignPolicy).foreignPolicy).toEqual({ ultimatums: [], heads: {} });
  });
});

describe('rivals', () => {
  it('a house names whoever it fears and hates, worst first, by public reasons only', () => {
    const s = world();
    const { big, small } = bully(s);
    const enemy = on(s, 'earth');
    rememberHouse(s, small.id, enemy.id, { text: 'A private shame nobody may know', value: -90 });
    const before = JSON.stringify(s);
    const rivals = rivalsOf(s, small.id);
    expect(JSON.stringify(s)).toBe(before);
    expect(rivals.length).toBeLessThanOrEqual(3);
    expect(rivals.find((r) => r.id === big.id)?.reasons.map((r) => r.label)).toContain('Fears their growing power');
    expect(rivals.find((r) => r.id === enemy.id)?.reasons.map((r) => r.label)).toContain('Cold relations');
    expect(JSON.stringify(rivals)).not.toContain('private shame');
  });

  it('your rivals are the houses set against you', () => {
    const s = world();
    const k = on(s, 'venus');
    rememberHouse(s, k.id, s.playerClanId, { text: 'Burned our fleet', value: -80 });
    expect(
      rivalsOf(s, s.playerClanId)
        .find((r) => r.id === k.id)
        ?.reasons.map((r) => r.label),
    ).toContain('Sworn rival');
    expect(rivalsOf(s, k.id).find((r) => r.id === s.playerClanId)).toBeTruthy();
  });
});

describe('envoys', () => {
  it('envoys interrupt you at most once in a while; later offers wait in Realm', () => {
    const s = world();
    const [x, y] = Object.values(s.clans).filter((k) => !k.isPlayer && clanRegions(s, k.id).length && k.planetId !== 'mars');
    const def = EVENT_BY_ID.treaty_offer;
    expect(proposeTreaty(s, x.id, s.playerClanId, termsFor(s, 'defensive', x.id, s.playerClanId))).toBe('pending');
    expect(def.when!(s)).toBe(true);
    queueEvent(s, def);
    s.cooldowns.treaty_offers = 0;
    s.diplomacy!.proposals = [];
    expect(proposeTreaty(s, y.id, s.playerClanId, termsFor(s, 'defensive', y.id, s.playerClanId))).toBe('pending');
    expect(def.when!(s)).toBe(false);
    s.year += ENVOY_GAP;
    s.diplomacy!.proposals[0].expires = s.year + 1;
    expect(def.when!(s)).toBe(true);
  });
});

/** Hand a house to another adult of its blood, with only the given leanings. */
function newLord(s: GameState, k: Clan, ...traits: string[]) {
  const heir = Object.values(s.characters).find((c) => c.clanId === k.id && c.died === undefined && c.id !== k.headId && s.year - c.born >= 20)!;
  heir.traits = heir.traits.filter((x) => !PERSONAL.includes(x)).concat(traits);
  heir.prisonerOf = undefined;
  k.headId = heir.id;
  return heir;
}

describe('a new lord reviews the treaties', () => {
  function pact() {
    const s = world();
    const a = on(s, 'venus');
    const b = on(s, 'earth');
    a.fleet = 600;
    b.fleet = 100;
    sign(s, termsFor(s, 'nonAggression', a.id, b.id));
    foreignPolicyTick(s); // the lords are noted: nobody has succeeded anyone yet
    return { s, a, b };
  }

  it('the first look at a house invents no succession', () => {
    const s = world();
    const a = on(s, 'venus');
    const b = on(s, 'earth');
    a.fleet = 600;
    lord(s, a, 'ambitious', 'wrathful');
    sign(s, termsFor(s, 'nonAggression', a.id, b.id));
    foreignPolicyTick(s);
    expect(treatyBetween(s, a.id, b.id, 'nonAggression')).toBeTruthy();
  });

  it('an expansionist heir repudiates a pact with a weaker neighbour: the partner minds, nobody else does', () => {
    const { s, a, b } = pact();
    const third = on(s, 'mercury') ?? on(s, 'jupiter');
    newLord(s, a, 'ambitious', 'wrathful');
    foreignPolicyTick(s);
    expect(treatyBetween(s, a.id, b.id, 'nonAggression')).toBeUndefined();
    expect(trustOf(s, b.id, a.id)).toBe(REPUDIATE_TRUST);
    expect(s.diplomacy!.memories.some((m) => m.observer === b.id && m.subject === a.id && m.text === 'Repudiated our non-aggression pact')).toBe(true);
    if (third) expect(trustOf(s, third.id, a.id)).toBe(0); // no breach: the oath was not theirs
    expect(s.log.some((l) => l.t.includes('repudiates the non-aggression pact'))).toBe(true);
  });

  it('an honourable heir keeps the word of the house, and so does a regency', () => {
    const { s, a, b } = pact();
    newLord(s, a, 'honest', 'just', 'ambitious');
    foreignPolicyTick(s);
    expect(treatyBetween(s, a.id, b.id, 'nonAggression')).toBeTruthy();
    const child = newLord(s, a, 'ambitious', 'wrathful');
    child.born = s.year - 8;
    foreignPolicyTick(s);
    expect(treatyBetween(s, a.id, b.id, 'nonAggression')).toBeTruthy();
  });

  it('a new lord tells you when they tear up your treaty', () => {
    const s = world();
    const a = on(s, 'venus');
    a.fleet = 600;
    s.fleet = 100;
    sign(s, termsFor(s, 'nonAggression', a.id, s.playerClanId));
    foreignPolicyTick(s);
    newLord(s, a, 'ambitious', 'wrathful');
    foreignPolicyTick(s);
    expect(treatyBetween(s, a.id, s.playerClanId, 'nonAggression')).toBeUndefined();
    expect(s.pending.some((p) => p.kind === 'notice' && p.title === 'A Treaty Repudiated')).toBe(true);
  });
});

describe('you may repudiate a predecessor’s treaty', () => {
  it('early in your reign, at a fraction of a breach; never one you signed yourself', () => {
    const s = world();
    const partner = on(s, 'venus');
    const reign = s.dynasty.rulers.find((r) => r.id === s.rulerId && r.to === undefined)!;
    reign.from = s.year;
    sign(s, termsFor(s, 'defensive', s.playerClanId, partner.id));
    const old = s.diplomacy!.treaties.at(-1)!;
    old.signed = s.year - 3;
    sign(s, termsFor(s, 'trade', s.playerClanId, partner.id));
    const mine = s.diplomacy!.treaties.at(-1)!;
    expect(predecessorTreaty(s, old.id)).toBe(true);
    expect(predecessorTreaty(s, mine.id)).toBe(false);
    expect(repudiateBlocker(s, mine.id)).toMatch(/yourself/);
    expect(repudiateBlocker(s, old.id)).toBeNull();
    const prestige = s.prestige;
    const before = partner.opinion;
    expect(repudiateTreaty(s, old.id)).toBe(true);
    expect(treatyBetween(s, s.playerClanId, partner.id, 'defensive')).toBeUndefined();
    expect(s.prestige).toBe(prestige);
    expect(partner.memories?.some((m) => m.text === 'Repudiated our defensive pact')).toBe(true);
    expect(trustOf(s, partner.id, s.playerClanId)).toBe(REPUDIATE_TRUST);
    expect(repudiateTreaty(s, old.id)).toBe(false);
    void before;
    reign.from = s.year - REPUDIATE_WINDOW - 1;
    mine.signed = reign.from - 1;
    expect(repudiateBlocker(s, mine.id)).toMatch(/first/);
  });

  it('a captive ruler cannot repudiate: nothing changes, not even the dice', () => {
    const s = world();
    const partner = on(s, 'venus');
    s.dynasty.rulers.find((r) => r.id === s.rulerId && r.to === undefined)!.from = s.year;
    sign(s, termsFor(s, 'defensive', s.playerClanId, partner.id));
    const old = s.diplomacy!.treaties.at(-1)!;
    old.signed = s.year - 1;
    s.characters[s.rulerId].prisonerOf = partner.id;
    const before = JSON.stringify(s);
    expect(repudiateBlocker(s, old.id)).toMatch(/captive/);
    expect(repudiateTreaty(s, old.id)).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('rivals plot', () => {
  it('a house plots against one it has a grave quarrel with, though the lords never met', () => {
    const s = world();
    const k = on(s, 'venus');
    const enemy = on(s, 'earth');
    k.credits = 1000;
    const before = aiPlans(s, k).filter((p) => p.target.id === enemy.headId);
    expect(before.some((p) => p.kind === 'assassinate')).toBe(false);
    rememberHouse(s, k.id, enemy.id, { text: 'Broke the defensive pact', value: -70 });
    expect(aiPlans(s, k).some((p) => p.target.id === enemy.headId && (p.kind === 'assassinate' || p.kind === 'sabotage'))).toBe(true);
  });

  it('a rising power next door invites sabotage', () => {
    const s = world();
    const { big, small } = bully(s);
    small.credits = 1000;
    expect(aiPlans(s, small).some((p) => p.kind === 'sabotage' && p.target.id === big.headId)).toBe(true);
  });
});

describe('integrated demand settlements', () => {
  it('accepted tribute uses one answer roll, no protection pact and only capped real payments', () => {
    for (const playerPays of [false, true]) {
      const s = world();
      const enemy = on(s, 'venus');
      const from = playerPays ? enemy.id : s.playerClanId;
      const to = playerPays ? s.playerClanId : enemy.id;
      const goal = { kind: 'tribute' as const, amount: 35, years: 3 };
      if (playerPays) {
        expect(issueUltimatum(s, from, to, goal)).toBe('pending');
        expect(answerUltimatum(s, true, pendingUltimatum(s)!.id)).toBe(true);
      } else {
        let seed = 1;
        for (; seed < 1000; seed++) {
          const probe = { seed };
          if (chance(probe, ultimatumAcceptance(s, from, to, goal).chance)) break;
        }
        expect(seed).toBeLessThan(1000);
        s.seed = seed;
        const probe = { seed };
        chance(probe, ultimatumAcceptance(s, from, to, goal).chance);
        expect(issueUltimatum(s, from, to, goal)).toBe('yielded');
        expect(s.seed).toBe(probe.seed);
      }
      expect(treatyBetween(s, from, to, 'tribute')).toBeUndefined();
      const obligation = s.peaceTributes![0];
      expect(obligation).toMatchObject({ from: to, to: from, amount: 35, until: s.year + 4 });
      for (let cycle = 0; cycle < 3; cycle++) {
        s.year++;
        if (playerPays) s.credits = 7;
        else enemy.credits = 7;
        const recipient = playerPays ? enemy.credits : s.credits;
        peaceTributeTick(s);
        expect(playerPays ? s.credits : enemy.credits).toBe(0);
        expect(playerPays ? enemy.credits : s.credits).toBe(recipient + 7);
        const once = JSON.stringify(s);
        peaceTributeTick(s);
        expect(JSON.stringify(s)).toBe(once);
      }
      s.year++;
      peaceTributeTick(s);
      expect(s.peaceTributes).toEqual([]);
    }
  });

  it('out-of-contract tribute terms change nothing and roll no dice', () => {
    const s = world();
    const enemy = on(s, 'venus');
    for (const goal of [
      { kind: 'tribute' as const, amount: 1001, years: 4 },
      { kind: 'tribute' as const, amount: 35, years: 21 },
      { kind: 'tribute' as const, amount: 0.5, years: 3 },
    ]) {
      const before = JSON.stringify(s);
      expect(issueUltimatum(s, s.playerClanId, enemy.id, goal)).toBeNull();
      expect(JSON.stringify(s)).toBe(before);
    }
  });
});

describe('integrated public state', () => {
  it('imposed tribute is a public rival reason only for its actual duration', () => {
    const s = world();
    const a = on(s, 'venus'),
      b = on(s, 'earth');
    s.peaceTributes = [{ id: 'owed', warId: 'accepted', from: a.id, to: b.id, amount: 35, started: s.year, until: s.year + 4 }];
    expect(rivalsOf(s, a.id).find((r) => r.id === b.id)?.reasons).toContainEqual({ label: 'Forced to pay them tribute' });
    s.year += 4;
    expect(rivalsOf(s, a.id).find((r) => r.id === b.id)?.reasons ?? []).not.toContainEqual({ label: 'Forced to pay them tribute' });
  });
  it('a saved ultimatum cannot be answered after the ruler becomes captive', () => {
    const s = world(),
      enemy = on(s, 'venus');
    expect(issueUltimatum(s, enemy.id, s.playerClanId, { kind: 'tribute', amount: 35, years: 4 })).toBe('pending');
    const id = pendingUltimatum(s)!.id;
    s.characters[s.rulerId].prisonerOf = enemy.id;
    const before = JSON.stringify(s);
    expect(answerUltimatum(s, true, id)).toBe(false);
    expect(answerUltimatum(s, false, id)).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('annual upkeep drops expired war warrants without inventing new history', () => {
    const s = world(),
      enemy = on(s, 'venus');
    s.warJustifications = [{ id: 'expired', from: s.playerClanId, to: enemy.id, goal: { kind: 'tribute', amount: 35, years: 4 }, expires: s.year }];
    foreignPolicyTick(s);
    expect(s.warJustifications!.some((j) => j.id === 'expired')).toBe(false);
  });
});
