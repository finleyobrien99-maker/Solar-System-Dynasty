import { effStats, newId, notice } from './core';
import { chance } from './rng';
import { regencyOf } from './regency';
import { headOf } from './houseRelations';
import { aidTruces, releaseAid } from './warAid';
import {
  findWar,
  goalBlocker,
  goalCampaignValid,
  goalLabel,
  houseFunds,
  moveFunds,
  rulerCanNegotiate,
  sameGoal,
  settleDemand,
  warSides,
  whole,
  type PeaceTerms,
} from './warGoals';
// Peace belongs to houses, so neither a new ruler nor a different prize erases it.
import { ageOf, alive, ch, clanRegions, log, ruler } from './core';
import { recordDeed } from './epithets';
import { capOpinion, remember } from './memory';
import { addFeeling, opinionOf } from './relations';
import { clamp } from './rng';
import type { AiWar, GameState, Truce, War } from './types';
import { warContributions } from './warAid';

export const TRUCE_CYCLES = 5;
export const OATH_BREAK_COST = 200;
export const OATH_DISAPPROVAL = 10;

const pair = (t: Truce, a: string, b: string) => (t.a === a && t.b === b) || (t.a === b && t.b === a);

export function truceOf(s: GameState, a: string, b: string): Truce | undefined {
  return s.truces.find((t) => pair(t, a, b) && t.until > s.year);
}
export function truceLeft(s: GameState, a: string, b: string): number {
  return Math.max(0, (truceOf(s, a, b)?.until ?? s.year) - s.year);
}

/** Call only on an actual peace. Stale/cancelled wars do not manufacture treaties. */
export function makeTruce(s: GameState, a: string, b: string): void {
  if (a === b || !s.clans[a] || !s.clans[b]) return;
  const old = truceOf(s, a, b);
  const until = Math.max(old?.until ?? 0, s.year + TRUCE_CYCLES);
  s.truces = s.truces.filter((t) => !pair(t, a, b));
  s.truces.push({ a, b, started: s.year, until });
  log(s, `Houses ${s.clans[a].name} and ${s.clans[b].name} swear a truce until ${until}.`, a === s.playerClanId || b === s.playerClanId ? 'war' : 'news');
}

export function truceBreakBlocker(s: GameState, breakerId: string, victimId: string): string | null {
  const house = s.clans[breakerId];
  const head = breakerId === s.playerClanId ? ruler(s) : ch(s, house?.headId);
  if (s.gameOver) return 'The dynasty has ended.';
  if (!house || !alive(head) || head.prisonerOf || ageOf(s, head) < 16 || !clanRegions(s, breakerId).length)
    return 'A free adult ruler must answer for this oath.';
  if (!truceOf(s, breakerId, victimId)) return 'There is no active truce to break.';
  const prestige = breakerId === s.playerClanId ? s.prestige : house.prestige;
  return prestige >= OATH_BREAK_COST ? null : `Breaking this oath needs ${OATH_BREAK_COST} prestige, plus the cost of war.`;
}

/** An explicit declaration must first validate every other cost/blocker, then consume this oath once. */
export function breakTruce(s: GameState, breakerId: string, victimId: string): boolean {
  if (truceBreakBlocker(s, breakerId, victimId)) return false;
  const house = s.clans[breakerId],
    victim = s.clans[victimId];
  const head = breakerId === s.playerClanId ? ruler(s) : ch(s, house.headId)!;
  const theirs = victimId === s.playerClanId ? ruler(s) : ch(s, victim.headId);
  if (breakerId === s.playerClanId) s.prestige -= OATH_BREAK_COST;
  else house.prestige -= OATH_BREAK_COST;
  s.truces = s.truces.filter((t) => !pair(t, breakerId, victimId));
  recordDeed(s, head, 'oathsBroken');
  if (alive(theirs)) addFeeling(s, theirs.id, head.id, { why: 'Broke our sworn truce', value: -45, decay: 0.25, key: 'broken_truce', grave: true });
  for (const observer of Object.values(s.clans)) {
    if (observer.id === breakerId || observer.id === victimId || !clanRegions(s, observer.id).length) continue;
    if (breakerId === s.playerClanId) observer.opinion = capOpinion(observer, clamp(observer.opinion - OATH_DISAPPROVAL, -100, 100));
    const lord = observer.id === s.playerClanId ? ruler(s) : ch(s, observer.headId);
    if (alive(lord)) addFeeling(s, lord.id, head.id, { why: 'Breaks sworn truces', value: -OATH_DISAPPROVAL, decay: 1, key: 'oath_breaker' });
  }
  // House memories mean memories of the player, never an AI offence misattributed to the player.
  if (breakerId === s.playerClanId) remember(s, victimId, 'Broke our sworn truce', -45);
  log(
    s,
    `House ${house.name} breaks its sworn truce with House ${victim.name}, spending ${OATH_BREAK_COST} prestige. Other rulers take notice.`,
    breakerId === s.playerClanId || victimId === s.playerClanId ? 'bad' : 'news',
  );
  return true;
}

/** AI willingness is a pure query; the actual decision roll belongs to its war action. */
export function aiMayBreakTruce(s: GameState, a: string, b: string): boolean {
  const head = ch(s, s.clans[a]?.headId),
    theirs = b === s.playerClanId ? ruler(s) : ch(s, s.clans[b]?.headId);
  if (!alive(head) || !alive(theirs) || truceBreakBlocker(s, a, b)) return false;
  return head.traits.some((t) => t === 'wrathful' || t === 'deceitful') && opinionOf(s, head, theirs) <= -40;
}
export function mayAttack(s: GameState, a: string, b: string): boolean {
  return !truceOf(s, a, b) || aiMayBreakTruce(s, a, b);
}

export const WEARINESS_PER_WAR = 3;
export const WEARINESS_RECOVERY = 8;
export const WEARINESS_MAX = 100;
export function warWeariness(s: GameState, clanId: string): number {
  return clamp(s.warWeariness[clanId] ?? 0, 0, WEARINESS_MAX);
}
export function warStrengthFactor(s: GameState, clanId: string): number {
  return 1 - warWeariness(s, clanId) * 0.0025;
}
export function warIncomeFactor(s: GameState, clanId: string): number {
  return 1 - warWeariness(s, clanId) * 0.0015;
}
/** Weariness comes from a real battle's participating ships, never a synthetic fleet. */
export function battleWeariness(s: GameState, clanId: string, ships: number, losses: number): void {
  if (!s.clans[clanId] || ships <= 0) return;
  const cost = 3 + Math.ceil(20 * clamp(losses / ships, 0, 1));
  s.warWeariness[clanId] = clamp(warWeariness(s, clanId) + cost, 0, WEARINESS_MAX);
}

export function campaignsOf(s: GameState, clanId: string): number {
  return (
    s.wars.filter((w) => clanId === s.playerClanId || w.enemy === clanId || warContributions(w).some((p) => p.clanId === clanId && p.ships > 0)).length +
    s.aiWars.filter((w) => w.attacker === clanId || w.defender === clanId || warContributions(w).some((p) => p.clanId === clanId && p.ships > 0)).length +
    s.successionCrises.filter((c) => c.stage === 'civil-war' && (c.clanId === clanId || c.contributions.some((p) => p.clanId === clanId && p.ships > 0))).length
  );
}

/** Campaign years burden each participating house; a cycle begun at peace lets it recover. */
export function peaceTick(s: GameState): void {
  const active = new Map<string, number>();
  const add = (id: string) => active.set(id, (active.get(id) ?? 0) + 1);
  for (const w of s.wars) {
    add(s.playerClanId);
    add(w.enemy);
    for (const id of new Set(
      warContributions(w)
        .filter((p) => p.ships > 0)
        .map((p) => p.clanId),
    ))
      if (id !== s.playerClanId && id !== w.enemy) add(id);
  }
  for (const w of s.aiWars) {
    add(w.attacker);
    add(w.defender);
    for (const id of new Set(
      warContributions(w)
        .filter((p) => p.ships > 0)
        .map((p) => p.clanId),
    ))
      if (id !== w.attacker && id !== w.defender) add(id);
  }
  for (const c of s.successionCrises)
    if (c.stage === 'civil-war') {
      for (const id of new Set([c.clanId, ...c.contributions.filter((p) => p.ships > 0).map((p) => p.clanId)])) add(id);
    }
  for (const id of Object.keys(s.clans)) {
    const campaigns = active.get(id) ?? 0;
    const next = clamp(warWeariness(s, id) + (campaigns ? WEARINESS_PER_WAR * Math.min(3, campaigns) : -WEARINESS_RECOVERY), 0, WEARINESS_MAX);
    if (next) s.warWeariness[id] = next;
    else delete s.warWeariness[id];
  }
  for (const id of Object.keys(s.warWeariness)) if (!s.clans[id]) delete s.warWeariness[id];

  s.truces = s.truces.filter((t) => t.until > s.year && s.clans[t.a] && s.clans[t.b]);
}

// ── Negotiated, exact terms (slice 3) ─────────────────────────────────────
export interface PeaceOption {
  terms: PeaceTerms;
  label: string;
  chance: number;
  reasons: string[];
  blocker?: string;
}
const PEACE_OFFER_CYCLES = 2;
export function peaceTermsBlocker(s: GameState, warOrId: string | War | AiWar, terms: PeaceTerms): string | null {
  const w = findWar(s, warOrId);
  if (!w || s.gameOver) return 'The war has passed.';
  const { attacker, defender } = warSides(s, w);
  if (!s.clans[attacker] || !s.clans[defender] || !clanRegions(s, attacker).length || !clanRegions(s, defender).length)
    return 'One house no longer holds land.';
  if (w.goal && !goalCampaignValid(s, w)) return 'The stated war goal is no longer available.';
  if (!terms || !['white', 'goal', 'reparations'].includes(terms.kind)) return 'Unknown peace terms.';
  if (terms.kind === 'white') return null;
  if (terms.winner !== attacker && terms.winner !== defender) return 'Only a primary belligerent can receive these terms.';
  if (terms.kind === 'reparations') return whole(terms.amount, 1000000) ? null : 'Reparations must be whole credits within the settlement limit.';
  if (!w.goal || terms.winner !== attacker || !sameGoal(terms.goal, w.goal)) return 'Peace must match the saved attacking goal.';
  return goalBlocker(s, attacker, defender, terms.goal);
}
export function peaceAcceptance(s: GameState, warOrId: string | War | AiWar, terms: PeaceTerms, recipient: string): { chance: number; reasons: string[] } {
  const w = findWar(s, warOrId);
  if (!w || peaceTermsBlocker(s, w, terms)) return { chance: 0, reasons: ['These terms are no longer available.'] };
  const sides = warSides(s, w),
    ownScore = sides.score * (recipient === sides.attacker ? 1 : -1);
  if (recipient !== sides.attacker && recipient !== sides.defender) return { chance: 0, reasons: ['Not a belligerent.'] };
  const theirs = recipient === sides.attacker ? sides.defender : sides.attacker;
  const h = headOf(s, theirs),
    dip = h ? effStats(s, h).dip : 0;
  const weariness = warWeariness(s, recipient);
  const receiving = terms.kind !== 'white' && terms.winner === recipient;
  let probability = receiving ? 0.9 : terms.kind === 'white' ? 0.45 - ownScore / 180 : 0.08 - ownScore / 125;
  probability += dip * 0.012 + weariness / 400;
  if (!receiving && terms.kind === 'goal' && terms.goal.kind === 'tribute') probability -= Math.min(0.15, (terms.goal.years * terms.goal.amount) / 10000);
  if (!receiving && terms.kind === 'reparations') probability -= Math.min(0.2, (terms.amount / Math.max(1, houseFunds(s, recipient))) * 0.15);
  return {
    chance: clamp(probability, 0.02, 0.98),
    reasons: [
      'Their war score: ' + (ownScore >= 0 ? '+' : '') + ownScore,
      'Their war weariness: ' + weariness,
      'Envoy Diplomacy: ' + dip,
      terms.kind === 'white'
        ? 'Neither side gives up its goal or pays reparations.'
        : receiving
          ? 'These terms favour their house.'
          : 'They would concede the stated terms.',
      ...(terms.kind === 'reparations' ? ['Payment is capped by the payer’s actual treasury at acceptance.'] : []),
    ],
  };
}
export function peaceTerms(s: GameState, warOrId: string | War | AiWar, proposerId?: string): PeaceOption[] {
  const w = findWar(s, warOrId);
  if (!w) return [];
  const sides = warSides(s, w);
  const proposer = proposerId ?? ('enemy' in w ? s.playerClanId : sides.attacker);
  if (proposer !== sides.attacker && proposer !== sides.defender) return [];
  const recipient = proposer === sides.attacker ? sides.defender : sides.attacker;
  const opts: { terms: PeaceTerms; label: string }[] = [{ terms: { kind: 'white' }, label: 'White peace' }];
  if (w.goal && proposer === sides.attacker)
    opts.push({ terms: { kind: 'goal', winner: proposer, goal: structuredClone(w.goal) }, label: goalLabel(s, w.goal) });
  const amount = Math.min(1000000, Math.max(1, Math.floor(houseFunds(s, recipient) * 0.25)));
  opts.push({ terms: { kind: 'reparations', winner: proposer, amount }, label: 'Reparations: up to ' + amount + ' credits' });
  const eligibility =
    !rulerCanNegotiate(s, proposer) || regencyOf(s, proposer)
      ? 'A free adult ruler must send peace terms.'
      : !rulerCanNegotiate(s, recipient) || regencyOf(s, recipient)
        ? 'A free adult ruler must receive peace terms.'
        : undefined;
  return opts.map((o) => ({ ...o, ...peaceAcceptance(s, w, o.terms, recipient), blocker: peaceTermsBlocker(s, w, o.terms) ?? eligibility }));
}
/** Once settled, the old war object can never transfer another ship, region or credit. */
export function settlePeace(s: GameState, warOrId: string | War | AiWar, terms: PeaceTerms, actors?: { attacker?: string; defender?: string }): boolean {
  const w = findWar(s, warOrId);
  if (!w || peaceTermsBlocker(s, w, terms)) return false;
  const sides = warSides(s, w);
  const winner = terms.kind === 'white' ? undefined : terms.winner;
  const loser = winner === sides.attacker ? sides.defender : sides.attacker;
  const a = actors?.attacker ?? headOf(s, sides.attacker)?.id,
    d = actors?.defender ?? headOf(s, sides.defender)?.id;
  // Validate all effects before deleting the war or creating a truce.
  if (terms.kind === 'goal' && !settleDemand(s, sides.attacker, sides.defender, terms.goal, w.id, 'enemy' in w ? w.cb : (w.cb ?? 'conquest'), a)) return false;
  if (terms.kind === 'reparations') {
    const paid = moveFunds(s, loser, terms.winner, terms.amount);
    log(s, 'House ' + s.clans[loser].name + ' pays House ' + s.clans[terms.winner].name + ' ' + paid + ' actual credits in reparations.', 'war');
  }
  aidTruces(s, sides.attacker, warContributions(w));
  releaseAid(s, warContributions(w));
  s.wars = s.wars.filter((x) => x.id !== w.id);
  s.aiWars = s.aiWars.filter((x) => x.id !== w.id);
  makeTruce(s, sides.attacker, sides.defender);
  if (!winner) {
    recordDeed(s, a, 'peaceTreaties');
    recordDeed(s, d, 'peaceTreaties');
  } else {
    recordDeed(s, winner === sides.attacker ? a : d, 'warsWon');
    recordDeed(s, winner === sides.attacker ? d : a, 'warsLost');
    if (winner === sides.defender) recordDeed(s, d, 'defensiveWins');
    if (winner === s.playerClanId) s.prestige += 60;
    else s.clans[winner].prestige += 60;
  }
  const label =
    terms.kind === 'white'
      ? 'White peace: neither side gains land or pays reparations.'
      : terms.kind === 'goal'
        ? goalLabel(s, terms.goal)
        : 'Capped reparations';
  log(s, 'Peace between House ' + s.clans[sides.attacker].name + ' and House ' + s.clans[sides.defender].name + ': ' + label + '.', 'war');
  if ([sides.attacker, sides.defender].includes(s.playerClanId)) notice(s, 'Peace agreed', label, { icon: 'peace' });
  return true;
}
export function offerPeace(s: GameState, warOrId: string | War | AiWar, terms?: PeaceTerms, proposerId?: string): boolean {
  const w = findWar(s, warOrId);
  if (!w) return false;
  const sides = warSides(s, w),
    from = proposerId ?? ('enemy' in w ? s.playerClanId : sides.attacker);
  const to = from === sides.attacker ? sides.defender : sides.attacker;
  if (![sides.attacker, sides.defender].includes(from) || !rulerCanNegotiate(s, from) || regencyOf(s, from)) return false;
  const chosen = terms ?? { kind: 'white' as const };
  const key = 'peace:' + w.id + ':' + from;
  if (peaceTermsBlocker(s, w, chosen) || s.cooldowns[key] === s.year || w.peaceOffer) return false;
  if (!rulerCanNegotiate(s, to) || regencyOf(s, to)) return false;
  s.cooldowns[key] = s.year;
  if (from === s.playerClanId) s.cooldowns['peace:' + w.id] = s.year;
  if (to === s.playerClanId) {
    w.peaceOffer = { id: newId(s, 'po'), warId: w.id, from, to, terms: structuredClone(chosen), year: s.year, expires: s.year + PEACE_OFFER_CYCLES };
    log(s, 'House ' + s.clans[from].name + ' sends exact peace terms, waiting for your answer on Realm.', 'war');
    return true;
  }
  const decision = peaceAcceptance(s, w, chosen, to);
  if (chance(s, decision.chance)) return settlePeace(s, w, chosen);
  if (from === s.playerClanId)
    notice(s, 'Peace Refused', 'House ' + s.clans[to].name + ' refuses these terms. Another envoy can go next cycle.', { icon: 'war', tone: 'bad' });
  return false;
}
export function peaceOfferBlocker(s: GameState, warOrId: string | War | AiWar, recipientId = s.playerClanId): string | null {
  const w = findWar(s, warOrId),
    p = w?.peaceOffer;
  if (!w || !p || p.expires <= s.year) return 'This offer has passed.';
  const sides = warSides(s, w);
  if (p.to !== recipientId || p.from !== (recipientId === sides.attacker ? sides.defender : sides.attacker) || p.warId !== w.id)
    return 'These terms were not addressed to this house.';
  if (!rulerCanNegotiate(s, recipientId) || regencyOf(s, recipientId)) return 'A free adult ruler must answer peace terms.';
  return peaceTermsBlocker(s, w, p.terms);
}
export function acceptPeace(s: GameState, warOrId: string | War | AiWar, accept: boolean, recipientId?: string): boolean {
  const w = findWar(s, warOrId),
    p = w?.peaceOffer;
  const recipient = recipientId ?? s.playerClanId;
  if (!w || !p || p.to !== recipient || p.expires <= s.year || !rulerCanNegotiate(s, recipient) || regencyOf(s, recipient) || peaceTermsBlocker(s, w, p.terms))
    return false;
  const sides = warSides(s, w);
  if (p.from !== (recipient === sides.attacker ? sides.defender : sides.attacker) || p.warId !== w.id) return false;
  if (accept) return settlePeace(s, w, p.terms);
  delete w.peaceOffer;
  log(s, 'House ' + s.clans[recipient].name + ' refuses the peace offer.', 'war');
  return true;
}
export function peaceOffersTick(s: GameState): void {
  for (const w of [...s.wars, ...s.aiWars])
    if (w.peaceOffer && (w.peaceOffer.expires <= s.year || peaceTermsBlocker(s, w, w.peaceOffer.terms))) delete w.peaceOffer;
}
/** AI considers one explained set of terms; a player recipient is always asked. */
export function aiPeaceTurn(s: GameState, war: War | AiWar): void {
  if (!war.goal || war.peaceOffer || s.year - war.started < 2 || Math.abs(warSides(s, war).score) >= 100) return;
  const sides = warSides(s, war);
  const from = sides.score < 0 ? sides.attacker : sides.defender;
  if (from === s.playerClanId) return;
  // A losing house offers to concede the attacking goal; a stalemate offers white peace.
  if (sides.score >= 60) offerPeace(s, war, { kind: 'goal', winner: sides.attacker, goal: structuredClone(war.goal) }, from);
  else if (sides.score <= -60)
    offerPeace(
      s,
      war,
      { kind: 'reparations', winner: sides.defender, amount: Math.max(1, Math.min(1000000, Math.floor(houseFunds(s, sides.attacker) * 0.25))) },
      from,
    );
  else if (s.year - war.started >= 4 && Math.abs(sides.score) <= 25) offerPeace(s, war, { kind: 'white' }, from);
}
