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
import { chance, clamp } from './rng';
import { addTrait } from './traits';
import type { Character, Clan, GameState } from './types';
import { isAway } from './wards';

const KEY = 'commander:';
/** An appointment has no deadline: the flag's due year 0 is a marker only (WAVE-3-CONTRACT.md). */
const APPOINTED = 0;
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
  setFlag(s, KEY + clanId, APPOINTED, { id, since: s.year });
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

// ── Who leads a given battle ──────────────────────────────────────────────

/**
 * Who leads a house's fleet in a battle: for you, the ruler when you lead in
 * person (`personal`), otherwise your appointed commander; for AI houses,
 * their commander. Pure: reading never changes anything. Snapshot the ID
 * before the battle so consequences land on the person who actually fought.
 */
export function commanderFor(s: GameState, houseId: string, personal = false): Character | undefined {
  const k = s.clans[houseId];
  if (k?.isPlayer && personal) {
    const r = ruler(s);
    return alive(r) && !r.prisonerOf && ageOf(s, r) >= MIN_AGE ? r : undefined;
  }
  return commanderOf(s, houseId);
}

// ── After a battle ────────────────────────────────────────────────────────

/** One battle, as the integrator saw it. Commander IDs are snapshotted before any consequence (or succession) can happen. */
export interface CommandedBattle {
  /** Unique per battle. Call `onCommandedBattle` exactly once for it. */
  id: string;
  attacker: string;
  defender: string;
  attackerCommanderId?: string;
  defenderCommanderId?: string;
  attackerWon: boolean;
  /** Each side's own ships before the battle and the ships it actually lost; heavier losses mean more danger on the bridge. */
  attackerShips?: number;
  attackerLosses?: number;
  defenderShips?: number;
  defenderLosses?: number;
  /** Scales every risk; AI skirmishes between other houses use 0.5. Default 1. */
  danger?: number;
}

export interface BattleFate {
  /** The commander it happened to. */
  who: string;
  /** One line for the battle report. */
  note: string;
  died?: boolean;
  captured?: boolean;
  wounded?: boolean;
  hero?: boolean;
}

/** How dangerous the battle was for one side's commander: by their own fleet's losses if known, otherwise twice as bad in defeat. */
function riskFor(won: boolean, ships?: number, losses?: number): number {
  if (ships && losses !== undefined) return clamp(0.5 + (losses / ships) * 5, 0.5, 2.5);
  return won ? 1 : 2;
}

/**
 * One commander's single consequence roll for a battle: deeds for their name,
 * then death, capture (only in defeat) or wounds, or glory. Family grieve a
 * death, blaming the enemy commander (or lord), and kin who never wanted them
 * sent may blame their own lord. Never call it twice for one person and battle.
 */
function consequences(
  s: GameState,
  c: Character,
  clanId: string,
  won: boolean,
  enemyClanId: string,
  foeId: string | undefined,
  risk: number,
): BattleFate | undefined {
  const k = s.clans[clanId];
  const enemy = s.clans[enemyClanId];
  if (!k) return undefined;
  const foe = ch(s, foeId) ?? (enemy ? leader(s, enemy) : undefined);
  const lord = leader(s, k);
  // A lord leading their own fleet already has the battle on their record.
  if (c.id !== lord?.id) recordDeed(s, c, won ? 'battlesWon' : 'battlesLost');
  recordDeed(s, c, 'personalBattles');
  if (chance(s, 0.012 * risk)) {
    const kin = closeKin(s, c);
    for (const x of kin) {
      if (alive(foe) && x.id !== foe.id) addFeeling(s, x.id, foe.id, { why: `Killed ${c.name} in battle`, value: -40, decay: 0.3, key: `fell:${c.id}` });
      if (alive(lord) && lord.id !== c.id && x.id !== lord.id && !hasTrait(c, 'brave') && !hasTrait(c, 'ambitious'))
        addFeeling(s, x.id, lord.id, { why: `Sent ${c.name} to die`, value: -15, decay: 0.5, key: `sent:${c.id}` });
    }
    if (commanderOf(s, clanId)?.id === c.id) clearFlag(s, KEY + clanId);
    // Your family will want to know how you mean to remember them (eventsCommanders.ts).
    const mourner = kin.find((x) => x.clanId === k.id && x.id !== s.rulerId) ?? kin.find((x) => x.id !== s.rulerId);
    if (k.isPlayer && c.id !== s.rulerId && mourner) setFlag(s, 'fallen_commander', s.year, { id: c.id, kin: mourner.id });
    killCharacter(s, c.id, `killed commanding the fleet of House ${k.name}`);
    return { note: `${fullName(s, c)} fell commanding House ${k.name}'s fleet.`, died: true, who: c.id };
  }
  if (!won && enemy && chance(s, 0.04 * Math.min(risk, 2))) {
    c.prisonerOf = enemy.id;
    if (alive(foe)) addFeeling(s, c.id, foe.id, { why: 'Took me captive in battle', value: -30, decay: 1, key: 'captive' });
    if (commanderOf(s, clanId)?.id === c.id) clearFlag(s, KEY + clanId);
    return { note: `${fullName(s, c)} was captured when House ${k.name}'s flagship was boarded.`, captured: true, who: c.id };
  }
  if (chance(s, 0.05 * risk)) {
    recordDeed(s, c, 'battleWounds');
    c.traits = addTrait(c.traits, 'wounded');
    if (chance(s, 0.4)) c.traits = addTrait(c.traits, 'scarred');
    if (!won && chance(s, 0.15)) c.traits = addTrait(c.traits, 'maimed');
    return { note: `${c.name} was wounded on the bridge.`, wounded: true, who: c.id };
  }
  if (won && !c.traits.includes('war_hero') && chance(s, 0.12)) {
    c.traits = addTrait(c.traits, 'war_hero');
    return { note: `${c.name} is hailed as a War Hero!`, hero: true, who: c.id };
  }
  return undefined;
}

/**
 * The named consequences of one battle for the commanders who actually fought
 * it (as snapshotted), one roll each. Returns a line per notable fate, for the
 * battle report or the news. Fleet numbers are only read, never changed.
 */
export function onCommandedBattle(s: GameState, b: CommandedBattle): string[] {
  return commandedBattleFates(s, b).map((f) => f.note);
}

/** As `onCommandedBattle`, with each fate's details (died, captured, wounded, hero), e.g. to report only deaths as news. */
export function commandedBattleFates(s: GameState, b: CommandedBattle): BattleFate[] {
  const fates: BattleFate[] = [];
  const danger = b.danger ?? 1;
  const sides = [
    {
      house: b.attacker,
      foeHouse: b.defender,
      id: b.attackerCommanderId,
      foeId: b.defenderCommanderId,
      won: b.attackerWon,
      ships: b.attackerShips,
      losses: b.attackerLosses,
    },
    {
      house: b.defender,
      foeHouse: b.attacker,
      id: b.defenderCommanderId,
      foeId: b.attackerCommanderId,
      won: !b.attackerWon,
      ships: b.defenderShips,
      losses: b.defenderLosses,
    },
  ];
  for (const side of sides) {
    const c = ch(s, side.id);
    if (!alive(c)) continue;
    const fate = consequences(s, c, side.house, side.won, side.foeHouse, side.foeId, riskFor(side.won, side.ships, side.losses) * danger);
    if (fate) fates.push(fate);
  }
  return fates;
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

/**
 * Each cycle: clear appointments that no longer stand (dead, captive, grown
 * too old, left the house), then AI houses without a commander appoint their
 * best and now and then replace a much worse one. Your own post stays empty
 * until you fill it.
 */
export function commandersTick(s: GameState): void {
  for (const k of Object.values(s.clans)) {
    const current = commanderOf(s, k.id);
    if (!current && getFlag(s, KEY + k.id)) clearFlag(s, KEY + k.id);
    if (k.isPlayer || !clanRegions(s, k.id).length) continue;
    const pool = eligibleCommanders(s, k.id);
    if (!pool.length) continue;
    const best = pool.reduce((a, b) => (aiScore(s, k, b) > aiScore(s, k, a) ? b : a));
    if (!current) {
      setFlag(s, KEY + k.id, APPOINTED, { id: best.id, since: s.year });
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
