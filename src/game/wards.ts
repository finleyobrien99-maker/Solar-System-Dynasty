// Wards and mentors (wave 2, NEXT-WAVES.md; WAVE-2-WARDS.md). Who raises a
// child shapes who they become. A mentor at your own court passes on part of
// their best skill, maybe a temperament, and a bond; a ward raised at another
// house's court comes home with that lord's skill and ways, sometimes their
// faith, and friendships with the family who raised them, which matter when
// those children inherit. AI houses foster their children with kin and
// friends by the same rules, and a ward caught on the wrong side of a war
// becomes a hostage under the captive rules (aiCourt.ts).
//
// No save change: each arrangement is a story flag (`ward:<childId>`,
// `mentor:<childId>`) due when the child turns 16, and its effects are worked
// out when it ends, so nothing needs a yearly hook except the AI's choices.

import { aiAmbition } from './aiAmbition';
import { pactMap, pactsOf, type Pacts } from './aiCourt';
import { ageOf, alive, canAct, ch, childrenOf, clanRank, clanRegions, effStats, fullName, hasTrait, log, notice, ruler } from './core';
import { councillor, ROLE_KEYS } from './council';
import { clearFlag, getFlag, setFlag } from './eventKit';
import { isRival, remember } from './memory';
import { theFaith } from './planets';
import { currentHeir } from './life';
import { addFeeling, opinionOf, relationOf } from './relations';
import { chance, clamp, pick, weighted } from './rng';
import { addTrait, STAT_NAMES, TRAITS } from './traits';
import { STAT_KEYS, type Character, type Clan, type GameState, type StatKey } from './types';
import { atWarWith } from './war';

const WARD = 'ward:';
const MENTOR = 'mentor:';
export const COMING_OF_AGE = 16;
export const WARD_AGES: [number, number] = [6, 14];
export const MENTOR_AGES: [number, number] = [6, 15];
/** How many pupils one mentor can take at a time. */
export const MAX_PUPILS = 2;

export interface Wardship {
  childId: string;
  /** The house raising the child. */
  hostId: string;
  /** The child's own house. */
  homeId: string;
  /** The lord who took the child in. */
  guardianId: string;
  since: number;
  due: number;
}

export interface Mentorship {
  childId: string;
  mentorId: string;
  since: number;
  due: number;
}

/** What someone would pass on to a child they raise. */
export interface Teaching {
  stat: StatKey;
  level: number;
  traits: string[];
  faithId: string;
}

// ── Reading the arrangements ──────────────────────────────────────────────

export function wardshipOf(s: GameState, childId: string): Wardship | undefined {
  const f = getFlag(s, WARD + childId);
  if (!f) return undefined;
  return { childId, hostId: String(f.data.host), homeId: String(f.data.home), guardianId: String(f.data.guardian), since: Number(f.data.since), due: f.due };
}

export function allWardships(s: GameState): Wardship[] {
  return Object.keys(s.flags ?? {})
    .filter((k) => k.startsWith(WARD))
    .map((k) => wardshipOf(s, k.slice(WARD.length))!);
}

export function wardsHostedBy(s: GameState, clanId: string): Wardship[] {
  return allWardships(s).filter((w) => w.hostId === clanId);
}

export function mentorshipOf(s: GameState, childId: string): Mentorship | undefined {
  const f = getFlag(s, MENTOR + childId);
  if (!f) return undefined;
  return { childId, mentorId: String(f.data.mentor), since: Number(f.data.since), due: f.due };
}

export function allMentorships(s: GameState): Mentorship[] {
  return Object.keys(s.flags ?? {})
    .filter((k) => k.startsWith(MENTOR))
    .map((k) => mentorshipOf(s, k.slice(MENTOR.length))!);
}

/** Living as a ward at a court other than their own. */
export function isAway(s: GameState, c: Character): boolean {
  const w = wardshipOf(s, c.id);
  return !!w && w.hostId !== c.clanId;
}

/** The lord raising a ward now: the one who took them in, or whoever leads that house since. */
export function guardianOf(s: GameState, w: Wardship): Character | undefined {
  const g = ch(s, w.guardianId);
  if (alive(g) && !g.prisonerOf) return g;
  const host = s.clans[w.hostId];
  const now = host?.isPlayer ? ruler(s) : ch(s, host?.headId);
  return alive(now) ? now : undefined;
}

export function teachingOf(s: GameState, teacher: Character): Teaching {
  const st = effStats(s, teacher);
  const stat = STAT_KEYS.reduce((a, b) => (st[b] > st[a] ? b : a));
  return { stat, level: st[stat], traits: teacher.traits.filter((t) => TRAITS[t]?.cat === 'personality'), faithId: teacher.faithId };
}

/** "Command 9; may pass on Brave or Cruel". */
export function teachingText(s: GameState, teacher: Character): string {
  const t = teachingOf(s, teacher);
  const traits = t.traits.map((x) => TRAITS[x].name);
  return `${STAT_NAMES[t.stat]} ${t.level}${traits.length ? `; may pass on ${traits.join(' or ')}` : ''}`;
}

// ── How a child is shaped ─────────────────────────────────────────────────

const HARSH = ['cruel', 'wrathful'];

/** Years with a teacher leave a skill, maybe a temperament, and the marks of a harsh hand. */
function shape(s: GameState, child: Character, teacher: Character, years: number, statEvery: number, traitPer: number, traitCap: number): string[] {
  const notes: string[] = [];
  const t = teachingOf(s, teacher);
  const gain = Math.min(2, Math.floor(years / statEvery), Math.max(0, t.level - child.base[t.stat]));
  if (gain > 0) {
    child.base[t.stat] += gain;
    notes.push(`+${gain} ${STAT_NAMES[t.stat]}`);
  }
  if (t.traits.length && chance(s, Math.min(traitCap, years * traitPer))) {
    const trait = pick(s, t.traits);
    if (!child.traits.includes(trait)) {
      child.traits = addTrait(child.traits, trait);
      notes.push(`learned to be ${TRAITS[trait].name.toLowerCase()}`);
    }
  }
  if (HARSH.some((h) => hasTrait(teacher, h)) && years >= 2 && chance(s, 0.35)) {
    const scar = pick(s, ['paranoid', 'craven', 'wrathful']);
    child.traits = addTrait(child.traits, scar);
    addFeeling(s, child.id, teacher.id, { why: 'A harsh hand', value: -20, decay: 0.3, key: 'harsh' });
    notes.push(`a harsh upbringing left them ${TRAITS[scar].name.toLowerCase()}`);
  }
  return notes;
}

function bond(s: GameState, a: Character, b: Character, why: string, value: number, decay: number, key: string): void {
  addFeeling(s, a.id, b.id, { why, value, decay, key });
}

function befriend(s: GameState, a: Character, b: Character): void {
  for (const [x, y] of [
    [a, b],
    [b, a],
  ]) {
    const rel = relationOf(s, x.id, y.id, true)!;
    if (!rel.kind) rel.kind = 'friend';
  }
}

// ── Wards ─────────────────────────────────────────────────────────────────

function startWardship(s: GameState, child: Character, host: Clan, homeId: string, guardianId: string): void {
  setFlag(s, WARD + child.id, child.born + COMING_OF_AGE, { host: host.id, home: homeId, guardian: guardianId, since: s.year });
}

/** Why your child can't go to that house as a ward, if they can't. */
export function fosterBlocker(s: GameState, childId: string, hostId: string): string | null {
  const c = ch(s, childId);
  const host = s.clans[hostId];
  if (!alive(c)) return 'They have died.';
  if (c.clanId !== s.playerClanId) return 'Only children of your house.';
  if (c.prisonerOf) return 'They are a captive.';
  const age = ageOf(s, c);
  if (age < WARD_AGES[0] || age > WARD_AGES[1]) return `Wards leave home between ${WARD_AGES[0]} and ${WARD_AGES[1]}.`;
  if (wardshipOf(s, c.id)) return 'Already a ward.';
  if (!host || host.isPlayer || !clanRegions(s, host.id).length) return 'There is no such court.';
  const head = ch(s, host.headId);
  if (!alive(head) || head.prisonerOf || ageOf(s, head) < 18) return 'That house has no lord to raise them.';
  if (atWarWith(s, host.id)) return 'You are at war with them.';
  if (isRival(host)) return 'Your sworn rival will not raise your child.';
  if (host.opinion <= -30) return `House ${host.name} would not have your child.`;
  if ((s.cooldowns[`foster:${host.id}`] ?? 0) > s.year) return 'They turned you down recently.';
  return null;
}

/**
 * How likely a house is to take your child: their opinion of you, how much a
 * tie with your house is worth to them (the frightened and the heirless value
 * it, the ambitious less), and how the lord feels about you personally.
 */
export function fosterChance(s: GameState, hostId: string): number {
  const host = s.clans[hostId];
  const head = ch(s, host?.headId);
  if (!host || !alive(head)) return 0;
  let p = 0.45 + host.opinion / 100 + (clanRank(s, s.playerClanId) - clanRank(s, host.id)) * 0.08;
  const aim = aiAmbition(s, host).kind;
  if (aim === 'security') p += 0.15;
  if (aim === 'heir') p += 0.05;
  if (aim === 'conquest' || aim === 'revenge') p -= 0.15;
  p += opinionOf(s, head, ruler(s)) / 200;
  return clamp(p, 0.05, 0.95);
}

/** Every court that could take your child, likeliest first. */
export function fosterOptions(s: GameState, childId: string): { clan: Clan; guardian: Character; chance: number }[] {
  return Object.values(s.clans)
    .filter((k) => fosterBlocker(s, childId, k.id) === null)
    .map((clan) => ({ clan, guardian: s.characters[clan.headId], chance: fosterChance(s, clan.id) }))
    .sort((a, b) => b.chance - a.chance);
}

/** Ask a house to raise your child. They may say no. `agreed` skips the asking (they offered). */
export function sendAsWard(s: GameState, childId: string, hostId: string, agreed = false): boolean {
  if (fosterBlocker(s, childId, hostId)) return false;
  const child = s.characters[childId];
  const host = s.clans[hostId];
  if (!agreed && !chance(s, fosterChance(s, hostId))) {
    s.cooldowns[`foster:${hostId}`] = s.year + 3;
    notice(s, 'Politely Declined', `House ${host.name} regrets that it cannot take ${child.name} as a ward.`, {
      icon: 'family',
      tone: 'bad',
      portraitId: host.headId,
    });
    return false;
  }
  if (mentorshipOf(s, childId)) endMentorship(s, childId);
  startWardship(s, child, host, s.playerClanId, host.headId);
  remember(s, host.id, 'Entrusted their child to us', 10, 0.1);
  log(s, `${child.name} leaves to be raised at the court of ${fullName(s, s.characters[host.headId])}.`, 'family');
  return true;
}

/** An AI house's child comes to be raised at your court. */
export function hostWard(s: GameState, childId: string): boolean {
  const child = ch(s, childId);
  const home = child && s.clans[child.clanId];
  if (!alive(child) || !home || home.isPlayer || child.prisonerOf || wardshipOf(s, child.id)) return false;
  startWardship(s, child, s.clans[s.playerClanId], home.id, s.rulerId);
  log(s, `${fullName(s, child)} of House ${home.name} arrives to be raised at your court.`, 'family');
  return true;
}

/**
 * A wardship ends: the child is shaped by the years at that court, bonds with
 * the family who raised them, perhaps takes up their faith, and feels one way
 * or another about being sent. Returns what changed, in a sentence.
 */
export function completeWardship(s: GameState, childId: string, early = false): string {
  const w = wardshipOf(s, childId);
  clearFlag(s, WARD + childId);
  const child = ch(s, childId);
  if (!w || !alive(child)) return '';
  const host = s.clans[w.hostId];
  const home = s.clans[w.homeId];
  const guardian = guardianOf(s, w);
  const years = clamp(s.year - w.since, 0, 10);
  const notes: string[] = [];
  if (guardian && guardian.id !== child.id) {
    notes.push(...shape(s, child, guardian, years, 4, 0.06, 0.5));
    bond(s, child, guardian, 'Raised me', Math.min(30, 10 + years * 3), 0.25, 'fostered');
    bond(s, guardian, child, 'My ward', Math.min(25, 8 + years * 2), 0.5, 'ward');
    // Children raised together become friends for life.
    const siblings = childrenOf(s, guardian).filter((k) => alive(k) && k.id !== child.id && Math.abs(k.born - child.born) <= 5 && k.clanId === guardian.clanId);
    for (const k of siblings) {
      bond(s, child, k, 'Grew up together', 20, 0.3, 'raised_together');
      bond(s, k, child, 'Grew up together', 20, 0.3, 'raised_together');
    }
    const closest = siblings.sort((a, b) => Math.abs(a.born - child.born) - Math.abs(b.born - child.born))[0];
    if (closest && years >= 3) {
      befriend(s, child, closest);
      notes.push(`a friend for life in ${closest.name}`);
    }
  }
  // Raised young and long enough, a child can take up the faith of the house that raised them.
  const ageThen = ageOf(s, child) - years;
  if (host && host.faithId !== child.faithId && ageThen <= 10 && years >= 5 && chance(s, 0.4 + (guardian && hasTrait(guardian, 'zealous') ? 0.2 : 0))) {
    child.faithId = host.faithId;
    notes.push(`took up ${theFaith(host.faithId)}`);
  }
  const parent = home?.isPlayer ? ruler(s) : ch(s, home?.headId);
  if (alive(parent) && parent.id !== child.id) {
    if (hasTrait(child, 'gregarious') || hasTrait(child, 'ambitious')) bond(s, child, parent, 'Sent me out into the world', 10, 0.5, 'sent_away');
    else if (hasTrait(child, 'shy') || years >= 6) bond(s, child, parent, 'Sent me away', -10, 0.5, 'sent_away');
  }
  // The houses are closer for it.
  if (host && home && !host.isPlayer && home.isPlayer) remember(s, host.id, 'Raised your child', 10, 0.1);
  if (host && home && !host.isPlayer && !home.isPlayer) {
    const [hh, hm] = [ch(s, host.headId), ch(s, home.headId)];
    if (alive(hh) && alive(hm)) bond(s, hm, hh, 'Raised my child', 15, 0.5, 'fostered_child');
  }
  if (home && !home.isPlayer && host?.isPlayer) remember(s, home.id, 'Raised our child', 10, 0.1);
  const where = host ? `House ${host.name}` : 'their foster court';
  return `${child.name} comes home from ${where}${early ? ' early' : ''}${notes.length ? `: ${notes.join(', ')}` : ', little changed'}.`;
}

/** Bring your child home before their time. The house that raised them is put out. */
export function recallWard(s: GameState, childId: string): string {
  const w = wardshipOf(s, childId);
  if (!w || w.homeId !== s.playerClanId) return '';
  const host = s.clans[w.hostId];
  if (host && !host.isPlayer) remember(s, host.id, 'Took their child back early', -5, 0.2);
  return completeWardship(s, childId, true);
}

/** War between a ward's two houses: the ward is now a hostage, held by the house that raised them. */
export function detainWard(s: GameState, childId: string): void {
  const w = wardshipOf(s, childId);
  const child = ch(s, childId);
  clearFlag(s, WARD + childId);
  if (!w || !alive(child)) return;
  child.prisonerOf = w.hostId;
  const g = guardianOf(s, w);
  if (g) addFeeling(s, child.id, g.id, { why: 'Made me a hostage', value: -30, decay: 0.5, key: 'captive' });
}

function aiAtWar(s: GameState, a: string, b: string): boolean {
  return s.aiWars.some((w) => (w.attacker === a && w.defender === b) || (w.attacker === b && w.defender === a));
}

/** Whether the houses on either side of a ward are now at war. */
export function wardAtWar(s: GameState, w: Wardship): boolean {
  if (s.clans[w.homeId]?.isPlayer) return !!atWarWith(s, w.hostId);
  if (s.clans[w.hostId]?.isPlayer) return !!atWarWith(s, w.homeId);
  return aiAtWar(s, w.homeId, w.hostId);
}

// ── Mentors ───────────────────────────────────────────────────────────────

/** Adults at your court who could raise a child: you, your spouse, parents, brothers and sisters, grown children and councillors. */
export function mentorCandidates(s: GameState, childId: string): Character[] {
  const r = ruler(s);
  const pool = new Map<string, Character>();
  const add = (c: Character | undefined) => {
    if (alive(c) && !c.prisonerOf && c.id !== childId && ageOf(s, c) >= 20 && !isAway(s, c)) pool.set(c.id, c);
  };
  add(r);
  add(ch(s, r.spouseId));
  for (const p of [ch(s, r.fatherId), ch(s, r.motherId)]) {
    add(p);
    for (const id of p?.childrenIds ?? []) add(s.characters[id]);
  }
  for (const k of childrenOf(s, r)) add(k);
  for (const role of ROLE_KEYS) add(councillor(s, role));
  return [...pool.values()];
}

/** A child you can choose a mentor for: your house's children at home, and wards you are raising. */
export function canBeMentored(s: GameState, c: Character): boolean {
  if (!alive(c) || c.prisonerOf) return false;
  const age = ageOf(s, c);
  if (age < MENTOR_AGES[0] || age > MENTOR_AGES[1]) return false;
  const w = wardshipOf(s, c.id);
  return w ? w.hostId === s.playerClanId : c.clanId === s.playerClanId;
}

export function pupilsOf(s: GameState, mentorId: string): Mentorship[] {
  return allMentorships(s).filter((m) => m.mentorId === mentorId);
}

export function mentorBlocker(s: GameState, childId: string, mentorId: string): string | null {
  const c = ch(s, childId);
  if (!c || !canBeMentored(s, c)) return `Mentors take children of your court aged ${MENTOR_AGES[0]} to ${MENTOR_AGES[1]}.`;
  if (!mentorCandidates(s, childId).some((m) => m.id === mentorId)) return 'They are not at your court.';
  if (mentorshipOf(s, childId)?.mentorId === mentorId) return 'Already their mentor.';
  if (pupilsOf(s, mentorId).length >= MAX_PUPILS) return `A mentor can take ${MAX_PUPILS} pupils at a time.`;
  return null;
}

export function appointMentor(s: GameState, childId: string, mentorId: string): boolean {
  if (mentorBlocker(s, childId, mentorId)) return false;
  if (mentorshipOf(s, childId)) endMentorship(s, childId);
  const child = s.characters[childId];
  setFlag(s, MENTOR + childId, child.born + COMING_OF_AGE, { mentor: mentorId, since: s.year });
  log(s, `${s.characters[mentorId].name} takes ${child.name} under their wing.`, 'family');
  return true;
}

/** A mentorship ends: the pupil is shaped and bonded, and if still at their lessons, those go better too. */
export function endMentorship(s: GameState, childId: string): string {
  const m = mentorshipOf(s, childId);
  clearFlag(s, MENTOR + childId);
  const child = ch(s, childId);
  const mentor = ch(s, m?.mentorId);
  if (!m || !alive(child)) return '';
  if (!mentor) return `${child.name}'s mentor is gone.`;
  const years = clamp(s.year - m.since, 0, 10);
  const notes = alive(mentor) ? shape(s, child, mentor, years, 3, 0.08, 0.6) : [];
  if (years > 0) {
    bond(s, child, mentor, 'My mentor', Math.min(25, 8 + years * 3), 0.3, 'mentor');
    if (alive(mentor)) bond(s, mentor, child, 'My pupil', Math.min(20, 6 + years * 2), 0.5, 'pupil');
    if (years >= 4 && alive(mentor)) befriend(s, child, mentor);
  }
  const t = alive(mentor) ? teachingOf(s, mentor) : undefined;
  if (t && child.edu && child.edu.focus === t.stat) child.edu.progress += 4 * years;
  return `${child.name}'s years with ${mentor.name} are over${notes.length ? `: ${notes.join(', ')}` : ''}.`;
}

// ── AI houses ─────────────────────────────────────────────────────────────

function landedAi(s: GameState): Clan[] {
  return Object.values(s.clans).filter((k) => !k.isPlayer && clanRegions(s, k.id).length > 0);
}

function freeLord(s: GameState, k: Clan): Character | undefined {
  const h = ch(s, k.headId);
  return alive(h) && !h.prisonerOf && ageOf(s, h) >= 18 ? h : undefined;
}

/**
 * Each cycle AI houses finish wardships that are due, turn wards into
 * hostages when their houses go to war, and a few lords send a young child to
 * be raised by marriage kin or friends. The player's own wards are handled by
 * events instead, so you get to answer for them. Ordinary mentorships finish
 * quietly with a line in the chronicle; your heir's, or one cut short by the
 * mentor's death or capture, get an event (eventsWards.ts).
 */
export function aiWardsTick(s: GameState): void {
  const heir = currentHeir(s);
  for (const m of allMentorships(s)) {
    const child = ch(s, m.childId);
    if (!alive(child)) {
      clearFlag(s, MENTOR + m.childId);
      continue;
    }
    if (m.due <= s.year && (child.id !== heir?.id || !canAct(s))) {
      const mentor = ch(s, m.mentorId);
      if (alive(mentor) && !mentor.prisonerOf) log(s, endMentorship(s, child.id), 'family');
    }
  }
  for (const w of allWardships(s)) {
    const child = ch(s, w.childId);
    const home = s.clans[w.homeId];
    const host = s.clans[w.hostId];
    if (!alive(child) || !home || !host) {
      clearFlag(s, WARD + w.childId);
      continue;
    }
    if (home.isPlayer || host.isPlayer) {
      // Under a regency nobody is there to answer the events, so the arrangements run their course.
      if (!canAct(s) && wardAtWar(s, w)) detainWard(s, w.childId);
      else if (!canAct(s) && w.due <= s.year) completeWardship(s, w.childId);
      continue;
    }
    if (wardAtWar(s, w)) {
      detainWard(s, w.childId);
      log(s, `House ${host.name} now holds its ward, ${fullName(s, child)}, as a hostage.`, 'news');
    } else if (w.due <= s.year || !clanRegions(s, host.id).length) completeWardship(s, w.childId);
  }
  let pacts: Pacts | undefined;
  for (const k of landedAi(s)) {
    const head = freeLord(s, k);
    if (!head || !chance(s, 0.03)) continue;
    const young = childrenOf(s, head).filter(
      (c) => alive(c) && c.clanId === k.id && !c.prisonerOf && !wardshipOf(s, c.id) && ageOf(s, c) >= WARD_AGES[0] && ageOf(s, c) <= 10,
    );
    if (!young.length) continue;
    const kin = pactsOf(s, k.id, (pacts ??= pactMap(s)));
    const hosts = landedAi(s)
      .filter((o) => o.id !== k.id && !aiAtWar(s, o.id, k.id))
      .map((o) => {
        const lord = freeLord(s, o);
        if (!lord || opinionOf(s, lord, head) < -10) return [o, 0] as const;
        return [o, (kin.has(o.id) ? 3 : 0) + Math.max(0, opinionOf(s, head, lord)) / 10] as const;
      })
      .filter(([, v]) => v > 0);
    if (!hosts.length) continue;
    const host = weighted(s, hosts);
    const child = pick(s, young);
    startWardship(s, child, host, k.id, host.headId);
    const heir = childrenOf(s, head)
      .filter((c) => alive(c) && c.clanId === k.id)
      .sort((a, b) => a.born - b.born)[0];
    if (heir?.id === child.id) log(s, `House ${k.name} sends its heir, ${child.name}, to be raised at the court of House ${host.name}.`, 'news');
  }
}
