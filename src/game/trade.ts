import { recordDeed } from './epithets';
// Trade routes: run convoys from one of your regions to a partner house on
// another world. Longer hauls and richer ports pay more; pirates hit routes
// that a small fleet can't protect.

import { clanRank, clanRegions, homePlanet, log, newId, ruler } from './core';
import { councilStat } from './council';
import { canAfford, pay, type Cost } from './genetics';
import { remember } from './memory';
import { PLANET_BY_ID } from './planets';
import { chance, clamp } from './rng';
import type { GameState, TradeRoute } from './types';
import { atWarWith } from './war';

export const GOODS: Record<string, string> = {
  mercury: 'forged alloys',
  venus: 'aerogel silks',
  earth: 'biotech and art',
  mars: 'munitions',
  ceres: 'ice and ore',
  jupiter: 'helium-3',
  saturn: 'AI cores',
  uranus: 'methane spice',
  neptune: 'deep-sea pharma',
  pluto: 'cryo-crystals',
};

export function routeCap(s: GameState): number {
  return 1 + clanRank(s, s.playerClanId) + Math.floor(councilStat(s, 'treasurer') / 6);
}

function distance(a: string, b: string): number {
  return Math.abs((PLANET_BY_ID[a]?.orbit ?? 0) - (PLANET_BY_ID[b]?.orbit ?? 0));
}

/** The world a partner house trades from: its home if it holds land there. */
export function partnerPort(s: GameState, partnerId: string): string | undefined {
  const regs = clanRegions(s, partnerId);
  if (!regs.length) return undefined;
  const home = s.clans[partnerId]?.planetId;
  return regs.some((r) => r.planetId === home) ? home : regs[0].planetId;
}

export function routeValue(s: GameState, fromId: string, partnerId: string, planetId: string): number {
  const from = s.regions[fromId];
  const partner = s.clans[partnerId];
  if (!from || !partner) return 0;
  const theirs = clanRegions(s, partnerId).filter((r) => r.planetId === planetId);
  const theirDev = theirs.length ? theirs.reduce((a, r) => a + r.dev, 0) / theirs.length : 3;
  let v = 25 + distance(from.planetId, planetId) * 9 + from.dev * 3 + theirDev * 3;
  if (partner.allied) v *= 1.15;
  if (homePlanet(s) === 'ceres') v *= 1.2;
  v *= 1 + councilStat(s, 'treasurer') * 0.01;
  return Math.round(v);
}

export function routeIncome(s: GameState): number {
  return s.routes.reduce((a, r) => a + routeValue(s, r.from, r.partner, r.planetId), 0);
}

export function openCost(s: GameState, fromId: string, planetId: string): Cost {
  const from = s.regions[fromId];
  return { credits: 120 + (from ? distance(from.planetId, planetId) * 30 : 0) };
}

export function routeBlocker(s: GameState, fromId: string, partnerId: string): string | null {
  const from = s.regions[fromId];
  const partner = s.clans[partnerId];
  if (!from || from.owner !== s.playerClanId) return 'Pick one of your regions as the home port.';
  if (!partner || partner.isPlayer) return 'Pick a partner house.';
  const port = partnerPort(s, partnerId);
  if (!port) return 'They hold no land to trade from.';
  if (port === from.planetId) return 'Routes must run to another world.';
  if (atWarWith(s, partnerId)) return 'You are at war with them.';
  if (partner.opinion < 0) return `House ${partner.name} won't trade with you (opinion below 0).`;
  if (s.routes.length >= routeCap(s)) return `All ${routeCap(s)} route slots are in use. Rank up or appoint a Treasurer.`;
  if (s.routes.some((r) => r.from === fromId && r.partner === partnerId)) return 'That route already runs.';
  if (!canAfford(s, openCost(s, fromId, port))) return 'Not enough credits to fit out the convoys.';
  return null;
}

export function openRoute(s: GameState, fromId: string, partnerId: string): TradeRoute | undefined {
  if (routeBlocker(s, fromId, partnerId)) return undefined;
  const port = partnerPort(s, partnerId)!;
  pay(s, openCost(s, fromId, port));
  const route: TradeRoute = { id: newId(s, 't'), from: fromId, partner: partnerId, planetId: port, since: s.year };
  s.routes.push(route);
  recordDeed(s, ruler(s), 'routes');
  recordDeed(s, s.clans[partnerId].headId, 'routes');
  remember(s, partnerId, 'Opened a trade route with us', 12, 0.04);
  log(
    s,
    `Convoys begin running ${GOODS[s.regions[fromId].planetId]} from ${s.regions[fromId].name} to House ${s.clans[partnerId].name} on ${PLANET_BY_ID[port].name}.`,
    'good',
  );
  return route;
}

export function closeRoute(s: GameState, id: string, reason?: string): void {
  const r = s.routes.find((x) => x.id === id);
  if (!r) return;
  s.routes = s.routes.filter((x) => x.id !== id);
  if (reason) log(s, `Trade route to House ${s.clans[r.partner]?.name ?? '?'} closed: ${reason}.`, 'bad');
}

export function raidRisk(s: GameState): number {
  return clamp(0.14 - s.fleet / 900, 0.02, 0.14);
}

/** Year-end: close broken routes, roll for pirate raids, partners warm to you. */
export function tradeTick(s: GameState): void {
  for (const r of s.routes.slice()) {
    const from = s.regions[r.from];
    const partner = s.clans[r.partner];
    if (!from || from.owner !== s.playerClanId) closeRoute(s, r.id, 'you lost the home port');
    else if (!partner || !clanRegions(s, partner.id).length) closeRoute(s, r.id, 'the partner house has fallen');
    else if (atWarWith(s, partner.id)) closeRoute(s, r.id, 'war broke out');
    else if (partner.opinion < -30) closeRoute(s, r.id, `House ${partner.name} cut ties`);
    else {
      partner.opinion = Math.min(100, partner.opinion + 1);
      if (chance(s, raidRisk(s))) {
        const lost = routeValue(s, r.from, r.partner, r.planetId);
        s.credits -= lost;
        log(s, `Pirates hit your convoy to ${PLANET_BY_ID[r.planetId].name}. ${lost} credits of cargo lost. A bigger fleet would deter them.`, 'bad');
      }
    }
  }
}
