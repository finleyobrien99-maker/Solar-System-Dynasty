// Income breakdowns. The UI shows every line so players can see exactly where
// their credits, prestige and faith come from.

import { committedShips } from './coalitions';
import { warIncomeFactor } from './peace';
import { isAway } from './wards';
import {
  ageOf,
  alive,
  bloodlineMembers,
  ch,
  childrenOf,
  clanRank,
  clanRegions,
  dynastyMembers,
  effStats,
  homePlanet,
  itemSum,
  liegeOf,
  regionIncome,
  ruler,
  traitSum,
  vassalsOf,
} from './core';
import { isCloseFamily } from './life';
import { councilStat } from './council';
import { RESEARCH_UPKEEP } from './forge';
import { routeIncome } from './trade';
import { diplomacyCreditLines } from './treaties';
import { TRAITS } from './traits';
import type { GameState } from './types';

export interface Line {
  label: string;
  value: number;
}

export const TUTOR_COST = { household: 0, academy: 25, ai: 60 } as const;
export const SHIP_COST = 6;
export const UPKEEP_PER_SHIP = 0.8;
export const TRIBUTE_RATE = 0.15;

export function rawRegionIncome(s: GameState, clanId: string): number {
  return clanRegions(s, clanId).reduce((a, r) => a + regionIncome(s, r), 0);
}
export function grossRegionIncome(s: GameState, clanId: string): number {
  return rawRegionIncome(s, clanId) * warIncomeFactor(s, clanId);
}

export function fleetCap(s: GameState): number {
  const regions = clanRegions(s, s.playerClanId);
  return 60 + regions.length * 35 + clanRank(s, s.playerClanId) * 40;
}

export function creditLines(s: GameState, includeTribute = true): Line[] {
  const r = ruler(s);
  const st = effStats(s, r);
  const lines: Line[] = [];
  const gross = grossRegionIncome(s, s.playerClanId);
  const raw = rawRegionIncome(s, s.playerClanId);
  let mult = 1 + st.eco * 0.03 + traitSum(r, 'creditsPct');
  if (homePlanet(s) === 'mercury') mult += 0.15;
  if (homePlanet(s) === 'ceres') mult += 0.1;
  lines.push({ label: 'Regions (boosted by Economy)', value: Math.round(raw * mult) });
  const treasurer = councilStat(s, 'treasurer');
  if (treasurer) lines.push({ label: `Treasurer (+${treasurer}%)`, value: Math.round(raw * treasurer * 0.01) });

  const wearyLoss = Math.round(raw * mult) - Math.round(gross * mult) + Math.round(raw * treasurer * 0.01) - Math.round(gross * treasurer * 0.01);
  if (wearyLoss) lines.push({ label: 'War-weary lands', value: -wearyLoss });

  const vassals = vassalsOf(s, s.playerClanId);
  if (vassals.length) {
    const tribute = vassals.reduce((a, v) => {
      const factor = v.opinion < -50 ? 0 : v.opinion < 0 ? 0.5 : 1;
      return a + grossRegionIncome(s, v.id) * TRIBUTE_RATE * factor;
    }, 0);
    lines.push({ label: `Tribute from ${vassals.length} vassal${vassals.length > 1 ? 's' : ''}`, value: Math.round(tribute) });
  }
  const liege = liegeOf(s, s.playerClanId);
  if (liege) lines.push({ label: `Tribute to House ${s.clans[liege].name}`, value: -Math.round(gross * TRIBUTE_RATE) });

  const ships = s.fleet + committedShips(s, s.playerClanId);
  lines.push({ label: `Fleet upkeep (${ships} ships)`, value: -Math.round(ships * UPKEEP_PER_SHIP) });

  const members = dynastyMembers(s);
  const school = members.reduce((a, c) => a + (c.edu && !isAway(s, c) && ageOf(s, c) < 16 ? TUTOR_COST[c.edu.tutor] : 0), 0);
  if (school) lines.push({ label: 'Heir tuition', value: -school });

  // Only the household you actually keep at court costs money; distant kin pay their own way.
  const court = members.filter((c) => isCloseFamily(s, c) && !isAway(s, c)).length * 2 + (alive(ch(s, r.spouseId)) ? 2 : 0);
  lines.push({ label: 'Court upkeep (close family)', value: -court });

  const items = itemSum(s, 'creditsYr');
  if (items) lines.push({ label: 'Relics', value: items });
  if (s.forge.project) lines.push({ label: 'Gene-Forge research', value: -RESEARCH_UPKEEP });
  if (s.routes.length) lines.push({ label: `Trade routes (${s.routes.length})`, value: routeIncome(s) });
  lines.push(...diplomacyCreditLines(s, includeTribute));
  return lines;
}

export function prestigeLines(s: GameState): Line[] {
  const r = ruler(s);
  const rank = clanRank(s, s.playerClanId);
  const lines: Line[] = [{ label: 'Rank', value: [0, 2, 5, 10, 20][rank] ?? 0 }];
  const t = traitSum(r, 'prestigeYr');
  if (t) lines.push({ label: 'Ruler traits', value: t });
  const items = itemSum(s, 'prestigeYr');
  if (items) lines.push({ label: 'Crown & relics', value: items });
  if (homePlanet(s) === 'jupiter') lines.push({ label: 'Jovian pomp', value: 3 });
  const bloodline = s.dynasty.locked.filter((id) => TRAITS[id]?.cat === 'genetic' && TRAITS[id]?.good).length;
  if (bloodline) lines.push({ label: 'Exalted bloodline (locked genes)', value: bloodline * 2 });
  const kids = childrenOf(s, r).filter(alive).length;
  if (kids) lines.push({ label: 'Children & heirs', value: Math.min(5, kids) });
  const sprawl = Math.floor(bloodlineMembers(s).length / 10);
  if (sprawl) lines.push({ label: 'Renown of a great bloodline (1 per 10 kin)', value: sprawl });
  if (s.credits < 0) lines.push({ label: 'In debt!', value: -10 });
  return lines;
}

export function faithLines(s: GameState, clanId = s.playerClanId): Line[] {
  const clan = s.clans[clanId];
  const r = clanId === s.playerClanId ? ruler(s) : s.characters[clan.headId];
  const lines: Line[] = [{ label: 'Daily devotions', value: 2 }];
  const t = traitSum(r, 'faithYr');
  if (t) lines.push({ label: 'Ruler traits', value: t });
  const items = clanId === s.playerClanId ? itemSum(s, 'faithYr') : 0;
  if (items) lines.push({ label: 'Relics', value: items });
  if (clan.planetId === 'uranus') lines.push({ label: 'Uranian seers', value: 3 });
  if (r.faithId !== clan.faithId) lines.push({ label: 'Ruler follows a foreign faith', value: -2 });
  return lines;
}

export function sum(lines: Line[]): number {
  return lines.reduce((a, l) => a + l.value, 0);
}
