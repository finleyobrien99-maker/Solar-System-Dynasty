// Stated objectives are separate from the cause of a war. Queries never roll or write.
import { alive, ch, clanRegions, liegeOf, log, newId, setOwner } from './core';
import { headOf, rememberHouse } from './houseRelations';
import { recordDeed } from './epithets';
import { recordExpansion } from './coalitions';
import { recordPlanetConquest } from './realmDefence';
import type { AiWar, GameState, War } from './types';

export type WarGoal =
  | { kind: 'cede'; regionId: string }
  | { kind: 'tribute'; amount: number; years: number }
  | { kind: 'humiliate'; prestige: number }
  | { kind: 'liberate'; vassalId: string };
export type PeaceTerms = { kind: 'white' } | { kind: 'goal'; winner: string; goal: WarGoal } | { kind: 'reparations'; winner: string; amount: number };
export interface PeaceProposal {
  id: string;
  warId: string;
  from: string;
  to: string;
  terms: PeaceTerms;
  year: number;
  expires: number;
}
export interface PeaceTribute {
  id: string;
  warId: string;
  from: string;
  to: string;
  amount: number;
  started: number;
  until: number;
  lastPaid?: number;
}
export const NAKED_WAR_PRESTIGE = 120;
export const MAX_TRIBUTE_CYCLES = 20;
export const MAX_TRIBUTE_CREDITS = 1000;
export const MAX_HUMILIATION = 200;
export const whole = (n: number, max: number) => Number.isInteger(n) && n > 0 && n <= max;
export const sameGoal = (a: WarGoal, b: WarGoal) =>
  a.kind === b.kind &&
  (a.kind === 'cede' && b.kind === 'cede'
    ? a.regionId === b.regionId
    : a.kind === 'tribute' && b.kind === 'tribute'
      ? a.amount === b.amount && a.years === b.years
      : a.kind === 'humiliate' && b.kind === 'humiliate'
        ? a.prestige === b.prestige
        : a.kind === 'liberate' && b.kind === 'liberate' && a.vassalId === b.vassalId);

export function goalBlocker(s: GameState, attacker: string, defender: string, goal: WarGoal): string | null {
  if (s.gameOver) return 'The dynasty has ended.';
  if (attacker === defender || !s.clans[attacker] || !s.clans[defender]) return 'Two different recorded houses are needed.';
  if (!clanRegions(s, attacker).length || !clanRegions(s, defender).length) return 'Both houses must still hold land.';
  if (!goal || !['cede', 'tribute', 'humiliate', 'liberate'].includes(goal.kind)) return 'Unknown war goal.';
  if (goal.kind === 'cede') return s.regions[goal.regionId]?.owner === defender ? null : 'The region no longer belongs to the defending house.';
  if (goal.kind === 'tribute')
    return whole(goal.amount, MAX_TRIBUTE_CREDITS) && whole(goal.years, MAX_TRIBUTE_CYCLES) ? null : 'Tribute needs 1–1000 whole credits for 1–20 cycles.';
  if (goal.kind === 'humiliate') return whole(goal.prestige, MAX_HUMILIATION) ? null : 'Humiliation needs 1–200 prestige.';
  if (goal.vassalId === attacker || goal.vassalId === defender || !s.clans[goal.vassalId] || !clanRegions(s, goal.vassalId).length)
    return 'Choose a landed third house to liberate.';
  return liegeOf(s, goal.vassalId) === defender ? null : 'That house is no longer a direct vassal of the defender.';
}
export function civilWarBlocker(s: GameState, attacker: string, defender: string): string | null {
  return s.successionCrises.some(
    (c) =>
      c.stage === 'civil-war' &&
      ([attacker, defender].includes(c.clanId) || c.contributions.some((p) => p.ships > 0 && [attacker, defender].includes(p.clanId))),
  )
    ? 'A house is already committed to a civil war.'
    : null;
}
export function goalLabel(s: GameState, goal: WarGoal): string {
  switch (goal.kind) {
    case 'cede':
      return 'Cede ' + (s.regions[goal.regionId]?.name ?? 'the recorded region');
    case 'tribute':
      return 'Tribute: ' + goal.amount + ' credits for ' + goal.years + ' cycles';
    case 'humiliate':
      return 'Humiliation: up to ' + goal.prestige + ' prestige';
    case 'liberate':
      return 'Liberate House ' + (s.clans[goal.vassalId]?.name ?? 'unknown');
  }
}
export function warSides(s: GameState, w: War | AiWar): { attacker: string; defender: string; score: number } {
  return 'enemy' in w
    ? {
        attacker: w.playerAttacker ? s.playerClanId : w.enemy,
        defender: w.playerAttacker ? w.enemy : s.playerClanId,
        score: w.score * (w.playerAttacker ? 1 : -1),
      }
    : { attacker: w.attacker, defender: w.defender, score: w.progress };
}
export function findWar(s: GameState, war: string | War | AiWar): War | AiWar | undefined {
  const id = typeof war === 'string' ? war : war.id;
  return [...s.wars, ...s.aiWars].find((w) => w.id === id);
}
export function houseFunds(s: GameState, id: string, kind: 'credits' | 'prestige' = 'credits'): number {
  const n = id === s.playerClanId ? s[kind] : s.clans[id]?.[kind];
  return Number.isFinite(n) ? Math.max(0, Math.floor(n!)) : 0;
}
export function moveFunds(s: GameState, from: string, to: string, amount: number, kind: 'credits' | 'prestige' = 'credits'): number {
  if (from === to || !s.clans[from] || !s.clans[to] || !Number.isFinite(amount) || amount <= 0) return 0;
  const paid = Math.min(Math.floor(amount), houseFunds(s, from, kind));
  if (from === s.playerClanId) s[kind] -= paid;
  else s.clans[from][kind] -= paid;
  if (to === s.playerClanId) s[kind] += paid;
  else s.clans[to][kind] += paid;
  return paid;
}
/** Accepted demands and enforced victories share the same physical effects. Caller owns explicit consent. */
export function settleDemand(
  s: GameState,
  attacker: string,
  defender: string,
  goal: WarGoal,
  warId = 'demand',
  cb: War['cb'] = 'feud',
  actorId?: string,
): boolean {
  if (goalBlocker(s, attacker, defender, goal)) return false;
  const lord = actorId ? ch(s, actorId) : headOf(s, attacker);
  if (goal.kind === 'cede') {
    const region = s.regions[goal.regionId],
      capital = region.capital;
    rememberHouse(s, defender, attacker, { text: 'Yielded ' + region.name, value: capital ? -55 : -35, decay: 0.025 });
    setOwner(s, region, attacker);
    recordExpansion(s, attacker, region, cb);
    recordPlanetConquest(s, attacker, region, cb);
    recordDeed(s, lord?.id, 'regionsTaken', 1, region.id);
    if (capital) recordDeed(s, lord?.id, 'capitalsTaken', 1, region.planetId);
    if (attacker === s.playerClanId) {
      s.claims = s.claims.filter((id) => id !== region.id);
      if (capital) s.prestige += 150;
    }
    if (capital && attacker !== s.playerClanId) s.clans[attacker].prestige += 150;
  } else if (goal.kind === 'tribute') {
    const existing = (s.peaceTributes ?? []).find((t) => t.from === defender && t.to === attacker && t.until > s.year);
    if (existing) {
      existing.amount = goal.amount;
      existing.until = s.year + goal.years + 1;
      existing.started = s.year;
    } else
      (s.peaceTributes ??= []).push({
        id: newId(s, 'pt'),
        warId,
        from: defender,
        to: attacker,
        amount: goal.amount,
        started: s.year,
        until: s.year + goal.years + 1,
      });
  } else if (goal.kind === 'humiliate') {
    const paid = moveFunds(s, defender, attacker, goal.prestige, 'prestige');
    rememberHouse(s, defender, attacker, { text: 'Humiliated our house in settlement', value: -25 });
    log(s, 'House ' + s.clans[defender].name + ' yields ' + paid + ' actual prestige to House ' + s.clans[attacker].name + '.', 'war');
  } else s.clans[goal.vassalId].liege = 'none';
  log(s, 'House ' + s.clans[defender].name + ' accepts terms: ' + goalLabel(s, goal) + '.', 'war');
  return true;
}
/** One physical transfer per recorded year, including AI-AI, AI-player and player-AI. */
export function peaceTributeTick(s: GameState): void {
  s.peaceTributes = (s.peaceTributes ?? []).filter(
    (t) => t.until > s.year && s.clans[t.from] && s.clans[t.to] && clanRegions(s, t.from).length && clanRegions(s, t.to).length,
  );
  for (const t of s.peaceTributes) {
    if (t.lastPaid === s.year || s.year <= t.started) continue;
    t.lastPaid = s.year;
    const paid = moveFunds(s, t.from, t.to, t.amount);
    if (t.from === s.playerClanId || t.to === s.playerClanId)
      log(s, 'Peace tribute: House ' + s.clans[t.from].name + ' pays House ' + s.clans[t.to].name + ' ' + paid + ' of ' + t.amount + ' credits owed.', 'war');
  }
}
export function goalCampaignValid(s: GameState, war: War | AiWar): boolean {
  const sides = warSides(s, war);
  return !!war.goal && !goalBlocker(s, sides.attacker, sides.defender, war.goal);
}
export function rulerCanNegotiate(s: GameState, id: string): boolean {
  const head = headOf(s, id);
  return !!head && alive(head) && !head.prisonerOf && s.year - head.born >= 16;
}

export interface RefusedWarDemand {
  id: string;
  from: string;
  to: string;
  goal: WarGoal;
  expires: number;
  used?: boolean;
}
/** The policy lane calls this only after its real decision/explicit refusal. Never invent it from logs. */
export function recordRefusedDemand(s: GameState, id: string, from: string, to: string, goal: WarGoal, expires: number): boolean {
  if (
    !id ||
    goalBlocker(s, from, to, goal) ||
    !Number.isInteger(expires) ||
    expires <= s.year ||
    expires > s.year + 10 ||
    (s.warJustifications ?? []).some((x) => x.id === id)
  )
    return false;
  (s.warJustifications ??= []).push({ id, from, to, goal: structuredClone(goal), expires });
  return true;
}
export function refusedWarDemand(s: GameState, id: string): RefusedWarDemand | undefined {
  return s.warJustifications?.find((x) => x.id === id && !x.used && x.expires > s.year);
}
export function goalJustified(s: GameState, id: string | undefined, from: string, to: string, goal: WarGoal): boolean {
  const j = id && refusedWarDemand(s, id);
  return !!j && j.from === from && j.to === to && sameGoal(j.goal, goal) && !goalBlocker(s, from, to, goal);
}
