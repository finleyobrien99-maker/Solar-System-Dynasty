// Houses remember. Every grudge and favour is stored on the clan, outlives
// the head who suffered it, and fades slowly. Murders and executions fade
// slowest of all: kill a lord and his children will still hate you decades on.

import { clamp } from './rng';
import type { Clan, GameState, Memory } from './types';

export const RIVAL_THRESHOLD = -40;
const MAX_MEMORIES = 8;

export function remember(s: GameState, clanId: string | undefined, text: string, value: number, decay?: number): void {
  const clan = clanId ? s.clans[clanId] : undefined;
  if (!clan || clan.isPlayer) return;
  const mem: Memory = { text, year: s.year, value, decay: decay ?? (value < 0 ? 0.05 : 0.1) };
  clan.memories = [...(clan.memories ?? []), mem];
  if (clan.memories.length > MAX_MEMORIES) {
    // Forget the faintest memory first.
    clan.memories.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    clan.memories = clan.memories.slice(0, MAX_MEMORIES).sort((a, b) => a.year - b.year);
  }
  clan.opinion = clamp(clan.opinion + value * 0.5, -100, 100);
}

export function memorySum(clan: Clan | undefined): number {
  return (clan?.memories ?? []).reduce((a, m) => a + m.value, 0);
}

export function isRival(clan: Clan | undefined): boolean {
  return memorySum(clan) <= RIVAL_THRESHOLD;
}

export function memoryTick(s: GameState): void {
  for (const clan of Object.values(s.clans)) {
    if (!clan.memories?.length) continue;
    clan.memories = clan.memories
      .map((m) => ({ ...m, value: m.value * (1 - m.decay) }))
      .filter((m) => Math.abs(m.value) >= 2);
  }
}

export function grudgeOpinion(clan: Clan): number {
  return clamp(Math.round(memorySum(clan)), -70, 40);
}
