import { recordDeed } from './epithets';
// Inheritance and the Gene Vault.
//
// Every heritable trait has a chance to pass from parent to child. Matching
// tiers in both parents can even climb a rung (two Brilliant parents can make
// a Genius). The Gene Vault lets the player override chance entirely:
//   • Locked traits are ALWAYS given to every child born into the dynasty.
//   • Purged traits are NEVER given to a dynasty child.

import { alive, bloodlineMembers, ageOf, isVip, log, ruler } from './core';
import { chance, pick, rand, weighted, type Seeded } from './rng';
import { addTrait, conflicts, GENETIC, isHeritable, TRAIT_LIST, TRAITS } from './traits';
import type { Character, GameState } from './types';

export const MAX_SLOTS = 12;

function traitInGroup(c: Character | undefined, group: string): string | undefined {
  return c?.traits.find((t) => TRAITS[t]?.cat === 'genetic' && TRAITS[t]?.group === group);
}

function tierAbove(id: string): string | undefined {
  const t = TRAITS[id];
  if (!t?.group || t.level === undefined || t.level <= 0) return undefined;
  return GENETIC.find((g) => g.group === t.group && g.level === (t.level ?? 0) + 1)?.id;
}

export interface InheritOpts {
  locked?: string[];
  purged?: string[];
}

export function inheritGenetics(s: Seeded, father: Character | undefined, mother: Character | undefined, o: InheritOpts = {}): string[] {
  const locked = o.locked ?? [];
  const purged = o.purged ?? [];
  const groups = new Set<string>();
  for (const p of [father, mother]) {
    for (const t of p?.traits ?? []) {
      const def = TRAITS[t];
      if (def?.cat === 'genetic' && def.group) groups.add(def.group);
    }
  }
  for (const t of locked) {
    const def = TRAITS[t];
    if (def?.cat === 'genetic' && def.group) groups.add(def.group);
  }

  let out: string[] = [];
  for (const group of groups) {
    const lockedHere = locked.find((t) => TRAITS[t]?.group === group && TRAITS[t]?.cat === 'genetic');
    if (lockedHere) {
      out = addTrait(out, lockedHere);
      continue;
    }
    const a = traitInGroup(father, group);
    const b = traitInGroup(mother, group);
    let got: string | undefined;
    if (a && b && a === b) {
      const r = rand(s);
      const up = tierAbove(a);
      if (up && r < 0.12) got = up;
      else if (r < 0.75) got = a;
    } else if (a && b) {
      const r = rand(s);
      if (r < 0.4) got = a;
      else if (r < 0.8) got = b;
    } else {
      const only = a ?? b;
      if (only && chance(s, 0.4)) got = only;
    }
    if (got && !purged.includes(got)) out = addTrait(out, got);
  }

  // Random mutation keeps the gene pool interesting.
  if (chance(s, 0.05)) {
    const options = GENETIC.filter((t) => !purged.includes(t.id) && !out.some((x) => conflicts(x, t.id))).map((t) => [t.id, t.mutation ?? 1] as const);
    if (options.length) out = addTrait(out, weighted(s, options));
  }
  return out;
}

export function inheritPersonality(s: Seeded, father: Character | undefined, mother: Character | undefined, o: InheritOpts = {}): string[] {
  const locked = (o.locked ?? []).filter((t) => TRAITS[t]?.cat === 'personality');
  const purged = o.purged ?? [];
  const out = locked.slice();
  for (const p of [father, mother]) {
    for (const t of p?.traits ?? []) {
      if (TRAITS[t]?.cat !== 'personality' || purged.includes(t)) continue;
      if (out.some((x) => conflicts(x, t))) continue;
      if (chance(s, 0.15)) out.push(t);
    }
  }
  return out;
}

// ── Gene Vault ────────────────────────────────────────────────────────────

export interface Cost {
  credits?: number;
  prestige?: number;
  faith?: number;
}

export function vaultUsed(s: GameState): number {
  return s.dynasty.locked.length + s.dynasty.purged.length;
}

export function lockCost(id: string): Cost {
  const t = TRAITS[id];
  if (!t) return {};
  if (t.cat === 'personality') return { credits: 100, faith: 100 };
  const lvl = Math.max(1, t.level ?? 1);
  return { credits: 150 + 175 * lvl, prestige: 75 + 25 * lvl };
}

export function purgeCost(id: string): Cost {
  const t = TRAITS[id];
  if (!t) return {};
  if (t.cat === 'personality') return { credits: 50, faith: 100 };
  return { credits: 250, prestige: 75 };
}

/** What the player actually pays: everything in the vault is free in VIP mode. */
export function lockPrice(s: GameState, id: string): Cost {
  return isVip(s) ? {} : lockCost(id);
}

export function purgePrice(s: GameState, id: string): Cost {
  return isVip(s) ? {} : purgeCost(id);
}

/** Vault capacity. VIP mode has no limit. */
export function vaultSlots(s: GameState): number {
  return isVip(s) ? Infinity : s.dynasty.slots;
}

export function slotCost(s: GameState): Cost {
  const n = s.dynasty.slots;
  return { credits: 250 * n, prestige: 50 * n };
}

export function canAfford(s: GameState, c: Cost): boolean {
  return s.credits >= (c.credits ?? 0) && s.prestige >= (c.prestige ?? 0) && s.faith >= (c.faith ?? 0);
}

export function pay(s: GameState, c: Cost): void {
  s.credits -= c.credits ?? 0;
  s.prestige -= c.prestige ?? 0;
  s.faith -= c.faith ?? 0;
}

export function costText(c: Cost): string {
  const parts: string[] = [];
  if (c.credits) parts.push(`${c.credits} credits`);
  if (c.prestige) parts.push(`${c.prestige} prestige`);
  if (c.faith) parts.push(`${c.faith} faith`);
  return parts.join(' + ') || 'free';
}

/** Locks that a new lock would push out (same gene group / opposite personality). */
function displacedBy(s: GameState, id: string): string[] {
  return s.dynasty.locked.filter((t) => t !== id && conflicts(t, id));
}

export function carriers(s: GameState, id: string): Character[] {
  return bloodlineMembers(s).filter((c) => c.traits.includes(id));
}

export function lockBlocker(s: GameState, id: string): string | null {
  const t = TRAITS[id];
  if (!t || !isHeritable(id)) return 'Only genetic and personality traits can be locked.';
  if (s.dynasty.locked.includes(id)) return 'Already locked.';
  const freed = displacedBy(s, id).length + (s.dynasty.purged.includes(id) ? 1 : 0);
  if (vaultUsed(s) - freed >= vaultSlots(s)) return 'No free vault slots. Release a trait or buy another slot.';
  if (!isVip(s) && !carriers(s, id).length && !s.forge.researched.includes(id))
    return 'No living member of your bloodline carries this trait. Breed for it, or research it in the Gene-Forge.';
  if (!canAfford(s, lockPrice(s, id))) return `Need ${costText(lockPrice(s, id))}.`;
  return null;
}

export function purgeBlocker(s: GameState, id: string): string | null {
  if (!isHeritable(id)) return 'Only genetic and personality traits can be purged.';
  if (s.dynasty.purged.includes(id)) return 'Already purged.';
  const freed = s.dynasty.locked.includes(id) ? 1 : 0;
  if (vaultUsed(s) - freed >= vaultSlots(s)) return 'No free vault slots. Release a trait or buy another slot.';
  if (!canAfford(s, purgePrice(s, id))) return `Need ${costText(purgePrice(s, id))}.`;
  return null;
}

export function lockTrait(s: GameState, id: string): boolean {
  if (lockBlocker(s, id)) return false;
  pay(s, lockPrice(s, id));
  const displaced = displacedBy(s, id);
  s.dynasty.locked = s.dynasty.locked.filter((t) => !displaced.includes(t));
  s.dynasty.purged = s.dynasty.purged.filter((t) => t !== id);
  s.dynasty.locked.push(id);
  const t = TRAITS[id];
  if (t.cat === 'personality') {
    // Conditioning reaches every dynasty child still growing up.
    for (const c of bloodlineMembers(s)) {
      if (ageOf(s, c) < 16) c.traits = addTrait(c.traits, id);
    }
  }
  log(s, `The Gene Vault now locks ${t.name} into the bloodline.`, 'good');
  return true;
}

export function purgeTrait(s: GameState, id: string): boolean {
  if (purgeBlocker(s, id)) return false;
  pay(s, purgePrice(s, id));
  s.dynasty.locked = s.dynasty.locked.filter((t) => t !== id);
  s.dynasty.purged.push(id);
  recordDeed(s, ruler(s), 'purges', 1, id);
  const t = TRAITS[id];
  if (t.cat === 'personality') {
    for (const c of bloodlineMembers(s)) {
      if (ageOf(s, c) < 16) c.traits = c.traits.filter((x) => x !== id);
    }
  }
  log(s, `${t.name} has been purged from the bloodline.`, 'good');
  return true;
}

export function releaseTrait(s: GameState, id: string): void {
  s.dynasty.locked = s.dynasty.locked.filter((t) => t !== id);
  s.dynasty.purged = s.dynasty.purged.filter((t) => t !== id);
}

export function buySlot(s: GameState): boolean {
  const c = slotCost(s);
  if (isVip(s) || s.dynasty.slots >= MAX_SLOTS || !canAfford(s, c)) return false;
  pay(s, c);
  s.dynasty.slots += 1;
  return true;
}

/** Sum of genetic tiers across living dynasty members, as a letter grade. */
export function bloodlineScore(s: GameState): { score: number; grade: string } {
  const members = bloodlineMembers(s).filter(alive);
  if (!members.length) return { score: 0, grade: '-' };
  let total = 0;
  for (const m of members) {
    for (const t of m.traits) {
      const d = TRAITS[t];
      if (d?.cat === 'genetic') total += d.level ?? 0;
    }
  }
  const score = total / members.length + s.dynasty.locked.filter((t) => TRAITS[t]?.cat === 'genetic' && TRAITS[t].good).length * 0.5;
  const grade = score >= 7 ? 'S' : score >= 5 ? 'A' : score >= 3 ? 'B' : score >= 1.5 ? 'C' : score >= 0 ? 'D' : 'F';
  return { score: Math.round(score * 10) / 10, grade };
}

/** Traits the vault could act on: everything heritable, carriers first. */
export function vaultCandidates(s: GameState): string[] {
  const present = new Set<string>();
  for (const m of bloodlineMembers(s)) for (const t of m.traits) if (isHeritable(t)) present.add(t);
  return TRAIT_LIST.filter((t) => isHeritable(t.id))
    .map((t) => t.id)
    .sort((a, b) => Number(present.has(b)) - Number(present.has(a)));
}

/** Rogue gene-splice: grant a random good genetic trait (used by events). */
export function randomGoodGene(s: Seeded, existing: string[]): string | undefined {
  const opts = GENETIC.filter(
    (t) => t.good && !existing.includes(t.id) && !existing.some((x) => conflicts(x, t.id) && (TRAITS[x].level ?? 0) >= (t.level ?? 0)),
  );
  if (!opts.length) return undefined;
  return pick(s, opts).id;
}
