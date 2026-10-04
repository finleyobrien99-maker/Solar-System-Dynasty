// House institutions survive succession; personal deeds do not.
import type { Character, GameState, HouseGenetics } from './types';
import { TRAITS } from './traits';

export function newHouseGenetics(): HouseGenetics {
  return { locked: [], purged: [], slots: 2, faith: 0, forge: { level: 0, researched: [] } };
}

/** New houses start empty. Never fabricate past research or spending in old saves. */
export function initialiseHouseGenetics(s: GameState): void {
  for (const k of Object.values(s.clans)) if (!k.isPlayer && k.cadetOf !== s.playerClanId) k.genetics ??= newHouseGenetics();
}

/** A modest preference within an already eligible political match pool. No dice or kinship guesses. */
export function geneticMatchWeight(a: Character, b: Character): number {
  let score = 10;
  for (const id of b.traits) {
    const t = TRAITS[id];
    if (t?.cat !== 'genetic') continue;
    score += t.good ? Math.max(1, t.level ?? 1) * 2 : -3;
    if (t.good && a.traits.includes(id)) score += 2;
  }
  return Math.max(1, Math.min(30, score));
}
