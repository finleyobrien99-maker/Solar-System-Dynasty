// Expansion creates fear; frightened houses pledge real ships to defend one another.
import { pactMap, type Pacts } from './aiCourt';
import { ageOf, alive, ch, clanRegions, liegeOf, log, regentHolding, ruler } from './core';
import { truceOf } from './peace';
import {
  aidBattleNotes,
  aidLosses,
  aidStrength,
  aidTruces,
  committedShips as aidCommittedShips,
  homeFleet,
  releaseAid,
  reserveAid,
  snapshotAid,
  type AidSnapshot,
} from './warAid';
import { neighbourPlanets } from './planets';
import { clamp } from './rng';
import type { CasusBelli, Coalition, FleetContribution, GameState, Region } from './types';

export const THREAT_MAX = 100;
export const THREAT_LOCAL = 30;
export const THREAT_WIDE = 60;
export const THREAT_RELEASE = 15;
export const THREAT_RECOVERY = 3;
export const COALITION_LIMIT = 8;
export const COALITION_SHARE = 0.5;

const contributions = (s: GameState): FleetContribution[][] => [...s.wars, ...s.aiWars].map((w) => w.coalition ?? []);
const houseHead = (s: GameState, id: string) => (id === s.playerClanId ? ruler(s) : ch(s, s.clans[id]?.headId));

export function threatOf(s: GameState, id: string): number {
  return clamp(s.houseThreat[id] ?? 0, 0, THREAT_MAX);
}
export function coalitionOf(s: GameState, target: string): Coalition | undefined {
  return s.coalitions.find((c) => c.target === target);
}

/** The war settlement calls this after setOwner, never for a fixture or a peaceful transfer. */
export function recordExpansion(s: GameState, attacker: string, region: Region, cb: CasusBelli = 'conquest'): void {
  if (!s.clans[attacker] || region.owner !== attacker || !['claim', 'holy', 'conquest', 'feud'].includes(cb)) return;
  s.houseThreat[attacker] = clamp(threatOf(s, attacker) + (cb === 'conquest' ? 20 : 12) + (region.capital ? 20 : 0), 0, THREAT_MAX);
}

function realm(s: GameState, id: string): string {
  // Follow actual sworn lieges, stopping safely if a malformed old save has a cycle.
  const seen = new Set<string>();
  let current = id;
  while (!seen.has(current)) {
    seen.add(current);
    const parent = liegeOf(s, current);
    if (!parent) return current;
    current = parent;
  }
  return id;
}
function threatened(s: GameState, id: string, target: string): boolean {
  if (threatOf(s, target) >= THREAT_WIDE) return true;
  const mine = new Set(clanRegions(s, id).map((r) => r.planetId));
  for (const r of clanRegions(s, target)) {
    if (mine.has(r.planetId) || neighbourPlanets(r.planetId).some((p) => mine.has(p))) return true;
  }
  return false;
}
function friendlyTo(s: GameState, id: string, target: string, pacts: Pacts): boolean {
  if (target === s.playerClanId && s.clans[id]?.allied) return true;
  if (id === s.playerClanId && s.clans[target]?.allied) return true;
  return !!pacts.get(id)?.has(target);
}
function eligible(s: GameState, id: string, target: string, pacts: Pacts): boolean {
  const h = houseHead(s, id);
  return (
    id !== target &&
    !!s.clans[id] &&
    !!s.clans[target] &&
    alive(h) &&
    !h.prisonerOf &&
    ageOf(s, h) >= 16 &&
    clanRegions(s, id).length > 0 &&
    clanRegions(s, target).length > 0 &&
    realm(s, id) !== realm(s, target) &&
    !friendlyTo(s, id, target, pacts) &&
    !truceOf(s, id, target) &&
    threatened(s, id, target)
  );
}
function busy(s: GameState, id: string, target: string): boolean {
  if (s.wars.some((w) => id === s.playerClanId || w.enemy === id)) return true;
  if (s.aiWars.some((w) => w.attacker === id || w.defender === id)) return true;
  if (s.successionCrises.some((c) => c.stage === 'civil-war' && (c.clanId === id || c.contributions.some((p) => p.clanId === id && p.ships > 0)))) return true;
  for (const w of s.wars) {
    const attacker = w.playerAttacker ? s.playerClanId : w.enemy;
    if (attacker !== target && w.coalition?.some((p) => p.clanId === id && p.ships > 0)) return true;
  }
  for (const w of s.aiWars) if (w.attacker !== target && w.coalition?.some((p) => p.clanId === id && p.ships > 0)) return true;
  return false;
}
function offensiveCampaign(s: GameState, id: string): boolean {
  return s.wars.some((w) => (w.playerAttacker ? id === s.playerClanId : id === w.enemy)) || s.aiWars.some((w) => w.attacker === id);
}

export function committedShips(s: GameState, clanId: string): number {
  return aidCommittedShips(s, clanId);
}

/** Compatibility wrapper. Returning the passed coalition loans does not release realm obligations. */
export function releaseCoalition(s: GameState, list: FleetContribution[]): void {
  releaseAid(s, list);
}
export function recallCoalition(s: GameState, clanId: string): void {
  for (const list of contributions(s))
    releaseCoalition(
      s,
      list.filter((p) => p.clanId === clanId),
    );
}

/** No rolls: the same saved political situation always produces the same defensive pledges. */
export function coalitionsTick(s: GameState): void {
  for (const id of Object.keys(s.houseThreat)) {
    if (!s.clans[id] || !clanRegions(s, id).length) delete s.houseThreat[id];
    else {
      const next = Math.max(0, threatOf(s, id) - (offensiveCampaign(s, id) ? 0 : THREAT_RECOVERY));
      if (next) s.houseThreat[id] = next;
      else delete s.houseThreat[id];
    }
  }
  const pacts = pactMap(s);
  for (const old of s.coalitions.slice()) {
    if (!s.clans[old.target] || threatOf(s, old.target) < THREAT_RELEASE || !clanRegions(s, old.target).length) {
      // Only these target's loans end; a member's separate defensive pledge remains intact.
      for (const w of s.wars) if ((w.playerAttacker ? s.playerClanId : w.enemy) === old.target) releaseCoalition(s, w.coalition ?? []);
      for (const w of s.aiWars) if (w.attacker === old.target) releaseCoalition(s, w.coalition ?? []);
      s.coalitions = s.coalitions.filter((c) => c !== old);
      log(s, `The defensive league against House ${s.clans[old.target]?.name ?? 'unknown'} dissolves.`, old.target === s.playerClanId ? 'war' : 'news');
    }
  }
  for (const target of Object.keys(s.houseThreat).sort()) {
    let c = coalitionOf(s, target);
    if (!c && threatOf(s, target) < THREAT_LOCAL) continue;
    const former = c?.members ?? [];
    const kept = former.filter((id) => eligible(s, id, target, pacts) && !busy(s, id, target));
    // Preserve valid existing pledges, including an explicit player pledge. New AI volunteers fill vacancies.
    const volunteers = Object.keys(s.clans)
      .filter(
        (id) =>
          threatOf(s, target) >= THREAT_LOCAL &&
          id !== s.playerClanId &&
          !kept.includes(id) &&
          eligible(s, id, target, pacts) &&
          !busy(s, id, target) &&
          homeFleet(s, id) >= 2,
      )
      .sort((a, b) => homeFleet(s, b) - homeFleet(s, a) || (a < b ? -1 : a > b ? 1 : 0));
    const members = [...kept, ...volunteers].slice(0, COALITION_LIMIT);
    for (const id of former.filter((id) => !members.includes(id))) {
      for (const w of s.wars)
        if ((w.playerAttacker ? s.playerClanId : w.enemy) === target)
          releaseCoalition(
            s,
            (w.coalition ?? []).filter((p) => p.clanId === id),
          );
      for (const w of s.aiWars)
        if (w.attacker === target)
          releaseCoalition(
            s,
            (w.coalition ?? []).filter((p) => p.clanId === id),
          );
    }
    if (!c) {
      c = { target, members, formed: s.year };
      s.coalitions.push(c);
      if (members.length)
        log(
          s,
          `Houses ${members.map((id) => s.clans[id].name).join(', ')} form a defensive league against House ${s.clans[target].name}.`,
          target === s.playerClanId ? 'war' : 'news',
        );
    } else c.members = members;
  }
}

export function coalitionPledgeBlocker(s: GameState, target: string): string | null {
  if (s.gameOver) return 'The dynasty has ended.';
  if (!s.clans[target] || target === s.playerClanId) return 'Choose another landed house.';
  if (threatOf(s, target) < THREAT_LOCAL && !coalitionOf(s, target)) return 'This house has not alarmed its neighbours.';
  if (coalitionOf(s, target)?.members.includes(s.playerClanId)) return 'You have already pledged.';
  const head = ruler(s);
  if (!alive(head) || head.prisonerOf || ageOf(s, head) < 16 || regentHolding(s)) return 'A free adult ruler must make this pledge.';
  if (!eligible(s, s.playerClanId, target, pactMap(s))) return 'Distance, allegiance, alliance or sworn peace prevents this pledge.';
  if (busy(s, s.playerClanId, target) || committedShips(s, s.playerClanId)) return 'Your fleet is already committed to war.';
  if (homeFleet(s, s.playerClanId) < 2) return 'You need at least two ships to pledge aid.';
  if ((coalitionOf(s, target)?.members.length ?? 0) >= COALITION_LIMIT) return 'This league already has eight members.';
  return null;
}
export function joinCoalition(s: GameState, target: string): boolean {
  if (coalitionPledgeBlocker(s, target)) return false;
  let c = coalitionOf(s, target);
  if (!c) {
    c = { target, members: [], formed: s.year };
    s.coalitions.push(c);
  }
  c.members.push(s.playerClanId);
  log(s, `You pledge half your available fleet to defend against House ${s.clans[target].name}'s next territorial attack.`, 'war');
  return true;
}
export function leaveCoalition(s: GameState, target: string): boolean {
  const c = coalitionOf(s, target);
  if (!c?.members.includes(s.playerClanId)) return false;
  c.members = c.members.filter((id) => id !== s.playerClanId);
  for (const w of s.wars)
    if ((w.playerAttacker ? s.playerClanId : w.enemy) === target)
      releaseCoalition(
        s,
        (w.coalition ?? []).filter((p) => p.clanId === s.playerClanId),
      );
  for (const w of s.aiWars)
    if (w.attacker === target)
      releaseCoalition(
        s,
        (w.coalition ?? []).filter((p) => p.clanId === s.playerClanId),
      );
  log(s, `You withdraw your pledge against House ${s.clans[target]?.name ?? 'unknown'}. Surviving crews return home.`, 'war');
  return true;
}

/** Called only after a validated territorial declaration. A pledge can defend any actual victim. */
export function coalitionCall(s: GameState, attacker: string, defender: string, excluded: ReadonlySet<string> = new Set()): FleetContribution[] {
  if (s.gameOver || attacker === defender || !s.clans[attacker] || !s.clans[defender]) return [];
  const c = coalitionOf(s, attacker);
  if (!c || threatOf(s, attacker) < THREAT_RELEASE) return [];
  const pacts = pactMap(s);
  const out: FleetContribution[] = [];
  for (const id of new Set(c.members)) {
    if (id === attacker || id === defender || excluded.has(id) || !eligible(s, id, attacker, pacts) || busy(s, id, attacker) || committedShips(s, id)) continue;
    const reservation = reserveAid(s, id, Math.floor(homeFleet(s, id) * COALITION_SHARE));
    if (reservation) out.push(reservation);
  }
  return out;
}
export function coalitionStrength(s: GameState, list: FleetContribution[]): number {
  return aidStrength(s, list);
}
export function coalitionLosses(s: GameState, list: FleetContribution[], rate: number): { clanId: string; ships: number; losses: number }[] {
  return aidLosses(s, list, rate);
}
export function coalitionTruces(s: GameState, attacker: string, list: FleetContribution[]): void {
  aidTruces(s, attacker, list);
}

// Old battle callers ignore this return value. Keep their saved commander IDs and remember the
// original rulers only for the imminent battle; nothing new is added to the save schema.
const battleSnapshots = new WeakMap<FleetContribution[], AidSnapshot[]>();
export function snapshotCoalition(s: GameState, list: FleetContribution[]): AidSnapshot[] {
  const snapshot = snapshotAid(s, list);
  for (const p of list) p.commanderId = snapshot.find((row) => row.contribution === p)?.commanderId;
  battleSnapshots.set(list, snapshot);
  return snapshot;
}
/** Each detached defender earns its own battle and takes one commander consequence roll. */
export function coalitionBattleNotes(
  s: GameState,
  list: FleetContribution[],
  attacker: string,
  attackerWon: boolean,
  casualties: { clanId: string; ships: number; losses: number }[],
  danger = 1,
): string[] {
  const snapshot =
    battleSnapshots.get(list) ??
    list.map((p) => ({
      contribution: p,
      clanId: p.clanId,
      rulerId: p.clanId === s.playerClanId ? s.rulerId : s.clans[p.clanId]?.headId,
      commanderId: p.commanderId,
      ships: casualties.find((row) => row.clanId === p.clanId)?.ships ?? p.ships,
    }));
  battleSnapshots.delete(list);
  return aidBattleNotes(s, snapshot, attacker, attackerWon, casualties, danger);
}
