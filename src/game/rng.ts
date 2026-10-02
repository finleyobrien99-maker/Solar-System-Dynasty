// Seeded RNG. Game randomness reads and advances `seed` on the state object,
// so a save restores the exact same future. SVG art uses its own seeded RNG
// built from a string so a portrait never changes between renders.

export interface Seeded {
  seed: number;
}

export function rand(s: Seeded): number {
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function int(s: Seeded, lo: number, hi: number): number {
  return lo + Math.floor(rand(s) * (hi - lo + 1));
}

export function range(s: Seeded, lo: number, hi: number): number {
  return lo + rand(s) * (hi - lo);
}

export function chance(s: Seeded, p: number): boolean {
  return rand(s) < p;
}

export function pick<T>(s: Seeded, arr: readonly T[]): T {
  return arr[Math.floor(rand(s) * arr.length)];
}

export function weighted<T>(s: Seeded, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((a, [, w]) => a + Math.max(0, w), 0);
  let r = rand(s) * total;
  for (const [item, w] of items) {
    r -= Math.max(0, w);
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}

export function shuffle<T>(s: Seeded, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seeded(key: string | number): Seeded {
  return { seed: typeof key === 'number' ? key : hashString(key) };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
