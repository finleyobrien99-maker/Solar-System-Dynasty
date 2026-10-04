// Shared shapes and helpers for the event decks.

import { ageOf, clanRegions, courtMembers, dynastyMembers, hasTrait } from './core';
import { chance, int, pick } from './rng';
import { addTrait } from './traits';
import type { Character, GameState, StoryFlag } from './types';

export interface EventCtx {
  s: GameState;
  r: Character;
  subject?: Character;
  data: Record<string, string | number>;
}

export interface EventChoice {
  label: string;
  /** A hand-written hint. Events built with the DSL (dsl.ts) generate `describe` instead. */
  hint?: string;
  /** The option's effects and odds, written from its definition. */
  describe?: (c: EventCtx) => string;
  /** Why the option is greyed out, if it is. */
  why?: (c: EventCtx) => string | null;
  /** Hidden entirely unless this holds (unlike `available`, which greys it out). */
  show?: (c: EventCtx) => boolean;
  available?: (c: EventCtx) => boolean;
  run: (c: EventCtx) => string;
}

export interface EventDef {
  id: string;
  title: string;
  icon: string;
  weight: number;
  cooldown?: number;
  /** Fires as soon as `when` holds, ahead of the random draw (follow-ups to earlier choices). */
  urgent?: boolean;
  when?: (s: GameState) => boolean;
  subject?: (s: GameState) => Character | undefined;
  setup?: (c: EventCtx) => void;
  text: (c: EventCtx) => string;
  choices: EventChoice[];
}

/** Alive and not immune to disease. */
export function canCatch(c: Character | undefined): c is Character {
  return !!c && c.died === undefined && !hasTrait(c, 'xenoblood') && !hasTrait(c, 'nano_immune') && !hasTrait(c, 'ironblood');
}

export function sicken(_s: GameState, c: Character): boolean {
  if (hasTrait(c, 'xenoblood') || hasTrait(c, 'nano_immune') || hasTrait(c, 'ironblood')) return false;
  c.traits = addTrait(c.traits, 'ill');
  return true;
}

export function randomCourt(s: GameState): Character | undefined {
  const pool = courtMembers(s);
  return pool.length ? pick(s, pool) : undefined;
}

export function rivalClan(s: GameState) {
  const pool = Object.values(s.clans).filter((c) => !c.isPlayer && clanRegions(s, c.id).length);
  if (!pool.length) return undefined;
  const sorted = pool.sort((a, b) => a.opinion - b.opinion);
  return chance(s, 0.6) ? sorted[int(s, 0, Math.min(4, sorted.length - 1))] : pick(s, pool);
}

export function myRegion(s: GameState) {
  const regs = clanRegions(s, s.playerClanId);
  return regs.length ? pick(s, regs) : undefined;
}

export function dynastyKids(s: GameState, lo: number, hi: number) {
  return dynastyMembers(s).filter((c) => {
    const a = ageOf(s, c);
    return a >= lo && a <= hi;
  });
}

/** He / she, his / her, him / her for a character. */
export function pr(c: Character | undefined) {
  const m = c?.gender === 'M';
  return { he: m ? 'he' : 'she', his: m ? 'his' : 'her', him: m ? 'him' : 'her', He: m ? 'He' : 'She', His: m ? 'His' : 'Her' };
}

// Story flags carry a choice forward to a follow-up event years later.
export function setFlag(s: GameState, name: string, due: number, data: StoryFlag['data'] = {}): void {
  (s.flags ??= {})[name] = { due, data };
}

export function getFlag(s: GameState, name: string): StoryFlag | undefined {
  return s.flags?.[name];
}

export function flagDue(s: GameState, name: string): boolean {
  const f = s.flags?.[name];
  return !!f && f.due <= s.year;
}

export function clearFlag(s: GameState, name: string): void {
  if (s.flags) delete s.flags[name];
}
