// Colour helpers and palettes shared by the procedural art.

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function shade(c: string, amount: number): string {
  return amount >= 0 ? mix(c, '#ffffff', amount) : mix(c, '#000000', -amount);
}

export function luminance(c: string): number {
  const [r, g, b] = hexToRgb(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export const SKIN = ['#f7dfcc', '#f0caa9', '#e2b18b', '#cb9672', '#ab7756', '#8b5b3d', '#6c452b', '#4b301e'];

// Each world leaves a faint mark on its people.
export const PLANET_TINT: Record<string, [string, number]> = {
  mercury: ['#d9893f', 0.08],
  venus: ['#e8c25a', 0.1],
  earth: ['#000000', 0],
  mars: ['#c0503a', 0.1],
  ceres: ['#8a9a7a', 0.06],
  jupiter: ['#d9a066', 0.06],
  saturn: ['#c2b0e0', 0.07],
  uranus: ['#7fd3d9', 0.12],
  neptune: ['#5b7cf0', 0.12],
  pluto: ['#b8a6d9', 0.12],
};

export const HAIR = ['#1b1714', '#3b2619', '#5e3b22', '#7c3e22', '#c9a15a', '#a8461f', '#e3dcc8'];

export const EXOTIC_HAIR: Record<string, string> = {
  mercury: '#d26a2a',
  venus: '#e7c55c',
  earth: '#1f2d55',
  mars: '#a3242a',
  ceres: '#5fbf6f',
  jupiter: '#d08a2c',
  saturn: '#b39ddb',
  uranus: '#a9d3ec',
  neptune: '#2bb3a8',
  pluto: '#eeeef8',
};

export const EYES = ['#5a3a1e', '#2b1d12', '#8a6a2a', '#4f7a3a', '#3a6fb0', '#7a8a95'];

export const EXOTIC_EYES: Record<string, string> = {
  mercury: '#ff9a2e',
  venus: '#e2b23a',
  earth: '#2a9d8f',
  mars: '#d33b2c',
  ceres: '#79e07a',
  jupiter: '#f0a500',
  saturn: '#a77bff',
  uranus: '#7ff3ff',
  neptune: '#3ad0ff',
  pluto: '#d0d0ff',
};

export function skinColor(index: number, planetId: string, traits: string[]): string {
  let c = SKIN[Math.max(0, Math.min(7, index))];
  const [tint, amt] = PLANET_TINT[planetId] ?? ['#000000', 0];
  if (amt) c = mix(c, tint, amt);
  if (traits.includes('void_adapted')) c = mix(c, '#9fb8e8', 0.18);
  if (traits.includes('ill') || traits.includes('gene_rot')) c = mix(c, '#9bb07a', 0.22);
  if (traits.includes('xenoblood')) c = mix(c, '#7ac9a0', 0.12);
  return c;
}

export function hairColor(index: number, planetId: string, age: number): string {
  let c = index >= 7 ? EXOTIC_HAIR[planetId] ?? HAIR[0] : HAIR[Math.max(0, Math.min(6, index))];
  if (age >= 45) c = mix(c, '#c9c9c9', Math.min(0.9, (age - 45) / 30));
  return c;
}

export function eyeColor(index: number, planetId: string): string {
  return index >= 6 ? EXOTIC_EYES[planetId] ?? EYES[0] : EYES[Math.max(0, Math.min(5, index))];
}
