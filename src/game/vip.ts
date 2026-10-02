// VIP mode, the sandbox. Edit anyone's traits, stats and age on the fly, run
// an unlimited Gene-Forge, and top up the treasury from a console. Like the
// VIP perks in mobile life sims, except it's free, and every bit of it only
// ever helps the player's house. AI houses never get any of this.

import { eduTrait } from './character';
import { ageOf, alive, bloodlineMembers, childrenOf, isVip, log, maxHealth, ruler } from './core';
import { fleetCap } from './economy';
import { clamp } from './rng';
import { addTrait, GENETIC, TRAITS, type TraitDef } from './traits';
import { STAT_KEYS, type Character, type GameState, type StatKey } from './types';

export const STAT_MAX = 30;
export const GOD_STAT = 15;
export const MAX_AGE = 150;

/** The better half of every opposed personality pair. */
export const GOD_PERSONALITY = [
  'brave',
  'calm',
  'lustful',
  'ambitious',
  'diligent',
  'generous',
  'gregarious',
  'deceitful',
  'humble',
  'just',
  'kind',
  'patient',
  'paranoid',
  'zealous',
];

/** Earned honours and implants that only help. */
export const GOD_EXTRAS = [
  'beast_slayer',
  'pilgrim',
  'war_hero',
  'blessed',
  'duelist',
  'neural_lace',
  'optic_implant',
  'bionic_arm',
  'silver_tongue',
  'ledger_cortex',
  'nano_immune',
  'cardio_core',
];

/** The top good rung of every gene ladder. */
export function godGenetics(): string[] {
  const best = new Map<string, TraitDef>();
  for (const t of GENETIC) {
    if (!t.good || !t.group) continue;
    const cur = best.get(t.group);
    if (!cur || (t.level ?? 0) > (cur.level ?? 0)) best.set(t.group, t);
  }
  return [...best.values()].map((t) => t.id);
}

/** Every good trait a single person can carry at once. */
export function godTraits(focus: StatKey): string[] {
  let out: string[] = [];
  for (const id of [...godGenetics(), ...GOD_PERSONALITY, ...GOD_EXTRAS, eduTrait(focus, 4)]) out = addTrait(out, id);
  return out;
}

/** Anyone the editor can reach: the living, the dead, and suitors on offer. */
export function findChar(s: GameState, id: string): Character | undefined {
  return s.characters[id] ?? s.suitors?.list.find((x) => x.char.id === id)?.char;
}

function eduFocus(c: Character): StatKey | undefined {
  const e = c.traits.find((t) => t.startsWith('edu_'));
  return e ? (e.split('_')[1] as StatKey) : c.edu?.focus;
}

// ── Switching it on and off ───────────────────────────────────────────────

export function enableVip(s: GameState): void {
  s.vip = { on: true, immortal: s.vip?.immortal };
  s.forge.project = undefined;
  log(s, 'VIP mode switched on. The rules bend for House ' + s.clans[s.playerClanId].name + '.', 'info');
}

export function disableVip(s: GameState): void {
  if (s.vip) s.vip.on = false;
  log(s, 'VIP mode switched off.', 'info');
}

export function setImmortal(s: GameState, on: boolean): void {
  if (!isVip(s) || !s.vip) return;
  s.vip.immortal = on;
}

// ── The character editor ──────────────────────────────────────────────────

export function toggleTrait(s: GameState, charId: string, traitId: string): void {
  const c = findChar(s, charId);
  if (!isVip(s) || !c || !TRAITS[traitId]) return;
  c.traits = c.traits.includes(traitId) ? c.traits.filter((t) => t !== traitId) : addTrait(c.traits, traitId);
}

export function setStat(s: GameState, charId: string, k: StatKey, value: number): void {
  const c = findChar(s, charId);
  if (!isVip(s) || !c) return;
  c.base[k] = clamp(Math.round(value), 0, STAT_MAX);
}

/** Youngest age someone can be set to: the ruler stays an adult, parents stay older than their kids. */
export function minAge(s: GameState, c: Character): number {
  const eldest = Math.max(-1, ...childrenOf(s, c).map((k) => s.year - k.born));
  return Math.max(c.id === s.rulerId ? 16 : 0, eldest >= 0 ? eldest + 14 : 0);
}

export function setAge(s: GameState, charId: string, age: number): void {
  const c = findChar(s, charId);
  if (!isVip(s) || !c || !alive(c)) return;
  c.born = s.year - clamp(Math.round(age), minAge(s, c), MAX_AGE);
  c.health = Math.min(c.health, maxHealth(s, c) + 10);
}

export function rename(s: GameState, charId: string, name: string): void {
  const c = findChar(s, charId);
  const n = name.trim().slice(0, 24);
  if (!isVip(s) || !c || !n) return;
  c.name = n;
}

export function heal(s: GameState, charId: string): void {
  const c = findChar(s, charId);
  if (!isVip(s) || !c || !alive(c)) return;
  c.traits = c.traits.filter((t) => t !== 'ill' && t !== 'wounded');
  c.health = maxHealth(s, c);
}

/** Strip every trait that does them harm. */
export function cleanse(s: GameState, charId: string): void {
  const c = findChar(s, charId);
  if (!isVip(s) || !c) return;
  c.traits = c.traits.filter((t) => TRAITS[t]?.good !== false);
}

export function clearTraits(s: GameState, charId: string): void {
  const c = findChar(s, charId);
  if (!isVip(s) || !c) return;
  c.traits = [];
}

/** Every good trait at once, plus top stats and full health. */
export function makeGodTier(s: GameState, charId: string, focus?: StatKey): void {
  const c = findChar(s, charId);
  if (!isVip(s) || !c) return;
  const f = focus ?? eduFocus(c) ?? 'cmd';
  let traits = c.traits.filter((t) => TRAITS[t]?.good !== false);
  for (const id of godTraits(f)) traits = addTrait(traits, id);
  c.traits = traits;
  for (const k of STAT_KEYS) c.base[k] = Math.max(c.base[k], GOD_STAT);
  if (alive(c)) c.health = maxHealth(s, c);
}

// ── The console ───────────────────────────────────────────────────────────

export type Resource = 'credits' | 'prestige' | 'faith';

export function give(s: GameState, what: Resource, amount: number): void {
  if (!isVip(s)) return;
  s[what] = Math.max(0, s[what]) + amount;
}

export function fillFleet(s: GameState): void {
  if (!isVip(s)) return;
  s.fleet = Math.max(s.fleet, fleetCap(s));
}

export function rejuvenate(s: GameState): void {
  if (!isVip(s)) return;
  const r = ruler(s);
  setAge(s, r.id, ageOf(s, r) - 10);
  heal(s, r.id);
}

export function healBloodline(s: GameState): number {
  if (!isVip(s)) return 0;
  const members = bloodlineMembers(s);
  for (const c of members) heal(s, c.id);
  return members.length;
}

/** Remove harmful genes from everyone living of the blood. */
export function cleanseBloodline(s: GameState): number {
  if (!isVip(s)) return 0;
  let n = 0;
  for (const c of bloodlineMembers(s)) {
    const before = c.traits.length;
    c.traits = c.traits.filter((t) => !(TRAITS[t]?.cat === 'genetic' && TRAITS[t].good === false));
    if (c.traits.length !== before) n++;
  }
  return n;
}

export function godTierBloodline(s: GameState): number {
  if (!isVip(s)) return 0;
  const members = bloodlineMembers(s);
  for (const c of members) makeGodTier(s, c.id);
  return members.length;
}

/** Lock the top rung of every gene ladder into the vault, so every child is born god-tier. */
export function lockGodGenes(s: GameState): void {
  if (!isVip(s)) return;
  const genes = godGenetics();
  s.dynasty.locked = [...s.dynasty.locked.filter((t) => !genes.some((g) => TRAITS[g].group === TRAITS[t]?.group && TRAITS[t]?.cat === 'genetic')), ...genes];
  s.dynasty.purged = s.dynasty.purged.filter((t) => !genes.includes(t));
  log(s, 'Every top-rung gene is now locked into the bloodline.', 'good');
}
