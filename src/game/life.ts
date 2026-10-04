import { observeReputation } from './epithets';
// Birth, growing up, health, death and succession.

import { createCharacter, eduTrait, inheritLooks, randomPersonality } from './character';
import {
  ageOf,
  alive,
  ch,
  childrenOf,
  clanRegions,
  dynastyMembers,
  fertility,
  fullName,
  effStats,
  hasTrait,
  lifespan,
  log,
  maxHealth,
  newId,
  notice,
  playerClan,
  ruler,
  siblingsOf,
  statTotal,
  vassalsOf,
  isBloodlineClan,
} from './core';
import { inheritGenetics, inheritPersonality } from './genetics';
import { appoint, councilStat, ROLE_KEYS, ROLES } from './council';
import { capOpinion, isRival } from './memory';
import { marriageMood } from './relations';
import { cadetRescue } from './cadets';
import { chance, clamp, int, pick, rand } from './rng';
import { addTrait, TRAITS } from './traits';
import type { Character, GameState, StatKey } from './types';
import { STAT_KEYS } from './types';

// ── Death ─────────────────────────────────────────────────────────────────

export function killCharacter(s: GameState, id: string, cause: string): void {
  const c = s.characters[id];
  if (!c || c.died !== undefined) return;
  if (id === s.rulerId && s.vip?.on && s.vip.immortal) {
    // VIP immortality: death simply doesn't take.
    c.health = Math.max(c.health, maxHealth(s, c));
    c.traits = c.traits.filter((t) => t !== 'ill' && t !== 'wounded');
    return;
  }
  observeReputation(s, c);
  c.died = s.year;
  c.deathCause = cause;
  c.loverId = undefined;
  if (c.betrothedId) {
    const b = s.characters[c.betrothedId];
    if (b) b.betrothedId = undefined;
    c.betrothedId = undefined;
  }
  // Only the ruler keeps lovers.
  const r = s.characters[s.rulerId];
  if (r?.loverId === id) r.loverId = undefined;
  const inCourt = c.clanId === s.playerClanId || ch(s, c.spouseId)?.clanId === s.playerClanId;
  if (id === s.rulerId) {
    log(s, `${c.name} has died (${cause}) aged ${ageOf(s, c)}.`, 'death');
    succeed(s, id);
    return;
  }
  if (inCourt && isCloseFamily(s, c)) log(s, `${fullName(s, c)} has died (${cause}) aged ${ageOf(s, c)}.`, 'death');
  const clan = Object.values(s.clans).find((k) => k.headId === id);
  if (clan && !clan.isPlayer) aiSucceed(s, clan.id);
}

function deathChance(s: GameState, c: Character): number {
  const age = ageOf(s, c);
  const life = lifespan(c);
  let p = 0;
  if (age < 5) p += 0.005;
  if (age > life - 25) p += Math.pow((age - (life - 25)) / 25, 2.2) * 0.18;
  if (c.health < 30) p += (30 - c.health) / 120;
  if (hasTrait(c, 'ill')) p += 0.03;
  return clamp(p, 0, 0.95);
}

export function healthTick(s: GameState): void {
  for (const c of Object.values(s.characters)) {
    if (!alive(c)) continue;
    if (hasTrait(c, 'ill')) {
      if (hasTrait(c, 'nano_immune') || hasTrait(c, 'xenoblood') || chance(s, 0.35 + effStats(s, c).sci * 0.02)) {
        c.traits = c.traits.filter((t) => t !== 'ill');
        if (c.clanId === s.playerClanId) log(s, `${c.name} has recovered from illness.`, 'good');
      } else c.health -= 6;
    }
    if (hasTrait(c, 'wounded') && chance(s, 0.55)) c.traits = c.traits.filter((t) => t !== 'wounded');
    const target = maxHealth(s, c);
    c.health += clamp(target - c.health, -8, 10);
    c.health = clamp(c.health, 0, target + 10);
    if (chance(s, deathChance(s, c))) {
      const cause = hasTrait(c, 'ill') ? 'illness' : c.health < 20 ? 'failing health' : ageOf(s, c) < 5 ? 'a childhood fever' : 'old age';
      killCharacter(s, c.id, cause);
    }
  }
}

// ── Births ────────────────────────────────────────────────────────────────

export function makeChild(s: GameState, mother: Character, father: Character, clanId: string, bastard = false): Character {
  // Locks reach every child of the blood, cadet branches included.
  const dynastic = isBloodlineClan(s, clanId);
  const opts = dynastic ? { locked: s.dynasty.locked, purged: s.dynasty.purged } : (s.clans[clanId]?.genetics ?? {});
  const genetic = inheritGenetics(s, father, mother, opts);
  const personality = inheritPersonality(s, father, mother, opts);
  const parentInClan = father.clanId === clanId ? father : mother;
  const clan = s.clans[clanId];
  const child = createCharacter(s, {
    born: s.year,
    clanId,
    planetId: parentInClan.planetId,
    faithId: clan?.faithId ?? parentInClan.faithId,
    fatherId: father.id,
    motherId: mother.id,
    looks: inheritLooks(s, father.looks, mother.looks, parentInClan.planetId),
    traits: [...genetic, ...personality],
  });
  child.bastard = bastard || undefined;
  // Children echo their parents' talents a little.
  for (const k of STAT_KEYS) {
    child.base[k] = clamp(Math.round((father.base[k] + mother.base[k]) / 2 + int(s, -2, 2)), 0, 10);
  }
  father.childrenIds.push(child.id);
  mother.childrenIds.push(child.id);
  observeReputation(s, mother);
  observeReputation(s, father);
  return child;
}

export function birthChance(s: GameState, mother: Character, father: Character, hostId = father.marriedIn ? mother.clanId : father.clanId): number {
  const age = ageOf(s, mother);
  const playerVats = (s.dynasty.gestationVats || s.vip?.on) && isBloodlineClan(s, hostId);
  const ownVats = s.clans[hostId]?.genetics?.forge.level === 2;
  const maxAge = playerVats || ownVats ? 58 : 45;
  if (age < 16 || age > maxAge) return 0;
  const ageFactor = age <= 32 ? 1 : Math.max(0.15, 1 - (age - 32) / (maxAge - 30));
  return 0.3 * fertility(s, mother) * fertility(s, father) * ageFactor;
}

/** Ruler, spouse, parents, siblings, children and grandchildren. */
export function isCloseFamily(s: GameState, c: Character): boolean {
  const r = ruler(s);
  if (c.id === r.id || c.id === r.spouseId || c.id === r.fatherId || c.id === r.motherId) return true;
  if (c.fatherId === r.id || c.motherId === r.id) return true;
  if ((r.fatherId && c.fatherId === r.fatherId) || (r.motherId && c.motherId === r.motherId)) return true;
  const parent = ch(s, c.fatherId) ?? ch(s, c.motherId);
  return !!parent && (parent.fatherId === r.id || parent.motherId === r.id);
}

function announceBirth(s: GameState, child: Character, mother: Character, father: Character, bastard: boolean): void {
  const r = ruler(s);
  const parentIsRuler = mother.id === r.id || father.id === r.id;
  const gene = child.traits.filter((t) => TRAITS[t]?.cat === 'genetic').map((t) => TRAITS[t].name);
  const geneText = gene.length ? ` Genome: ${gene.join(', ')}.` : '';
  if (parentIsRuler) {
    s.stats.children += 1;
    s.prestige += 5;
    notice(
      s,
      bastard ? 'An Unsanctioned Heir' : `A ${child.gender === 'M' ? 'Son' : 'Daughter'} is Born!`,
      `${bastard ? `Your affair has produced a child. ` : ''}${child.name} has been born to ${mother.id === r.id ? 'you' : mother.name} and ${father.id === r.id ? 'you' : father.name}.${geneText}`,
      { icon: 'birth', tone: 'good', portraitId: child.id },
    );
  }
  log(s, `${child.name} was born to ${mother.name} and ${father.name}.${geneText}`, 'birth');
}

export function birthsTick(s: GameState): void {
  const playerClanId = s.playerClanId;
  const r = ruler(s);
  const capped = s.dynasty.growth === 'capped';
  // Capped mode keeps the court tight; uncapped lets the bloodline sprawl.
  const dynastySize = capped ? dynastyMembers(s).length : 0;
  const clanSize = new Map<string, number>();
  for (const x of Object.values(s.characters)) if (alive(x)) clanSize.set(x.clanId, (clanSize.get(x.clanId) ?? 0) + 1);

  let quietBirths = 0;
  const mothers = Object.values(s.characters).filter((c) => alive(c) && c.gender === 'F' && c.spouseId);
  for (const c of mothers) {
    const husband = s.characters[c.spouseId!];
    if (!alive(husband) || husband.spouseId !== c.id) continue;
    if (c.prisonerOf || husband.prisonerOf) continue;
    // Children belong to the house that hosts the marriage.
    const host = husband.marriedIn ? c : husband;
    const clanId = host.clanId;
    const isPlayerCourt = clanId === playerClanId;
    const rulerCouple = c.id === r.id || husband.id === r.id;
    if (rulerCouple && s.dynasty.familyPlanning) continue;
    const kids = childrenOf(s, c).filter(alive).length;
    let mult = Math.pow(0.72, kids); // big families get rarer naturally
    // Couples who resent each other have fewer children (only couples with history can).
    if ((s.relations[c.id]?.[husband.id] || s.relations[husband.id]?.[c.id]) && marriageMood(s, c, husband) < -40) mult *= 0.5;
    if (isPlayerCourt && !rulerCouple && capped) {
      if (dynastySize >= 60 || kids >= 4) continue;
      mult *= dynastySize >= 30 ? 0.25 : 0.6;
    }
    if (!isPlayerCourt) {
      const aiClan = s.clans[clanId];
      const touchesDynasty = c.clanId === playerClanId || husband.clanId === playerClanId;
      const cap = isBloodlineClan(s, clanId) && !capped ? 30 : 12;
      if (!touchesDynasty && (kids >= 4 || (clanSize.get(clanId) ?? 0) >= cap || !aiClan)) continue;
    }
    if (!chance(s, birthChance(s, c, husband) * mult)) continue;
    const born = [makeChild(s, c, husband, clanId)];
    if (chance(s, 0.03)) born.push(makeChild(s, c, husband, clanId));
    for (const child of born) {
      clanSize.set(clanId, (clanSize.get(clanId) ?? 0) + 1);
      if (c.clanId !== playerClanId && husband.clanId !== playerClanId) continue;
      if (isCloseFamily(s, c) || isCloseFamily(s, husband)) announceBirth(s, child, c, husband, false);
      else quietBirths += 1;
    }
  }
  if (quietBirths) log(s, `${quietBirths} more ${quietBirths === 1 ? 'child was' : 'children were'} born to distant kin of the dynasty.`, 'birth');
  // Affairs.
  const lover = ch(s, r.loverId);
  if (alive(lover) && ageOf(s, r) < 60) {
    const mother = r.gender === 'F' ? r : lover;
    const father = r.gender === 'F' ? lover : r;
    if (chance(s, birthChance(s, mother, father, s.playerClanId) * 0.6)) {
      const child = makeChild(s, mother, father, s.playerClanId, true);
      announceBirth(s, child, mother, father, true);
    }
  }
}

// ── Growing up ────────────────────────────────────────────────────────────

const TUTOR_RATE = { household: 5, academy: 8, ai: 11 };

export function bestFocus(c: Character): StatKey {
  return STAT_KEYS.reduce((best, k) => (c.base[k] > c.base[best] ? k : best), 'dip' as StatKey);
}

export function eduTier(progress: number): number {
  return progress < 45 ? 1 : progress < 75 ? 2 : progress < 100 ? 3 : 4;
}

export function growthTick(s: GameState): void {
  for (const c of Object.values(s.characters)) {
    if (!alive(c)) continue;
    const age = ageOf(s, c);
    const dynastic = c.clanId === s.playerClanId;
    if (age >= 6 && age < 16) {
      if (!c.edu) {
        c.edu = { focus: bestFocus(c), tutor: 'household', progress: 0 };
        if (dynastic && isCloseFamily(s, c)) log(s, `${c.name} has begun lessons. Pick a tutor in the Family tab.`, 'family');
      }
      const intellect = c.traits.map((t) => TRAITS[t]).find((t) => t?.group === 'intellect')?.level ?? 0;
      const sat = s.clans[c.clanId]?.planetId === 'saturn' ? 2 : 0;
      const scientist = dynastic ? councilStat(s, 'scientist') * 0.15 : 0;
      c.edu.progress += TUTOR_RATE[c.edu.tutor] + intellect * 1.5 + sat + scientist + rand(s) * 3;
      if (chance(s, 0.4)) c.base[c.edu.focus] = Math.min(12, c.base[c.edu.focus] + 1);
    }
    if (age === 16) comeOfAge(s, c);
  }
}

export function comeOfAge(s: GameState, c: Character): void {
  const dynastic = c.clanId === s.playerClanId;
  const focus = c.edu?.focus ?? bestFocus(c);
  const ofBlood = isBloodlineClan(s, c.clanId);
  const tier = c.edu ? eduTier(c.edu.progress) : int(s, 1, 3);
  if (!c.traits.some((t) => TRAITS[t]?.cat === 'education')) c.traits = addTrait(c.traits, eduTrait(focus, tier));
  const banned = ofBlood ? s.dynasty.purged : [];
  c.traits = randomPersonality(s, 3, c.traits, focus, banned);
  c.edu = undefined;
  if (dynastic && isCloseFamily(s, c)) {
    const eduName = TRAITS[eduTrait(focus, tier)].name;
    log(s, `${c.name} came of age, trained as a ${eduName}.`, 'family');
  }
  const b = ch(s, c.betrothedId);
  if (alive(b) && ageOf(s, b) >= 16) wed(s, c, b);
}

export function wed(s: GameState, a: Character, b: Character): void {
  a.betrothedId = undefined;
  b.betrothedId = undefined;
  a.spouseId = b.id;
  b.spouseId = a.id;
  if (isCloseFamily(s, a) || isCloseFamily(s, b)) log(s, `${a.name} and ${b.name} are married.`, 'family');
}

/**
 * Kin you haven't matched yourself find their own spouses across the system.
 * Depending on the gender law they either bring the spouse home (children
 * join the dynasty) or marry into the other house (spreading the bloodline).
 */
export function matchmakingTick(s: GameState): void {
  if (!s.dynasty.autoMatch) return;
  const r = ruler(s);
  const heir = currentHeir(s);
  const clans = Object.values(s.clans).filter((c) => !c.isPlayer);
  if (!clans.length) return;
  let home = 0;
  let away = 0;
  for (const c of dynastyMembers(s)) {
    if (c.id === r.id || c.id === heir?.id) continue;
    const age = ageOf(s, c);
    if (age < 19 || age > 40 || c.betrothedId || c.prisonerOf) continue;
    if (alive(ch(s, c.spouseId))) continue;
    if (!chance(s, 0.18)) continue;
    const clan = pick(s, clans);
    const spouse = createCharacter(s, {
      gender: c.gender === 'M' ? 'F' : 'M',
      born: s.year - clamp(age + int(s, -5, 4), 18, 45),
      clanId: clan.id,
      planetId: clan.planetId,
      faithId: clan.faithId,
      adultExtras: true,
    });
    const law = s.dynasty.genderLaw;
    const stays = law === 'equal' ? chance(s, 0.5) : (law === 'male') === (c.gender === 'M');
    spouse.marriedIn = stays;
    c.marriedIn = !stays;
    c.spouseId = spouse.id;
    spouse.spouseId = c.id;
    clan.opinion = capOpinion(clan, Math.min(100, clan.opinion + 4));
    if (isCloseFamily(s, c)) {
      log(
        s,
        stays
          ? `${c.name} married ${fullName(s, spouse)}, who joins your house.`
          : `${c.name} married into House ${clan.name} of ${clan.planetId[0].toUpperCase() + clan.planetId.slice(1)}.`,
        'family',
      );
    } else if (stays) home++;
    else away++;
  }
  if (home || away) log(s, `Distant kin wed this cycle: ${home} brought spouses home, ${away} married into other houses.`, 'family');
}

export function betrothalTick(s: GameState): void {
  for (const c of Object.values(s.characters)) {
    if (!alive(c) || !c.betrothedId) continue;
    const b = s.characters[c.betrothedId];
    if (!alive(b)) {
      c.betrothedId = undefined;
      continue;
    }
    if (ageOf(s, c) >= 16 && ageOf(s, b) >= 16) wed(s, c, b);
  }
}

// ── Succession ────────────────────────────────────────────────────────────

/**
 * Succession candidates in order, as ranked groups: designated heir, children,
 * grandchildren, great-grandchildren, siblings, nephews and nieces, then the
 * whole dynasty. Lazy, so finding the heir rarely has to rank everyone.
 */
function* successionGroups(s: GameState): Generator<Character[]> {
  const r = ruler(s);
  const law = s.dynasty.law;
  const g = s.dynasty.genderLaw;
  const retired = new Set(s.dynasty.rulers.filter((r) => r.to !== undefined).map((r) => r.id));
  const ok = (c: Character) => alive(c) && c.id !== r.id && c.clanId === s.playerClanId && !c.bastard && !retired.has(c.id);
  const order = (list: Character[]): Character[] => {
    const l = list.filter(ok);
    if (law === 'ultimogeniture') l.sort((a, b) => b.born - a.born);
    else if (law === 'merit') {
      const score = new Map(l.map((c) => [c.id, statTotal(s, c) * (ageOf(s, c) >= 16 ? 1 : 0.6)]));
      l.sort((a, b) => score.get(b.id)! - score.get(a.id)!);
    } else l.sort((a, b) => a.born - b.born);
    if (g !== 'equal') {
      const pref = g === 'male' ? 'M' : 'F';
      l.sort((a, b) => Number(b.gender === pref) - Number(a.gender === pref));
    }
    return l;
  };
  if (law === 'designated') {
    const d = ch(s, s.dynasty.designatedHeir);
    if (d && ok(d)) yield [d];
  }
  const kids = order(childrenOf(s, r));
  yield kids;
  for (const k of kids) yield order(childrenOf(s, k));
  for (const k of childrenOf(s, r)) for (const gk of childrenOf(s, k)) yield order(childrenOf(s, gk));
  const sibs = order(siblingsOf(s, r));
  yield sibs;
  for (const sib of sibs) yield order(childrenOf(s, sib));
  yield order(dynastyMembers(s));
}

export function lineOfSuccession(s: GameState): Character[] {
  const out: Character[] = [];
  const seen = new Set<string>();
  for (const group of successionGroups(s)) {
    for (const c of group) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

export function currentHeir(s: GameState): Character | undefined {
  for (const group of successionGroups(s)) if (group.length) return group[0];
  return undefined;
}

export function succeed(s: GameState, deadId: string): void {
  const heir = currentHeir(s) ?? cadetRescue(s);
  const clan = playerClan(s);
  const dead = s.characters[deadId];
  const last = s.dynasty.rulers[s.dynasty.rulers.length - 1];
  if (last && last.id === deadId) last.to = s.year;
  if (!heir) {
    s.gameOver = { reason: `${dead.name} died with no heir. The bloodline of House ${clan.name} has ended.`, year: s.year };
    return;
  }
  s.rulerId = heir.id;
  clan.headId = heir.id;
  heir.prisonerOf = undefined;
  // The new ruler cannot simultaneously serve as their own councillor.
  for (const role of ROLE_KEYS) if (s.council[role] === heir.id) delete s.council[role];
  if (s.dynasty.designatedHeir === heir.id) s.dynasty.designatedHeir = undefined;
  s.suitors = undefined;
  s.prestige = Math.round(s.prestige * 0.9);
  for (const v of vassalsOf(s, clan.id)) v.opinion -= 10;
  s.dynasty.rulers.push({ id: heir.id, name: heir.name, from: s.year, title: '' });
  s.pending.push({ kind: 'succession', uid: newId(s, 's'), deadId, heirId: heir.id });
  log(s, `${heir.name} is now head of House ${clan.name}${ageOf(s, heir) < 16 ? ' under a regency council' : ''}.`, 'info');
}

/** A non-player clan picks a new head when the old one dies. */
export function aiSucceed(s: GameState, clanId: string): void {
  const clan = s.clans[clanId];
  const old = s.characters[clan.headId];
  const kids = old ? childrenOf(s, old).filter((c) => alive(c) && c.clanId === clanId) : [];
  const pool = kids.length ? kids : Object.values(s.characters).filter((c) => alive(c) && c.clanId === clanId && c.id !== clan.headId);
  let heir = pool.sort((a, b) => a.born - b.born)[0];
  if (!heir) {
    heir = createCharacter(s, {
      born: s.year - int(s, 20, 45),
      clanId,
      planetId: clan.planetId,
      faithId: clan.faithId,
      adultExtras: true,
    });
  }
  clan.headId = heir.id;
  clan.opinion = Math.round(clan.opinion * 0.5);
  if (!clanRegions(s, clanId).length) return;
  // Grudges are inherited along with the house.
  if (isRival(clan)) log(s, `${fullName(s, heir)} now leads House ${clan.name}, and has sworn to settle the house's old scores with you.`, 'war');
  else log(s, `${fullName(s, heir)} now leads House ${clan.name}.`, 'news');
}

/** A finished reign with a living ruler means they have retired. */
export function retiredRuler(s: GameState, id: string): boolean {
  return alive(ch(s, id)) && s.dynasty.rulers.some((r) => r.id === id && r.to !== undefined);
}
export function abdicationBlocker(s: GameState): string | null {
  if (s.gameOver || !alive(ruler(s))) return 'Your dynasty has ended.';
  if (s.pending.length) return 'Resolve the current events first.';
  if (ageOf(s, ruler(s)) < 16) return 'A regent cannot abdicate for a child.';
  if (ruler(s).prisonerOf) return 'You cannot abdicate while imprisoned.';
  const heir = currentHeir(s);
  if (!heir) return 'You need a legitimate heir.';
  if (ageOf(s, heir) < 16) return 'Your heir must be at least 16.';
  if (heir.prisonerOf) return 'Your heir must be free to take the throne.';
  return null;
}
/** A voluntary handover uses normal succession and leaves the old ruler alive. */
export function abdicate(s: GameState): boolean {
  if (abdicationBlocker(s)) return false;
  const old = ruler(s),
    heir = currentHeir(s)!;
  const vacated = ROLE_KEYS.find((role) => s.council[role] === heir.id);
  observeReputation(s, old);
  succeed(s, old.id);
  const seat = vacated ?? ROLE_KEYS.filter((role) => !s.council[role]).sort((a, b) => effStats(s, old)[ROLES[b].stat] - effStats(s, old)[ROLES[a].stat])[0];
  if (seat) appoint(s, seat, old.id);
  log(s, `${fullName(s, old)} abdicated in favour of ${fullName(s, heir)}. The old ruler remains with the family.`, 'family');
  return true;
}

export function regencyActive(s: GameState): boolean {
  return ageOf(s, ruler(s)) < 16;
}

export function pickRandomAdultFromClan(s: GameState, clanId: string): Character | undefined {
  const pool = Object.values(s.characters).filter((c) => alive(c) && c.clanId === clanId && ageOf(s, c) >= 16);
  return pool.length ? pick(s, pool) : undefined;
}

export function healthLabel(h: number): string {
  if (h >= 85) return 'Excellent';
  if (h >= 65) return 'Good';
  if (h >= 45) return 'Fair';
  if (h >= 25) return 'Poor';
  return 'Dying';
}
