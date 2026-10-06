// Cosmetic overrides are separate from inherited looks and never affect simulation.
import { isVip, ruler } from './core';
import type { Appearance, Character, GameState, PortraitStyle, SigilSpec } from './types';

export const LOOK_LIMITS: Record<keyof Appearance, number> = { skin: 7, hair: 7, hairStyle: 7, eyes: 6, face: 3, nose: 3, mouth: 3, brow: 2, beard: 3 };
export const SIGIL_SHAPES = ['Shield', 'Round', 'Hexagon', 'Banner', 'Kite'];
export const SIGIL_PATTERNS = ['Plain', 'Vertical split', 'Horizontal split', 'Diagonal split', 'Quartered', 'Chevron', 'Border'];
export const SIGIL_SYMBOLS = [
  'Star',
  'Comet',
  'Ringed planet',
  'Rocket',
  'Eye',
  'Crown',
  'Gear',
  'Atom',
  'Crescent',
  'Sun',
  'Trident',
  'Wing',
  'Skull',
  'Lightning',
  'Gem',
  'Sword',
];
export function hexColour(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (/^#[a-f\d]{6}$/i.test(text)) return text.toLowerCase();
  if (/^#[a-f\d]{3}$/i.test(text))
    return (
      '#' +
      text
        .slice(1)
        .split('')
        .map((c) => c + c)
        .join('')
        .toLowerCase()
    );
  return null;
}
export function normalisePortrait(value: unknown): PortraitStyle | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: PortraitStyle = {};
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined) continue;
    if (key === 'skinColor' || key === 'hairColor' || key === 'eyeColor') {
      const colour = hexColour(v);
      if (!colour) return null;
      out[key] = colour;
    } else if (Object.hasOwn(LOOK_LIMITS, key)) {
      const k = key as keyof Appearance;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > LOOK_LIMITS[k]) return null;
      out[k] = v;
    } else return null;
  }
  return out;
}
export function canEditPortrait(s: GameState, c: Character): boolean {
  return c.clanId === s.playerClanId || c.id === ruler(s)?.spouseId || isVip(s);
}
export function setPortrait(s: GameState, id: string, style: PortraitStyle): boolean {
  const c = s.characters[id] ?? s.suitors?.list.find((x) => x.char.id === id)?.char;
  const clean = normalisePortrait(style);
  if (!c || !canEditPortrait(s, c) || !clean) return false;
  if (Object.keys(clean).length) c.portrait = clean;
  else delete c.portrait;
  return true;
}
export function setHouseIdentity(s: GameState, id: string, name: string, spec: SigilSpec): boolean {
  const clan = s.clans[id];
  const n = name.trim();
  const colours = [spec.c1, spec.c2, spec.c3].map(hexColour);
  const indices = [
    [spec.shape, SIGIL_SHAPES.length],
    [spec.division, SIGIL_PATTERNS.length],
    [spec.charge, SIGIL_SYMBOLS.length],
  ];
  if (
    !clan ||
    id !== s.playerClanId ||
    !n ||
    n.length > 24 ||
    colours.some((c) => !c) ||
    indices.some(([v, count]) => !Number.isInteger(v) || v < 0 || v >= count)
  )
    return false;
  clan.name = n;
  clan.sigil = { shape: spec.shape, division: spec.division, charge: spec.charge, c1: colours[0]!, c2: colours[1]!, c3: colours[2]! };
  clan.color = clan.sigil.c1;
  return true;
}
