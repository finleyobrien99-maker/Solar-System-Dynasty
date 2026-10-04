// Relics, ships and artefacts. Items sit in the dynasty treasury, the ruler
// equips them, and they pass down to every heir.

import { int, pick, rand, weighted, type Seeded } from './rng';
import type { Item, ItemEffects, ItemSlot, Rarity, StatKey } from './types';
import { STAT_NAMES } from './traits';

export const SLOT_NAMES: Record<ItemSlot, string> = {
  head: 'Crown',
  weapon: 'Weapon',
  suit: 'Armour',
  flagship: 'Flagship',
  relic: 'Relic',
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#9aa7b8',
  rare: '#4fa3ff',
  epic: '#b56cff',
  legendary: '#ffb340',
};

const RARITY_POWER: Record<Rarity, number> = { common: 1, rare: 2, epic: 3, legendary: 5 };
const RARITY_PRICE: Record<Rarity, number> = { common: 120, rare: 300, epic: 700, legendary: 1600 };

const NAMES: Record<ItemSlot, { pre: string[]; noun: string[]; post: string[] }> = {
  head: {
    pre: ['Gilded', 'Star-Forged', 'Obsidian', 'Radiant', 'Ancient', 'Silver', 'Void-Black', 'Solar'],
    noun: ['Circlet', 'Diadem', 'Crown', 'Halo', 'Coronet', 'Tiara', 'Helm'],
    post: ['of Io', 'of the Red Throne', 'of Titan', 'of the First Sun', 'of the Deep', 'of Old Terra', 'of the Seers'],
  },
  weapon: {
    pre: ['Plasma', 'Ion', 'Monomolecular', 'Graviton', 'Phase', 'Rail', 'Singing'],
    noun: ['Saber', 'Lance', 'Blade', 'Pistol', 'Glaive', 'Rapier', 'Hammer'],
    post: ['of Olympus', 'of the Belt Kings', 'of Ganymede', 'of the Last War', 'of Triton', 'of Ashes'],
  },
  suit: {
    pre: ['Void', 'Gravweave', 'Ceramite', 'Nanoweave', 'Mirror', 'Reactive', 'Ceremonial'],
    noun: ['Plate', 'Mantle', 'Exo-Suit', 'Cuirass', 'Cloak', 'Harness'],
    post: ['of the Wardens', 'of Mars', 'of the Synod', 'of Venus', 'of the Undying Sun'],
  },
  flagship: {
    pre: ['Dreadnought', 'Battlecruiser', 'Carrier', 'Frigate', 'Star-Galleon', 'Monitor'],
    noun: ['Indomitable', 'Wrath of Sol', 'Red Fury', 'Silent Tide', "Ganymede's Pride", 'Far Watcher', 'Iron Saint', 'Nightjar'],
    post: [''],
  },
  relic: {
    pre: ['Shard', 'Codex', 'Pearl', 'Core', 'Icon', 'Skull', 'Orb', 'Tablet'],
    noun: ['of the First Sun', 'of Olympus', 'of Europa', 'of the Machine-Saint', 'of the Abyss', 'of the Far Dark', 'of Old Earth', 'of Charon'],
    post: [''],
  },
};

function makeName(s: Seeded, slot: ItemSlot): string {
  const n = NAMES[slot];
  if (slot === 'flagship') return `${pick(s, n.pre)} ${pick(s, n.noun)}`;
  if (slot === 'relic') return `${pick(s, n.pre)} ${pick(s, n.noun)}`;
  const base = `${pick(s, n.pre)} ${pick(s, n.noun)}`;
  return rand(s) < 0.55 ? `${base} ${pick(s, n.post)}` : base;
}

function makeEffects(s: Seeded, slot: ItemSlot, rarity: Rarity): ItemEffects {
  const p = RARITY_POWER[rarity];
  const fx: ItemEffects = {};
  const addStat = (k: StatKey, v: number) => {
    fx.stats = fx.stats ?? {};
    fx.stats[k] = (fx.stats[k] ?? 0) + v;
  };
  switch (slot) {
    case 'head':
      addStat('dip', p + int(s, 0, 1));
      fx.prestigeYr = p * 2;
      break;
    case 'weapon':
      addStat(rand(s) < 0.6 ? 'cmd' : 'int', p + 1);
      if (p >= 3) fx.fleetPct = 0.03 * p;
      break;
    case 'suit':
      fx.health = 4 * p + 2;
      addStat('cmd', Math.ceil(p / 2));
      break;
    case 'flagship':
      fx.fleetPct = 0.05 * p + 0.03;
      if (p >= 3) addStat('cmd', 1);
      break;
    case 'relic': {
      const kind = int(s, 0, 4);
      if (kind === 0) fx.faithYr = 2 * p + 1;
      else if (kind === 1) {
        addStat('sci', p + 1);
      } else if (kind === 2) fx.creditsYr = 15 * p;
      else if (kind === 3) {
        fx.fertility = 0.15 * p;
        fx.health = 2 * p;
      } else fx.scheme = 0.04 * p;
      break;
    }
  }
  return fx;
}

export function makeItem(s: Seeded, id: string, opts: { slot?: ItemSlot; rarity?: Rarity; origin?: string } = {}): Item {
  const slot =
    opts.slot ??
    weighted<ItemSlot>(s, [
      ['head', 2],
      ['weapon', 3],
      ['suit', 2],
      ['flagship', 2],
      ['relic', 3],
    ]);
  const rarity =
    opts.rarity ??
    weighted<Rarity>(s, [
      ['common', 50],
      ['rare', 32],
      ['epic', 14],
      ['legendary', 4],
    ]);
  return {
    id,
    name: makeName(s, slot),
    slot,
    rarity,
    fx: makeEffects(s, slot, rarity),
    price: Math.round(RARITY_PRICE[rarity] * (0.85 + rand(s) * 0.3)),
    seed: int(s, 1, 1e9),
    origin: opts.origin,
  };
}

export function itemEffectText(fx: ItemEffects): string {
  const parts: string[] = [];
  if (fx.stats) {
    for (const [k, v] of Object.entries(fx.stats)) if (v) parts.push(`+${v} ${STAT_NAMES[k as StatKey]}`);
  }
  if (fx.health) parts.push(`+${fx.health} health`);
  if (fx.fleetPct) parts.push(`+${Math.round(fx.fleetPct * 100)}% fleet strength`);
  if (fx.prestigeYr) parts.push(`+${fx.prestigeYr} prestige/cycle`);
  if (fx.faithYr) parts.push(`+${fx.faithYr} faith/cycle`);
  if (fx.creditsYr) parts.push(`+${fx.creditsYr} credits/cycle`);
  if (fx.fertility) parts.push(`+${Math.round(fx.fertility * 100)}% fertility`);
  if (fx.scheme) parts.push(`+${Math.round(fx.scheme * 100)}% scheme success`);
  return parts.join(', ');
}
