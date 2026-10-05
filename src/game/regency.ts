// Named regents (ROADMAP 12.3 and 6.6). When a child inherits, a real person
// rules for them: a surviving parent, an elder of the family or, for you, a
// councillor. The regent governs until the ruler turns 16 and is not obliged
// to enjoy giving it back. Greed skims the treasury, temperament shapes how
// the child feels about them, and ambition decides whether they hand over the
// seal at sixteen or cling on for a few more cycles. AI houses live by the
// same rules, and an ambitious AI regent can keep the house for themself.
//
// No save change: the regency is a story flag (`regent:<clanId>`) holding the
// regent, the ward, when it began, what has gone missing from the treasury,
// whether the ward has found out and, once the ward comes of age, the year a
// clinging regent finally lets go. A guardian you name in advance is a flag
// too (`guardian:<clanId>`).

import { finishAmbition } from './ambitions';
import { ADULT_AGE, ageOf, alive, ch, childrenOf, clanRank, clanRegions, effStats, fullName, hasTrait, log, notice, ruler } from './core';
import { ROLE_KEYS } from './council';
import { clearFlag, getFlag, setFlag } from './eventKit';
import { addFeeling, opinionOf, relationOf } from './relations';
import { chance, clamp } from './rng';
import type { Character, Clan, GameState } from './types';
import { isAway } from './wards';

const KEY = 'regent:';
const GUARDIAN = 'guardian:';
/** The urgent "who rules for the child" choice, and the yearly challenge to a regent who will not go (eventsRegency.ts). */
export const CHOICE_FLAG = 'regency_choice';
export const CHALLENGE_FLAG = 'regent_challenge';
/** The regency flag has no deadline: due year 0 is a marker only, like a commander's appointment. */
const MARKER = 0;
export const MIN_AGE = 20;
export const MAX_AGE = 75;
/** The longest a regent can cling on after the ruler comes of age. */
export const MAX_CLING = 3;

export interface Regency {
  regent: Character;
  ward: Character;
  since: number;
  /** Credits the regent has quietly taken from the treasury. */
  skimmed: number;
  /** Whether the ward has found out about the skimming. */
  exposed: boolean;
  /** The year a clinging regent finally hands over; 0 while the ward is still a child. */
  until: number;
}

export interface Grip {
  score: number;
  reasons: string[];
}

// ── Who can be regent ─────────────────────────────────────────────────────

function headOf(s: GameState, k: Clan): Character | undefined {
  return k.isPlayer ? ruler(s) : ch(s, k.headId);
}

function isParent(ward: Character, c: Character): boolean {
  return ward.fatherId === c.id || ward.motherId === c.id;
}

/** Brothers and sisters, full or half, from the parents' own records (no scan of everyone). */
function siblings(s: GameState, c: Character): Character[] {
  const out = new Map<string, Character>();
  for (const p of [ch(s, c.fatherId), ch(s, c.motherId)]) for (const x of p ? childrenOf(s, p) : []) if (x.id !== c.id) out.set(x.id, x);
  return [...out.values()];
}

/** Grown but not ancient, free, at home, of the house (a parent who married in counts), and not ruling a house of their own. */
function fit(s: GameState, k: Clan, ward: Character, c: Character | undefined): c is Character {
  if (!alive(c) || c.prisonerOf || c.id === ward.id || isAway(s, c)) return false;
  const age = ageOf(s, c);
  if (age < MIN_AGE || age > MAX_AGE) return false;
  if (c.clanId !== k.id && !(isParent(ward, c) && c.marriedIn)) return false;
  return !Object.values(s.clans).some((x) => x.id !== k.id && x.headId === c.id);
}

/**
 * Who could rule for `ward` (the house's child ruler, or your minor heir when
 * naming a guardian): the ward's parents, grown siblings, grandparents, uncles
 * and aunts; for you, your councillors too. A living ruler naming a guardian
 * for their heir is never one of them: they will be dead when it matters.
 */
export function regentCandidates(s: GameState, clanId: string, ward: Character): Character[] {
  const k = s.clans[clanId];
  if (!k) return [];
  const out = new Map<string, Character>();
  const add = (c: Character | undefined) => {
    if (fit(s, k, ward, c) && !(k.isPlayer && c.id === s.rulerId)) out.set(c.id, c);
  };
  const parents = [ch(s, ward.fatherId), ch(s, ward.motherId)];
  for (const p of parents) add(p);
  for (const c of siblings(s, ward)) add(c);
  for (const p of parents) {
    if (!p) continue;
    add(ch(s, p.fatherId));
    add(ch(s, p.motherId));
    for (const c of siblings(s, p)) add(c);
  }
  if (k.isPlayer) for (const role of ROLE_KEYS) add(ch(s, s.council[role]));
  return [...out.values()];
}

/** Statecraft, and a parent comes first. Used for AI houses and the council's default choice. */
export function regentScore(s: GameState, ward: Character, c: Character): number {
  const st = effStats(s, c);
  return st.dip + st.eco + st.int + (isParent(ward, c) ? 6 : 0);
}

function best(s: GameState, ward: Character, pool: Character[]): Character | undefined {
  return pool.length ? pool.reduce((a, b) => (regentScore(s, ward, b) > regentScore(s, ward, a) ? b : a)) : undefined;
}

/** How the regent is related to (or serves) the ward, for the screens and stories. */
export function regentTie(s: GameState, ward: Character, c: Character): string {
  const f = c.gender === 'F';
  if (isParent(ward, c)) return f ? 'mother' : 'father';
  if (siblings(s, ward).some((x) => x.id === c.id)) return f ? 'sister' : 'brother';
  const parents = [ch(s, ward.fatherId), ch(s, ward.motherId)];
  if (parents.some((p) => p && (p.fatherId === c.id || p.motherId === c.id))) return f ? 'grandmother' : 'grandfather';
  if (parents.some((p) => p && siblings(s, p).some((x) => x.id === c.id))) return f ? 'aunt' : 'uncle';
  return 'councillor';
}

// ── Reading the regency (never changes anything) ──────────────────────────

/** The saved regency, if its regent can still serve, whatever the ward's age. */
function stored(s: GameState, k: Clan): Regency | undefined {
  const f = getFlag(s, KEY + k.id);
  if (!f) return undefined;
  const ward = headOf(s, k);
  const regent = ch(s, String(f.data.id));
  if (!alive(ward) || ward.id !== f.data.ward || !fit(s, k, ward, regent)) return undefined;
  return {
    regent,
    ward,
    since: Number(f.data.since),
    skimmed: Number(f.data.skimmed ?? 0),
    exposed: !!Number(f.data.exposed ?? 0),
    until: Number(f.data.until ?? 0),
  };
}

/** The house's regency, while a regent governs: the ward is a child, or a grown ward's regent is still clinging on. */
export function regencyOf(s: GameState, clanId: string): Regency | undefined {
  const k = s.clans[clanId];
  const r = k && stored(s, k);
  if (!r) return undefined;
  return ageOf(s, r.ward) < ADULT_AGE || r.until > s.year ? r : undefined;
}

export function regentOf(s: GameState, clanId: string): Character | undefined {
  return regencyOf(s, clanId)?.regent;
}

/** A grown ruler whose regent still holds the seal. */
export function clinging(s: GameState, clanId: string): boolean {
  const r = regencyOf(s, clanId);
  return !!r && ageOf(s, r.ward) >= ADULT_AGE;
}

/** The year the ward comes of age. */
export function majorityYear(ward: Character): number {
  return ward.born + ADULT_AGE;
}

/** How tightly a regent holds on to power, and why: ambition, greed and years at the helm against honesty, contentment and love of the child. */
export function gripOf(s: GameState, regent: Character, ward: Character, since = s.year): Grip {
  const reasons: string[] = [];
  const years = Math.max(0, s.year - since);
  let score = Math.min(5, Math.floor(years / 2));
  if (years >= 2) reasons.push(`${years} years at the helm`);
  const add = (trait: string, n: number, why: string) => {
    if (!hasTrait(regent, trait)) return;
    score += n;
    reasons.push(why);
  };
  add('ambitious', 4, 'Ambitious: likes the seal');
  add('greedy', 2, 'Greedy: likes the treasury');
  add('deceitful', 2, 'Deceitful');
  add('arrogant', 1, 'Arrogant: thinks they do it better');
  add('honest', -3, 'Honest: keeps their word');
  add('content', -3, 'Content with a lesser place');
  add('humble', -3, 'Humble');
  if (isParent(ward, regent)) {
    score -= 3;
    reasons.push('Rules for their own child');
  }
  const fond = opinionOf(s, regent, ward);
  if (fond < -10) {
    score += 2;
    reasons.push('Thinks little of the young ruler');
  } else if (fond > 30) {
    score -= 2;
    reasons.push('Fond of the young ruler');
  }
  return { score, reasons };
}

/** The chance a regent refuses to hand over the seal when the ward turns 16. */
export function clingChance(g: Grip): number {
  return clamp((g.score - 3) * 0.1, 0, 0.7);
}

/** How long a clinging regent holds on: one to three cycles. */
export function clingYears(g: Grip): number {
  return clamp(1 + Math.floor((g.score - 4) / 2), 1, MAX_CLING);
}

/** The chance a clinging AI regent keeps the house outright. Your own regent can only cling (this slice). */
export function usurpChance(g: Grip): number {
  return clamp((g.score - 6) * 0.08, 0, 0.3);
}

/** A share of the treasury that sticks to a greedy or deceitful regent's fingers each cycle. Honest regents take nothing. */
export function skimRate(c: Character): number {
  if (hasTrait(c, 'honest')) return 0;
  return (hasTrait(c, 'greedy') ? 0.05 : 0) + (hasTrait(c, 'deceitful') ? 0.03 : 0);
}

/** Your heir, if they would still be a child: the one a guardian would rule for. */
export function guardianWard(s: GameState): Character | undefined {
  const r = ruler(s);
  const named = ch(s, s.dynasty.designatedHeir);
  const heir =
    named && alive(named)
      ? named
      : childrenOf(s, r)
          .filter((c) => alive(c) && c.clanId === s.playerClanId && !c.bastard)
          .sort((a, b) => a.born - b.born)[0];
  return heir && ageOf(s, heir) < ADULT_AGE ? heir : undefined;
}

export function namedGuardian(s: GameState): Character | undefined {
  return ch(s, String(getFlag(s, GUARDIAN + s.playerClanId)?.data.id ?? ''));
}

export function guardianBlocker(s: GameState, id: string): string | null {
  const heir = guardianWard(s);
  if (!heir) return 'Your heir is grown: no regent would be needed.';
  if (id === s.rulerId) return 'You will not be there to do it.';
  if (!regentCandidates(s, s.playerClanId, heir).some((c) => c.id === id)) return 'Only family of the heir or your councillors, aged 20 to 75 and at home.';
  if (namedGuardian(s)?.id === id) return 'Already named.';
  return null;
}

// ── Changing it (through act() for the player) ────────────────────────────

/** Name who will rule for your heir if you die before they turn 16. */
export function nameGuardian(s: GameState, id: string): boolean {
  if (guardianBlocker(s, id)) return false;
  setFlag(s, GUARDIAN + s.playerClanId, MARKER, { id });
  log(s, `${fullName(s, s.characters[id])} is named guardian of the heir, should the worst happen.`, 'family');
  return true;
}

export function clearGuardian(s: GameState): boolean {
  if (!getFlag(s, GUARDIAN + s.playerClanId)) return false;
  clearFlag(s, GUARDIAN + s.playerClanId);
  return true;
}

function write(s: GameState, k: Clan, ward: Character, id: string): void {
  const f = getFlag(s, KEY + k.id);
  const same = f?.data.ward === ward.id;
  setFlag(s, KEY + k.id, MARKER, {
    id,
    ward: ward.id,
    since: s.year,
    skimmed: same ? Number(f!.data.skimmed ?? 0) : 0,
    exposed: same ? Number(f!.data.exposed ?? 0) : 0,
    until: 0,
  });
}

/** Put someone else in the regent's chair while the ruler is a child. A regent set aside takes it personally. */
export function appointRegent(s: GameState, clanId: string, id: string): boolean {
  const k = s.clans[clanId];
  const ward = k && headOf(s, k);
  if (!k || !alive(ward) || ageOf(s, ward) >= ADULT_AGE || !regentCandidates(s, clanId, ward).some((x) => x.id === id)) return false;
  const old = regencyOf(s, clanId);
  if (old?.regent.id === id) return false;
  if (old) addFeeling(s, old.regent.id, ward.id, { why: 'Took the regency from me', value: -20, decay: 0.5, key: 'regency_lost' });
  write(s, k, ward, id);
  if (k.isPlayer) log(s, `${fullName(s, s.characters[id])} rules as regent for ${ward.name}.`, 'family');
  return true;
}

function update(s: GameState, clanId: string, patch: Record<string, string | number>): void {
  const f = getFlag(s, KEY + clanId);
  if (f) f.data = { ...f.data, ...patch };
}

/** The ward finds out where the money went (the ledger story). */
export function exposeSkimming(s: GameState, clanId = s.playerClanId): void {
  update(s, clanId, { exposed: 1 });
}

/** One more cycle in the chair for a clinging regent, never past MAX_CLING beyond majority. */
export function extendRegency(s: GameState, clanId = s.playerClanId): void {
  const r = regencyOf(s, clanId);
  if (r?.until) update(s, clanId, { until: Math.min(r.until + 1, majorityYear(r.ward) + MAX_CLING + 1) });
}

/** The regent leaves office: on time, paid off, unseated or arrested. */
export function endRegency(s: GameState, clanId: string): void {
  clearFlag(s, KEY + clanId);
  if (clanId === s.playerClanId) clearFlag(s, CHALLENGE_FLAG);
}

/** Replace a regent with the best of the rest (the council turning on a thief). Returns the new regent. */
export function replaceRegent(s: GameState, clanId: string): Character | undefined {
  const reg = regencyOf(s, clanId);
  if (!reg || ageOf(s, reg.ward) >= ADULT_AGE) return undefined;
  const next = best(
    s,
    reg.ward,
    regentCandidates(s, clanId, reg.ward).filter((c) => c.id !== reg.regent.id),
  );
  return next && appointRegent(s, clanId, next.id) ? next : undefined;
}

/** A clinging AI regent keeps the house: the ward is set aside, alive and resentful. */
function usurp(s: GameState, k: Clan, regent: Character, ward: Character): void {
  finishAmbition(s, ward);
  k.headId = regent.id;
  addFeeling(s, ward.id, regent.id, { why: 'Stole my house while I was a child', value: -60, decay: 0.2, grave: true, key: 'deposed' });
  endRegency(s, k.id);
  log(s, `${fullName(s, regent)}, regent of House ${k.name}, has refused to step aside and now rules it outright. ${ward.name} is set aside.`, 'news');
}

// ── Each cycle ────────────────────────────────────────────────────────────

/** What the ward comes to feel about the person running the realm around them. */
function shape(s: GameState, regent: Character, ward: Character): void {
  const warm = ['kind', 'generous', 'honest', 'patient', 'gregarious'].filter((t) => hasTrait(regent, t)).length;
  const cold = ['cruel', 'greedy', 'wrathful', 'arrogant', 'paranoid'].filter((t) => hasTrait(regent, t)).length;
  const delta = clamp((warm - cold) * 2, -4, 4);
  if (!delta) return;
  const prev = relationOf(s, ward.id, regent.id)?.feelings.find((f) => f.key === 'regency')?.value ?? 0;
  const value = clamp(prev + delta, -30, 30);
  addFeeling(s, ward.id, regent.id, {
    why: value > 0 ? 'Looked after me and the realm' : 'Ruled over me like I was furniture',
    value,
    decay: 0.5,
    key: 'regency',
  });
}

function skim(s: GameState, k: Clan, reg: Regency): void {
  const rate = skimRate(reg.regent);
  if (!rate) return;
  const n = Math.min(Math.round(Math.max(0, k.isPlayer ? s.credits : k.credits) * rate), 30 + 15 * clanRank(s, k.id));
  if (n <= 0) return;
  if (k.isPlayer) s.credits -= n;
  else k.credits -= n;
  update(s, k.id, { skimmed: reg.skimmed + n });
}

function missing(reg: Regency): string {
  return reg.skimmed > 0 ? ` Once you can read the books properly, they are ${reg.skimmed} credits light.` : '';
}

function handOver(s: GameState, k: Clan, reg: Regency, onTime: boolean): void {
  endRegency(s, k.id);
  if (onTime && !reg.skimmed) addFeeling(s, reg.ward.id, reg.regent.id, { why: 'Handed back my realm in good order', value: 15, decay: 0.3, key: 'regency' });
  if (reg.skimmed) addFeeling(s, reg.ward.id, reg.regent.id, { why: 'Helped themself to my treasury', value: -15, decay: 0.3, key: 'skimmed' });
  if (!k.isPlayer) return;
  notice(
    s,
    onTime ? 'The Regent Steps Down' : 'At Last',
    onTime
      ? `${fullName(s, reg.regent)} hands ${reg.ward.name} the seal of House ${k.name}, with a short speech and a long list of advice.${missing(reg)}`
      : `${fullName(s, reg.regent)} finally hands over the seal, as if it had been their idea all along.${missing(reg)}`,
    { icon: 'crown', tone: onTime && !reg.skimmed ? 'good' : 'neutral', portraitId: reg.regent.id },
  );
}

/** The ward turns 16: hand over, or hold on (and, in an AI house, perhaps keep it). */
function comeOfAge(s: GameState, k: Clan, reg: Regency): void {
  const g = gripOf(s, reg.regent, reg.ward, reg.since);
  if (!chance(s, clingChance(g))) {
    handOver(s, k, reg, true);
    return;
  }
  if (!k.isPlayer && reg.regent.clanId === k.id && chance(s, usurpChance(g))) {
    usurp(s, k, reg.regent, reg.ward);
    return;
  }
  update(s, k.id, { until: s.year + clingYears(g) });
  addFeeling(s, reg.ward.id, reg.regent.id, { why: 'Would not hand back my seal', value: -20, decay: 0.3, key: 'clung' });
  if (k.isPlayer) {
    setFlag(s, CHALLENGE_FLAG, s.year);
    log(s, `${fullName(s, reg.regent)} declines to hand over the seal, though ${reg.ward.name} is of age.`, 'bad');
  } else log(s, `${fullName(s, reg.regent)} still rules House ${k.name}, though its lord ${reg.ward.name} is of age.`, 'news');
}

/** A new regency, or a new regent for one whose regent can no longer serve. */
function begin(s: GameState, k: Clan, ward: Character, replacing: boolean): void {
  const pool = regentCandidates(s, k.id, ward);
  const named = k.isPlayer ? namedGuardian(s) : undefined;
  const choice = named && pool.some((c) => c.id === named.id) ? named : best(s, ward, pool);
  if (!choice) {
    // Nobody fit to serve: the faceless regency council of old saves carries on.
    if (replacing) endRegency(s, k.id);
    return;
  }
  write(s, k, ward, choice.id);
  if (!k.isPlayer) return;
  if (named) clearGuardian(s);
  const tie = regentTie(s, ward, choice);
  if (replacing) {
    notice(s, 'A New Regent', `${fullName(s, choice)}, ${ward.name}'s ${tie}, takes the regent's chair.`, {
      icon: 'crown',
      tone: 'neutral',
      portraitId: choice.id,
    });
  } else if (named?.id === choice.id) {
    notice(s, 'The Late Ruler’s Wish', `As the late ruler asked, ${fullName(s, choice)}, ${ward.name}'s ${tie}, will rule until ${ward.name} comes of age.`, {
      icon: 'crown',
      tone: 'neutral',
      portraitId: choice.id,
    });
  } else if (pool.length > 1) setFlag(s, CHOICE_FLAG, s.year);
  else log(s, `${fullName(s, choice)}, ${ward.name}'s ${tie}, rules as regent.`, 'family');
}

/**
 * Each cycle, for you and every landed house: a child head gets a regent (your
 * named guardian if you chose one, otherwise the best of the family, which you
 * may then overrule); a regent who can no longer serve is replaced; regents
 * skim and shape the child; at sixteen they hand over or hold on; and a
 * clinging regent leaves when their time is up.
 */
export function regencyTick(s: GameState): void {
  for (const k of Object.values(s.clans)) {
    const ward = headOf(s, k);
    const f = getFlag(s, KEY + k.id);
    if (f && (!alive(ward) || f.data.ward !== ward.id || (!k.isPlayer && !clanRegions(s, k.id).length))) endRegency(s, k.id);
    if (!alive(ward) || (!k.isPlayer && !clanRegions(s, k.id).length)) continue;
    const grown = ageOf(s, ward) >= ADULT_AGE;
    if (!getFlag(s, KEY + k.id)) {
      if (!grown) begin(s, k, ward, false);
      continue;
    }
    const reg = stored(s, k);
    if (!reg) {
      // The regent died, was captured or grew too old.
      if (grown) endRegency(s, k.id);
      else begin(s, k, ward, true);
      continue;
    }
    if (!grown) {
      skim(s, k, reg);
      shape(s, reg.regent, ward);
    } else if (!reg.until) comeOfAge(s, k, reg);
    else if (reg.until <= s.year) handOver(s, k, reg, false);
    else {
      skim(s, k, reg);
      if (k.isPlayer) setFlag(s, CHALLENGE_FLAG, s.year);
    }
  }
}
