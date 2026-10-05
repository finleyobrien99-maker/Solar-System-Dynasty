import { isAway, wardshipOf } from './wards';
import { recordAffair, recordMurder } from './secrets';
import { breakFaithfulness, recordDeed } from './epithets';
// Personal relationships (ROADMAP §1.1, numbers from deep dives §C).
//
// How A feels about B runs from −100 to 100: a baseline worked out on the
// spot (shared or clashing personalities, family ties, faith, looks, envy)
// plus remembered feelings that fade at their own pace. Only pairs with
// history are stored, in s.relations[a][b]. Every point comes with a reason,
// so the UI can always say why.

import { ageOf, alive, canAct, ch, childrenOf, ruler, siblingsOf } from './core';
import { clamp } from './rng';
import { TRAITS } from './traits';
import type { Character, Feeling, GameState, Relation, RelationKind } from './types';

export interface OpinionLine {
  label: string;
  value: number;
}

/** What's left of a feeling this year. */
export function feelingNow(f: Feeling, year: number): number {
  if (!f.decay) return f.value;
  const left = Math.max(0, Math.abs(f.value) - f.decay * (year - f.year));
  return Math.sign(f.value) * left;
}

function has(c: Character, id: string): boolean {
  return c.traits.includes(id);
}

function isParent(a: Character, b: Character): boolean {
  return b.fatherId === a.id || b.motherId === a.id;
}

function isSibling(a: Character, b: Character): boolean {
  return a.id !== b.id && ((!!a.fatherId && a.fatherId === b.fatherId) || (!!a.motherId && a.motherId === b.motherId));
}

/** Every reason A feels the way they do about B, largest first. */
export function opinionLines(s: GameState, a: Character, b: Character): OpinionLine[] {
  const lines: OpinionLine[] = [];
  for (const id of a.traits) {
    const t = TRAITS[id];
    if (t?.cat !== 'personality') continue;
    if (has(b, id)) lines.push({ label: `Both ${t.name}`, value: 5 });
    else if (t.opposite && has(b, t.opposite)) lines.push({ label: `${t.name} vs ${TRAITS[t.opposite].name}`, value: -10 });
  }
  if (isParent(a, b)) lines.push({ label: 'My child', value: 20 });
  else if (isParent(b, a)) lines.push({ label: 'My parent', value: 20 });
  else if (isSibling(a, b)) lines.push({ label: 'My sibling', value: 10 });
  if (a.spouseId === b.id) lines.push({ label: 'My spouse', value: 15 });
  const zeal = has(a, 'zealous') ? 2 : 1;
  lines.push(a.faithId === b.faithId ? { label: 'Shares my faith', value: 10 * zeal } : { label: 'A different faith', value: -10 * zeal });
  if (zeal === 2 && a.faithId === 'solar' && (has(b, 'clone') || has(b, 'vatborn'))) lines.push({ label: 'An abomination (clone or vat-born)', value: -20 });
  const looks = b.traits.map((id) => TRAITS[id]).find((t) => t?.group === 'beauty');
  if (looks?.level) lines.push({ label: looks.name, value: looks.level * 3 });
  if (b.traits.length >= 15 && a.id !== b.id) {
    if (has(a, 'ambitious')) lines.push({ label: 'Envies their gifts', value: -10 });
    else if (has(a, 'humble')) lines.push({ label: 'Admires their gifts', value: 10 });
  }
  for (const f of s.relations[a.id]?.[b.id]?.feelings ?? []) {
    const v = Math.round(feelingNow(f, s.year));
    if (v) lines.push({ label: f.why, value: v });
  }
  return lines.sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
}

export function opinionOf(s: GameState, a: Character, b: Character): number {
  return clamp(
    opinionLines(s, a, b).reduce((n, l) => n + l.value, 0),
    -100,
    100,
  );
}

/** The stored relation from A to B, made if asked for. */
export function relationOf(s: GameState, fromId: string, toId: string, create = false): Relation | undefined {
  const row = s.relations[fromId] ?? (create ? (s.relations[fromId] = {}) : undefined);
  if (!row) return undefined;
  return row[toId] ?? (create ? (row[toId] = { since: s.year, feelings: [] }) : undefined);
}

/** A remembers something about B. A feeling with the same key replaces the old one. */
export function addFeeling(s: GameState, fromId: string, toId: string, f: Omit<Feeling, 'year'>): void {
  if (fromId === toId) return;
  const rel = relationOf(s, fromId, toId, true)!;
  if (f.key) rel.feelings = rel.feelings.filter((x) => x.key !== f.key);
  rel.feelings.push({ ...f, year: s.year });
}

export function forget(s: GameState, fromId: string, toId: string, key: string): void {
  const rel = relationOf(s, fromId, toId);
  if (rel) rel.feelings = rel.feelings.filter((x) => x.key !== key);
}

// ── Spending time together ────────────────────────────────────────────────

export type TimeKind = 'dinner' | 'sparring' | 'stargazing';

export const TIME_KINDS: Record<TimeKind, { name: string; loves: string[]; hates: string[] }> = {
  dinner: { name: 'A family dinner', loves: ['gregarious', 'generous'], hates: ['shy'] },
  sparring: { name: 'Sparring in the training hall', loves: ['brave', 'wrathful', 'ambitious'], hates: ['craven', 'lazy'] },
  stargazing: { name: 'Stargazing on the observation deck', loves: ['shy', 'calm', 'content'], hates: ['wrathful'] },
};

/** People the ruler can see each cycle. */
export const TIME_PER_CYCLE = 3;

export function timeLeft(s: GameState): number {
  return TIME_PER_CYCLE - (s.cooldowns[`time@${s.year}`] ?? 0);
}

export function timeBlocker(s: GameState, targetId: string): string | null {
  const t = ch(s, targetId);
  if (!alive(t)) return 'They are dead.';
  if (t.id === s.rulerId) return 'That is you.';
  if (!canAct(s)) return 'A regent rules for now.';
  if (ruler(s).prisonerOf) return 'You cannot visit while imprisoned.';
  const ward = wardshipOf(s, targetId);
  if (ward && ward.hostId !== s.playerClanId) return 'They are being raised at another court.';
  if (t.prisonerOf) return 'They are a prisoner.';
  if (relationOf(s, t.id, s.rulerId)?.together === s.year) return 'You already saw them this cycle.';
  if (timeLeft(s) <= 0) return `You can only see ${TIME_PER_CYCLE} people a cycle.`;
  return null;
}

/** How much a character enjoys this kind of time: +5 baseline, up to +15. */
export function timeValue(c: Character, kind: TimeKind): number {
  const k = TIME_KINDS[kind];
  return clamp(5 + 5 * k.loves.filter((id) => has(c, id)).length - 5 * k.hates.filter((id) => has(c, id)).length, 0, 15);
}

/** The ruler spends time with someone. Fixes neglect; warms them (more if it suits them), fading a point a cycle. */
export function spendTime(s: GameState, targetId: string, kind: TimeKind): boolean {
  if (timeBlocker(s, targetId)) return false;
  const t = s.characters[targetId];
  const r = ruler(s);
  if (kind === 'stargazing') recordDeed(s, r, 'stargazing');
  if (
    t.spouseId === r.id ||
    t.fatherId === r.id ||
    t.motherId === r.id ||
    r.fatherId === t.id ||
    r.motherId === t.id ||
    (r.fatherId && r.fatherId === t.fatherId) ||
    (r.motherId && r.motherId === t.motherId)
  )
    recordDeed(s, r, 'familyVisits');
  forget(s, t.id, r.id, 'neglect');
  const v = timeValue(t, kind);
  if (v) addFeeling(s, t.id, r.id, { why: 'Time together', value: v, decay: 1, key: 'time' });
  relationOf(s, t.id, r.id, true)!.together = s.year;
  // The ruler warms a little too.
  addFeeling(s, r.id, t.id, { why: 'Time together', value: 5, decay: 1, key: 'time' });
  relationOf(s, r.id, t.id)!.together = s.year;
  s.cooldowns[`time@${s.year}`] = (s.cooldowns[`time@${s.year}`] ?? 0) + 1;
  return true;
}

// ── Hooks for other systems ───────────────────────────────────────────────

/** The ruler's spouse learns of a lover. */
export function lovers(s: GameState, r: Character, lover: Character): void {
  recordAffair(s, r, lover, alive(ch(s, r.spouseId)) ? [r.spouseId!] : []);
  breakFaithfulness(r);
  breakFaithfulness(ch(s, r.spouseId));
  breakFaithfulness(lover);
  breakFaithfulness(ch(s, lover.spouseId));
  const spouse = ch(s, r.spouseId);
  if (alive(spouse)) addFeeling(s, spouse.id, r.id, { why: 'Has a lover', value: -40, decay: 2, key: 'lover' });
  relationOf(s, r.id, lover.id, true)!.kind = 'lover';
}

/** Someone who expected to inherit was passed over. */
export function passedOver(s: GameState, who: Character): void {
  addFeeling(s, who.id, s.rulerId, { why: 'Passed over as heir', value: -30, decay: 1, key: 'passed_over' });
}

/** The ruler executed someone: their close family will not forget. */
/** Someone's living parents, spouse, children and siblings. */
export function closeKin(s: GameState, victim: Character): Character[] {
  const kin = new Set<Character>();
  for (const id of [victim.fatherId, victim.motherId, victim.spouseId]) {
    const k = ch(s, id);
    if (alive(k)) kin.add(k);
  }
  for (const k of [...childrenOf(s, victim), ...siblingsOf(s, victim)]) if (alive(k)) kin.add(k);
  return [...kin];
}

/** The victim's close family hold `byId` responsible for a death. */
function grieve(s: GameState, victim: Character, byId: string, why: string, value: number, decay: number): void {
  for (const k of closeKin(s, victim)) if (k.id !== byId) addFeeling(s, k.id, byId, { why, value, decay, grave: true });
}

/** Someone was executed (by the ruler unless `byId` says otherwise): their close family barely ever forgive it. */
export function executed(s: GameState, victim: Character, byId = s.rulerId): void {
  grieve(s, victim, byId, `Executed ${victim.name}`, -75, 0.2);
}

/**
 * Someone was murdered. If the killer is known, the victim's close family
 * hate them for life; if only suspected, they mistrust them for a while.
 */
export function murdered(s: GameState, victim: Character, byId: string, known: boolean): void {
  const killer = ch(s, byId);
  if (killer) recordMurder(s, killer, victim, known);
  if (known) grieve(s, victim, byId, `Murdered ${victim.name}`, -90, 0);
  else
    for (const k of closeKin(s, victim))
      if (k.id !== byId) addFeeling(s, k.id, byId, { why: `Suspected of killing ${victim.name}`, value: -30, decay: 1, key: `suspect:${victim.id}` });
}

/** `victim` survived a murder attempt by `byId` and knows it. */
export function attempted(s: GameState, victim: Character, byId: string): void {
  addFeeling(s, victim.id, byId, { why: 'Tried to have me killed', value: -70, decay: 0.2, grave: true });
}

/** `victim` was blackmailed by `byId`. Nobody forgets being squeezed. */
export function blackmailed(s: GameState, victim: Character, byId: string): void {
  addFeeling(s, victim.id, byId, { why: 'Blackmailed me', value: -50, decay: 0.3, key: `blackmail:${byId}` });
}

/** `byId` seduced `target`; their spouse found out. */
export function cuckolded(s: GameState, target: Character, byId: string): void {
  const spouse = ch(s, target.spouseId);
  if (alive(spouse) && spouse.id !== byId)
    addFeeling(s, spouse.id, byId, { why: `Seduced ${target.name}`, value: -50, decay: 0.5, key: `seduced:${target.id}` });
}

/** What A's personal history with B adds up to: feelings only, not the baseline. */
export function feelingsSum(s: GameState, a: Character, b: Character): number {
  return (s.relations[a.id]?.[b.id]?.feelings ?? []).reduce((n, f) => n + feelingNow(f, s.year), 0);
}

/** The ruler granted someone land. */
export function granted(s: GameState, who: Character): void {
  addFeeling(s, who.id, s.rulerId, { why: 'Granted me land', value: 30, decay: 1 });
}

// ── The yearly tick ───────────────────────────────────────────────────────

/** Cycles since the ruler last spent time with a child (counting from when they took the throne, or the child turned three). */
export function neglectedFor(s: GameState, child: Character): number {
  const reign = s.dynasty.rulers[s.dynasty.rulers.length - 1]?.from ?? s.startYear;
  const last = Math.max(relationOf(s, child.id, s.rulerId)?.together ?? -Infinity, child.born + 3, reign);
  return s.year - last;
}

/**
 * Neglect: a ruler's child who gets no time for 5 cycles feels it (−15), and
 * it deepens by 4 a cycle after that, to −45. It lasts until you spend time
 * with them.
 */
function neglectTick(s: GameState): void {
  const r = ruler(s);
  for (const kid of childrenOf(s, r)) {
    if (!alive(kid) || ageOf(s, kid) > 15 || isAway(s, kid)) continue;
    const n = neglectedFor(s, kid);
    if (n < 5) continue;
    addFeeling(s, kid.id, r.id, { why: 'Neglected me', value: -Math.min(45, 15 + 4 * (n - 5)), decay: 0, key: 'neglect' });
  }
}

const CAP = 3;

/** Fade feelings, drop the forgotten and the long dead, and settle who counts as a friend, rival or nemesis. */
export function relationsTick(s: GameState): void {
  neglectTick(s);
  for (const [a, row] of Object.entries(s.relations)) {
    const ca = s.characters[a];
    if (!ca || (ca.died !== undefined && s.year - ca.died > 10)) {
      delete s.relations[a];
      continue;
    }
    const scored: [string, number, Relation][] = [];
    for (const [b, rel] of Object.entries(row)) {
      const cb = s.characters[b];
      rel.feelings = rel.feelings.filter((f) => feelingNow(f, s.year) !== 0);
      const stale = !rel.feelings.length && rel.kind !== 'lover' && (rel.together ?? -Infinity) < s.year - 10;
      if (!cb || (cb.died !== undefined && s.year - cb.died > 10) || stale) {
        delete row[b];
        continue;
      }
      if (rel.kind !== 'lover' || ca.loverId !== b) rel.kind = undefined;
      if (alive(ca) && alive(cb)) scored.push([b, opinionOf(s, ca, cb), rel]);
    }
    if (!Object.keys(row).length) {
      delete s.relations[a];
      continue;
    }
    const pickKind = (kind: RelationKind, ok: (op: number, rel: Relation) => boolean, best: (x: number, y: number) => number) => {
      for (const [, , rel] of scored
        .filter(([, op, rel]) => !rel.kind && ok(op, rel))
        .sort((x, y) => best(x[1], y[1]))
        .slice(0, CAP))
        rel.kind = kind;
    };
    pickKind(
      'nemesis',
      (op, rel) => op <= -80 && rel.feelings.some((f) => f.grave),
      (x, y) => x - y,
    );
    pickKind(
      'friend',
      (op, rel) => op >= 50 && (rel.together ?? -Infinity) >= s.year - 10,
      (x, y) => y - x,
    );
    pickKind(
      'rival',
      (op, rel) => op <= -40 && rel.feelings.some((f) => feelingNow(f, s.year) < 0),
      (x, y) => x - y,
    );
  }
}

/** Everyone A has history with, plus close family, with how A feels. Strongest feelings first. */
export function relationsOf(s: GameState, a: Character): { other: Character; opinion: number; kind?: RelationKind }[] {
  const ids = new Set(Object.keys(s.relations[a.id] ?? {}));
  for (const id of [a.spouseId, a.fatherId, a.motherId, ...a.childrenIds]) if (id) ids.add(id);
  const out: { other: Character; opinion: number; kind?: RelationKind }[] = [];
  for (const id of ids) {
    const b = s.characters[id];
    if (!alive(b) || b.id === a.id) continue;
    out.push({ other: b, opinion: opinionOf(s, a, b), kind: s.relations[a.id]?.[id]?.kind });
  }
  return out.sort((x, y) => Math.abs(y.opinion) - Math.abs(x.opinion));
}

/** How a married couple feel about each other: the colder of the two. */
export function marriageMood(s: GameState, a: Character, b: Character): number {
  return Math.min(opinionOf(s, a, b), opinionOf(s, b, a));
}
