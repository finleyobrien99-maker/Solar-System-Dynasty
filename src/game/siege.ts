// Siege orders deepen territorial campaigns without inventing troops or occupation.
// Ownership, battle deeds and commander fates belong to the existing war resolver.
import { alive, ch, clanRegions, effStats, log, regentHolding, ruler, traitSum } from './core';
import { commanderOf } from './commanders';
import { battleWeariness, warStrengthFactor } from './peace';
import { chance, clamp, int, range, weighted } from './rng';
import type { AiWar, Character, Clan, GameState, Region, SiegeKind, SiegeResult, War } from './types';

export interface SiegeOption {
  kind: SiegeKind;
  name: string;
  desc: string;
  cost: number;
  chance: number;
  ok: boolean;
  reason?: string;
  /** Successful progress; the description states a failed attempt's setback. */
  progressMin: number;
  progressMax: number;
  /** Fractions of the attacking house's own ships, before integer rounding. */
  lossMin: number;
  lossMax: number;
}

interface Campaign {
  war: War | AiWar;
  playerWar?: War;
  aiWar?: AiWar;
  attacker: Clan;
  defender: Clan;
  target?: Region;
  head?: Character;
  ships: number;
  credits: number;
  progress: number;
}

// Allows a measured coalition-only comparison without retuning any numbers.
export const AI_SIEGE_ORDERS = true;

const KINDS: readonly SiegeKind[] = ['starve', 'assault', 'bribe', 'sabotage'];

function campaign(s: GameState, warId: string): Campaign | undefined {
  const playerWar = s.wars.find((w) => w.id === warId);
  const aiWar = playerWar ? undefined : s.aiWars.find((w) => w.id === warId);
  const war = playerWar ?? aiWar;
  if (!war) return undefined;
  const attackerId = playerWar ? (playerWar.playerAttacker ? s.playerClanId : playerWar.enemy) : aiWar!.attacker;
  const defenderId = playerWar ? (playerWar.playerAttacker ? playerWar.enemy : s.playerClanId) : aiWar!.defender;
  const attacker = s.clans[attackerId],
    defender = s.clans[defenderId];
  if (!attacker || !defender || attackerId === defenderId) return undefined;
  const player = attackerId === s.playerClanId;
  return {
    war,
    playerWar,
    aiWar,
    attacker,
    defender,
    target: s.regions[war.target],
    head: player ? ruler(s) : ch(s, attacker.headId),
    ships: player ? s.fleet : attacker.fleet,
    credits: player ? s.credits : attacker.credits,
    progress: playerWar ? playerWar.score * (playerWar.playerAttacker ? 1 : -1) : aiWar!.progress,
  };
}

function assaultChance(s: GameState, c: Campaign): number {
  const strength = (house: Clan, ships: number) => {
    const personal = house.id === s.playerClanId && s.leadPersonally;
    const leader = personal ? ruler(s) : (commanderOf(s, house.id) ?? (house.id === s.playerClanId ? ruler(s) : ch(s, house.headId)));
    const command = leader && alive(leader) ? effStats(s, leader).cmd : 4;
    const traits = leader ? traitSum(leader, 'fleetPct') : 0;
    return Math.max(0, ships * (1 + command * 0.04) * (1 + traits) * warStrengthFactor(s, house.id));
  };
  const ours = strength(c.attacker, c.ships);
  const theirs = strength(c.defender, c.defender.id === s.playerClanId ? s.fleet : c.defender.fleet);
  return ours / Math.max(1, ours + theirs);
}

function preview(s: GameState, c: Campaign, kind: SiegeKind): Omit<SiegeOption, 'ok' | 'reason'> {
  const dev = c.target?.dev ?? 1;
  const stats = c.head ? effStats(s, c.head) : undefined;
  switch (kind) {
    case 'starve':
      return {
        kind,
        name: 'Starve them out',
        desc: 'Pay for supplies and tighten the blockade. Gain 5–9 progress; lose 1–3% of your own ships to attrition.',
        cost: 20 + 4 * dev,
        chance: 1,
        progressMin: 5,
        progressMax: 9,
        lossMin: 0.01,
        lossMax: 0.03,
      };
    case 'assault':
      return {
        kind,
        name: 'Assault',
        desc: 'Launch an ordinary fleet battle. Win 18–45 progress or lose as much; real ships and commanders face the normal battle risks. Odds estimate your own fleets before allies and battle rolls.',
        cost: 0,
        chance: assaultChance(s, c),
        progressMin: 18,
        progressMax: 45,
        lossMin: 0.04,
        lossMax: 0.3,
      };
    case 'bribe':
      return {
        kind,
        name: 'Bribe a gate',
        desc: 'Diplomacy buys a way inside. Gain 12–20 progress on success; lose 4 on failure. The bribe is spent either way.',
        cost: 80 + 20 * dev,
        chance: clamp(0.35 + 0.03 * (stats?.dip ?? 0) - 0.03 * dev, 0.15, 0.85),
        progressMin: 12,
        progressMax: 20,
        lossMin: 0,
        lossMax: 0,
      };
    case 'sabotage':
      return {
        kind,
        name: 'Sabotage the walls',
        desc: 'Intrigue opens a breach. Gain 8–16 progress on success; lose 8 on failure. Pay either way and risk 1–4% of your own ships supporting the agents.',
        cost: 40 + 10 * dev,
        chance: clamp(0.3 + 0.03 * (stats?.int ?? 0) - 0.03 * dev, 0.1, 0.8),
        progressMin: 8,
        progressMax: 16,
        lossMin: 0.01,
        lossMax: 0.04,
      };
  }
}

/** Every validation and preview is pure, including invalid or stale calls. */
export function siegeBlocker(s: GameState, warId: string, kind: SiegeKind, aiInitiated = false): string | null {
  if (!KINDS.includes(kind)) return 'Unknown siege order.';
  if (s.gameOver) return 'The dynasty has ended.';
  const c = campaign(s, warId);
  if (!c) return 'The campaign is no longer active.';
  if (c.playerWar && c.playerWar.playerAttacker === aiInitiated) return 'Only the attacking house can order this siege.';
  if (c.aiWar && !aiInitiated) return 'This campaign is led by another house.';
  if (c.aiWar && (c.attacker.id === s.playerClanId || c.defender.id === s.playerClanId)) return 'This is not a valid house campaign.';
  if (c.playerWar && (c.playerWar.cb === 'independence' || c.playerWar.cb === 'revolt')) return 'This war has no territorial siege.';
  if (!c.target || c.target.owner !== c.defender.id) return 'The war target has changed hands.';
  if (!clanRegions(s, c.attacker.id).length) return 'The attacking house has no lands.';
  if (!alive(c.head)) return 'The attacking house has no living ruler.';
  if (c.head.prisonerOf) return 'A captive ruler cannot order a siege.';
  if (s.year - c.head.born < 16 || (c.attacker.id === s.playerClanId && regentHolding(s))) return 'A free adult ruler must order the siege.';
  if (c.ships < 10) return 'Need at least 10 of your own ships.';
  if (c.progress >= 100 || c.progress <= -100) return 'The campaign is already decided.';
  if (c.progress < 25) return 'Win orbital control first: need 25 attacker progress.';
  const last = c.aiWar?.lastOperation ?? (aiInitiated ? c.playerWar?.lastAiOperation : c.playerWar?.lastPlayerBattle);
  if (last === s.year) return 'Already ordered a battle or siege this cycle.';
  const option = preview(s, c, kind);
  if (c.credits < option.cost) return `Need ${option.cost} credits for the whole attempt.`;
  return null;
}

export function siegeOptions(s: GameState, warId: string, aiInitiated = false): SiegeOption[] {
  const c = campaign(s, warId);
  if (!c) return [];
  return KINDS.map((kind) => {
    const reason = siegeBlocker(s, warId, kind, aiInitiated);
    return { ...preview(s, c, kind), ok: !reason, reason: reason ?? undefined };
  });
}

/** Non-battle orders only. Assaults go through the real war battle resolver. */
export function performSiege(s: GameState, warId: string, kind: SiegeKind, aiInitiated = false): SiegeResult | undefined {
  if (kind === 'assault' || siegeBlocker(s, warId, kind, aiInitiated)) return undefined;
  const c = campaign(s, warId)!;
  const option = preview(s, c, kind);
  const success = kind === 'starve' || chance(s, option.chance);
  const proposed = success ? int(s, option.progressMin, option.progressMax) : kind === 'bribe' ? -4 : -8;
  const losses = option.lossMax > 0 ? clamp(Math.round(c.ships * range(s, option.lossMin, option.lossMax)), 0, c.ships) : 0;
  const next = clamp(c.progress + proposed, -100, 100);
  const result: SiegeResult = {
    kind,
    year: s.year,
    attacker: c.attacker.id,
    success,
    cost: option.cost,
    losses,
    progress: next - c.progress,
    leaderId: c.head!.id,
  };
  if (c.attacker.id === s.playerClanId) {
    s.credits -= option.cost;
    s.fleet -= losses;
  } else {
    c.attacker.credits -= option.cost;
    c.attacker.fleet -= losses;
  }
  if (losses > 0) battleWeariness(s, c.attacker.id, c.ships, losses);
  if (c.aiWar) {
    c.aiWar.progress = next;
    c.aiWar.lastOperation = s.year;
  } else {
    c.playerWar!.score = next * (c.playerWar!.playerAttacker ? 1 : -1);
    if (aiInitiated) c.playerWar!.lastAiOperation = s.year;
    else c.playerWar!.lastPlayerBattle = s.year;
  }
  c.war.siege = result;
  const change = `${result.progress >= 0 ? '+' : ''}${result.progress}`;
  const outcome = `${option.name.toLowerCase()} ${success ? 'succeeds' : 'fails'} at ${c.target!.name}: ${option.cost} credits spent, ${losses} ships lost, ${change} attacker progress.`;
  const visible = c.attacker.id === s.playerClanId || c.defender.id === s.playerClanId;
  const good = c.attacker.id === s.playerClanId ? success : !success;
  log(s, `House ${c.attacker.name}'s ${outcome}`, visible ? (good ? 'good' : 'bad') : 'news');
  return result;
}

/** AI spends its single operation on an affordable order, using its own lord's skills. */
export function chooseAiSiege(s: GameState, warId: string): SiegeKind | undefined {
  if (!AI_SIEGE_ORDERS) return undefined;
  const c = campaign(s, warId);
  if (!c) return undefined;
  const options = siegeOptions(s, warId, true).filter((o) => o.ok);
  if (!options.length) return undefined;
  const stats = c.head ? effStats(s, c.head) : undefined;
  return weighted(
    s,
    options.map(
      (o) =>
        [
          o.kind,
          o.kind === 'starve'
            ? 2
            : o.kind === 'bribe'
              ? Math.max(1, (stats?.dip ?? 4) / 6)
              : o.kind === 'sabotage'
                ? Math.max(1, (stats?.int ?? 4) / 8)
                : c.head?.traits.includes('brave')
                  ? 4
                  : 1,
        ] as const,
    ),
  );
}
