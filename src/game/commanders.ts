// Named commanders (ROADMAP 12.10 and 5.3). Each house can put one of its own
// people in command of its fleet. They lead every battle the ruler doesn't
// lead in person, using only their own Command: no council seat, treasury or
// VIP bonus is borrowed for it. Battles are real for them: victories build a
// military reputation (deeds feed earned names), and every engagement risks
// wounds, capture or death, which their family feels. AI houses choose their
// best kin by the same rules.
//
// No save change: the appointment is a story flag (`commander:<clanId>`) and
// everything else (deeds, traits, captivity, feelings) is existing state.
// Fleet accounting is untouched: a commander changes how well ships fight,
// never how many there are.

import { ageOf, alive, ch, childrenOf, clanRegions, effStats, fullName, hasTrait, log, ruler, traitSum } from './core';
import { roleOf } from './council';
import { recordDeed } from './epithets';
import { clearFlag, getFlag, setFlag } from './eventKit';
import { isCloseFamily, killCharacter } from './life';
import { addFeeling, closeKin } from './relations';
import { chance, pick } from './rng';
import { addTrait } from './traits';
import type { Character, Clan, GameState } from './types';
import { isAway } from './wards';

const KEY = 'commander:';
/** Story flags need a due year; an appointment has none. */
const NEVER = 99999;
export const MIN_AGE = 16;
export const MAX_AGE = 70;
/** How much each point of Command adds to a fleet's strength (as for the ruler and the admiral). */
export const PER_COMMAND = 0.04;

// ── Who commands ──────────────────────────────────────────────────────────

function leader(s: GameState, k: Clan): Character | undefined {
  return k.isPlayer ? ruler(s) : ch(s, k.headId);
}

/** Free, grown, at home and of the house. The player's ruler leads in person instead (Realm tab). */
function fit(s: GameState, k: Clan, c: Character | undefined): c is Character {
  if (!alive(c) || c.prisonerOf || c.clanId !== k.id || isAway(s, c)) return false;
  const age = ageOf(s, c);
  if (age < MIN_AGE || age > MAX_AGE) return false;
  return !(k.isPlayer && c.id === s.rulerId);
}

/** People a house could put in command: for you, close family and councillors; for AI houses, the lord and the lord's children and siblings. */
export function eligibleCommanders(s: GameState, clanId: string): Character[] {
  const k = s.clans[clanId];
  if (!k) return [];
  const out = new Map<string, Character>();
  const add = (c: Character | undefined) => {
    if (fit(s, k, c)) out.set(c.id, c);
  };
  if (k.isPlayer) {
    const r = ruler(s);
    for (const c of childrenOf(s, r)) add(c);
    for (const p of [ch(s, r.fatherId), ch(s, r.motherId)]) {
      add(p);
      for (const id of p?.childrenIds ?? []) add(s.characters[id]);
    }
    for (const role of ['envoy', 'admiral', 'treasurer', 'spymaster', 'scientist'] as const) add(ch(s, s.council[role]));
    for (const c of [...out.values()]) if (!isCloseFamily(s, c) && !roleOf(s, c.id)) out.delete(c.id);
  } else {
    const head = ch(s, k.headId);
    add(head);
    for (const c of head ? childrenOf(s, head) : []) add(c);
    for (const p of [ch(s, head?.fatherId), ch(s, head?.motherId)]) for (const id of p?.childrenIds ?? []) add(s.characters[id]);
  }
  return [...out.values()];
}

/** The house's commander, if they can still serve. Reading never changes anything. */
export function commanderOf(s: GameState, clanId: string): Character | undefined {
  const k = s.clans[clanId];
  const f = getFlag(s, KEY + clanId);
  const c = f && ch(s, String(f.data.id));
  return k && fit(s, k, c) ? c : undefined;
}

export function commandedSince(s: GameState, clanId: string): number | undefined {
  const f = getFlag(s, KEY + clanId);
  return f ? Number(f.data.since) : undefined;
}

/** A commander's own Command: their stats and traits only, never a council seat, relic or VIP bonus. */
export function personalCommand(s: GameState, c: Character): number {
  return effStats(s, c).cmd;
}

/** The fleet strength multiplier a commander brings: Command, plus their own fleet-minded traits (Brave, Void-Adapted...). */
export function commandFactor(s: GameState, c: Character): number {
  return (1 + personalCommand(s, c) * PER_COMMAND) * (1 + traitSum(c, 'fleetPct'));
}

export function commandBlocker(s: GameState, clanId: string, id: string): string | null {
  const k = s.clans[clanId];
  const c = ch(s, id);
  if (!k || !c) return 'Nobody to appoint.';
  if (k.isPlayer && id === s.rulerId) return 'You lead in person from the Realm tab instead.';
  if (!alive(c)) return 'They have died.';
  if (c.prisonerOf) return 'They are a captive.';
  if (ageOf(s, c) < MIN_AGE) return `Commanders must be at least ${MIN_AGE}.`;
  if (ageOf(s, c) > MAX_AGE) return 'Too old for the bridge.';
  if (!eligibleCommanders(s, clanId).some((x) => x.id === id)) return 'Only close family and councillors of your house.';
  if (commanderOf(s, clanId)?.id === id) return 'Already in command.';
  return null;
}

export function appointCommander(s: GameState, clanId: string, id: string): boolean {
  if (commandBlocker(s, clanId, id)) return false;
  const k = s.clans[clanId];
  const old = commanderOf(s, clanId);
  if (old) addFeeling(s, old.id, leader(s, k)?.id ?? old.id, { why: 'Relieved me of command', value: -10, decay: 1, key: 'relieved' });
  setFlag(s, KEY + clanId, NEVER, { id, since: s.year });
  enlist(s, s.characters[id]);
  if (k.isPlayer) log(s, `${fullName(s, s.characters[id])} takes command of the fleet.`, 'war');
  return true;
}

/** Relieve the commander. The proud take it badly. */
export function dismissCommander(s: GameState, clanId: string): void {
  const k = s.clans[clanId];
  const c = commanderOf(s, clanId);
  clearFlag(s, KEY + clanId);
  if (!c || !k) return;
  const lord = leader(s, k);
  const proud = hasTrait(c, 'ambitious') || hasTrait(c, 'arrogant') || hasTrait(c, 'wrathful');
  if (lord && lord.id !== c.id) addFeeling(s, c.id, lord.id, { why: 'Relieved me of command', value: proud ? -20 : -10, decay: 1, key: 'relieved' });
  if (k.isPlayer) log(s, `${c.name} is relieved of command of the fleet.`, 'war');
}

/** Battles, wins and losses a character has led (from their deeds). */
export function battleRecord(c: Character): { won: number; lost: number } {
  const d = c.reputation?.deeds ?? {};
  return { won: d.battlesWon ?? 0, lost: d.battlesLost ?? 0 };
}

// ── After a battle ────────────────────────────────────────────────────────

export interface BattleFate {
  /** One line for the battle report. */
  note: string;
  died?: boolean;
  captured?: boolean;
  wounded?: boolean;
  hero?: boolean;
}

/**
 * A commander lived through (or didn't) a battle: deeds for their name, and a
 * chance of death, capture (only in defeat) or wounds, twice as likely in
 * defeat. Family grieve a death, blaming the enemy commander or lord, and kin
 * who never wanted them sent may blame their own lord too. `danger` scales the
 * risks (AI skirmishes between other houses are smaller affairs).
 */
export function commanderAfterBattle(s: GameState, clanId: string, won: boolean, enemyClanId: string, danger = 1): BattleFate | undefined {
  const c = commanderOf(s, clanId);
  if (!c) return undefined;
  const k = s.clans[clanId];
  const enemy = s.clans[enemyClanId];
  const foe = commanderOf(s, enemyClanId) ?? (enemy ? leader(s, enemy) : undefined);
  // A lord leading their own fleet already has the battle on their record.
  if (c.id !== leader(s, k)?.id) recordDeed(s, c, won ? 'battlesWon' : 'battlesLost');
  recordDeed(s, c, 'personalBattles');
  const risk = (won ? 1 : 2) * danger;
  if (chance(s, 0.012 * risk)) {
    for (const kin of closeKin(s, c)) {
      if (alive(foe) && kin.id !== foe.id) addFeeling(s, kin.id, foe.id, { why: `Killed ${c.name} in battle`, value: -40, decay: 0.3, key: `fell:${c.id}` });
      const lord = leader(s, k);
      if (alive(lord) && kin.id !== lord.id && !hasTrait(c, 'brave') && !hasTrait(c, 'ambitious'))
        addFeeling(s, kin.id, lord.id, { why: `Sent ${c.name} to die`, value: -15, decay: 0.5, key: `sent:${c.id}` });
    }
    clearFlag(s, KEY + clanId);
    // Your family will want to know how you mean to remember them (eventsCommanders.ts).
    const mourner = closeKin(s, c).find((x) => x.clanId === k.id && x.id !== s.rulerId) ?? closeKin(s, c).find((x) => x.id !== s.rulerId);
    if (k.isPlayer && mourner) setFlag(s, 'fallen_commander', s.year, { id: c.id, kin: mourner.id });
    killCharacter(s, c.id, `killed commanding the fleet of House ${k.name}`);
    return { note: `${c.name} fell commanding the fleet.`, died: true };
  }
  if (!won && enemy && chance(s, 0.08 * danger)) {
    c.prisonerOf = enemy.id;
    if (alive(foe)) addFeeling(s, c.id, foe.id, { why: 'Took me captive in battle', value: -30, decay: 1, key: 'captive' });
    clearFlag(s, KEY + clanId);
    return { note: `${c.name} was captured when the flagship was boarded.`, captured: true };
  }
  if (chance(s, 0.05 * risk)) {
    recordDeed(s, c, 'battleWounds');
    c.traits = addTrait(c.traits, 'wounded');
    if (chance(s, 0.4)) c.traits = addTrait(c.traits, 'scarred');
    if (!won && chance(s, 0.15)) c.traits = addTrait(c.traits, 'maimed');
    return { note: `${c.name} was wounded on the bridge.`, wounded: true };
  }
  if (won && !c.traits.includes('war_hero') && chance(s, 0.12)) {
    c.traits = addTrait(c.traits, 'war_hero');
    return { note: `${c.name} is hailed as a War Hero!`, hero: true };
  }
  return undefined;
}

// ── AI houses ─────────────────────────────────────────────────────────────

/** How much an AI lord wants someone in command: their Command, and whether the lord trusts themself to lead. */
function aiScore(s: GameState, k: Clan, c: Character): number {
  let v = personalCommand(s, c);
  if (c.id === k.headId) {
    if (hasTrait(c, 'brave') || hasTrait(c, 'ambitious') || hasTrait(c, 'wrathful')) v += 1;
    if (hasTrait(c, 'craven')) v -= 5;
  }
  return v;
}

/** Each cycle AI houses without a fit commander appoint their best, and now and then replace a much worse one. */
export function aiCommandersTick(s: GameState): void {
  for (const k of Object.values(s.clans)) {
    if (k.isPlayer || !clanRegions(s, k.id).length) continue;
    const current = commanderOf(s, k.id);
    if (!current && getFlag(s, KEY + k.id)) clearFlag(s, KEY + k.id);
    const pool = eligibleCommanders(s, k.id);
    if (!pool.length) continue;
    const best = pool.reduce((a, b) => (aiScore(s, k, b) > aiScore(s, k, a) ? b : a));
    if (!current) {
      setFlag(s, KEY + k.id, NEVER, { id: best.id, since: s.year });
      enlist(s, best);
    } else if (best.id !== current.id && aiScore(s, k, best) >= aiScore(s, k, current) + 3 && chance(s, 0.2)) appointCommander(s, k.id, best.id);
  }
}

/** How well a house's fleet is led: its commander's factor, or 1 with nobody in command. */
export function leadFactor(s: GameState, clanId: string): number {
  const c = commanderOf(s, clanId);
  return c ? commandFactor(s, c) : 1;
}

/** Start a commander's own record of deeds, so their battles can earn them a name (EPITHETS.md). */
function enlist(s: GameState, c: Character): void {
  c.reputation ??= { deeds: {}, earned: [], since: s.year, houses: [], lastYear: s.year, peaceStreak: 0, marriageStreak: 0 };
}

/** A random fit candidate, for events that need one. */
export function anyCandidate(s: GameState, clanId: string): Character | undefined {
  const pool = eligibleCommanders(s, clanId);
  return pool.length ? pick(s, pool) : undefined;
}
