// Realm management: ships, development, titles, the bazaar and the treasury.

import {
  clanRank,
  clanRegions,
  effStats,
  homePlanet,
  log,
  newId,
  notice,
  playerClan,
  ruler,
  sovereignPlanets,
} from './core';
import { fleetCap, SHIP_COST } from './economy';
import { canAfford, pay, type Cost } from './genetics';
import { makeItem } from './items';
import type { GameState, Item, ItemSlot } from './types';

// ── Fleet ─────────────────────────────────────────────────────────────────

export function shipCost(s: GameState): number {
  return Math.round(SHIP_COST * (1 - Math.min(0.3, effStats(s, ruler(s)).eco * 0.015)));
}

export function recruitShips(s: GameState, n: number): number {
  const room = fleetCap(s) - s.fleet;
  const affordable = Math.floor(Math.max(0, s.credits) / shipCost(s));
  const count = Math.max(0, Math.min(n, room, affordable));
  if (!count) return 0;
  s.credits -= count * shipCost(s);
  s.fleet += count;
  return count;
}

export function scrapShips(s: GameState, n: number): void {
  const count = Math.min(n, s.fleet);
  s.fleet -= count;
  s.credits += Math.round(count * shipCost(s) * 0.3);
}

// ── Regions ───────────────────────────────────────────────────────────────

export function developCost(dev: number): number {
  return 70 * dev;
}

export function developBlocker(s: GameState, regionId: string): string | null {
  const r = s.regions[regionId];
  if (!r || r.owner !== s.playerClanId) return 'Not your region.';
  if (r.dev >= 10) return 'Fully developed.';
  if (r.lastDeveloped === s.year) return 'Already built here this cycle.';
  if (s.credits < developCost(r.dev)) return `Need ${developCost(r.dev)} credits.`;
  return null;
}

export function developRegion(s: GameState, regionId: string): boolean {
  if (developBlocker(s, regionId)) return false;
  const r = s.regions[regionId];
  s.credits -= developCost(r.dev);
  r.dev += 1;
  r.lastDeveloped = s.year;
  log(s, `${r.name} has been developed to level ${r.dev}.`, 'good');
  return true;
}

// ── Titles ────────────────────────────────────────────────────────────────

export const VICEROY_COST: Cost = { credits: 500, prestige: 300 };
export const EMPEROR_COST: Cost = { credits: 3000, prestige: 1500 };
export const EMPEROR_PLANETS = 3;

export function viceroyBlocker(s: GameState): string | null {
  const clan = playerClan(s);
  if (clan.titles.viceroy) return 'Already created.';
  if (clanRegions(s, clan.id).length < 3) return 'Hold at least 3 regions.';
  if (!canAfford(s, VICEROY_COST)) return 'Need 500 credits and 300 prestige.';
  return null;
}

export function createViceroy(s: GameState): boolean {
  if (viceroyBlocker(s)) return false;
  pay(s, VICEROY_COST);
  playerClan(s).titles.viceroy = true;
  const r = ruler(s);
  notice(s, 'A Viceroyalty is Born', `${r.name} is proclaimed ${r.gender === 'M' ? 'Viceroy' : 'Vicereine'}. You may now demand vassalage from lesser clans.`, {
    icon: 'crown',
    tone: 'good',
    portraitId: r.id,
  });
  log(s, `${r.name} created the title of Viceroy.`, 'good');
  return true;
}

export function emperorBlocker(s: GameState): string | null {
  const clan = playerClan(s);
  if (clan.titles.emperor) return 'You already sit the Solar Throne.';
  if (sovereignPlanets(s, clan.id).length < EMPEROR_PLANETS) return `Rule the throne-worlds of ${EMPEROR_PLANETS} planets.`;
  if (!canAfford(s, EMPEROR_COST)) return 'Need 3000 credits and 1500 prestige.';
  return null;
}

export function forgeSolarThrone(s: GameState): boolean {
  if (emperorBlocker(s)) return false;
  pay(s, EMPEROR_COST);
  playerClan(s).titles.emperor = true;
  const r = ruler(s);
  notice(
    s,
    'The Solar Throne',
    `${r.name} is crowned ${r.gender === 'M' ? 'Solar Emperor' : 'Solar Empress'}, the first since the Collapse. Every world from Mercury to Pluto knows your name.`,
    { icon: 'sun', tone: 'good', portraitId: r.id },
  );
  log(s, `${r.name} forged the Solar Throne!`, 'good');
  return true;
}

// ── Bazaar & treasury ─────────────────────────────────────────────────────

export function refreshShop(s: GameState): void {
  if (s.shop.year === s.year) return;
  const items: Item[] = [];
  for (let i = 0; i < 4; i++) items.push(makeItem(s, newId(s, 'i'), { origin: 'Bought at the Occator Bazaar' }));
  s.shop = { year: s.year, items };
}

export function priceOf(s: GameState, item: Item): number {
  return Math.round(item.price * (homePlanet(s) === 'ceres' ? 0.8 : 1));
}

export function buyItem(s: GameState, id: string): boolean {
  const item = s.shop.items.find((i) => i.id === id);
  if (!item || s.credits < priceOf(s, item)) return false;
  s.credits -= priceOf(s, item);
  s.shop.items = s.shop.items.filter((i) => i.id !== id);
  s.items.push(item);
  log(s, `Bought ${item.name}.`, 'info');
  return true;
}

export function sellItem(s: GameState, id: string): void {
  const item = s.items.find((i) => i.id === id);
  if (!item) return;
  unequip(s, id);
  s.items = s.items.filter((i) => i.id !== id);
  s.credits += Math.round(item.price * 0.45);
  log(s, `Sold ${item.name}.`, 'info');
}

export type EquipSlot = ItemSlot | 'relic2';

export function slotFor(s: GameState, item: Item): EquipSlot {
  if (item.slot !== 'relic') return item.slot;
  if (!s.equipped.relic) return 'relic';
  if (!s.equipped.relic2) return 'relic2';
  return 'relic';
}

export function equip(s: GameState, id: string, slot?: EquipSlot): void {
  const item = s.items.find((i) => i.id === id);
  if (!item) return;
  unequip(s, id);
  s.equipped[slot ?? slotFor(s, item)] = id;
}

export function unequip(s: GameState, id: string): void {
  for (const k of Object.keys(s.equipped) as EquipSlot[]) if (s.equipped[k] === id) delete s.equipped[k];
}

export function isEquipped(s: GameState, id: string): boolean {
  return Object.values(s.equipped).includes(id);
}

export function rankIndex(s: GameState): number {
  return clanRank(s, s.playerClanId);
}

export function convertFaith(s: GameState, faithId: string): boolean {
  const cost: Cost = { faith: 200, prestige: 100 };
  const clan = playerClan(s);
  if (clan.faithId === faithId || !canAfford(s, cost)) return false;
  pay(s, cost);
  clan.faithId = faithId;
  for (const c of Object.values(s.characters)) if (c.clanId === clan.id && c.died === undefined) c.faithId = faithId;
  log(s, `House ${clan.name} has converted.`, 'info');
  return true;
}
