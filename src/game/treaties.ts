import { houseFunds, moveFunds } from './warGoals';
// Treaties between houses (WAVE-5-DIPLOMACY.md slice 2). Any two houses, AI
// with AI as well as with you, can agree a non-aggression pact, a defensive
// pact, a trade agreement, a guarantee of independence or tribute. Every
// treaty has terms and an end. Trust grows while promises are kept (once a
// cycle per pair), and breaking any promise costs the breaker trust with
// every house, so an oathbreaker soon finds nobody to sign with. AI houses
// propose to each other and to you by the same rules; you are asked, never
// rolled for, and your offers to them are answered with explained odds.
//
// This module decides, records and pays AI houses. The war lane wires the
// rest (WAVE-5-CONTRACT.md): treatyWarBlocker / breakTreatiesForWar in
// declarations, pactDefenders in the realm call, diplomacyCreditLines in your
// economy, diplomacyTick in Age Up, and the saved state in the next version.

import { aiAmbition, ambitionHouse } from './aiAmbition';
import { pactMap, type Pacts } from './aiCourt';
import { threatOf } from './coalitions';
import { ageOf, canAct, clanRank, clanRegions, cooldownReady, hasTrait, log, newId, notice, setCooldown } from './core';
import type { Reason, Treaty, TreatyKind, TreatyProposal, TreatyTerms } from './diplomacyTypes';
import { recordDeed } from './epithets';
import {
  adjustTrust,
  diplomacyOf,
  ensureDiplomacy,
  headOf,
  houseMemoriesTick,
  houseName,
  houseRelation,
  mightOf,
  neighbours,
  pairKey,
  rememberHouse,
  treatiesBetween,
  treatyName,
  trustOf,
  type WithDiplomacy,
} from './houseRelations';
import { truceOf } from './peace';
import { REALM_SHARE, realmOf } from './realmDefence';
import { regencyOf } from './regency';
import { foreignPolicyTick, risingPower, stanceKind } from './foreignPolicy';
import { chance, clamp } from './rng';
import type { GameState } from './types';
import { committedShips } from './warAid';

// ── Numbers for Fin's review ──────────────────────────────────────────────

export const TREATY_YEARS: Record<TreatyKind, number> = { nonAggression: 10, defensive: 10, trade: 10, guarantee: 15, tribute: 10 };
/** At most this many live treaties per house. */
export const MAX_TREATIES = 8;
/** Trust each way per cycle a treaty holds (once per pair per cycle), and on a treaty honoured to its end. */
export const TRUST_PER_CYCLE = 2;
export const TRUST_ON_COMPLETION = 5;
/** A broken promise: what the victim, and every other house, now thinks of the breaker. */
export const BREACH_VICTIM = -60;
export const BREACH_EVERYONE = -15;
/** Breaking a trade agreement is a smaller betrayal. */
export const TRADE_BREACH_VICTIM = -20;
export const TRADE_BREACH_EVERYONE = -5;
/** Prestige you pay for a broken promise (the same as betraying an ally today). */
export const BREACH_PRESTIGE = 50;
/** Credits each side earns per cycle from a trade agreement: base plus this per rank of the smaller house. */
export const TRADE_BASE = 6;
export const TRADE_PER_RANK = 2;
/** Tribute owed per cycle: base plus this per rank of the payer. */
export const TRIBUTE_BASE = 15;
export const TRIBUTE_PER_RANK = 10;
/** How much stronger a protector or tribute recipient must be. */
export const STRONGER = 1.5;
/** The chance an AI house looks for a new treaty in a cycle. */
export const AI_DIPLOMACY_RATE = 0.12;
/** Offers to you that may wait at once, and how long each waits. */
export const MAX_OFFERS = 2;
export const OFFER_YEARS = 4;
/** Offers weighty enough to interrupt you with envoys at court; the rest wait in Realm's list of envoys. */
export const URGENT_OFFERS: TreatyKind[] = ['defensive', 'guarantee', 'tribute'];
export function urgentOffers(s: GameState): TreatyProposal[] {
  return offersToYou(s).filter((p) => URGENT_OFFERS.includes(p.kind));
}
/** After an envoy reaches you, the next waits this many cycles, so offers never crowd out your other news. */
export const OFFER_GAP = 3;

const PROMISES: TreatyKind[] = ['nonAggression', 'defensive', 'guarantee', 'tribute'];

// ── Reading (never changes anything) ──────────────────────────────────────

/** Live treaties of a house. */
export function treatiesOf(s: GameState, id: string): Treaty[] {
  return diplomacyOf(s).treaties.filter((t) => t.until > s.year && (t.a === id || t.b === id));
}

export function treatyBetween(s: GameState, a: string, b: string, kind?: TreatyKind): Treaty | undefined {
  return treatiesBetween(s, a, b, kind)[0];
}

/** Offers waiting for your answer. */
export function offersToYou(s: GameState): TreatyProposal[] {
  return diplomacyOf(s).proposals.filter((p) => p.to === s.playerClanId && p.expires > s.year);
}

export function tributeAmount(s: GameState, payer: string): number {
  return TRIBUTE_BASE + TRIBUTE_PER_RANK * Math.max(1, clanRank(s, payer));
}

export function tradeIncomeOf(s: GameState, t: Treaty): number {
  return TRADE_BASE + TRADE_PER_RANK * Math.max(1, Math.min(clanRank(s, t.a), clanRank(s, t.b)));
}

/** Standard terms for a kind between a proposer and a recipient, with the stronger side as `a` where it matters. */
export function termsFor(s: GameState, kind: TreatyKind, proposer: string, recipient: string, protectorOrRecipient = proposer): TreatyTerms {
  const years = TREATY_YEARS[kind];
  if (kind === 'guarantee') {
    const b = protectorOrRecipient === proposer ? recipient : proposer;
    return { kind, a: protectorOrRecipient, b, years };
  }
  if (kind === 'tribute') {
    const b = protectorOrRecipient === proposer ? recipient : proposer;
    return { kind, a: protectorOrRecipient, b, years, amount: tributeAmount(s, b) };
  }
  return { kind, a: proposer, b: recipient, years };
}

function freeAdultHead(s: GameState, id: string): string | null {
  const head = headOf(s, id);
  if (!head) return 'Nobody leads the house.';
  if (head.prisonerOf) return 'Their ruler is a captive.';
  if (ageOf(s, head) < 16 || regencyOf(s, id)) return 'A regent will not bind the house.';
  return null;
}

function atWar(s: GameState, a: string, b: string): boolean {
  if (a === s.playerClanId || b === s.playerClanId) return s.wars.some((w) => w.enemy === (a === s.playerClanId ? b : a));
  return s.aiWars.some((w) => (w.attacker === a && w.defender === b) || (w.attacker === b && w.defender === a));
}

/** Why these terms cannot be agreed now; null if they can. Pure. */
export function treatyBlocker(s: GameState, proposer: string, recipient: string, terms: TreatyTerms): string | null {
  if (s.gameOver) return 'The dynasty has ended.';
  if (proposer === recipient || !s.clans[proposer] || !s.clans[recipient]) return 'Choose another house.';
  if (!((terms.a === proposer && terms.b === recipient) || (terms.a === recipient && terms.b === proposer))) return 'These terms are for other houses.';
  if (!clanRegions(s, proposer).length || !clanRegions(s, recipient).length) return 'Only a landed house can sign treaties.';
  if (proposer === s.playerClanId && !canAct(s)) return 'A regency signs no treaties.';
  for (const id of [proposer, recipient]) {
    if (id === s.playerClanId) continue;
    const why = freeAdultHead(s, id);
    if (why) return why;
  }
  if (atWar(s, proposer, recipient)) return 'You are at war: make peace first.';
  if (!Number.isInteger(terms.years) || terms.years < 1 || terms.years > 30) return 'Treaties run from 1 to 30 cycles.';
  if (treatiesBetween(s, proposer, recipient, terms.kind).length) return `A ${treatyName(terms.kind).toLowerCase()} already stands.`;
  if ((terms.kind === 'guarantee' || terms.kind === 'tribute') && mightOf(s, terms.a) < mightOf(s, terms.b) * STRONGER)
    return terms.kind === 'guarantee' ? 'Only a much stronger house can guarantee another.' : 'Tribute flows from a much weaker house.';
  if (terms.kind === 'tribute' && !(terms.amount && terms.amount > 0)) return 'Tribute needs an amount.';
  for (const id of [proposer, recipient]) if (treatiesOf(s, id).length >= MAX_TREATIES) return `House ${s.clans[id].name} has as many treaties as it can keep.`;
  if (proposer === s.playerClanId && !cooldownReady(s, `treaty:${recipient}`)) return 'Your envoys were there this cycle already.';
  return null;
}

function hasDesigns(s: GameState, on: string, by: string): boolean {
  if (by === s.playerClanId || !s.clans[by]) return false;
  const a = aiAmbition(s, s.clans[by]);
  return (a.kind === 'conquest' || a.kind === 'revenge' || a.kind === 'crusade') && ambitionHouse(s, a) === on;
}

/** A third house both have reason to fear: a threatening neighbour of both, one at war with either, or one both despise. */
function commonThreat(s: GameState, x: string, y: string, pacts?: Pacts): string | undefined {
  for (const z of Object.keys(s.clans)) {
    if (z === x || z === y || !clanRegions(s, z).length) continue;
    if (threatOf(s, z) >= 30 && neighbours(s, z, x) && neighbours(s, z, y)) return z;
    if (risingPower(s, z) && neighbours(s, z, x) && neighbours(s, z, y)) return z;
    if (atWar(s, x, z) || atWar(s, y, z)) return z;
    if (houseRelation(s, x, z, pacts).value <= -30 && houseRelation(s, y, z, pacts).value <= -30) return z;
  }
  return undefined;
}

/** A rising power next to both houses, if any: the cheap first question before commonThreat. */
function risingThreat(s: GameState, x: string, y: string): string | undefined {
  for (const z of Object.keys(s.clans)) if (z !== x && z !== y && risingPower(s, z) && neighbours(s, z, x) && neighbours(s, z, y)) return z;
  return undefined;
}

/**
 * How likely `recipient` is to agree to `proposer`'s terms, and why. Pure: no
 * dice. You are never rolled for: offers to you wait for your answer.
 */
export function treatyAcceptance(s: GameState, proposer: string, recipient: string, terms: TreatyTerms, pacts?: Pacts): { chance: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  const rel = houseRelation(s, recipient, proposer, pacts).value;
  const trust = trustOf(s, recipient, proposer);
  const head = headOf(s, recipient);
  const has = (t: string) => !!head && hasTrait(head, t);
  let p = 0;
  const add = (label: string, n: number) => {
    p += n;
    if (Math.round(n * 100)) reasons.push({ label, value: Math.round(n * 100) });
  };
  const mp = mightOf(s, proposer),
    mr = Math.max(1, mightOf(s, recipient));
  switch (terms.kind) {
    case 'nonAggression':
      add('Base', 0.25);
      if (mp > mr * 1.3) add('Fears your fleet', 0.15);
      if (mr > mp * 1.5) add('Prefers to keep its options open', -0.2);
      if (hasDesigns(s, proposer, recipient)) add('Has designs on your lands', -0.3);
      break;
    case 'defensive': {
      add('Base', -0.05);
      const z = commonThreat(s, proposer, recipient, pacts);
      if (z) add(`Both fear House ${s.clans[z].name}`, 0.25);
      if (neighbours(s, proposer, recipient)) add('Neighbours', 0.05);
      if (rel < 10) add('Not close enough for a pact', -0.2);
      break;
    }
    case 'trade':
      add('Base', 0.3);
      if (has('greedy')) add('Greedy: likes the money', 0.15);
      if (s.clans[proposer].planetId !== s.clans[recipient].planetId) add('Goods from another world', 0.05);
      break;
    case 'guarantee':
      if (terms.a === proposer) {
        add('Base: protection offered', 0.45);
        if (has('arrogant')) add('Too proud to need protection', -0.15);
      } else {
        add('Base: asked to protect', 0.1);
        if (has('ambitious')) add('Likes the influence', 0.1);
      }
      break;
    case 'tribute':
      if (terms.b === proposer) {
        add('Base: tribute offered', 0.6);
        if (hasDesigns(s, proposer, recipient)) add('Would rather take your lands', -0.4);
      } else {
        const ratio = mp / mr;
        add('Base: tribute demanded', 0);
        add(`Fears your fleet (${ratio.toFixed(1)}x)`, clamp((ratio - STRONGER) * 0.2, 0, 0.5));
        if (has('craven')) add('Craven', 0.2);
        if (has('arrogant') || has('ambitious')) add('Too proud to pay', -0.15);
      }
      break;
  }
  const stance = stanceKind(s, recipient);
  if (stance === 'honourable' && (terms.kind === 'defensive' || terms.kind === 'nonAggression')) add('Honourable: values a promise', 0.05);
  if (stance === 'mercantile' && terms.kind === 'trade') add('Mercantile: lives by trade', 0.15);
  if (stance === 'expansionist' && terms.kind === 'nonAggression') add('Wants a free hand', -0.15);
  if (stance === 'planetFirst' && terms.kind !== 'trade' && s.clans[proposer].planetId !== s.clans[recipient].planetId) add('Distrusts outsiders', -0.1);
  // A schemer happily signs a pact with a neighbour it means to betray. It looks keen; it says nothing of why.
  if (stance === 'schemer' && terms.kind === 'nonAggression' && hasDesigns(s, proposer, recipient)) add('Keen to sign', 0.25);
  if (risingPower(s, proposer) && terms.kind !== 'tribute' && !(terms.kind === 'guarantee' && terms.b === proposer)) add('Wary of your growing power', -0.15);
  add('How they regard you', rel / 150);
  if (trust) add(trust > 0 ? 'Trusts your word' : 'Remembers broken promises', trust / 250);
  if (has('paranoid')) add('Paranoid', -0.1);
  return { chance: clamp(p, 0.02, 0.95), reasons };
}

// ── Making and breaking ───────────────────────────────────────────────────

function involvesYou(s: GameState, t: TreatyTerms): boolean {
  return t.a === s.playerClanId || t.b === s.playerClanId;
}

function describe(s: GameState, t: TreatyTerms): string {
  switch (t.kind) {
    case 'guarantee':
      return `${houseName(s, t.a)} guarantees the independence of ${houseName(s, t.b)}`;
    case 'tribute':
      return `${houseName(s, t.b)} pays ${houseName(s, t.a)} ${t.amount} credits a cycle in tribute`;
    default:
      return `${houseName(s, t.a)} and ${houseName(s, t.b)} sign a ${treatyName(t.kind).toLowerCase()}`;
  }
}

/** Record agreed terms (an accepted offer, or tribute exacted by an ultimatum). */
export function signTreaty(s: GameState, terms: TreatyTerms): Treaty {
  return sign(s, terms);
}

function sign(s: GameState, terms: TreatyTerms): Treaty {
  const d = ensureDiplomacy(s);
  const t: Treaty = { ...terms, id: newId(s, 't'), signed: s.year, until: s.year + terms.years };
  d.treaties.push(t);
  if (involvesYou(s, t)) log(s, `${describe(s, t)}, until ${t.until}.`, 'good');
  else if (t.kind !== 'trade' && t.kind !== 'nonAggression') log(s, `${describe(s, t)}.`, 'news');
  return t;
}

/**
 * Offer terms. Your offer to an AI house is answered at once, with one roll
 * at the odds shown. An AI house's offer to you waits for your answer. Between
 * AI houses, one roll. Returns what happened, or null if the terms could not
 * be offered.
 */
export function proposeTreaty(s: GameState, proposer: string, recipient: string, terms: TreatyTerms): 'signed' | 'refused' | 'pending' | null {
  if (treatyBlocker(s, proposer, recipient, terms)) return null;
  if (recipient === s.playerClanId) {
    if (!cooldownReady(s, 'treaty_offers') || offersToYou(s).length >= MAX_OFFERS) return null;
    setCooldown(s, 'treaty_offers', OFFER_GAP);
    const d = ensureDiplomacy(s);
    d.proposals = d.proposals.filter((p) => p.from !== proposer);
    d.proposals.push({ ...terms, id: newId(s, 'tp'), from: proposer, to: recipient, year: s.year, expires: s.year + OFFER_YEARS });
    return 'pending';
  }
  if (proposer === s.playerClanId) setCooldown(s, `treaty:${recipient}`);
  const yes = chance(s, treatyAcceptance(s, proposer, recipient, terms).chance);
  if (yes) {
    sign(s, terms);
    return 'signed';
  }
  if (proposer === s.playerClanId) log(s, `House ${s.clans[recipient].name} declines your ${treatyName(terms.kind).toLowerCase()}.`, 'info');
  return 'refused';
}

/** Why you cannot accept an offer now (revalidated against today's houses and terms); null if you can. Pure. */
export function offerBlocker(s: GameState, proposalId: string): string | null {
  const p = offersToYou(s).find((x) => x.id === proposalId);
  if (!p) return 'The offer has lapsed.';
  if (!canAct(s)) return 'A regency signs no treaties.';
  return treatyBlocker(s, p.from, p.to, p);
}

/** Your answer to an AI house's offer. Declining is always possible, and remembered a little. */
export function answerTreaty(s: GameState, proposalId: string, accept: boolean): boolean {
  const p = offersToYou(s).find((x) => x.id === proposalId);
  if (!p || (accept && offerBlocker(s, proposalId))) return false;
  const d = ensureDiplomacy(s);
  d.proposals = d.proposals.filter((x) => x.id !== proposalId);
  if (accept) sign(s, p);
  else rememberHouse(s, p.from, s.playerClanId, { text: `Turned down our ${treatyName(p.kind).toLowerCase()}`, value: -5 });
  return true;
}

export function breakTreatyBlocker(s: GameState, breaker: string, treatyId: string): string | null {
  const t = diplomacyOf(s).treaties.find((x) => x.id === treatyId && x.until > s.year);
  if (!t) return 'No such treaty stands.';
  if (t.a !== breaker && t.b !== breaker) return 'Not your treaty to break.';
  if (!canActHouse(s, breaker)) return 'A free adult ruler must answer for this treaty.';
  return null;
}

/**
 * Break a treaty. A broken promise costs the breaker the victim's trust, a
 * little of every other house's, and a memory the victim will keep (grave
 * for abandoning a defensive pact or guarantee). Ending a trade agreement
 * early is a smaller betrayal.
 */
export function breakTreaty(s: GameState, breaker: string, treatyId: string, why?: string, charge = true): boolean {
  if (breakTreatyBlocker(s, breaker, treatyId)) return false;
  const d = ensureDiplomacy(s);
  const t = d.treaties.find((x) => x.id === treatyId)!;
  d.treaties = d.treaties.filter((x) => x !== t);
  const victim = t.a === breaker ? t.b : t.a;
  const promise = PROMISES.includes(t.kind);
  adjustTrust(s, victim, breaker, promise ? BREACH_VICTIM : TRADE_BREACH_VICTIM);
  for (const id of Object.keys(s.clans))
    if (id !== victim && id !== breaker && clanRegions(s, id).length) adjustTrust(s, id, breaker, promise ? BREACH_EVERYONE : TRADE_BREACH_EVERYONE);
  const abandoned = t.kind === 'defensive' || t.kind === 'guarantee';
  rememberHouse(s, victim, breaker, {
    text: why ?? `Broke the ${treatyName(t.kind).toLowerCase()}`,
    value: abandoned ? -45 : promise ? -30 : -10,
    decay: abandoned ? undefined : 0.05,
    grave: abandoned || undefined,
  });
  if (promise && charge) recordDeed(s, headOf(s, breaker)?.id, 'oathsBroken');
  if (promise && charge) {
    if (breaker === s.playerClanId) s.prestige -= BREACH_PRESTIGE;
    else s.clans[breaker].prestige -= BREACH_PRESTIGE;
  }
  if (breaker === s.playerClanId || victim === s.playerClanId)
    log(s, `${houseName(s, breaker)} breaks the ${treatyName(t.kind).toLowerCase()} with ${houseName(s, victim)}.`, breaker === s.playerClanId ? 'bad' : 'war');
  else if (promise) log(s, `${houseName(s, breaker)} breaks its ${treatyName(t.kind).toLowerCase()} with ${houseName(s, victim)}.`, 'news');
  if (victim === s.playerClanId && promise)
    notice(s, 'A Promise Broken', `${houseName(s, breaker)} has broken the ${treatyName(t.kind).toLowerCase()} with your house.`, { icon: 'war', tone: 'bad' });
  return true;
}

/** What stops `attacker` declaring war on `defender` under its own promises; null if nothing. Pure. */
export function treatyWarBlocker(s: GameState, attacker: string, defender: string): string | null {
  for (const t of treatiesBetween(s, attacker, defender)) {
    if (t.kind === 'nonAggression') return `Bound by a non-aggression pact with ${houseName(s, defender)} until ${t.until}.`;
    if (t.kind === 'defensive') return `Bound by a defensive pact with ${houseName(s, defender)} until ${t.until}.`;
    if (t.kind === 'guarantee' && t.a === attacker) return `You guarantee the independence of ${houseName(s, defender)} until ${t.until}.`;
    if (t.kind === 'tribute' && t.a === attacker) return `${houseName(s, defender)} pays you tribute: you swore not to attack them.`;
  }
  return null;
}

/** Whether an AI lord would even consider breaking promises to attack: deceit, or ambition with a temper. Pure. */
export function mightBreakPromises(s: GameState, attacker: string): boolean {
  const h = headOf(s, attacker);
  return (
    !!h &&
    attacker !== s.playerClanId &&
    (hasTrait(h, 'deceitful') || (hasTrait(h, 'ambitious') && hasTrait(h, 'wrathful')) || stanceKind(s, attacker) === 'schemer')
  );
}

/**
 * An AI house about to declare on `defender` weighs its promises: with none
 * in the way it may go ahead; otherwise one roll (deceit, ambition, temper
 * and hatred make it likelier, honesty all but rules it out), and on a yes
 * every treaty between them is broken first. Returns whether it may declare.
 */
export function aiResolvePromises(s: GameState, attacker: string, defender: string): boolean {
  if (!treatyWarBlocker(s, attacker, defender)) return true;
  const h = headOf(s, attacker);
  if (!h || attacker === s.playerClanId || houseFunds(s, attacker, 'prestige') < treatyWarCost(s, attacker, defender)) return false;
  let p = 0.03;
  if (hasTrait(h, 'deceitful')) p += 0.3;
  if (hasTrait(h, 'ambitious')) p += 0.1;
  if (hasTrait(h, 'wrathful')) p += 0.05;
  if (houseRelation(s, attacker, defender).value <= -40) p += 0.1;
  if (stanceKind(s, attacker) === 'schemer') p += 0.15;
  if (hasTrait(h, 'honest')) p = 0.01;
  if (stanceKind(s, attacker) === 'honourable') p = 0.005;
  if (!chance(s, clamp(p, 0, 0.5))) return false;
  breakTreatiesForWar(s, attacker, defender);
  return true;
}

/** Declaring war anyway: every treaty between the two ends, each promise broken by the attacker. Returns how many. */
export function treatyWarCost(s: GameState, attacker: string, defender: string): number {
  return treatiesBetween(s, attacker, defender).some((t) => PROMISES.includes(t.kind)) ? BREACH_PRESTIGE : 0;
}
export function breakTreatiesForWar(s: GameState, attacker: string, defender: string): number {
  const treaties = treatiesBetween(s, attacker, defender);
  const cost = treatyWarCost(s, attacker, defender);
  let n = 0;
  for (const t of treaties) if (breakTreaty(s, attacker, t.id, 'Made war on us despite the ' + treatyName(t.kind).toLowerCase(), false)) n++;
  if (n && cost) {
    if (attacker === s.playerClanId) s.prestige -= cost;
    else s.clans[attacker].prestige -= cost;
    recordDeed(s, headOf(s, attacker)?.id, 'oathsBroken');
  }
  return n;
}

// ── Defending a partner (merged into the realm call by the war lane) ──────

export interface PactDefender {
  clanId: string;
  treatyId: string;
  kind: TreatyKind;
  /** 0 to 1; 0 when blocked. You are asked instead (`yours`). */
  chance: number;
  proposedShips: number;
  reasons: Reason[];
  blocker?: string;
  yours?: boolean;
}

function lentOrFighting(s: GameState, id: string): string | undefined {
  if (s.successionCrises.some((c) => c.stage === 'civil-war' && (c.clanId === id || c.contributions.some((p) => p.clanId === id && p.ships > 0))))
    return 'Committed to a civil war';
  if (committedShips(s, id)) return 'Their ships are already lent elsewhere';
  const fighting =
    id === s.playerClanId ? s.wars.length > 0 : s.wars.some((w) => w.enemy === id) || s.aiWars.some((w) => w.attacker === id || w.defender === id);
  return fighting ? 'Already at war' : undefined;
}

/**
 * Houses bound by treaty to defend `defender` against `attacker`: defensive
 * pact partners, a guarantor, a tribute recipient. A treaty partner who stays
 * home breaks its promise (pactRefused). Pure.
 */
export function pactDefenders(s: GameState, defender: string, attacker: string): PactDefender[] {
  const out = new Map<string, PactDefender>();
  for (const t of treatiesOf(s, defender)) {
    const partner =
      t.kind === 'defensive' ? (t.a === defender ? t.b : t.a) : (t.kind === 'guarantee' || t.kind === 'tribute') && t.b === defender ? t.a : undefined;
    if (!partner || partner === attacker || out.has(partner)) continue;
    const bond =
      t.kind === 'defensive'
        ? `Defensive pact with ${houseName(s, defender)}`
        : t.kind === 'guarantee'
          ? `Guarantees ${houseName(s, defender)}`
          : `Paid tribute by ${houseName(s, defender)}`;
    const head = headOf(s, partner);
    let block: string | undefined;
    if (!head) block = 'Nobody leads the house';
    else if (head.prisonerOf) block = 'Their ruler is a captive';
    else if (ageOf(s, head) < 16 || regencyOf(s, partner)) block = 'A regent will not risk the fleet';
    else if (realmOf(s, partner) === realmOf(s, attacker)) block = "Sworn to the attacker's realm";
    else if (truceOf(s, partner, attacker)) block = 'Sworn peace with the attacker';
    else block = lentOrFighting(s, partner) ?? (Math.floor(mightOf(s, partner) * REALM_SHARE) < 1 ? 'Too few ships to send' : undefined);
    const proposedShips = block ? 0 : Math.floor(mightOf(s, partner) * REALM_SHARE);
    if (block) {
      out.set(partner, {
        clanId: partner,
        treatyId: t.id,
        kind: t.kind,
        chance: 0,
        proposedShips,
        reasons: [{ label: bond }, { label: block }],
        blocker: block,
      });
      continue;
    }
    if (partner === s.playerClanId) {
      out.set(partner, { clanId: partner, treatyId: t.id, kind: t.kind, chance: 1, proposedShips, reasons: [{ label: bond }], yours: true });
      continue;
    }
    const reasons: Reason[] = [{ label: bond }];
    let p = 0.85;
    const temper: [string, number, string][] = [
      ['honest', 0.1, 'Keeps their oaths'],
      ['craven', -0.3, 'Craven: finds an excuse'],
      ['deceitful', -0.2, 'Deceitful: oaths are for others'],
    ];
    for (const [trait, n, label] of temper)
      if (hasTrait(head!, trait)) {
        p += n;
        reasons.push({ label });
      }
    const regard = houseRelation(s, partner, defender).value;
    p += clamp(regard / 200, -0.25, 0.1);
    if (Math.abs(regard) >= 10) reasons.push({ label: regard > 0 ? 'Values the alliance' : 'Cares little for them', value: regard });
    out.set(partner, { clanId: partner, treatyId: t.id, kind: t.kind, chance: clamp(p, 0.05, 0.98), proposedShips, reasons });
  }
  return [...out.values()];
}

/** A treaty partner who stays home when called has broken its promise. */
export function pactRefused(s: GameState, partner: string, treatyId: string): void {
  breakTreaty(s, partner, treatyId, 'Left us to face the invader alone');
}

// ── Money ─────────────────────────────────────────────────────────────────

/** Your credit lines from treaties, for the economy screen and Age Up (the war lane adds them to creditLines). Pure. */
export function diplomacyCreditLines(s: GameState, includeTribute = true): { label: string; value: number }[] {
  const lines: { label: string; value: number }[] = [];
  for (const t of treatiesOf(s, s.playerClanId)) {
    const other = t.a === s.playerClanId ? t.b : t.a;
    if (t.kind === 'trade') lines.push({ label: `Trade with House ${s.clans[other]?.name}`, value: tradeIncomeOf(s, t) });
    else if (includeTribute && t.kind === 'tribute' && t.a === s.playerClanId)
      lines.push({ label: `Tribute from House ${s.clans[other]?.name}`, value: Math.min(Math.max(0, t.amount ?? 0), houseFunds(s, t.b)) });
    else if (includeTribute && t.kind === 'tribute' && t.b === s.playerClanId)
      lines.push({ label: `Tribute to House ${s.clans[other]?.name}`, value: -Math.min(Math.max(0, t.amount ?? 0), houseFunds(s, t.b)) });
  }
  return lines;
}

/** Trade income plus both sides of each capped physical tribute transfer. */
function payments(s: GameState): void {
  if (s.cooldowns.treatyPayments === s.year) return;
  s.cooldowns.treatyPayments = s.year;
  for (const t of diplomacyOf(s).treaties) {
    if (t.until <= s.year) continue;
    if (t.kind === 'trade') {
      for (const id of [t.a, t.b]) if (id !== s.playerClanId && s.clans[id]) s.clans[id].credits += tradeIncomeOf(s, t);
    } else if (t.kind === 'tribute' && t.amount) {
      const paid = moveFunds(s, t.b, t.a, t.amount);
      if (t.a === s.playerClanId || t.b === s.playerClanId)
        log(s, 'Treaty tribute: ' + houseName(s, t.b) + ' pays ' + houseName(s, t.a) + ' ' + paid + ' of ' + t.amount + ' credits owed.', 'info');
    }
  }
}

// ── AI houses make their own deals ────────────────────────────────────────

interface Plan {
  to: string;
  terms: TreatyTerms;
  utility: number;
}

/**
 * The deal an AI house most wants this cycle, if any is worth asking for: what
 * it would gain, weighed by how likely the other side is to agree (an AI never
 * asks a hostile giant for a pact it would laugh at). Pure.
 */
export function bestDeal(s: GameState, x: string, pacts: Pacts = pactMap(s)): Plan | undefined {
  if (freeAdultHead(s, x) || treatiesOf(s, x).length >= MAX_TREATIES) return undefined;
  const head = headOf(s, x)!;
  const mx = Math.max(1, mightOf(s, x));
  const stance = stanceKind(s, x);
  const plans: Plan[] = [];
  const consider = (to: string, terms: TreatyTerms, utility: number) => {
    if (utility >= 10 && !treatyBlocker(s, x, to, terms)) plans.push({ to, terms, utility });
  };
  for (const y of Object.keys(s.clans)) {
    if (y === x || !clanRegions(s, y).length || atWar(s, x, y)) continue;
    if (y !== s.playerClanId && freeAdultHead(s, y)) continue;
    const rel = houseRelation(s, x, y, pacts).value;
    const my = Math.max(1, mightOf(s, y));
    const near = neighbours(s, x, y);
    // A realm already binds its houses to defend each other: pacts and guarantees are for houses of different realms.
    const apart = realmOf(s, x) !== realmOf(s, y);
    if (near && rel >= -15 && my >= mx * 1.5)
      consider(y, termsFor(s, 'nonAggression', x, y), (10 * Math.min(3, my / mx) + rel / 5 - 5) * (stance === 'expansionist' ? 0.5 : 1));
    const giantNear = apart && rel >= 5 ? risingThreat(s, x, y) : undefined;
    const threat = giantNear ?? (apart && rel >= 25 ? commonThreat(s, x, y, pacts) : undefined);
    const giant = !!giantNear;
    // Fear of a rising power draws even lukewarm neighbours together.
    if (threat && rel >= (giant ? 5 : 25)) consider(y, termsFor(s, 'defensive', x, y), 15 + rel / 3 + (giant ? 10 : 0));
    if (rel >= 10 && s.clans[x].planetId !== s.clans[y].planetId)
      consider(y, termsFor(s, 'trade', x, y), 6 + rel / 5 + (hasTrait(head, 'greedy') ? 5 : 0) + (stance === 'mercantile' ? 6 : 0));
    if (apart && near && rel >= 20 && mx >= my * 2 && clanRegions(s, y).length <= 2)
      consider(y, termsFor(s, 'guarantee', x, y, x), 6 + rel / 5 + (hasTrait(head, 'ambitious') ? 3 : 0));
    if (near && my >= mx * 3 && houseRelation(s, y, x, pacts).value <= -20)
      consider(y, termsFor(s, 'tribute', x, y, y), 12 + Math.min(10, my / mx) + (hasTrait(head, 'craven') ? 5 : 0));
  }
  // Weigh only the most wanted few by their odds: your answers are never predicted, so offers to you count at even odds.
  const shortlist = plans.sort((a, b) => b.utility - a.utility || (a.to < b.to ? -1 : 1)).slice(0, 4);
  let best: Plan | undefined;
  let bestValue = 3;
  for (const plan of shortlist) {
    const odds = plan.to === s.playerClanId ? 0.5 : treatyAcceptance(s, x, plan.to, plan.terms, pacts).chance;
    const value = plan.utility * odds;
    if (value > bestValue) {
      best = plan;
      bestValue = value;
    }
  }
  return best;
}

function aiDiplomacy(s: GameState): void {
  const pacts = pactMap(s);
  for (const x of Object.keys(s.clans).sort()) {
    const k = s.clans[x];
    if (k.isPlayer || !clanRegions(s, x).length) continue;
    if (!chance(s, AI_DIPLOMACY_RATE)) continue;
    const plan = bestDeal(s, x, pacts);
    if (plan) proposeTreaty(s, x, plan.to, plan.terms);
  }
}

// ── Each cycle ────────────────────────────────────────────────────────────

/**
 * Lapse finished treaties (an honoured promise earns trust), drop treaties of
 * houses gone from the map, grow trust once per pair, settle AI payments,
 * lapse unanswered offers, let AI houses seek new deals, and let old house
 * memories fade.
 */
export function diplomacyTick(s: GameState): void {
  const d = ensureDiplomacy(s);
  const live: Treaty[] = [];
  for (const t of d.treaties) {
    const gone = !s.clans[t.a] || !s.clans[t.b] || !clanRegions(s, t.a).length || !clanRegions(s, t.b).length;
    if (gone) continue;
    if (t.until <= s.year) {
      adjustTrust(s, t.a, t.b, TRUST_ON_COMPLETION);
      adjustTrust(s, t.b, t.a, TRUST_ON_COMPLETION);
      if (involvesYou(s, t))
        log(s, `The ${treatyName(t.kind).toLowerCase()} between ${houseName(s, t.a)} and ${houseName(s, t.b)} has run its course.`, 'info');
      continue;
    }
    live.push(t);
  }
  d.treaties = live;
  for (const t of live) {
    const key = pairKey(t.a, t.b);
    if (d.trustYear[key] === s.year) continue;
    d.trustYear[key] = s.year;
    adjustTrust(s, t.a, t.b, TRUST_PER_CYCLE);
    adjustTrust(s, t.b, t.a, TRUST_PER_CYCLE);
  }
  for (const key of Object.keys(d.trustYear)) if (d.trustYear[key] < s.year - 1) delete d.trustYear[key];
  payments(s);
  d.proposals = d.proposals.filter((p) => p.expires > s.year && s.clans[p.from] && clanRegions(s, p.from).length);
  aiDiplomacy(s);
  foreignPolicyTick(s);
  houseMemoriesTick(s);
}

/** For tests and screens: the full record, or undefined for a save without one. */
export function diplomacyRecord(s: GameState) {
  return (s as WithDiplomacy).diplomacy;
}

function canActHouse(s: GameState, id: string): boolean {
  const h = headOf(s, id);
  return !s.gameOver && !!h && !h.prisonerOf && ageOf(s, h) >= 16 && !regencyOf(s, id);
}
