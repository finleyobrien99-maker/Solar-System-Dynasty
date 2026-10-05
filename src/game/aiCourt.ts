// AI houses play the dynasty game (ROADMAP 8.1 and 8.2; Fin: "I want AI
// characters to have the same level of freedom I have"). Heads marry their
// children for advantage (power, neighbours, a shared enemy, never a house
// they hate), and a marriage between two heads' blood binds the houses into a
// pact: kin defend each other in war, and only the treacherous turn on them.
// Wars and arrests take captives, and captors execute, ransom or free them
// according to their character; the executed leave grieving kin like any
// other death. Allies who come to hate you walk away. No save change: pacts
// are read off the family trees and captives off `prisonerOf`.

import { recordAffair } from './secrets';
import { aiAmbition } from './aiAmbition';
import { geneticMatchWeight } from './houseGenetics';
import { createCharacter } from './character';
import { ageOf, alive, ch, childrenOf, clanRank, clanRegions, effStats, fullName, hasTrait, log, newId, notice, ruler, vassalsOf } from './core';
import { breakFaithfulness, isCloseKin, recordDeed } from './epithets';
import { birthChance, isCloseFamily, killCharacter, makeChild } from './life';
import { isRival } from './memory';
import { neighbourPlanets } from './planets';
import { addFeeling, closeKin, executed, feelingNow, feelingsSum, opinionOf, relationOf } from './relations';
import { chance, clamp, int, pick, weighted } from './rng';
import type { Character, Clan, GameState } from './types';

function landedAi(s: GameState): Clan[] {
  return Object.values(s.clans).filter((k) => !k.isPlayer && clanRegions(s, k.id).length > 0);
}

function freeAdult(s: GameState, c: Character | undefined, min = 16): c is Character {
  return alive(c) && !c.prisonerOf && ageOf(s, c) >= min;
}

function atWar(s: GameState, a: string, b: string): boolean {
  return s.aiWars.some((w) => (w.attacker === a && w.defender === b) || (w.attacker === b && w.defender === a));
}

// ── Marriage pacts ────────────────────────────────────────────────────────

export type Pacts = Map<string, Set<string>>;

/**
 * Which AI houses are bound to which by blood: a head, their children or their
 * siblings married to the other head or the other head's children or siblings.
 * Ties to a mere member of a house don't count, so pacts only come from real
 * dynastic matches. Read fresh from the family trees, so they lapse when the
 * people who made them die (and sibling ties when the parents who linked
 * them are long forgotten).
 */
export function pactMap(s: GameState): Pacts {
  const bloodOf = new Map<string, string[]>();
  const add = (id: string, clanId: string) => {
    const c = s.characters[id];
    if (alive(c)) (bloodOf.get(id) ?? bloodOf.set(id, []).get(id)!).push(clanId);
  };
  for (const k of landedAi(s)) {
    const h = ch(s, k.headId);
    if (!alive(h)) continue;
    const blood = new Set<string>([h.id, ...h.childrenIds]);
    for (const p of [h.fatherId, h.motherId]) for (const id of ch(s, p)?.childrenIds ?? []) blood.add(id);
    for (const id of blood) add(id, k.id);
  }
  const pacts: Pacts = new Map();
  const bind = (a: string, b: string) => (pacts.get(a) ?? pacts.set(a, new Set()).get(a)!).add(b);
  for (const [id, mine] of bloodOf) {
    const sp = ch(s, s.characters[id].spouseId);
    if (!alive(sp) || sp.spouseId !== id) continue;
    for (const b of bloodOf.get(sp.id) ?? [])
      for (const a of mine)
        if (a !== b) {
          bind(a, b);
          bind(b, a);
        }
  }
  return pacts;
}

export function pactsOf(s: GameState, clanId: string, pacts: Pacts = pactMap(s)): Set<string> {
  return pacts.get(clanId) ?? new Set();
}

/** The houses a head counts as enemies: anyone they're at war with, anyone whose lord they loathe, and you if you're a sworn rival. */
function foesOf(s: GameState, head: Character): Set<string> {
  const out = new Set<string>();
  for (const w of s.aiWars) {
    if (w.attacker === head.clanId) out.add(w.defender);
    if (w.defender === head.clanId) out.add(w.attacker);
  }
  for (const [id, rel] of Object.entries(s.relations[head.id] ?? {})) {
    const t = s.characters[id];
    if (alive(t) && t.clanId !== head.clanId && rel.feelings.reduce((n, f) => n + feelingNow(f, s.year), 0) <= -40) out.add(t.clanId);
  }
  const k = s.clans[head.clanId];
  if (k && isRival(k)) out.add(s.playerClanId);
  return out;
}

/**
 * What a head thinks a match with another house is worth: power (doubly so if
 * they're ambitious), nearness, faith and a shared enemy. Never a house they're
 * at war with or can't stand; a house they're already bound to is worth less.
 */
export function matchValue(
  s: GameState,
  k: Clan,
  head: Character,
  other: Clan,
  pacts: Set<string>,
  foes = foesOf(s, head),
  // The ambitious and the frightened both want powerful in-laws.
  powerHungry = hasTrait(head, 'ambitious') || aiAmbition(s, k).kind === 'security',
): number {
  if (other.id === k.id || other.isPlayer || atWar(s, k.id, other.id)) return 0;
  let v = 6;
  const theirs = ch(s, other.headId);
  if (alive(theirs)) {
    const o = opinionOf(s, head, theirs);
    if (o <= -30) return 0;
    v += o / 4;
    if ([...foesOf(s, theirs)].some((f) => f !== k.id && f !== other.id && foes.has(f))) v += 20;
  }
  if (clanRegions(s, other.id).length) {
    v += (clanRank(s, other.id) * 6 + other.fleet / 12) * (powerHungry ? 1.6 : 1);
    if (other.planetId === k.planetId) v += 12;
    else if (neighbourPlanets(k.planetId).includes(other.planetId)) v += 6;
  }
  if (other.faithId === k.faithId) v += 8;
  if (pacts.has(other.id)) v -= 10;
  return Math.max(0, v);
}

/** A grown, unmatched child of the other head who could wed `c` (never their heir, never close kin). */
function matchFrom(s: GameState, other: Clan, c: Character): Character | undefined {
  const theirs = ch(s, other.headId);
  if (!alive(theirs)) return undefined;
  const kids = childrenOf(s, theirs)
    .filter((x) => alive(x) && x.clanId === other.id)
    .sort((a, b) => a.born - b.born);
  const pool = kids
    .slice(1)
    .filter(
      (x) =>
        x.gender !== c.gender &&
        !x.prisonerOf &&
        !x.marriedIn &&
        !x.betrothedId &&
        !alive(ch(s, x.spouseId)) &&
        ageOf(s, x) >= 18 &&
        ageOf(s, x) <= 50 &&
        Math.abs(ageOf(s, x) - ageOf(s, c)) <= 15 &&
        !isCloseKin(x, c),
    );
  return pool.length
    ? weighted(
        s,
        pool.map((x) => [x, geneticMatchWeight(c, x)] as const),
      )
    : undefined;
}

/** Each cycle, unmarried heads and their grown children are matched, for advantage. */
export function aiMarriages(s: GameState): void {
  const pacts = pactMap(s);
  for (const k of landedAi(s)) {
    const head = ch(s, k.headId);
    if (!alive(head)) continue;
    const candidates = [head, ...childrenOf(s, head).filter((c) => c.clanId === k.id)];
    // A lord with no heir looks hard for a wife, even late in life.
    const ambition = aiAmbition(s, k).kind;
    const needHeir = ambition === 'heir';
    const powerHungry = hasTrait(head, 'ambitious') || ambition === 'security';
    for (const c of candidates) {
      const lord = c.id === k.headId;
      if (!alive(c) || ageOf(s, c) < 18 || ageOf(s, c) > (lord && needHeir ? 65 : 55) || c.marriedIn || c.prisonerOf) continue;
      if (c.betrothedId || alive(ch(s, c.spouseId))) continue;
      if (!chance(s, lord ? (needHeir ? 0.8 : 0.35) : 0.2)) continue;
      const mine = pactsOf(s, k.id, pacts);
      const foes = foesOf(s, head);
      const options = Object.values(s.clans)
        .map((o) => [o, matchValue(s, k, head, o, mine, foes, powerHungry)] as const)
        .filter(([, v]) => v > 0);
      const from = options.length ? weighted(s, options) : k;
      const partner = from.id !== k.id ? matchFrom(s, from, c) : undefined;
      const spouse =
        partner ??
        createCharacter(s, {
          gender: c.gender === 'M' ? 'F' : 'M',
          born: s.year - clamp(ageOf(s, c) + int(s, -6, 4), 18, 50),
          clanId: from.id,
          planetId: from.planetId,
          faithId: k.faithId,
          adultExtras: true,
        });
      spouse.marriedIn = true;
      c.spouseId = spouse.id;
      spouse.spouseId = c.id;
      if (partner) {
        (pacts.get(k.id) ?? pacts.set(k.id, new Set()).get(k.id)!).add(from.id);
        (pacts.get(from.id) ?? pacts.set(from.id, new Set()).get(from.id)!).add(k.id);
        log(s, `${fullName(s, c)} weds ${fullName(s, partner)}. Houses ${k.name} and ${from.name} are bound by blood.`, 'news');
      }
    }
  }
}

/** Ships a house's kin send to its war: a quarter of each ally's fleet in defence, less in attack. Kin of both sides stay home. */
export function kinFleet(s: GameState, clanId: string, foeId: string, pacts: Pacts, share: number): number {
  let n = 0;
  for (const id of pactsOf(s, clanId, pacts)) {
    if (id === foeId || pacts.get(id)?.has(foeId)) continue;
    n += (s.clans[id]?.fleet ?? 0) * share;
  }
  return Math.round(n);
}

/** Would this head make war on a house bound to theirs? Only the deceitful or ambitious, and only against a lord they hate. */
export function wouldBetray(s: GameState, head: Character, theirs: Character | undefined): boolean {
  if (!alive(theirs)) return true;
  return (hasTrait(head, 'deceitful') || hasTrait(head, 'ambitious')) && -opinionOf(s, head, theirs) >= 40;
}

/** A house turns on its kin by marriage. Their lord won't forget it, and the oath-breaking counts toward a bad name. */
export function betrayPact(s: GameState, attacker: Clan, victim: Clan): void {
  const head = ch(s, attacker.headId);
  const theirs = ch(s, victim.headId);
  if (!alive(head)) return;
  recordDeed(s, head, 'oathsBroken');
  if (alive(theirs)) addFeeling(s, theirs.id, head.id, { why: 'Betrayed the bond between our houses', value: -50, decay: 0.5, key: 'pact' });
  log(s, `House ${attacker.name} turns on House ${victim.name}, its own kin by marriage.`, 'news');
}

// ── Captives ──────────────────────────────────────────────────────────────

/** What a captive's freedom costs. Lords and their children come dear. */
export function captiveRansom(s: GameState, c: Character): number {
  const k = s.clans[c.clanId];
  const lord = k?.isPlayer ? ruler(s) : ch(s, k?.headId);
  const close = lord && (lord.id === c.id ? 100 : c.fatherId === lord.id || c.motherId === lord.id || lord.spouseId === c.id ? 50 : 0);
  return 100 + clanRank(s, c.clanId) * 80 + (close || 0);
}

/** Who could be carried off when a house loses: its lord or the lord's grown kin. Never the player's ruler. */
function captivePool(s: GameState, k: Clan): Character[] {
  if (k.isPlayer) return Object.values(s.characters).filter((c) => c.clanId === k.id && c.id !== s.rulerId && freeAdult(s, c) && isCloseFamily(s, c));
  const h = ch(s, k.headId);
  if (!alive(h)) return [];
  return [h, ...childrenOf(s, h)].filter((c) => c.clanId === k.id && freeAdult(s, c));
}

/** The winner of a war may carry off the loser's lord or one of their kin. */
export function takeCaptive(s: GameState, winnerId: string, loserId: string, p: number): Character | undefined {
  if (!chance(s, p)) return undefined;
  const winner = s.clans[winnerId];
  const loser = s.clans[loserId];
  if (!winner || !loser) return undefined;
  const pool = captivePool(s, loser);
  if (!pool.length) return undefined;
  const c = pick(s, pool);
  c.prisonerOf = winnerId;
  addFeeling(s, c.id, winner.isPlayer ? s.rulerId : winner.headId, { why: 'Took me captive', value: -30, decay: 1, key: 'captive' });
  if (!winner.isPlayer && !loser.isPlayer) log(s, `House ${winner.name} carries off ${fullName(s, c)} in chains.`, 'news');
  return c;
}

/** A captive can be beheaded, sold back, set free, or simply left to rot for another cycle. */
export type CaptiveFate = 'keep' | 'execute' | 'ransom' | 'release';

/**
 * How a captor leans with a captive: hatred, cruelty and blood debts toward
 * the axe; greed toward a ransom; kindness, justice and liking toward mercy.
 * Hatred of the captive's lord counts too: the son pays for the father.
 * The player's kin are never sold here: their ransom comes as an event.
 */
export function captiveFates(s: GameState, head: Character, c: Character): [CaptiveFate, number][] {
  const has = (t: string) => hasTrait(head, t);
  const playerKin = c.clanId === s.playerClanId;
  const lord = playerKin ? ruler(s) : ch(s, s.clans[c.clanId]?.headId);
  const grave = (id: string | undefined) => !!id && (s.relations[head.id]?.[id]?.feelings ?? []).some((f) => f.grave);
  const liking = opinionOf(s, head, c);
  const hate = Math.max(-liking, alive(lord) && lord.id !== c.id ? -opinionOf(s, head, lord) * 0.6 : 0, 0);
  // A captive who hates their captor is a threat once freed, and the wary or ambitious know it.
  const threat = feelingsSum(s, c, head) <= -30 && (has('paranoid') || has('ambitious')) ? 2 : 0;
  let execute = Math.max(0, hate - 10) / 8 + (has('cruel') ? 2.5 : 0) + (has('wrathful') ? 1.5 : 0) + (grave(c.id) || grave(lord?.id) ? 4 : 0) + threat;
  if (['kind', 'just', 'honest', 'content'].some(has)) execute *= 0.25;
  const payer = s.clans[c.clanId];
  const ransom = !playerKin && payer && payer.credits >= captiveRansom(s, c) ? 2 + (has('greedy') ? 3 : 0) : 0;
  const release = 0.6 + (has('kind') ? 2 : 0) + (has('just') ? 1.5 : 0) + (has('honest') ? 1 : 0) + (has('generous') ? 1 : 0) + Math.max(0, liking) / 20;
  return [
    ['keep', 2],
    ['execute', execute],
    ['ransom', ransom],
    ['release', release],
  ];
}

/** A captor has a captive put to death. */
export function executeCaptive(s: GameState, captor: Clan, head: Character, c: Character): void {
  c.prisonerOf = undefined;
  recordDeed(s, head, 'executions');
  recordDeed(s, head, 'cruelty');
  if (isCloseKin(head, c)) recordDeed(s, head, 'kinslayings');
  executed(s, c, head.id);
  killCharacter(s, c.id, `executed by House ${captor.name}`);
  if (c.clanId === s.playerClanId) {
    if (!s.feuds.includes(captor.id)) s.feuds.push(captor.id);
    notice(s, 'Executed in Captivity', `House ${captor.name} has put ${fullName(s, c)} to death. You have a Blood Feud against them.`, {
      icon: 'death',
      tone: 'bad',
      portraitId: c.id,
    });
  } else log(s, `${fullName(s, head)} had ${fullName(s, c)} executed.`, 'news');
}

function setFree(s: GameState, c: Character, captor: Clan | undefined, how: string): void {
  c.prisonerOf = undefined;
  if (c.clanId === s.playerClanId) notice(s, 'Home Again', `${fullName(s, c)} ${how}.`, { icon: 'peace', tone: 'good', portraitId: c.id });
  else if (captor && s.clans[c.clanId]?.headId === c.id) log(s, `${fullName(s, c)} ${how}.`, 'news');
}

/** Each cycle, AI captors decide what to do with the people in their cells. */
export function captivesTick(s: GameState): void {
  for (const id in s.characters) {
    const c = s.characters[id];
    if (!c.prisonerOf || c.prisonerOf === s.playerClanId || !alive(c)) continue;
    const captor = s.clans[c.prisonerOf];
    if (!captor || !clanRegions(s, captor.id).length) {
      setFree(s, c, captor, `walks free as House ${captor?.name ?? 'of their captors'} falls`);
      continue;
    }
    if (chance(s, 0.03 + effStats(s, c).int * 0.004)) {
      setFree(s, c, captor, `escapes from House ${captor.name}'s cells`);
      continue;
    }
    const head = ch(s, captor.headId);
    if (!freeAdult(s, head) || !chance(s, 0.35)) continue;
    const fate = weighted(s, captiveFates(s, head, c));
    if (fate === 'execute') executeCaptive(s, captor, head, c);
    else if (fate === 'ransom') {
      const payer = s.clans[c.clanId];
      const amount = captiveRansom(s, c);
      payer.credits -= amount;
      captor.credits += amount;
      const lord = ch(s, payer.headId);
      if (alive(lord) && lord.id !== c.id) addFeeling(s, lord.id, head.id, { why: `Ransomed ${c.name}`, value: -15, decay: 1 });
      setFree(s, c, captor, `is ransomed home for ${amount} credits`);
    } else if (fate === 'release') {
      recordDeed(s, head, 'pardons');
      addFeeling(s, c.id, head.id, { why: 'Set me free', value: 20, decay: 1 });
      if (c.clanId === s.playerClanId) addFeeling(s, s.rulerId, head.id, { why: `Freed ${c.name}`, value: 15, decay: 1 });
      setFree(s, c, captor, `is set free by ${fullName(s, head)}`);
    }
  }
}

// ── Lieges and vassals ────────────────────────────────────────────────────

const HEAVY_HANDED = ['paranoid', 'cruel', 'wrathful', 'ambitious'];

/** A vassal escapes arrest and rises against their liege. */
function rebel(s: GameState, v: Clan, lord: Clan): void {
  const theirs = clanRegions(s, lord.id);
  const target = theirs.find((r) => r.planetId === v.planetId && !r.capital) ?? theirs.find((r) => !r.capital) ?? theirs[0];
  if (!target) return;
  s.aiWars.push({ id: newId(s, 'aw'), attacker: v.id, defender: lord.id, target: target.id, started: s.year, progress: 0 });
  recordDeed(s, v.headId, 'rebellions');
  recordDeed(s, v.headId, 'warsStarted');
  log(s, `House ${v.name} fights off House ${lord.name}'s guards and rises in revolt over ${target.name}.`, 'news');
}

/** AI lieges throw vassals they hate in chains, as you can. A botched arrest starts a revolt. */
export function aiArrests(s: GameState): void {
  for (const lord of landedAi(s)) {
    if (clanRank(s, lord.id) < 2) continue;
    const lh = ch(s, lord.headId);
    if (!freeAdult(s, lh, 18)) continue;
    for (const v of vassalsOf(s, lord.id)) {
      if (v.isPlayer || atWar(s, v.id, lord.id)) continue;
      const vh = ch(s, v.headId);
      if (!freeAdult(s, vh) || -opinionOf(s, lh, vh) < 40) continue;
      if (!chance(s, 0.04 + HEAVY_HANDED.filter((t) => hasTrait(lh, t)).length * 0.05)) continue;
      if (chance(s, clamp(0.5 + (effStats(s, lh).int - effStats(s, vh).int) * 0.04, 0.1, 0.9))) {
        vh.prisonerOf = lord.id;
        addFeeling(s, vh.id, lh.id, { why: 'Threw me in a cell', value: -40, decay: 0.5, key: 'captive' });
        for (const k of closeKin(s, vh))
          if (k.id !== lh.id) addFeeling(s, k.id, lh.id, { why: `Imprisoned ${vh.name}`, value: -25, decay: 1, key: `jailed:${vh.id}` });
        log(s, `${fullName(s, lh)} has thrown ${fullName(s, vh)}, lord of House ${v.name}, in chains.`, 'news');
      } else rebel(s, v, lord);
    }
  }
}

// ── Allies of the player ──────────────────────────────────────────────────

/** An allied house that has come to hate you, or whose lord has, walks away from the alliance. */
export function alliesAbandon(s: GameState): void {
  const r = ruler(s);
  for (const k of Object.values(s.clans)) {
    if (k.isPlayer || !k.allied) continue;
    const theirs = ch(s, k.headId);
    if (k.opinion > -15 && !isRival(k) && !(alive(theirs) && alive(r) && feelingsSum(s, theirs, r) <= -50)) continue;
    k.allied = false;
    notice(s, 'Alliance Broken', `House ${k.name} will no longer stand with you. After everything, nobody at court is surprised.`, {
      icon: 'peace',
      tone: 'bad',
      portraitId: k.headId,
    });
    log(s, `House ${k.name} broke off its alliance with you.`, 'bad');
  }
}

// ── Affairs ───────────────────────────────────────────────────────────────

/**
 * The people at the heart of each landed AI house: its lord, the lord's spouse
 * and their grown children. Anyone married into your dynasty is left to your
 * own events (a seducer, a jealous spouse), not to chance.
 */
function courtiers(s: GameState): Character[] {
  const out: Character[] = [];
  for (const k of landedAi(s)) {
    const h = ch(s, k.headId);
    if (!alive(h)) continue;
    for (const c of [h, ch(s, h.spouseId), ...childrenOf(s, h)])
      if (c && freeAdult(s, c, 18) && ageOf(s, c) <= 60 && c.clanId !== s.playerClanId && ch(s, c.spouseId)?.clanId !== s.playerClanId) out.push(c);
  }
  return out;
}

/** How tempted someone is to stray this cycle: desire and an unhappy marriage push, chastity and honesty hold back. */
export function temptation(s: GameState, c: Character): number {
  let p = 0.003;
  if (hasTrait(c, 'lustful')) p += 0.012;
  const spouse = ch(s, c.spouseId);
  if (alive(spouse) && opinionOf(s, c, spouse) <= -20) p += 0.012;
  if (hasTrait(c, 'chaste')) p *= 0.2;
  if (hasTrait(c, 'honest') || hasTrait(c, 'just')) p *= 0.5;
  return p;
}

function married(s: GameState, c: Character): boolean {
  const sp = ch(s, c.spouseId);
  return alive(sp) && sp.spouseId === c.id;
}

/** Two people take up with each other, in secret for now. */
export function beginAffair(s: GameState, a: Character, b: Character): void {
  a.loverId = b.id;
  b.loverId = a.id;
  recordAffair(s, a, b);
  for (const [x, y] of [
    [a, b],
    [b, a],
  ]) {
    breakFaithfulness(x);
    addFeeling(s, x.id, y.id, { why: 'My lover', value: 30, decay: 1, key: 'lover' });
    relationOf(s, x.id, y.id, true)!.kind = 'lover';
  }
}

function endAffair(a: Character, b: Character | undefined): void {
  if (b?.loverId === a.id) b.loverId = undefined;
  a.loverId = undefined;
}

/** Whether a betrayed spouse already knows about this affair. */
function exposed(s: GameState, a: Character, b: Character): boolean {
  return [a, b].some((x) => married(s, x) && (s.relations[x.spouseId!]?.[x.id]?.feelings ?? []).some((f) => f.key === 'betrayed'));
}

/** The affair comes out: each betrayed spouse turns on their partner and on the lover. Lords make the news. */
export function exposeAffair(s: GameState, a: Character, b: Character): void {
  recordAffair(s, a, b, [], true);
  for (const [x, y] of [
    [a, b],
    [b, a],
  ]) {
    if (!married(s, x)) continue;
    const sp = s.characters[x.spouseId!];
    addFeeling(s, sp.id, x.id, { why: 'Betrayed me', value: -40, decay: 1, key: 'betrayed' });
    if (sp.id !== y.id) addFeeling(s, sp.id, y.id, { why: `Seduced ${x.name}`, value: -50, decay: 0.5, key: `seduced:${x.id}` });
  }
  const lordly = [a, b].some((x) => s.clans[x.clanId]?.headId === x.id || (married(s, x) && s.clans[s.characters[x.spouseId!].clanId]?.headId === x.spouseId));
  if (lordly) log(s, `Scandal: ${fullName(s, a)} and ${fullName(s, b)} have been sharing a bed.`, 'news');
}

/**
 * AI lords, their spouses and their grown children take lovers as you can:
 * the lustful and the unhappily married most of all, from the courts of
 * nearby houses. Affairs come out in time, make enemies of the betrayed, and
 * sometimes produce children the mother's house would rather not explain.
 */
export function aiAffairsTick(s: GameState): void {
  const court = courtiers(s);
  for (const c of court) {
    const lover = ch(s, c.loverId);
    if (lover) {
      if (!alive(lover) || lover.loverId !== c.id) {
        endAffair(c, lover);
        continue;
      }
      if (c.gender === 'M') continue; // tend each affair once, from the woman's side
      const child =
        !c.prisonerOf && !lover.prisonerOf && chance(s, birthChance(s, c, lover, c.clanId) * 0.35) ? makeChild(s, c, lover, c.clanId, true) : undefined;
      // Once it's out, it's out: the betrayed know, and the news has moved on.
      if (exposed(s, c, lover)) {
        if (chance(s, 0.15)) endAffair(c, lover);
      } else if (chance(s, child ? 0.35 : 0.12)) {
        exposeAffair(s, c, lover);
        if (chance(s, 0.5)) endAffair(c, lover);
      } else if (chance(s, 0.08)) endAffair(c, lover);
      continue;
    }
    if (!chance(s, temptation(s, c))) continue;
    const near = new Set([c.planetId, ...neighbourPlanets(c.planetId)]);
    const pool = court.filter(
      (o) => o.gender !== c.gender && !o.loverId && o.clanId !== c.clanId && near.has(o.planetId) && !isCloseKin(o, c) && (married(s, c) || married(s, o)),
    );
    if (!pool.length) continue;
    const other = weighted(
      s,
      pool.map((o) => [o, 1 + (hasTrait(o, 'lustful') ? 2 : 0) + temptation(s, o) * 50 + Math.max(0, opinionOf(s, c, o)) / 20] as const),
    );
    beginAffair(s, c, other);
  }
}
