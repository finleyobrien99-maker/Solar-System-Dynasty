// Income breakdowns. The UI shows every line so players can see exactly where
// their credits, prestige and faith come from.

import {
  ageOf,
  alive,
  ch,
  childrenOf,
  clanRank,
  clanRegions,
  dynastyMembers,
  effStats,
  homePlanet,
  itemSum,
  liegeOf,
  playerClan,
  regionIncome,
  ruler,
  traitSum,
  vassalsOf,
} from './core';
import { isCloseFamily } from './life';
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

export function grossRegionIncome(s: GameState, clanId: string): number {
  return clanRegions(s, clanId).reduce((a, r) => a + regionIncome(s, r), 0);
}

export function fleetCap(s: GameState): number {
  const regions = clanRegions(s, s.playerClanId);
  return 60 + regions.length * 35 + clanRank(s, s.playerClanId) * 40;
}

export function creditLines(s: GameState): Line[] {
  const r = ruler(s);
  const st = effStats(s, r);
  const lines: Line[] = [];
  const gross = grossRegionIncome(s, s.playerClanId);
  let mult = 1 + st.eco * 0.03 + traitSum(r, 'creditsPct');
  if (homePlanet(s) === 'mercury') mult += 0.15;
  if (homePlanet(s) === 'ceres') mult += 0.1;
  lines.push({ label: 'Regions (boosted by Economy)', value: Math.round(gross * mult) });

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

  lines.push({ label: `Fleet upkeep (${s.fleet} ships)`, value: -Math.round(s.fleet * UPKEEP_PER_SHIP) });

  const school = dynastyMembers(s).reduce((a, c) => a + (c.edu && ageOf(s, c) < 16 ? TUTOR_COST[c.edu.tutor] : 0), 0);
  if (school) lines.push({ label: 'Heir tuition', value: -school });

  // Only the household you actually keep at court costs money; distant kin pay their own way.
  const court = dynastyMembers(s).filter((c) => isCloseFamily(s, c)).length * 2 + (alive(ch(s, r.spouseId)) ? 2 : 0);
  lines.push({ label: 'Court upkeep (close family)', value: -court });

  const items = itemSum(s, 'creditsYr');
  if (items) lines.push({ label: 'Relics', value: items });
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
  const sprawl = Math.floor(dynastyMembers(s).length / 10);
  if (sprawl) lines.push({ label: 'Renown of a great bloodline (1 per 10 kin)', value: sprawl });
  if (s.credits < 0) lines.push({ label: 'In debt!', value: -10 });
  return lines;
}

export function faithLines(s: GameState): Line[] {
  const r = ruler(s);
  const lines: Line[] = [{ label: 'Daily devotions', value: 2 }];
  const t = traitSum(r, 'faithYr');
  if (t) lines.push({ label: 'Ruler traits', value: t });
  const items = itemSum(s, 'faithYr');
  if (items) lines.push({ label: 'Relics', value: items });
  if (homePlanet(s) === 'uranus') lines.push({ label: 'Uranian seers', value: 3 });
  const clan = playerClan(s);
  if (r.faithId !== clan.faithId) lines.push({ label: 'Ruler follows a foreign faith', value: -2 });
  return lines;
}

export function sum(lines: Line[]): number {
  return lines.reduce((a, l) => a + l.value, 0);
}
