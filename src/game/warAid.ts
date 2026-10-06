// Shared physical fleets on loan to wars. Politics decides who joins; this module only accounts for real ships.
import { commanderOf, commandedBattleFates, leadFactor } from './commanders';
import { alive, ch, ruler } from './core';
import { recordDeed } from './epithets';
import { battleWeariness, makeTruce, warStrengthFactor } from './peace';
import { clamp } from './rng';
import type { FleetContribution, GameState } from './types';

/** Structural support for the next realm-defence slice; this does not add saved fields. */
export interface AidCampaign {
  coalition?: FleetContribution[];
  realmAid?: FleetContribution[];
}
export interface AidLedger {
  wars: readonly AidCampaign[];
  aiWars: readonly AidCampaign[];
}
export interface AidCasualty {
  clanId: string;
  ships: number;
  losses: number;
}
/** One battle's actual people and participating ships, captured before any fate or succession.
 * Every reservation of a house shares its one currently appointed commander; saved pool IDs are historical. */
export interface AidSnapshot {
  contribution: FleetContribution;
  clanId: string;
  rulerId?: string;
  commanderId?: string;
  ships: number;
}

/** People whose primary-side battle credit/consequences have already been processed. */
export interface AidBattleContext {
  commanderIds?: ReadonlySet<string>;
  rulerIds?: ReadonlySet<string>;
}

export function homeFleet(s: GameState, clanId: string): number {
  return clanId === s.playerClanId ? s.fleet : (s.clans[clanId]?.fleet ?? 0);
}
function setHomeFleet(s: GameState, clanId: string, ships: number): void {
  if (clanId === s.playerClanId) s.fleet = ships;
  else if (s.clans[clanId]) s.clans[clanId].fleet = ships;
}

/** Preserve every reservation and its identity. Repeated clan IDs can represent distinct physical loans. */
export function warContributions(war: AidCampaign): FleetContribution[] {
  return [...(war.coalition ?? []), ...(war.realmAid ?? [])];
}
export function warAid(s: AidLedger): FleetContribution[] {
  return [...s.wars, ...s.aiWars].flatMap(warContributions);
}
export function committedShips(s: AidLedger, clanId: string): number {
  return warAid(s).reduce((total, p) => total + (p.clanId === clanId ? p.ships : 0), 0);
}

/** Reserve an exact affordable physical count. Eligibility and duplicate-house checks belong to the declaration. */
export function reserveAid(s: GameState, clanId: string, ships: number): FleetContribution | undefined {
  if (!s.clans[clanId] || !Number.isInteger(ships) || ships <= 0 || ships > homeFleet(s, clanId)) return undefined;
  setHomeFleet(s, clanId, homeFleet(s, clanId) - ships);
  return { clanId, ships, sent: ships, lost: 0, returned: 0, commanderId: commanderOf(s, clanId)?.id };
}

/** Return survivors once. The original sent count remains available for history and peace participants. */
export function releaseAid(s: GameState, list: readonly FleetContribution[]): void {
  for (const p of list) {
    if (p.ships > 0 && s.clans[p.clanId]) setHomeFleet(s, p.clanId, homeFleet(s, p.clanId) + p.ships);
    if (p.returned !== undefined) p.returned += p.ships;
    p.ships = 0;
  }
}
/** A direct attack can recall a house's ships from every physical aid pool. */
export function recallAid(s: GameState, clanId: string): void {
  releaseAid(
    s,
    warAid(s).filter((p) => p.clanId === clanId),
  );
}
export function aidStrength(s: GameState, list: readonly FleetContribution[]): number {
  return list.reduce((n, p) => n + Math.max(0, p.ships) * leadFactor(s, p.clanId) * warStrengthFactor(s, p.clanId), 0);
}

/** Debit every actual reservation; a house pays battle fatigue once for its combined participating ships. */
export function aidLosses(s: GameState, list: readonly FleetContribution[], rate: number): AidCasualty[] {
  const byHouse = new Map<string, AidCasualty>();
  for (const p of list) {
    const ships = p.ships;
    if (ships <= 0) continue;
    const losses = Math.min(ships, Math.round(ships * clamp(rate, 0, 1)));
    p.ships -= losses;
    if (p.lost !== undefined) p.lost += losses;
    const row = byHouse.get(p.clanId) ?? { clanId: p.clanId, ships: 0, losses: 0 };
    row.ships += ships;
    row.losses += losses;
    byHouse.set(p.clanId, row);
  }
  const rows = [...byHouse.values()];
  for (const row of rows) battleWeariness(s, row.clanId, row.ships, row.losses);
  return rows;
}
export function aidTruces(s: GameState, attacker: string, list: readonly FleetContribution[]): void {
  for (const id of new Set(list.filter((p) => p.sent > 0).map((p) => p.clanId))) makeTruce(s, attacker, id);
}

/** Pure, ephemeral snapshot: neither saved commander IDs nor the seed are changed by reading. */
export function snapshotAid(s: GameState, list: readonly FleetContribution[]): AidSnapshot[] {
  const people = new Map<string, { rulerId?: string; commanderId?: string }>();
  return list
    .filter((p) => p.ships > 0)
    .map((p) => {
      let original = people.get(p.clanId);
      if (!original) {
        original = {
          rulerId: p.clanId === s.playerClanId ? s.rulerId : s.clans[p.clanId]?.headId,
          commanderId: commanderOf(s, p.clanId)?.id,
        };
        people.set(p.clanId, original);
      }
      return { contribution: p, clanId: p.clanId, ...original, ships: p.ships };
    });
}

/** Helpers earn their own deeds and commander consequences; the primary attacker was processed by its resolver. */
export function aidBattleNotes(
  s: GameState,
  snapshot: readonly AidSnapshot[],
  attacker: string,
  attackerWon: boolean,
  casualties: readonly AidCasualty[],
  danger = 1,
  prior: AidBattleContext = {},
): string[] {
  // snapshotAid supplies a single current command and original ruler per house. Refuse a corrupt
  // manually assembled snapshot before any deed or RNG change, rather than silently choosing a leader.
  const people = new Map<string, AidSnapshot>();
  for (const row of snapshot) {
    const previous = people.get(row.clanId);
    if (previous && (previous.commanderId !== row.commanderId || previous.rulerId !== row.rulerId))
      throw new Error('A battle aid snapshot must have one original ruler and appointed commander per house.');
    people.set(row.clanId, row);
  }
  const notes: string[] = [];
  const recordedHouses = new Set<string>();
  const recordedRulers = new Set(prior.rulerIds);
  const processedCommanders = new Set(prior.commanderIds);
  for (const row of casualties) {
    const before = people.get(row.clanId);
    if (!before || recordedHouses.has(row.clanId)) continue;
    recordedHouses.add(row.clanId);
    const currentHead = row.clanId === s.playerClanId ? ruler(s).id : s.clans[row.clanId]?.headId;
    const commander = ch(s, before.commanderId);
    const processCommander = alive(commander) && !commander.prisonerOf && !processedCommanders.has(commander.id);
    // commanders.ts already records a commander who is not the current head. If a battle changed the head,
    // that can be the snapshotted old ruler: avoid awarding their battle twice, while never crediting the successor.
    const commanderRecordsRuler = processCommander && before.commanderId === before.rulerId && currentHead !== before.rulerId;
    if (before.rulerId && !recordedRulers.has(before.rulerId)) {
      if (!commanderRecordsRuler) recordDeed(s, before.rulerId, attackerWon ? 'battlesLost' : 'battlesWon');
      recordedRulers.add(before.rulerId);
    }
    if (processCommander) processedCommanders.add(commander.id);
    notes.push(
      ...commandedBattleFates(s, {
        id: `aid@${s.year}:${row.clanId}`,
        attacker,
        defender: row.clanId,
        defenderCommanderId: processCommander ? before.commanderId : undefined,
        attackerWon,
        defenderShips: row.ships,
        defenderLosses: row.losses,
        danger,
      }).map((f) => f.note),
    );
  }
  return notes;
}

/** Pure report for one aid pool after the combined physical debit. */
export function aidCasualties(snapshot: readonly AidSnapshot[], pool: readonly FleetContribution[]): AidCasualty[] {
  const rows = new Map<string, AidCasualty>();
  for (const before of snapshot) {
    if (!pool.includes(before.contribution)) continue;
    const row = rows.get(before.clanId) ?? { clanId: before.clanId, ships: 0, losses: 0 };
    row.ships += before.ships;
    row.losses += before.ships - before.contribution.ships;
    rows.set(before.clanId, row);
  }
  return [...rows.values()];
}
