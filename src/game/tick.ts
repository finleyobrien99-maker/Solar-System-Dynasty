import { peaceTributeTick } from './warGoals';
import { peaceOffersTick } from './peace';
import { coalitionsTick } from './coalitions';
import { peaceTick } from './peace';
import { successionTick } from './succession';
import { regencyTick } from './regency';
import { realmDefenceTick } from './realmDefence';
import { diplomacyTick } from './treaties';
import { ambitionsTick } from './ambitions';
import { secretsTick } from './secrets';
import { epithetsTick, recordDeed } from './epithets';
// Ageing up one cycle: the heartbeat of the game.

import { aiTick, prune } from './ai';
import { ageOf, alive, clanRank, clanRegions, log, playerClan, ruler } from './core';
import { creditLines, faithLines, prestigeLines, sum } from './economy';
import { rollEvents } from './events';
import { betrothalTick, birthsTick, growthTick, healthTick, matchmakingTick } from './life';
import { refreshShop } from './realm';
import { relationsTick } from './relations';
import { councilTick } from './council';
import { memoryTick } from './memory';
import { forgeTick } from './forge';
import { tradeTick } from './trade';
import type { GameState } from './types';
import { tickPlayerWars } from './war';

export function canAgeUp(s: GameState): boolean {
  return !s.gameOver && s.pending.length === 0;
}

export function ageUp(s: GameState): void {
  if (!canAgeUp(s)) return;
  s.year += 1;
  peaceOffersTick(s);
  peaceTributeTick(s);
  peaceTick(s); // Expire treaties before this cycle's declarations.
  realmDefenceTick(s); // A world's unity and outrage fade.
  diplomacyTick(s); // Treaties lapse or pay before this cycle's wars are chosen; AI houses seek new ones.
  coalitionsTick(s); // Fear cools only if the cycle began without an offensive war.

  // Money first, so this cycle's events see this cycle's treasury.
  const dc = sum(creditLines(s, false)); // Tribute was already transferred, capped, by diplomacyTick.
  const dp = sum(prestigeLines(s));
  const df = sum(faithLines(s));
  s.credits += dc;
  s.prestige += dp;
  s.faith = Math.max(0, s.faith + df);
  if (s.credits < 0) {
    const deserters = Math.ceil(s.fleet * 0.1);
    s.fleet -= deserters;
    log(s, deserters ? `The treasury is empty! ${deserters} unpaid crews desert the fleet.` : 'The treasury is empty and creditors are circling.', 'bad');
  }

  const r = ruler(s);
  recordDeed(s, r, 'income', Math.max(0, dc));
  epithetsTick(s);
  log(
    s,
    `${r.name} turns ${ageOf(s, r)}. Income: ${dc >= 0 ? '+' : ''}${dc} credits, ${dp >= 0 ? '+' : ''}${dp} prestige, ${df >= 0 ? '+' : ''}${df} faith.`,
    'info',
  );

  healthTick(s);
  if (s.gameOver) return;
  birthsTick(s);
  growthTick(s);
  betrothalTick(s);
  matchmakingTick(s);
  relationsTick(s);
  memoryTick(s);
  councilTick(s);
  forgeTick(s);
  aiTick(s);
  successionTick(s);
  regencyTick(s); // After deaths and inheritances, before this cycle's events.
  ambitionsTick(s);
  secretsTick(s); // Discover evidence after new AI deeds, before blackmail letters are selected.
  tickPlayerWars(s);
  tradeTick(s);
  if (s.gameOver) return;

  if (!clanRegions(s, s.playerClanId).length) {
    s.gameOver = { reason: `House ${playerClan(s).name} has lost every last region and fades into exile.`, year: s.year };
    return;
  }
  if (!alive(ruler(s))) return;

  refreshShop(s);
  if (s.suitors && s.suitors.year < s.year) s.suitors = undefined;
  rollEvents(s);

  s.stats.peakRank = Math.max(s.stats.peakRank, clanRank(s, s.playerClanId));
  for (const k of Object.keys(s.cooldowns)) {
    if (k.startsWith('schemes@') && Number(k.slice(8)) < s.year) delete s.cooldowns[k];
    else if (k !== 'executions' && s.cooldowns[k] < s.year - 1 && !k.startsWith('schemes@')) delete s.cooldowns[k];
  }
  prune(s);
}
