// Realms close ranks (WAVE-5-DIPLOMACY.md slice 1; WAVE-5-CONTRACT.md). Attack
// a house from outside its realm and the realm is called: the sovereign at the
// top of the liege chain must answer unless it truly cannot, and every other
// sworn house weighs duty, loyalty to its liege, ties to either side, faith and
// its lord's nerve. A world that suffers foreign conquest again and again
// unites for a while, and then every house of that world answers, even the
// sovereign's rivals. Fights inside one realm stay local. You and AI houses
// live by identical rules; your own answer as a vassal is a choice
// (eventsRealmDefence.ts), never a roll.
//
// This module decides and explains. It never moves ships: the war lane
// reserves the proposed ships of accepted answers as real detached fleets
// (`realmAid`), keeps them apart from league loans, and saves the answers
// with the war (`realmCalls`). Until then those fields are read through the
// local RealmWar type.
//
// A world's outrage and unity are story flags behind planetOutrageOf and
// unitedUntil, so the v9 migration can move them into typed state without
// touching callers.

import { pactMap, type Pacts } from './aiCourt';
import { ageOf, alive, ch, clanRegions, hasTrait, liegeOf, log, regentHolding, ruler } from './core';
import type { RealmCallAnswer, RealmCallOffer, RealmRole, Reason } from './diplomacyTypes';
import { clearFlag, getFlag, setFlag } from './eventKit';
import { truceOf } from './peace';
import { regencyOf } from './regency';
import { committedShips } from './warAid';
import { PLANET_BY_ID } from './planets';
import { addFeeling, opinionOf } from './relations';
import { chance, clamp } from './rng';
import type { AiWar, CasusBelli, Character, FleetContribution, GameState, Region, War } from './types';

/** Share of a defender's available home fleet sent to the realm's defence (Fin: half, as leagues do). */
export const REALM_SHARE = 0.5;
/** A token squadron: enough to say you came. */
export const TOKEN_SHARE = 0.1;
/** A sworn house's starting sense of duty, before loyalty, ties and temperament. */
export const DUTY = 0.45;
/** Foreign conquests of one world, without enough quiet between them, before it unites. */
export const UNITY_CONQUESTS = 2;
/** How long a united world stands together. */
export const UNITY_YEARS = 10;
/** One remembered conquest fades for every this many cycles without another. */
export const OUTRAGE_FADE = 10;
/** A liege's personal grievance at a deliberate refusal, and at a token squadron. */
export const REFUSAL_GRIEVANCE = -15;
export const TOKEN_GRIEVANCE = -5;

const OUTRAGE = 'outrage:';
const UNITED = 'united:';
const MARKER = 0;
const TERRITORIAL: CasusBelli[] = ['claim', 'holy', 'conquest', 'feud'];

/** A war as the war lane saves it: realm answers and realm loans beside the league's coalition. */
export type RealmWar = (War | AiWar) & { realmCalls?: RealmCallAnswer[]; realmAid?: FleetContribution[] };

// ── Realms and worlds ─────────────────────────────────────────────────────

const headOf = (s: GameState, id: string): Character | undefined => (id === s.playerClanId ? ruler(s) : ch(s, s.clans[id]?.headId));
const homeFleet = (s: GameState, id: string) => (id === s.playerClanId ? s.fleet : (s.clans[id]?.fleet ?? 0));
const house = (s: GameState, id: string) => `House ${s.clans[id]?.name ?? 'unknown'}`;
const planetName = (id: string) => PLANET_BY_ID[id]?.name ?? id;

/** The top of a house's liege chain: the sovereign whose realm it belongs to (itself if it answers to nobody). Safe against a malformed cycle. */
export function realmOf(s: GameState, id: string): string {
  const seen = new Set<string>();
  let current = id;
  while (!seen.has(current)) {
    seen.add(current);
    const parent = liegeOf(s, current);
    if (!parent) return current;
    current = parent;
  }
  return id;
}

/** The landed houses of the defender's realm, its sovereign included, the defender itself excluded. */
export function realmMembers(s: GameState, defender: string): string[] {
  const top = realmOf(s, defender);
  return Object.keys(s.clans).filter((id) => id !== defender && clanRegions(s, id).length > 0 && realmOf(s, id) === top);
}

/** A war the realm answers: territorial, between two real houses, and from outside the defender's realm. */
export function realmCallApplies(s: GameState, attackerId: string, defenderId: string, cb: CasusBelli = 'conquest', regionId?: string): boolean {
  return (
    TERRITORIAL.includes(cb) &&
    s.clans[attackerId]?.planetId !== (s.regions[regionId ?? '']?.planetId ?? s.clans[defenderId]?.planetId) &&
    attackerId !== defenderId &&
    !!s.clans[attackerId] &&
    !!s.clans[defenderId] &&
    clanRegions(s, defenderId).length > 0 &&
    realmOf(s, attackerId) !== realmOf(s, defenderId)
  );
}

/** Remembered foreign conquests of a world, fading one per OUTRAGE_FADE quiet cycles. Pure. */
export function planetOutrageOf(s: GameState, planetId: string): number {
  const f = getFlag(s, OUTRAGE + planetId);
  if (!f) return 0;
  return Math.max(0, Number(f.data.strikes) - Math.floor((s.year - Number(f.data.last)) / OUTRAGE_FADE));
}

/** The year a united world stops standing together, while it is united. Pure. */
export function unitedUntil(s: GameState, planetId: string): number | undefined {
  const f = getFlag(s, UNITED + planetId);
  return f && f.due > s.year ? f.due : undefined;
}

/**
 * A real foreign conquest of a region has just been settled (call it beside
 * recordExpansion, after setOwner). Conquest by a house from another world
 * angers this one; enough of it unites the world.
 */
export function recordPlanetConquest(s: GameState, attackerId: string, region: Region, cb: CasusBelli = 'conquest'): void {
  const attacker = s.clans[attackerId];
  if (!attacker || attacker.planetId === region.planetId || !TERRITORIAL.includes(cb) || region.owner !== attackerId) return;
  const strikes = planetOutrageOf(s, region.planetId) + 1;
  if (strikes < UNITY_CONQUESTS || unitedUntil(s, region.planetId)) {
    setFlag(s, OUTRAGE + region.planetId, MARKER, { strikes, last: s.year });
    return;
  }
  clearFlag(s, OUTRAGE + region.planetId);
  setFlag(s, UNITED + region.planetId, s.year + UNITY_YEARS, { since: s.year, by: attackerId });
  const mine = s.clans[s.playerClanId]?.planetId === region.planetId || attackerId === s.playerClanId;
  log(
    s,
    `${planetName(region.planetId)} has lost land to outsiders once too often. Its houses swear to stand together against the next invader until ${s.year + UNITY_YEARS}.`,
    mine ? 'war' : 'news',
  );
}

// ── Who answers, and why ──────────────────────────────────────────────────

interface Ctx {
  attacker: string;
  defender: string;
  top: string;
  planet: string;
  united: boolean;
  cb: CasusBelli;
  pacts: Pacts;
}

/** Ships already out of a house's home fleet: league loans and realm loans alike (warAid.ts). */
function lent(s: GameState, id: string): number {
  return (
    committedShips(s, id) +
    s.successionCrises.flatMap((c) => (c.stage === 'civil-war' ? c.contributions : [])).reduce((n, p) => n + (p.clanId === id ? p.ships : 0), 0)
  );
}

function atWar(s: GameState, id: string): boolean {
  if (s.successionCrises.some((c) => c.stage === 'civil-war' && c.clanId === id)) return true;
  if (id === s.playerClanId) return s.wars.length > 0 || s.aiWars.some((w) => w.attacker === id || w.defender === id);
  return s.wars.some((w) => w.enemy === id) || s.aiWars.some((w) => w.attacker === id || w.defender === id);
}

function alliedWith(s: GameState, a: string, b: string): boolean {
  if (a === s.playerClanId) return !!s.clans[b]?.allied;
  if (b === s.playerClanId) return !!s.clans[a]?.allied;
  return false;
}

/** Hard inabilities, never rolled and never held against them. Sworn peace or an alliance with the attacker is honoured, not silently broken. */
function blocker(s: GameState, c: Ctx, id: string): string | undefined {
  const head = headOf(s, id);
  if (!alive(head)) return 'Nobody leads the house';
  if (head.prisonerOf) return 'Their ruler is a captive';
  if (ageOf(s, head) < 16 || !!regencyOf(s, id)) return 'A regent will not risk the fleet';
  if (lent(s, id)) return 'Their ships are already lent elsewhere';
  if (atWar(s, id)) return 'Already at war';
  if (truceOf(s, id, c.attacker)) return 'Sworn peace with the attacker';
  if (alliedWith(s, id, c.attacker)) return 'Allied with the attacker';
  if (Math.floor(homeFleet(s, id) * REALM_SHARE) < 1) return 'Too few ships to send';
  return undefined;
}

/** A sworn house's loyalty: its standing with you if you are the liege, otherwise the two rulers' personal opinion. */
function loyalty(s: GameState, id: string, top: string): number {
  if (top === s.playerClanId) return s.clans[id]?.opinion ?? 0;
  const a = headOf(s, id),
    b = headOf(s, top);
  return a && b ? opinionOf(s, a, b) : 0;
}

/** How a house regards the attacker: its standing with you if you attack, otherwise the rulers' personal opinion. */
function towardAttacker(s: GameState, id: string, attacker: string): number {
  if (attacker === s.playerClanId && id !== s.playerClanId) return s.clans[id]?.opinion ?? 0;
  const a = headOf(s, id),
    b = headOf(s, attacker);
  return a && b ? opinionOf(s, a, b) : 0;
}

const TEMPER: [string, number, string][] = [
  ['brave', 0.1, 'Brave'],
  ['wrathful', 0.05, 'Wrathful: spoiling for a fight'],
  ['honest', 0.05, 'Keeps their oaths'],
  ['craven', -0.25, 'Craven: finds an excuse'],
  ['deceitful', -0.1, 'Deceitful: oaths are for others'],
];

function offer(s: GameState, c: Ctx, id: string): RealmCallOffer {
  const role: RealmRole = id === c.top ? 'sovereign' : realmOf(s, id) === c.top ? 'vassal' : 'planet';
  const liegeId = liegeOf(s, id) ?? undefined;
  const block = blocker(s, c, id);
  if (block) return { clanId: id, liegeId, role, chance: 0, reasons: [{ label: block }], blocker: block, proposedShips: 0 };
  const proposedShips = Math.floor(homeFleet(s, id) * REALM_SHARE);
  if (c.united) return { clanId: id, liegeId, role, chance: 1, proposedShips, reasons: [{ label: `${planetName(c.planet)} stands united against outsiders` }] };
  if (role === 'sovereign') {
    const label = c.defender === id ? 'Defends its own realm' : `Sovereign of the realm: bound to defend ${house(s, c.defender)}`;
    return { clanId: id, liegeId, role, chance: 1, proposedShips, reasons: [{ label }] };
  }
  const lord = liegeId ?? c.top;
  const reasons: Reason[] = [{ label: `Sworn to ${house(s, lord)}` }];
  let p = DUTY;
  const loyal = Math.round(loyalty(s, id, lord));
  p += clamp(loyal / 200, -0.3, 0.3);
  if (loyal >= 10) reasons.push({ label: 'Loyal to their liege', value: loyal });
  else if (loyal <= -10) reasons.push({ label: 'Resents their liege', value: loyal });
  const kin = c.pacts.get(id);
  if (kin?.has(c.defender) && c.defender !== c.top) {
    p += 0.2;
    reasons.push({ label: `Kin by marriage to ${house(s, c.defender)}` });
  }
  if (kin?.has(c.attacker)) {
    p -= 0.3;
    reasons.push({ label: `Kin by marriage to ${house(s, c.attacker)}` });
  }
  const foe = Math.round(towardAttacker(s, id, c.attacker));
  if (foe <= -20) {
    p += 0.15;
    reasons.push({ label: `Hates ${house(s, c.attacker)}`, value: foe });
  } else if (foe >= 30) {
    p -= 0.2;
    reasons.push({ label: `Friendly with ${house(s, c.attacker)}`, value: foe });
  }
  const head = headOf(s, id)!;
  for (const [trait, n, label] of TEMPER)
    if (hasTrait(head, trait)) {
      p += n;
      reasons.push({ label });
    }
  const faith = head.faithId;
  if (c.cb === 'holy' && faith === headOf(s, c.attacker)?.faithId) {
    p -= 0.25;
    reasons.push({ label: "Shares the attacker's faith in a holy war" });
  } else if (faith === headOf(s, c.defender)?.faithId) {
    p += 0.05;
    reasons.push({ label: 'Same faith as the defender' });
  }
  return { clanId: id, liegeId, role, chance: clamp(p, 0.05, 0.95), proposedShips, reasons };
}

function context(s: GameState, attacker: string, defender: string, regionId: string, cb: CasusBelli): Ctx | undefined {
  if (!realmCallApplies(s, attacker, defender, cb, regionId)) return undefined;
  const planet = s.regions[regionId]?.planetId ?? s.clans[defender].planetId;
  const foreign = s.clans[attacker].planetId !== planet;
  return { attacker, defender, top: realmOf(s, defender), planet, united: foreign && !!unitedUntil(s, planet), cb, pacts: pactMap(s, true) };
}

/** The defender's realm, and every landed house of the world while it stands united; never the attacker's own realm. */
function called(s: GameState, c: Ctx): string[] {
  const ids = new Set(realmMembers(s, c.defender));
  if (c.united) for (const id of Object.keys(s.clans)) if (s.clans[id].planetId === c.planet && id !== c.defender && clanRegions(s, id).length > 0) ids.add(id);
  const theirs = realmOf(s, c.attacker);
  return [...ids].filter((id) => id !== c.attacker && realmOf(s, id) !== theirs);
}

const ROLE_ORDER: Record<RealmRole, number> = { sovereign: 0, vassal: 1, planet: 2 };

/** Who would come to the defender's aid if this war were declared now, and why. Pure: no dice, no changes. */
export function realmCallPreview(s: GameState, attackerId: string, defenderId: string, regionId: string, cb: CasusBelli = 'conquest'): RealmCallOffer[] {
  const c = context(s, attackerId, defenderId, regionId, cb);
  if (!c) return [];
  return called(s, c)
    .map((id) => offer(s, c, id))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || b.chance - a.chance || b.proposedShips - a.proposedShips || (a.clanId < b.clanId ? -1 : 1));
}

// ── Calling the realm ─────────────────────────────────────────────────────

function grieve(s: GameState, liegeHouse: string | undefined, id: string, value: number, why: string): void {
  const liege = liegeHouse && headOf(s, liegeHouse),
    them = headOf(s, id);
  if (liege && them && liege.id !== them.id) addFeeling(s, liege.id, them.id, { why, value, decay: 0.5, key: 'realm_call' });
}

/** Gratitude and resentment once a house has chosen to fight: personal, between the actual rulers. */
function sides(s: GameState, attackerId: string, defenderId: string, id: string): void {
  const them = headOf(s, id),
    defender = headOf(s, defenderId),
    attacker = headOf(s, attackerId);
  if (!them) return;
  if (defender && defender.id !== them.id) addFeeling(s, defender.id, them.id, { why: 'Came to our defence', value: 10, decay: 0.5, key: 'realm_aid' });
  if (attacker && attacker.id !== them.id) addFeeling(s, them.id, attacker.id, { why: 'Attacked our realm', value: -10, decay: 0.5, key: 'realm_attacked' });
}

/**
 * The realm answers a declared war. Call once, after the declaration has
 * passed every check and been paid for, with the new war's id. Each AI house
 * that can come and is not bound to rolls once with rng.ts; a sovereign or a
 * united world answers without a roll, under the same rule for you and for AI
 * houses. Your answer as a vassal is left pending for you to give. Returns the
 * answers to save with the war; reserve the proposedShips of every accepted
 * answer as real detached ships.
 */
export function realmCall(s: GameState, o: { warId: string; attackerId: string; defenderId: string; regionId: string; cb?: CasusBelli }): RealmCallAnswer[] {
  const cb = o.cb ?? 'conquest';
  const c = context(s, o.attackerId, o.defenderId, o.regionId, cb);
  if (!c || s.gameOver) return [];
  const answers: RealmCallAnswer[] = [];
  for (const off of realmCallPreview(s, o.attackerId, o.defenderId, o.regionId, cb)) {
    const rulerId = headOf(s, off.clanId)?.id;
    const base = { ...off, rulerId, year: s.year };
    if (off.blocker) {
      answers.push({ ...base, answer: 'blocked' });
      continue;
    }
    if (off.clanId === s.playerClanId && off.chance < 1) {
      answers.push({ ...base, answer: 'pending' });
      continue;
    }
    const yes = off.chance >= 1 || chance(s, off.chance);
    answers.push({ ...base, answer: yes ? 'accepted' : 'refused' });
    if (yes) sides(s, o.attackerId, o.defenderId, off.clanId);
    else grieve(s, off.liegeId, off.clanId, REFUSAL_GRIEVANCE, 'Stayed home when the realm called');
  }
  announce(s, c, answers);
  return answers;
}

function announce(s: GameState, c: Ctx, answers: RealmCallAnswer[]): void {
  const came = answers.filter((a) => a.answer === 'accepted');
  const home = answers.filter((a) => a.answer === 'refused');
  if (!came.length && !home.length) return;
  const ships = came.reduce((n, a) => n + a.proposedShips, 0);
  const verb = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const text =
    (came.length
      ? `${came.map((a) => house(s, a.clanId)).join(', ')} ${verb(came.length, 'answers', 'answer')} the call to defend ${house(s, c.defender)} against ${house(s, c.attacker)}, with ${ships} ships.`
      : `Nobody answers the call to defend ${house(s, c.defender)} against ${house(s, c.attacker)}.`) +
    (home.length ? ` ${home.map((a) => house(s, a.clanId)).join(', ')} ${verb(home.length, 'stays', 'stay')} home.` : '');
  const mine = [c.attacker, c.defender].includes(s.playerClanId) || came.some((a) => a.clanId === s.playerClanId);
  log(s, text, mine ? 'war' : 'news');
}

// ── Your own answer ───────────────────────────────────────────────────────

/** An AI war as the war lane saves it. You are only ever called to other houses' wars. */
type RealmAiWar = AiWar & { realmCalls?: RealmCallAnswer[] };

/** The saved war whose realm is waiting on your answer, and the waiting answer. Pure. */
function validCall(s: GameState, war: RealmAiWar): boolean {
  if (s.gameOver || s.regions[war.target]?.owner !== war.defender || !clanRegions(s, war.attacker).length) return false;
  const c = context(s, war.attacker, war.defender, war.target, 'conquest');
  return !!c && called(s, c).includes(s.playerClanId);
}

export function pendingRealmCall(s: GameState, warId?: string): { war: RealmAiWar; answer: RealmCallAnswer } | undefined {
  for (const war of s.aiWars) {
    if (warId !== undefined && war.id !== warId) continue;
    const answer = war.realmCalls?.find((a) => a.clanId === s.playerClanId && a.answer === 'pending');
    if (answer && validCall(s, war)) return { war, answer };
  }
  return undefined;
}

/** Pure revalidation against this specific war, current allegiance, ruler, fleet and oaths. */
export function answerBlocker(s: GameState, warId: string): string | null {
  const p = pendingRealmCall(s, warId);
  if (!p) return 'The call has passed.';
  const c = context(s, p.war.attacker, p.war.defender, p.war.target, 'conquest')!;
  return blocker(s, c, s.playerClanId) ?? null;
}

/**
 * Give your answer to a pending realm call. Accepting revalidates everything
 * and fixes the ships you send (half your available fleet, or a token
 * squadron); the war lane then reserves them. Refusing is always possible and
 * your liege remembers it. Returns the updated answer, or undefined when
 * nothing changed (no such call, or you can no longer send ships).
 */
export function answerRealmCall(s: GameState, warId: string, accept: boolean, share = REALM_SHARE): RealmCallAnswer | undefined {
  const p = pendingRealmCall(s, warId);
  if (!p || !alive(ruler(s)) || ruler(s).prisonerOf || ageOf(s, ruler(s)) < 16 || regentHolding(s)) return undefined;
  if (accept && (!Number.isFinite(share) || share <= 0 || share > REALM_SHARE)) return undefined;
  const { attacker, defender } = p.war;
  if (accept) {
    if (answerBlocker(s, warId)) return undefined;
    Object.assign(p.answer, {
      answer: 'accepted',
      proposedShips: Math.max(1, Math.floor(s.fleet * clamp(share, 0, REALM_SHARE))),
      rulerId: s.rulerId,
      year: s.year,
    });
    sides(s, attacker, defender, s.playerClanId);
    if (share < REALM_SHARE) grieve(s, p.answer.liegeId, s.playerClanId, TOKEN_GRIEVANCE, 'Sent a token squadron when the realm called');
    log(s, `You send ${p.answer.proposedShips} ships to defend ${house(s, defender)} against ${house(s, attacker)}.`, 'war');
  } else {
    Object.assign(p.answer, { answer: 'refused', proposedShips: 0, rulerId: s.rulerId, year: s.year });
    grieve(s, p.answer.liegeId, s.playerClanId, REFUSAL_GRIEVANCE, 'Stayed home when the realm called');
    log(s, `You keep your fleet at home while ${house(s, attacker)} attacks ${house(s, defender)}.`, 'war');
  }
  return p.answer;
}

/** Expire finished unity and faded outrage. */
export function realmDefenceTick(s: GameState): void {
  for (const war of s.aiWars) {
    if (validCall(s, war)) continue;
    for (const a of war.realmCalls ?? [])
      if (a.answer === 'pending') {
        a.answer = 'blocked';
        a.blocker = 'The call has passed.';
        a.reasons = [...a.reasons, { label: a.blocker }];
      }
  }
  if (!s.flags) return;
  for (const key of Object.keys(s.flags)) {
    if (key.startsWith(UNITED) && s.flags[key].due <= s.year) delete s.flags[key];
    else if (key.startsWith(OUTRAGE) && !planetOutrageOf(s, key.slice(OUTRAGE.length))) delete s.flags[key];
  }
}

/** A sovereign's existing peace protects its realm from indirect external attacks too.
 * Indirect declarations cannot silently consume or evade that house's oath. */
export function realmPeaceBlocker(s: GameState, attacker: string, defender: string, regionId: string, cb: CasusBelli = 'conquest'): string | null {
  if (!realmCallApplies(s, attacker, defender, cb, regionId)) return null;
  const seen = new Set<string>([defender]);
  let lord = liegeOf(s, defender);
  while (lord && !seen.has(lord)) {
    seen.add(lord);
    const peace = truceOf(s, attacker, lord);
    if (peace) return `Your sworn peace with ${house(s, lord)} protects this realm until ${peace.until}.`;
    lord = liegeOf(s, lord);
  }
  return null;
}
