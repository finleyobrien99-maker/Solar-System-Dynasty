// Houses remember. Every grudge and favour is stored on the clan, outlives
// the head who suffered it, and fades slowly. Grave wrongs (murder, a murder
// attempt, blackmail, executing their kin, stealing their throne) barely fade
// at all, and favours can't buy them back: gifts and charm can offset an
// ordinary grudge in full but only a quarter of a grave one. Kill a lord's
// wife and his children will still hate you decades on.

import { clamp } from './rng';
import type { Clan, GameState, Memory } from './types';

export const RIVAL_THRESHOLD = -40;
const MAX_MEMORIES = 10;
/** How fast grave memories fade at most: about half in 85 cycles. */
const GRAVE_DECAY = 0.008;
/** A grave grudge this deep or deeper: favours count for a quarter. */
const GRAVE_BITTER = -20;
/** How much of a grave grudge favours can ever offset. */
const GRAVE_FORGIVABLE = 0.25;

export function isGrave(m: Memory): boolean {
  return m.grave ?? m.value <= -40;
}

/** The sum of a house's grave grudges (zero or less). */
export function graveSum(clan: Clan | undefined): number {
  return (clan?.memories ?? []).filter(isGrave).reduce((a, m) => a + m.value, 0);
}

/**
 * Record something a house will remember about you. Wrongs of -40 or worse
 * are grave unless said otherwise. While a house nurses a grave grudge, your
 * favours count for a quarter: they return your gifts all but unopened.
 */
export function remember(s: GameState, clanId: string | undefined, text: string, value: number, decay?: number, grave = value <= -40): void {
  const clan = clanId ? s.clans[clanId] : undefined;
  if (!clan || clan.isPlayer) return;
  if (value > 0 && graveSum(clan) <= GRAVE_BITTER) value = Math.round(value * GRAVE_FORGIVABLE);
  if (!value) return;
  const mem: Memory = {
    text,
    year: s.year,
    value,
    decay: grave ? Math.min(decay ?? GRAVE_DECAY, GRAVE_DECAY) : (decay ?? (value < 0 ? 0.05 : 0.1)),
    grave: grave || undefined,
  };
  clan.memories = [...(clan.memories ?? []), mem];
  if (clan.memories.length > MAX_MEMORIES) {
    // Forget the faintest memory first.
    clan.memories.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    clan.memories = clan.memories.slice(0, MAX_MEMORIES).sort((a, b) => a.year - b.year);
  }
  clan.opinion = capOpinion(clan, clamp(clan.opinion + value * 0.5, -100, 100));
}

/** A house's opinion of you, held under the ceiling a grave grudge sets. */
export function capOpinion(clan: Clan, opinion: number): number {
  const ceiling = opinionCeiling(clan);
  return ceiling === null ? opinion : Math.min(opinion, ceiling);
}

/** What a house's memories add up to: favours offset ordinary grudges in full, but only a quarter of grave ones. */
export function memorySum(clan: Clan | undefined): number {
  let grave = 0;
  let ordinary = 0;
  let favours = 0;
  for (const m of clan?.memories ?? []) {
    if (m.value > 0) favours += m.value;
    else if (isGrave(m)) grave += m.value;
    else ordinary += m.value;
  }
  if (!grave) return ordinary + favours;
  return grave + ordinary + Math.min(favours, -ordinary - grave * GRAVE_FORGIVABLE);
}

export function isRival(clan: Clan | undefined): boolean {
  return memorySum(clan) <= RIVAL_THRESHOLD;
}

export function memoryTick(s: GameState): void {
  for (const clan of Object.values(s.clans)) {
    if (!clan.memories?.length) continue;
    clan.memories = clan.memories.map((m) => ({ ...m, value: m.value * (1 - m.decay) })).filter((m) => Math.abs(m.value) >= 2);
  }
}

export function grudgeOpinion(clan: Clan): number {
  return clamp(Math.round(memorySum(clan)), -100, 40);
}

/**
 * The best a house with a grave grudge can think of you, however famous,
 * charming or generous you are. Null when there's no grave grudge.
 */
export function opinionCeiling(clan: Clan): number | null {
  const g = graveSum(clan);
  return g < 0 ? Math.round(g * 0.6) : null;
}
