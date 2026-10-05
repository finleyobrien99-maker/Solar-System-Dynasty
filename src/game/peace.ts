// Peace belongs to houses, so neither a new ruler nor a different prize erases it.
import { ageOf, alive, ch, clanRegions, log, ruler } from './core';
import { recordDeed } from './epithets';
import { capOpinion, remember } from './memory';
import { addFeeling, opinionOf } from './relations';
import { clamp } from './rng';
import type { GameState, Truce } from './types';
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
