// How houses regard one another (WAVE-5-DIPLOMACY.md slice 2). Every pair of
// houses has a relation, AI with AI as well as with you, and it always says
// why: the rulers' personal regard, whether they share a world, marriage ties,
// what each remembers the other doing, how far they trust each other, the
// treaties between them, and war.
//
// What an AI house remembers of *you* stays where it always was (Clan.memories
// and Clan.opinion, memory.ts): that is the one authority for that direction,
// so nothing is copied or counted twice. What AI houses remember of *each
// other* is new, kept sparsely here under the same rules: grave wrongs barely
// fade, and favours buy back only a quarter of a grave grudge.

import { pactMap, type Pacts } from './aiCourt';
import { alive, ch, clanRank, clanRegions, ruler } from './core';
import type { DiplomacyState, HouseMemory, Reason, Treaty, TreatyKind } from './diplomacyTypes';
import { remember } from './memory';
import { neighbourPlanets } from './planets';
import { opinionOf } from './relations';
import { clamp } from './rng';
import type { Character, GameState } from './types';

/** GameState with the diplomacy record the v9 save adds (WAVE-5-CONTRACT.md). Read through these helpers only. */
export type WithDiplomacy = GameState & { diplomacy?: DiplomacyState };

const EMPTY: DiplomacyState = Object.freeze({ treaties: [], proposals: [], memories: [], trust: {}, trustYear: {} }) as DiplomacyState;

/** The diplomacy record, or an empty one for a save that has none yet. Never writes. */
export function diplomacyOf(s: GameState): DiplomacyState {
  return (s as WithDiplomacy).diplomacy ?? EMPTY;
}

/** The diplomacy record, created empty if missing: for code about to change it. */
export function ensureDiplomacy(s: GameState): DiplomacyState {
  const w = s as WithDiplomacy;
  w.diplomacy ??= { treaties: [], proposals: [], memories: [], trust: {}, trustYear: {} };
  w.diplomacy.treaties ??= [];
  w.diplomacy.proposals ??= [];
  w.diplomacy.memories ??= [];
  w.diplomacy.trust ??= {};
  w.diplomacy.trustYear ??= {};
  return w.diplomacy;
}

/** A save without diplomacy starts with none: no treaties, neutral trust, no invented history. Safe to run twice. */
export function migrateDiplomacy(s: GameState): void {
  ensureDiplomacy(s);
}

export const headOf = (s: GameState, id: string): Character | undefined => {
  const c = id === s.playerClanId ? ruler(s) : ch(s, s.clans[id]?.headId);
  return alive(c) ? c : undefined;
};
const house = (s: GameState, id: string) => `House ${s.clans[id]?.name ?? 'unknown'}`;

// ── Trust ─────────────────────────────────────────────────────────────────

export const TRUST_MIN = -100;
export const TRUST_MAX = 100;
const trustKey = (observer: string, subject: string) => `${observer}>${subject}`;
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** How far `observer` trusts `subject`: -100 to 100, neutral 0 until they have dealt with each other. Pure. */
export function trustOf(s: GameState, observer: string, subject: string): number {
  return diplomacyOf(s).trust[trustKey(observer, subject)] ?? 0;
}

export function adjustTrust(s: GameState, observer: string, subject: string, delta: number): void {
  if (observer === subject || !delta) return;
  const d = ensureDiplomacy(s);
  const next = clamp(trustOf(s, observer, subject) + delta, TRUST_MIN, TRUST_MAX);
  if (next) d.trust[trustKey(observer, subject)] = next;
  else delete d.trust[trustKey(observer, subject)];
}

// ── House memories ────────────────────────────────────────────────────────

/** A grave wrong between houses: at most this fraction fades each cycle (as memory.ts). */
const GRAVE_DECAY = 0.008;
/** While a grave grudge this deep stands, favours count for a quarter. */
const GRAVE_BITTER = -20;
const GRAVE_FORGIVABLE = 0.25;
const MAX_PER_PAIR = 6;

const isGrave = (m: { value: number; grave?: boolean }) => m.grave ?? m.value <= -40;

/**
 * What `observer` remembers of `subject`. Of you, an AI house's memories are
 * its existing Clan.memories (read-only here); between AI houses, the new
 * record. You keep no house memories: your choices are yours to make.
 */
export function houseMemoriesOf(s: GameState, observer: string, subject: string): HouseMemory[] {
  if (observer === s.playerClanId || observer === subject) return [];
  if (subject === s.playerClanId)
    return (s.clans[observer]?.memories ?? []).map((m) => ({ observer, subject, text: m.text, year: m.year, value: m.value, decay: m.decay, grave: m.grave }));
  return diplomacyOf(s).memories.filter((m) => m.observer === observer && m.subject === subject);
}

/** What the memories add up to: favours offset ordinary grudges in full, but only a quarter of grave ones. Pure. */
export function houseMemorySum(s: GameState, observer: string, subject: string): number {
  let grave = 0,
    ordinary = 0,
    favours = 0;
  for (const m of houseMemoriesOf(s, observer, subject)) {
    if (m.value > 0) favours += m.value;
    else if (isGrave(m)) grave += m.value;
    else ordinary += m.value;
  }
  if (!grave) return ordinary + favours;
  return grave + ordinary + Math.min(favours, -ordinary - grave * GRAVE_FORGIVABLE);
}

/**
 * Something `observer` will remember about `subject`. About you, this is the
 * existing memory.ts writer, unchanged. Between AI houses it follows the same
 * rules: -40 or worse is grave unless said otherwise, and while a grave grudge
 * stands, favours count for a quarter.
 */
export function rememberHouse(s: GameState, observer: string, subject: string, m: { text: string; value: number; decay?: number; grave?: boolean }): void {
  if (observer === subject || observer === s.playerClanId || !s.clans[observer] || !s.clans[subject]) return;
  if (subject === s.playerClanId) {
    remember(s, observer, m.text, m.value, m.decay, m.grave ?? m.value <= -40);
    return;
  }
  const grave = m.grave ?? m.value <= -40;
  let value = m.value;
  const graveSum = houseMemoriesOf(s, observer, subject)
    .filter(isGrave)
    .reduce((n, x) => n + x.value, 0);
  if (value > 0 && graveSum <= GRAVE_BITTER) value = Math.round(value * GRAVE_FORGIVABLE);
  if (!value) return;
  const d = ensureDiplomacy(s);
  d.memories.push({
    observer,
    subject,
    text: m.text,
    year: s.year,
    value,
    decay: grave ? Math.min(m.decay ?? GRAVE_DECAY, GRAVE_DECAY) : (m.decay ?? (value < 0 ? 0.05 : 0.1)),
    grave: grave || undefined,
  });
  const mine = d.memories.filter((x) => x.observer === observer && x.subject === subject);
  if (mine.length > MAX_PER_PAIR) {
    // Forget the faintest first.
    const faintest = mine.reduce((a, b) => (Math.abs(b.value) < Math.abs(a.value) ? b : a));
    d.memories.splice(d.memories.indexOf(faintest), 1);
  }
}

/** Memories between AI houses fade like memories of you. */
export function houseMemoriesTick(s: GameState): void {
  const d = (s as WithDiplomacy).diplomacy;
  if (!d?.memories.length) return;
  d.memories = d.memories
    .filter((m) => s.clans[m.observer] && s.clans[m.subject])
    .map((m) => ({ ...m, value: m.value * (1 - m.decay) }))
    .filter((m) => Math.abs(m.value) >= 2);
}

// ── Relations ─────────────────────────────────────────────────────────────

/** Live treaties between two houses. Pure. */
export function treatiesBetween(s: GameState, a: string, b: string, kind?: TreatyKind): Treaty[] {
  return diplomacyOf(s).treaties.filter((t) => t.until > s.year && ((t.a === a && t.b === b) || (t.a === b && t.b === a)) && (!kind || t.kind === kind));
}

const TREATY_REGARD: Record<TreatyKind, number> = { nonAggression: 5, defensive: 15, trade: 8, guarantee: 10, tribute: -5 };
const TREATY_NAME: Record<TreatyKind, string> = {
  nonAggression: 'Non-aggression pact',
  defensive: 'Defensive pact',
  trade: 'Trade agreement',
  guarantee: 'Guarantee',
  tribute: 'Tribute',
};
export function treatyName(kind: TreatyKind): string {
  return TREATY_NAME[kind];
}

function warBetween(s: GameState, a: string, b: string): boolean {
  if (a === s.playerClanId || b === s.playerClanId) return s.wars.some((w) => w.enemy === (a === s.playerClanId ? b : a));
  return s.aiWars.some((w) => (w.attacker === a && w.defender === b) || (w.attacker === b && w.defender === a));
}

/** Neighbours: the same world, or worlds next to each other. */
export function neighbours(s: GameState, a: string, b: string): boolean {
  const pa = s.clans[a]?.planetId,
    pb = s.clans[b]?.planetId;
  return !!pa && !!pb && (pa === pb || neighbourPlanets(pa).includes(pb));
}

/** A house's might for diplomacy: its fleet at home and on loan. */
export function mightOf(s: GameState, id: string): number {
  return id === s.playerClanId ? s.fleet : (s.clans[id]?.fleet ?? 0);
}

/**
 * How `from` regards `to`, -100 to 100, with every reason. Of you, an AI
 * house's standing (Clan.opinion, which already holds its memories of you)
 * is the base; between AI houses it is built from the rulers' personal regard
 * and the houses' own history. Treaties, trust and war count either way. Pure.
 */
export function houseRelation(s: GameState, from: string, to: string, pacts?: Pacts): { value: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  if (from === to || !s.clans[from] || !s.clans[to]) return { value: 0, reasons };
  const add = (label: string, value: number) => {
    value = Math.round(value);
    if (value) reasons.push({ label, value });
  };
  if (from !== s.playerClanId && to === s.playerClanId) {
    add('Their standing with your house', s.clans[from].opinion);
  } else {
    const a = headOf(s, from),
      b = headOf(s, to);
    if (a && b) add("Their rulers' personal regard", opinionOf(s, a, b) * 0.5);
    if (s.clans[from].planetId === s.clans[to].planetId) add('Share a world', 8);
    else if (neighbours(s, from, to)) add('Neighbouring worlds', 3);
    if (s.clans[from].faithId === s.clans[to].faithId) add('Share a faith', 5);
    if ((pacts ?? pactMap(s)).get(from)?.has(to)) add('Bound by marriage', 15);
    add('What they remember of them', houseMemorySum(s, from, to));
    if (from === s.playerClanId && s.clans[to].allied) add('Allies', 15);
  }
  const trust = trustOf(s, from, to);
  if (trust) add(trust > 0 ? 'Trust built by kept promises' : 'Broken promises', trust / 4);
  for (const t of treatiesBetween(s, from, to)) add(TREATY_NAME[t.kind], t.kind === 'tribute' && t.b === from ? -10 : TREATY_REGARD[t.kind]);
  if (warBetween(s, from, to)) add('At war', -40);
  const rf = clanRank(s, from),
    rt = clanRank(s, to);
  if (rt >= 3 && rf < 3 && neighbours(s, from, to) && clanRegions(s, to).length > clanRegions(s, from).length * 2) add('Wary of a great neighbour', -5);
  const value = clamp(
    reasons.reduce((n, r) => n + (r.value ?? 0), 0),
    -100,
    100,
  );
  return { value, reasons: reasons.sort((x, y) => Math.abs(y.value ?? 0) - Math.abs(x.value ?? 0)) };
}

export { house as houseName };
