// Houses with a foreign policy (WAVE-5-DIPLOMACY.md slice 3, Claude's half).
// Every AI house has a stance read from its lord: expansionist, honourable,
// planet-first, zealous, mercantile, schemer or cautious. It changes what
// treaties the house wants and accepts, and how readily it breaks its word; a
// new lord can turn the house around. Houses fear whoever grows too strong
// (you included) and draw together against them. And expansionist lords bully
// weaker neighbours with ultimatums: yield a region or pay tribute, or face a
// war. You can make the same demands. A new lord reviews the treaties a
// predecessor signed and may repudiate them, and so may you early in a reign.
//
// Stances and rivals are read fresh, never saved. Ultimatums waiting for your
// answer are saved (the v11 record, WAVE-5-CONTRACT.md). A refusal justifies
// one war over exactly what was demanded; the war lane keeps that
// justification and fights the war (warGoals.ts, its half of slice 3).

import { aiAmbition } from './aiAmbition';
import { pactMap } from './aiCourt';
import { recordExpansion } from './coalitions';
import { canAct, clanRegions, cooldownReady, fullName, hasTrait, log, newId, notice, ruler, setCooldown, setOwner } from './core';
import type { DemandGoal, ForeignPolicyState, Reason, SavedUltimatum, Treaty } from './diplomacyTypes';
import {
  adjustTrust,
  diplomacyOf,
  ensureDiplomacy,
  headOf,
  houseMemorySum,
  houseRelation,
  mightOf,
  neighbours,
  rememberHouse,
  treatiesBetween,
  treatyName,
  trustOf,
} from './houseRelations';
import { isRival } from './memory';
import { truceOf } from './peace';
import { PLANET_BY_ID } from './planets';
import { realmOf } from './realmDefence';
import { regencyOf } from './regency';
import { chance, clamp } from './rng';
import { pactDefenders, signTreaty, treatiesOf, tributeAmount, treatyWarBlocker, TREATY_YEARS } from './treaties';
import type { GameState, Region } from './types';
import { committedShips } from './warAid';

// ── Stances ───────────────────────────────────────────────────────────────

export type StanceKind = 'expansionist' | 'honourable' | 'planetFirst' | 'zealous' | 'mercantile' | 'schemer' | 'cautious';

export interface Stance {
  kind: StanceKind;
  reasons: Reason[];
}

export const STANCE_NAME: Record<StanceKind, string> = {
  expansionist: 'Expansionist',
  honourable: 'Honourable',
  planetFirst: 'Planet first',
  zealous: 'Zealous',
  mercantile: 'Mercantile',
  schemer: 'Schemer',
  cautious: 'Cautious',
};

const ORDER: StanceKind[] = ['expansionist', 'schemer', 'zealous', 'mercantile', 'honourable', 'planetFirst'];

/**
 * An AI house's outlook, read from its lord's traits and stated ambition, with
 * the reasons. Both are public (they show on the lord's card), so every viewer
 * sees the same. Undefined for you: your policy is whatever you do. Pure.
 */
export function stanceOf(s: GameState, id: string, _viewerId?: string): Stance | undefined {
  if (id === s.playerClanId || !s.clans[id]) return undefined;
  const head = headOf(s, id);
  if (!head) return { kind: 'cautious', reasons: [{ label: 'Nobody leads the house' }] };
  const score: Record<StanceKind, number> = { expansionist: 0, honourable: 0, planetFirst: 0, zealous: 0, mercantile: 0, schemer: 0, cautious: 0 };
  const why: Record<StanceKind, string[]> = { expansionist: [], honourable: [], planetFirst: [], zealous: [], mercantile: [], schemer: [], cautious: [] };
  const add = (k: StanceKind, n: number, label: string) => {
    score[k] += n;
    why[k].push(label);
  };
  const trait = (t: string, k: StanceKind, n: number, label: string) => hasTrait(head, t) && add(k, n, label);
  trait('ambitious', 'expansionist', 2, 'Ambitious');
  trait('wrathful', 'expansionist', 1, 'Wrathful');
  trait('arrogant', 'expansionist', 1, 'Arrogant');
  trait('honest', 'honourable', 2, 'Honest');
  trait('just', 'honourable', 2, 'Just');
  trait('content', 'planetFirst', 2, 'Content with their world');
  trait('shy', 'planetFirst', 1, 'Shy of outsiders');
  trait('zealous', 'zealous', 3, 'Zealous');
  trait('greedy', 'mercantile', 2, 'Greedy');
  trait('diligent', 'mercantile', 1, 'Diligent');
  trait('deceitful', 'schemer', 3, 'Deceitful');
  trait('paranoid', 'schemer', 1, 'Paranoid');
  const ambition = aiAmbition(s, s.clans[id]);
  if (ambition.kind === 'conquest') add('expansionist', 2, 'Wants conquest');
  if (ambition.kind === 'crusade') add('zealous', 2, 'Wants a crusade');
  if (ambition.kind === 'wealth') add('mercantile', 2, 'Wants wealth');
  if (ambition.kind === 'revenge') add('schemer', 1, 'Wants revenge');
  if (ambition.kind === 'peace' || ambition.kind === 'security') add('planetFirst', 1, 'Wants peace and safety');
  let best: StanceKind = 'cautious';
  for (const k of ORDER) if (score[k] >= 2 && score[k] > score[best]) best = k;
  return { kind: best, reasons: best === 'cautious' ? [{ label: 'No strong ambitions abroad' }] : why[best].map((label) => ({ label })) };
}

export function stanceKind(s: GameState, id: string): StanceKind | undefined {
  return stanceOf(s, id)?.kind;
}

// ── The balance of power ──────────────────────────────────────────────────

/** How many times the typical landed house's ships make a house a menace to its neighbours. */
export const RISING_POWER = 2.5;

const powerCache = new WeakMap<GameState, { year: number; median: number }>();

/** The median fleet of landed houses this cycle (you included). Cached per state and year; reading never changes the game. */
export function medianMight(s: GameState): number {
  const hit = powerCache.get(s);
  if (hit && hit.year === s.year) return hit.median;
  const all = Object.keys(s.clans)
    .filter((id) => clanRegions(s, id).length)
    .map((id) => mightOf(s, id))
    .sort((a, b) => a - b);
  const median = all.length ? all[Math.floor(all.length / 2)] : 0;
  powerCache.set(s, { year: s.year, median });
  return median;
}

/** A house so much stronger than the typical one that its neighbours fear it. Pure. */
export function risingPower(s: GameState, id: string): boolean {
  const m = medianMight(s);
  return !!s.clans[id] && clanRegions(s, id).length > 0 && m > 0 && mightOf(s, id) >= m * RISING_POWER;
}

/** The house this one fears as a rising power next door, if any. Pure. */
export function fearedNeighbour(s: GameState, id: string): string | undefined {
  for (const z of Object.keys(s.clans)) if (z !== id && risingPower(s, z) && neighbours(s, z, id) && realmOf(s, z) !== realmOf(s, id)) return z;
  return undefined;
}

// ── Rivals ────────────────────────────────────────────────────────────────

/** At most this many rivals are named for a house. */
export const MAX_RIVALS = 3;
/** Relations this cold make a rival even without an open quarrel. */
export const RIVAL_BELOW = -30;

export interface Rival {
  id: string;
  reasons: Reason[];
}

/**
 * The houses a house is publicly set against, worst first: open war, fear of
 * a rising power, a sworn rivalry with you, broken promises, tribute forced
 * from it, and cold relations. Only public reasons; private knowledge
 * (affairs, hooks, undiscovered murders) never appears, so every viewer sees
 * the same. For you, the houses set against you. Pure.
 */
export function rivalsOf(s: GameState, id: string, _viewerId?: string): Rival[] {
  if (!s.clans[id]) return [];
  const pacts = pactMap(s);
  const out: (Rival & { weight: number })[] = [];
  for (const other of Object.keys(s.clans)) {
    if (other === id || !clanRegions(s, other).length) continue;
    // Who feels it: the house itself, or, for you, the house set against you.
    const [observer, subject] = id === s.playerClanId ? [other, id] : [id, other];
    const reasons: Reason[] = [];
    if (atWarBetween(s, observer, subject)) reasons.push({ label: 'At war' });
    if (fearedNeighbour(s, observer) === subject) reasons.push({ label: 'Fears their growing power' });
    if (subject === s.playerClanId && isRival(s.clans[observer])) reasons.push({ label: 'Sworn rival' });
    if (trustOf(s, observer, subject) <= -30) reasons.push({ label: 'Broken promises' });
    if (treatiesBetween(s, observer, subject, 'tribute').some((t) => t.b === observer)) reasons.push({ label: 'Forced to pay them tribute' });
    const rel = houseRelation(s, observer, subject, pacts).value;
    if (rel <= RIVAL_BELOW) reasons.push({ label: 'Cold relations', value: rel });
    if (reasons.length) out.push({ id: other, reasons, weight: rel - 25 * reasons.length });
  }
  return out
    .sort((a, b) => a.weight - b.weight || (a.id < b.id ? -1 : 1))
    .slice(0, MAX_RIVALS)
    .map(({ id: rival, reasons }) => ({ id: rival, reasons }));
}

// ── The ultimatum record ──────────────────────────────────────────────────

/** GameState with the foreign-policy record the v11 save adds (WAVE-5-CONTRACT.md). Read through these helpers only. */
export type WithForeignPolicy = GameState & { foreignPolicy?: ForeignPolicyState };

const EMPTY: ForeignPolicyState = Object.freeze({ ultimatums: [], heads: {} }) as ForeignPolicyState;

/** The record, or an empty one for a save that has none yet. Never writes. */
export function foreignPolicyOf(s: GameState): ForeignPolicyState {
  return (s as WithForeignPolicy).foreignPolicy ?? EMPTY;
}

/** The record, created empty if missing: for code about to change it. */
export function ensureForeignPolicy(s: GameState): ForeignPolicyState {
  const w = s as WithForeignPolicy;
  w.foreignPolicy ??= { ultimatums: [], heads: {} };
  w.foreignPolicy.ultimatums ??= [];
  w.foreignPolicy.heads ??= {};
  return w.foreignPolicy;
}

/**
 * A save from before foreign policy starts with no ultimatums on record and
 * no lords noted, so the first cycle notes them without inventing a
 * succession. Safe to run twice. Called from MIGRATIONS[11].
 */
export function migrateForeignPolicy(s: GameState): void {
  ensureForeignPolicy(s);
}

// ── Ultimatums ────────────────────────────────────────────────────────────

/** A lord bent on expansion considers an ultimatum this often, and waits this long before the next. */
export const ULTIMATUM_RATE = 0.06;
export const ULTIMATUM_GAP = 10;
/** How much stronger than the victim and its sworn protectors the demander must be. */
export const ULTIMATUM_EDGE = 1.5;
/** You have this long to answer an ultimatum before it lapses. */
export const ANSWER_YEARS = 2;
/** A refused demand justifies one war over it for this long (the war lane's limit too). */
export const GRIEVANCE_YEARS = 10;

/** What a demand asks for: a region, or tribute for some years. */
export type Demand = DemandGoal;

/** A demand one house means to make of another (not yet made). */
export interface Ultimatum {
  from: string;
  to: string;
  demand: Demand;
}

/** Tribute terms for a demand on `payer`: the usual amount, for the usual years. */
export function tributeDemand(s: GameState, payer: string): Extract<Demand, { kind: 'tribute' }> {
  return { kind: 'tribute', amount: tributeAmount(s, payer), years: TREATY_YEARS.tribute };
}

/** Your ruler can speak for the house: grown, out of regency and not a captive (as freeAdult is for AI lords). */
export function rulerFree(s: GameState): boolean {
  return canAct(s) && !ruler(s).prisonerOf;
}

function freeAdult(s: GameState, id: string): boolean {
  const h = headOf(s, id);
  return !!h && !h.prisonerOf && s.year - h.born >= 16 && !regencyOf(s, id);
}

function atWarAtAll(s: GameState, id: string): boolean {
  if (id === s.playerClanId) return s.wars.length > 0;
  return s.wars.some((w) => w.enemy === id) || s.aiWars.some((w) => w.attacker === id || w.defender === id);
}

function atWarBetween(s: GameState, a: string, b: string): boolean {
  if (a === s.playerClanId || b === s.playerClanId) return s.wars.some((w) => w.enemy === (a === s.playerClanId ? b : a));
  return s.aiWars.some((w) => (w.attacker === a && w.defender === b) || (w.attacker === b && w.defender === a));
}

/** A region worth demanding: never a throne-region, and never a house's last. */
function prize(s: GameState, id: string): Region | undefined {
  const regs = clanRegions(s, id);
  if (regs.length < 2) return undefined;
  return regs.filter((r) => !r.capital).sort((a, b) => a.dev - b.dev || (a.id < b.id ? -1 : 1))[0];
}

/** What stands behind a house: its own ships plus the ships its treaty partners would send against `demander`. */
export function defendedMight(s: GameState, id: string, demander: string): number {
  return mightOf(s, id) + pactDefenders(s, id, demander).reduce((n, d) => n + (d.blocker ? 0 : d.proposedShips), 0);
}

/** Whether the demand can still be met: the region is still theirs to give and not their last. */
function demandValid(s: GameState, to: string, demand: Demand): boolean {
  if (demand.kind === 'tribute') return demand.amount > 0 && demand.years > 0;
  const r = s.regions[demand.regionId];
  return !!r && r.owner === to && !r.capital && clanRegions(s, to).length >= 2;
}

/** Why `from` cannot press demands on `to` now; null if it can. Pure. */
export function ultimatumBlocker(s: GameState, from: string, to: string, demand: Demand): string | null {
  if (s.gameOver || from === to || !s.clans[from] || !s.clans[to]) return 'Choose another house.';
  if (!clanRegions(s, from).length || !clanRegions(s, to).length) return 'Only landed houses make demands.';
  if (from === s.playerClanId ? !canAct(s) : !freeAdult(s, from)) return 'A regency makes no demands.';
  if (from === s.playerClanId && !rulerFree(s)) return 'A captive ruler makes no demands.';
  if (!cooldownReady(s, `ultimatum:${from}`)) return 'Your last demand is too recent.';
  if (realmOf(s, from) === realmOf(s, to)) return 'A quarrel inside one realm is for its liege.';
  if (atWarBetween(s, from, to)) return 'You are already at war.';
  if (truceOf(s, from, to)) return 'You swore a truce.';
  if (treatyWarBlocker(s, from, to)) return 'Your treaty forbids threats.';
  if (committedShips(s, from)) return 'Your ships are lent elsewhere.';
  if (!demandValid(s, to, demand)) return 'That cannot be demanded.';
  return null;
}

/** How likely the target is to give in, and why: fear of the demander against pride, courage and trusted allies. Pure. */
export function ultimatumAcceptance(s: GameState, from: string, to: string, demand: Demand): { chance: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  let p = 0;
  const add = (label: string, n: number) => {
    p += n;
    if (Math.round(n * 100)) reasons.push({ label, value: Math.round(n * 100) });
  };
  add('Base', 0.1);
  const ratio = mightOf(s, from) / Math.max(1, defendedMight(s, to, from));
  add(`Your might against theirs and their allies (${ratio.toFixed(1)}x)`, clamp((ratio - ULTIMATUM_EDGE) * 0.15, -0.1, 0.45));
  const head = headOf(s, to);
  const has = (t: string) => !!head && hasTrait(head, t);
  if (has('craven')) add('Craven', 0.2);
  if (has('brave')) add('Brave', -0.2);
  if (has('arrogant') || has('wrathful')) add('Too proud to bow', -0.15);
  if (demand.kind === 'cede') add('Land is dearer than money', -0.1);
  if (pactDefenders(s, to, from).some((d) => !d.blocker)) add('Trusts its allies', -0.15);
  const regard = houseRelation(s, to, from).value;
  if (regard <= -40) add('Hates you', -0.1);
  return { chance: clamp(p, 0.02, 0.9), reasons };
}

function describeDemand(s: GameState, d: Demand): string {
  return d.kind === 'cede' ? `${s.regions[d.regionId]?.name ?? 'a region'}` : `${d.amount} credits a cycle in tribute for ${d.years} cycles`;
}

/**
 * The demand is met: the region changes hands (setOwner), or tribute is
 * signed. The victim remembers. (With the war lane: warGoals.settleDemand.)
 */
function yieldTo(s: GameState, u: Ultimatum): void {
  const { from, to, demand } = u;
  if (demand.kind === 'cede') {
    const region = s.regions[demand.regionId];
    setOwner(s, region, from);
    recordExpansion(s, from, region, 'claim');
    rememberHouse(s, to, from, { text: `Took ${region.name} from us by threat`, value: -35, decay: 0.03 });
  } else {
    signTreaty(s, { kind: 'tribute', a: from, b: to, years: demand.years, amount: demand.amount });
    rememberHouse(s, to, from, { text: 'Forced tribute from us', value: -25, decay: 0.04 });
  }
  const mine = from === s.playerClanId || to === s.playerClanId;
  log(
    s,
    `House ${s.clans[to].name} gives in to House ${s.clans[from].name}: ${describeDemand(s, demand)}.`,
    mine ? (from === s.playerClanId ? 'good' : 'bad') : 'news',
  );
}

/**
 * The target refuses, and the demander remembers. The refusal justifies one
 * war over exactly what was demanded, never another target: the war lane
 * records it (warGoals.recordRefusedDemand, under the ultimatum's id, or a
 * new one for an AI target, for GRIEVANCE_YEARS)
 * and an AI demander declares at once (war.declareWithGoal with that
 * justification). Until the war lane is merged a refusal is only remembered.
 */
function refuse(s: GameState, u: Ultimatum, _id?: string): void {
  rememberHouse(s, u.from, u.to, { text: 'Defied our demands', value: -15, decay: 0.05 });
  if (u.from === s.playerClanId) log(s, `House ${s.clans[u.to].name} refuses your demands.`, 'war');
  else if (u.to !== s.playerClanId) log(s, `House ${s.clans[u.to].name} defies House ${s.clans[u.from].name}.`, 'news');
}

/**
 * Press a demand. AI targets decide with one roll at the odds shown; you are
 * asked (Ultimatum event) unless a regent governs you, in which case the
 * regent decides by the same odds. Returns what happened, or null if it could
 * not be made.
 */
export function issueUltimatum(s: GameState, from: string, to: string, demand: Demand): 'yielded' | 'refused' | 'pending' | null {
  if (ultimatumBlocker(s, from, to, demand)) return null;
  setCooldown(s, `ultimatum:${from}`, from === s.playerClanId ? 5 : ULTIMATUM_GAP);
  const u: Ultimatum = { from, to, demand: { ...demand } };
  if (to === s.playerClanId && rulerFree(s)) {
    ensureForeignPolicy(s).ultimatums.push({ id: newId(s, 'ul'), from, to, goal: u.demand, year: s.year, expires: s.year + ANSWER_YEARS });
    return 'pending';
  }
  const yes = chance(s, ultimatumAcceptance(s, from, to, demand).chance);
  if (to === s.playerClanId) {
    // A child's regent answers, or the council while you are a captive.
    const who = canAct(s) ? 'council' : 'regent';
    notice(
      s,
      `Your ${who === 'council' ? 'Council' : 'Regent'} Answers`,
      `House ${s.clans[from].name} demanded ${describeDemand(s, demand)}. Your ${who} ${yes ? 'gave in' : 'refused'}.`,
      { icon: 'war', tone: 'bad' },
    );
  }
  if (yes) yieldTo(s, u);
  else refuse(s, u);
  return yes ? 'yielded' : 'refused';
}

/** Whether an ultimatum waiting for your answer still stands: in time, its houses landed, no war yet, the demand still possible. */
function stands(s: GameState, u: SavedUltimatum): boolean {
  return u.expires > s.year && !!s.clans[u.from] && clanRegions(s, u.from).length > 0 && !atWarBetween(s, u.from, u.to) && demandValid(s, u.to, u.goal);
}

/** The ultimatum waiting for your answer (that one, given its id), if it still stands. Pure. */
export function pendingUltimatum(s: GameState, id?: string): SavedUltimatum | undefined {
  return foreignPolicyOf(s).ultimatums.find((u) => u.to === s.playerClanId && (!id || u.id === id) && stands(s, u));
}

/**
 * Your answer to an ultimatum (that one, given its id): give in, or refuse.
 * Either way it leaves the record. One that no longer stands, or was already
 * answered, is left alone and returns false.
 */
export function answerUltimatum(s: GameState, give: boolean, id?: string): boolean {
  const saved = pendingUltimatum(s, id);
  if (!saved) return false;
  const fp = ensureForeignPolicy(s);
  fp.ultimatums = fp.ultimatums.filter((x) => x !== saved);
  const u: Ultimatum = { from: saved.from, to: saved.to, demand: saved.goal };
  if (give) yieldTo(s, u);
  else refuse(s, u, saved.id);
  return true;
}

/** The best victim for an AI house's demands, if any is worth bullying. Pure. */
export function ultimatumTarget(s: GameState, from: string): Ultimatum | undefined {
  if (from === s.playerClanId || stanceKind(s, from) !== 'expansionist' || !freeAdult(s, from) || atWarAtAll(s, from)) return undefined;
  const mx = mightOf(s, from);
  let best: { u: Ultimatum; score: number } | undefined;
  for (const to of Object.keys(s.clans)) {
    if (to === from || !clanRegions(s, to).length || !neighbours(s, from, to)) continue;
    const behind = defendedMight(s, to, from);
    if (mx < behind * ULTIMATUM_EDGE) continue;
    const regard = houseRelation(s, from, to).value;
    if (regard > 20) continue;
    const region = prize(s, to);
    const demand: Demand = region && regard <= -20 ? { kind: 'cede', regionId: region.id } : tributeDemand(s, to);
    if (ultimatumBlocker(s, from, to, demand)) continue;
    const score = mx / Math.max(1, behind) - regard / 50;
    if (!best || score > best.score) best = { u: { from, to, demand }, score };
  }
  return best?.u;
}

// ── A new lord reviews the treaties ───────────────────────────────────────

/** Repudiating a predecessor's treaty costs the partner's trust and a memory: far less than a breach, since the oath was not the new lord's. */
export const REPUDIATE_TRUST = -15;
export const REPUDIATE_MEMORY = -20;
/** You may repudiate a predecessor's treaties this many cycles into your reign. */
export const REPUDIATE_WINDOW = 5;

const otherSide = (t: Treaty, id: string) => (t.a === id ? t.b : t.a);

/**
 * Why a house's new lord would repudiate a treaty, as a phrase ("unwilling to
 * bleed for another world"), or null if they keep it. Honourable lords keep
 * every word, and schemers keep non-aggression pacts they mean to betray. Pure.
 */
export function repudiationReason(s: GameState, id: string, t: Treaty): string | null {
  const stance = stanceKind(s, id);
  if (stance === 'honourable' || (stance === 'schemer' && t.kind === 'nonAggression')) return null;
  const other = otherSide(t, id);
  if (!s.clans[other]) return null;
  if (houseRelation(s, id, other).value <= -30) return `despising House ${s.clans[other].name}`;
  if (stance === 'expansionist' && t.kind === 'nonAggression' && mightOf(s, other) * ULTIMATUM_EDGE <= mightOf(s, id))
    return 'wanting a free hand against a weaker neighbour';
  if (stance === 'planetFirst' && (t.kind === 'defensive' || (t.kind === 'guarantee' && t.a === id)) && s.clans[other].planetId !== s.clans[id].planetId)
    return 'unwilling to bleed for another world';
  const head = headOf(s, id);
  if (t.kind === 'tribute' && t.b === id && mightOf(s, id) >= mightOf(s, other) * 0.8 && !(head && hasTrait(head, 'craven')))
    return 'unwilling to pay tribute to a house no stronger than their own';
  return null;
}

function repudiate(s: GameState, id: string, t: Treaty, why: string): void {
  const d = ensureDiplomacy(s);
  d.treaties = d.treaties.filter((x) => x !== t);
  const other = otherSide(t, id);
  const name = treatyName(t.kind).toLowerCase();
  adjustTrust(s, other, id, REPUDIATE_TRUST);
  rememberHouse(s, other, id, { text: `Repudiated our ${name}`, value: REPUDIATE_MEMORY, decay: 0.05 });
  if (id === s.playerClanId) {
    log(s, `You repudiate your predecessor's ${name} with House ${s.clans[other].name}.`, 'info');
    return;
  }
  const lord = headOf(s, id);
  const text = `The new head of House ${s.clans[id].name}${lord ? `, ${fullName(s, lord)},` : ''} repudiates the ${name} with House ${s.clans[other].name}, ${why}.`;
  if (other === s.playerClanId) notice(s, 'A Treaty Repudiated', text, { icon: 'war', tone: 'bad' });
  else log(s, text, 'news');
}

/** Each AI house whose lord has changed since its last review reviews its treaties once. A regency keeps the house's word. */
function reviewTreaties(s: GameState, fp: ForeignPolicyState): void {
  for (const id of Object.keys(fp.heads)) if (!s.clans[id]) delete fp.heads[id];
  for (const id of Object.keys(s.clans).sort()) {
    if (id === s.playerClanId || !clanRegions(s, id).length) continue;
    const known = fp.heads[id];
    const head = s.clans[id].headId;
    fp.heads[id] = head;
    if (!known || known === head || !freeAdult(s, id)) continue;
    for (const t of treatiesOf(s, id)) {
      const why = repudiationReason(s, id, t);
      if (why) repudiate(s, id, t, why);
    }
  }
}

/** The year your ruler took the throne. */
function reignStart(s: GameState): number | undefined {
  return s.dynasty.rulers.find((r) => r.id === s.rulerId && r.to === undefined)?.from;
}

/** A treaty of yours signed before your ruler's reign began. Pure. */
export function predecessorTreaty(s: GameState, treatyId: string): boolean {
  const t = diplomacyOf(s).treaties.find((x) => x.id === treatyId && x.until > s.year);
  const from = reignStart(s);
  return !!t && (t.a === s.playerClanId || t.b === s.playerClanId) && from !== undefined && t.signed < from;
}

/** Why you cannot repudiate this treaty now; null if you can. Pure. */
export function repudiateBlocker(s: GameState, treatyId: string): string | null {
  if (!canAct(s)) return 'A regency keeps the house’s word.';
  if (!rulerFree(s)) return 'A captive ruler cannot speak for the house.';
  if (!predecessorTreaty(s, treatyId)) return 'You signed it yourself: only breaking it is left.';
  if (s.year - (reignStart(s) ?? s.year) > REPUDIATE_WINDOW) return `Only in the first ${REPUDIATE_WINDOW} cycles of a reign.`;
  return null;
}

/** Repudiate a treaty your predecessor signed: they lose some trust in you and remember it, but it is no breach. */
export function repudiateTreaty(s: GameState, treatyId: string): boolean {
  if (repudiateBlocker(s, treatyId)) return false;
  const t = diplomacyOf(s).treaties.find((x) => x.id === treatyId)!;
  repudiate(s, s.playerClanId, t, '');
  return true;
}

/** Each cycle, after treaties: stale ultimatums are dropped, new lords review their treaties, then a few expansionist lords press demands on weaker neighbours. */
export function foreignPolicyTick(s: GameState): void {
  const fp = ensureForeignPolicy(s);
  if (fp.ultimatums.length) fp.ultimatums = fp.ultimatums.filter((u) => s.clans[u.to] && stands(s, u));
  reviewTreaties(s, fp);
  for (const id of Object.keys(s.clans).sort()) {
    if (id === s.playerClanId || !clanRegions(s, id).length) continue;
    if (!cooldownReady(s, `ultimatum:${id}`) || !chance(s, ULTIMATUM_RATE)) continue;
    const u = ultimatumTarget(s, id);
    if (u) {
      const world = PLANET_BY_ID[s.clans[id].planetId]?.name;
      if (u.to !== s.playerClanId)
        log(s, `House ${s.clans[id].name}${world ? ` of ${world}` : ''} demands ${describeDemand(s, u.demand)} from House ${s.clans[u.to].name}.`, 'news');
      issueUltimatum(s, u.from, u.to, u.demand);
    }
  }
}

// ── What the events look for ─────────────────────────────────────────────

/** Two AI houses with a public quarrel (a grudge of 25 or worse, or broken promises), one of them next to you, at peace with each other and with you. Pure. */
export function quarrelNearYou(s: GameState): { a: string; b: string } | undefined {
  const me = s.playerClanId;
  const d = diplomacyOf(s);
  const pairs = new Set<string>();
  for (const m of d.memories) if (m.value < 0) pairs.add(`${m.observer}>${m.subject}`);
  for (const [key, v] of Object.entries(d.trust)) if (v <= -30) pairs.add(key);
  for (const key of [...pairs].sort()) {
    const [a, b] = key.split('>');
    if (a === me || b === me || !clanRegions(s, a).length || !clanRegions(s, b).length || !headOf(s, a) || !headOf(s, b)) continue;
    if (!(neighbours(s, a, me) || neighbours(s, b, me)) || atWarBetween(s, a, b) || atWarBetween(s, a, me) || atWarBetween(s, b, me)) continue;
    if (houseMemorySum(s, a, b) <= -25 || trustOf(s, a, b) <= -30) return { a, b };
  }
  return undefined;
}

/** AI houses next to you, in other realms, that fear you as a rising power, mightiest first. Pure. */
export function fearfulOfYou(s: GameState): string[] {
  const me = s.playerClanId;
  if (!risingPower(s, me)) return [];
  return Object.keys(s.clans)
    .filter((id) => id !== me && clanRegions(s, id).length && headOf(s, id) && neighbours(s, id, me) && realmOf(s, id) !== realmOf(s, me))
    .sort((a, b) => mightOf(s, b) - mightOf(s, a) || (a < b ? -1 : 1));
}

/** Someone of a house set against you (a sworn rival, or one that loathes you) who might flee its court: an adult, free, not its lord. Pure. */
export function defectorFrom(s: GameState): { clanId: string; personId: string } | undefined {
  for (const k of Object.values(s.clans).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (k.isPlayer || !clanRegions(s, k.id).length || !(isRival(k) || k.opinion <= -40)) continue;
    const who = Object.values(s.characters)
      .filter((c) => c.clanId === k.id && c.died === undefined && c.id !== k.headId && !c.prisonerOf && s.year - c.born >= 18)
      .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    if (who) return { clanId: k.id, personId: who.id };
  }
  return undefined;
}

export { describeDemand, prize as demandableRegion };
