import { primaryEpithet } from './epithetDefs';
// Shared helpers: lookups, derived stats, ranks, titles, logging.

import { PLANET_BY_ID } from './planets';
import { clamp } from './rng';
import { TRAITS, type TraitDef } from './traits';
import { STAT_KEYS, type Character, type Clan, type GameState, type ItemEffects, type LogKind, type Pending, type Region, type StatKey } from './types';

export const SAVE_VERSION = 8;
export const ADULT_AGE = 16;

export function newId(s: GameState, prefix: string): string {
  s.nextId += 1;
  return `${prefix}${s.nextId}`;
}

export function log(s: GameState, t: string, k: LogKind = 'info'): void {
  s.log.push({ y: s.year, t, k });
  if (s.log.length > 500) s.log.splice(0, s.log.length - 500);
}

export function notice(s: GameState, title: string, text: string, opts: { icon?: string; tone?: 'good' | 'bad' | 'neutral'; portraitId?: string } = {}): void {
  s.pending.push({ kind: 'notice', uid: newId(s, 'n'), title, text, ...opts });
}

export function pushPending(s: GameState, p: Pending): void {
  s.pending.push(p);
}

// ── Lookups ───────────────────────────────────────────────────────────────

export function ch(s: GameState, id: string | undefined): Character | undefined {
  return id ? s.characters[id] : undefined;
}

export function ruler(s: GameState): Character {
  return s.characters[s.rulerId];
}

export function playerClan(s: GameState): Clan {
  return s.clans[s.playerClanId];
}

export function alive(c: Character | undefined): c is Character & { died: undefined } {
  return !!c && c.died === undefined;
}

export function ageOf(s: GameState, c: Character): number {
  return (c.died ?? s.year) - c.born;
}

export function isAdult(s: GameState, c: Character): boolean {
  return ageOf(s, c) >= ADULT_AGE;
}

export function fullName(s: GameState, c: Character): string {
  const clan = s.clans[c.clanId];
  const name = clan ? `${c.name} ${clan.name}` : c.name;
  const epithet = primaryEpithet(c.reputation);
  return epithet ? `${name} ${epithet.name}` : name;
}

export function hasTrait(c: Character, id: string): boolean {
  return c.traits.includes(id);
}

export function traitDefs(c: Character): TraitDef[] {
  return c.traits.map((t) => TRAITS[t]).filter((t): t is TraitDef => !!t);
}

type NumericTraitKey = 'health' | 'fertility' | 'life' | 'fleetPct' | 'prestigeYr' | 'faithYr' | 'creditsPct' | 'scheme' | 'defense';

export function traitSum(c: Character, key: NumericTraitKey): number {
  let total = 0;
  for (const id of c.traits) total += TRAITS[id]?.[key] ?? 0;
  // A bionic arm cancels out the Maimed penalty.
  if (key === 'health' && c.traits.includes('maimed') && c.traits.includes('bionic_arm')) total += 10;
  return total;
}

export function equippedItems(s: GameState) {
  const ids = new Set(Object.values(s.equipped).filter(Boolean));
  return s.items.filter((i) => ids.has(i.id));
}

export function itemSum(s: GameState, key: Exclude<keyof ItemEffects, 'stats'>): number {
  return equippedItems(s).reduce((a, i) => a + (i.fx[key] ?? 0), 0);
}

export function isRuler(s: GameState, c: Character): boolean {
  return c.id === s.rulerId;
}

export function homePlanet(s: GameState): string {
  return playerClan(s).planetId;
}

// ── Stats ─────────────────────────────────────────────────────────────────

export function effStats(s: GameState, c: Character): Record<StatKey, number> {
  const out = { ...c.base };
  for (const id of c.traits) {
    const t = TRAITS[id];
    if (!t) continue;
    for (const k of STAT_KEYS) {
      out[k] += (t.all ?? 0) + (t.stats?.[k] ?? 0);
    }
  }
  if (c.traits.includes('maimed') && c.traits.includes('bionic_arm')) out.cmd += 3;
  if (isRuler(s, c)) {
    for (const item of equippedItems(s)) {
      for (const k of STAT_KEYS) out[k] += item.fx.stats?.[k] ?? 0;
    }
    const home = homePlanet(s);
    if (home === 'venus') out.int += 2;
    if (home === 'earth') out.dip += 2;
    if (home === 'saturn') out.sci += 2;
  }
  const age = ageOf(s, c);
  if (age < ADULT_AGE) {
    const f = Math.max(0.15, age / ADULT_AGE);
    for (const k of STAT_KEYS) out[k] = out[k] * f;
  } else if (age > 65) {
    for (const k of STAT_KEYS) if (k !== 'sci' && k !== 'dip') out[k] -= Math.floor((age - 65) / 6);
  }
  for (const k of STAT_KEYS) out[k] = Math.max(0, Math.round(out[k]));
  return out;
}

export function statTotal(s: GameState, c: Character): number {
  const st = effStats(s, c);
  return STAT_KEYS.reduce((a, k) => a + st[k], 0);
}

export function lifespan(c: Character): number {
  return 68 + traitSum(c, 'life');
}

export function maxHealth(s: GameState, c: Character): number {
  const age = ageOf(s, c);
  let h = 100 + traitSum(c, 'health');
  if (isRuler(s, c)) {
    h += itemSum(s, 'health');
    if (homePlanet(s) === 'neptune') h += 10;
    if (homePlanet(s) === 'pluto') h += 5;
  }
  const decline = Math.max(0, age - 40) * 1.1 + Math.max(0, age - lifespan(c) + 10) * 2;
  return clamp(Math.round(h - decline), 5, 150);
}

export function fertility(s: GameState, c: Character): number {
  const f = traitSum(c, 'fertility') + (isRuler(s, c) ? itemSum(s, 'fertility') : 0);
  if (c.traits.includes('barren')) return 0;
  return Math.max(0, 1 + f);
}

// ── Realm, ranks & titles ─────────────────────────────────────────────────

// Region lookups are hot, so they go through a cached index. Any change of
// owner MUST go through setOwner() so the cache is thrown away.
interface RegionIndex {
  byOwner: Map<string, Region[]>;
  byPlanet: Map<string, Region[]>;
  capital: Map<string, Region>;
}
const regionIndex = new WeakMap<Record<string, Region>, RegionIndex>();

function indexOf(s: GameState): RegionIndex {
  let idx = regionIndex.get(s.regions);
  if (!idx) {
    idx = { byOwner: new Map(), byPlanet: new Map(), capital: new Map() };
    for (const r of Object.values(s.regions)) {
      if (!idx.byOwner.has(r.owner)) idx.byOwner.set(r.owner, []);
      idx.byOwner.get(r.owner)!.push(r);
      if (!idx.byPlanet.has(r.planetId)) idx.byPlanet.set(r.planetId, []);
      idx.byPlanet.get(r.planetId)!.push(r);
      if (r.capital) idx.capital.set(r.planetId, r);
    }
    regionIndex.set(s.regions, idx);
  }
  return idx;
}

export function setOwner(s: GameState, region: Region, owner: string): void {
  region.owner = owner;
  regionIndex.delete(s.regions);
}

const NONE: Region[] = [];

export function clanRegions(s: GameState, clanId: string): readonly Region[] {
  return indexOf(s).byOwner.get(clanId) ?? NONE;
}

export function planetRegions(s: GameState, planetId: string): readonly Region[] {
  return indexOf(s).byPlanet.get(planetId) ?? NONE;
}

export function capitalOf(s: GameState, planetId: string): Region | undefined {
  return indexOf(s).capital.get(planetId);
}

export function planetSovereign(s: GameState, planetId: string): string | undefined {
  return capitalOf(s, planetId)?.owner;
}

export function clanRank(s: GameState, clanId: string): number {
  const clan = s.clans[clanId];
  if (!clan) return 0;
  const regions = clanRegions(s, clanId);
  if (!regions.length) return 0;
  if (clan.titles.emperor) return 4;
  if (regions.some((r) => r.capital)) return 3;
  if (regions.length >= 3 && (clan.titles.viceroy || !clan.isPlayer)) return 2;
  return 1;
}

export function liegeOf(s: GameState, clanId: string): string | null {
  const clan = s.clans[clanId];
  if (!clan || clanRank(s, clanId) >= 3) return null;
  if (clan.liege === 'none') return null;
  if (clan.liege !== 'auto') {
    const l = s.clans[clan.liege];
    if (l && l.id !== clanId && (clanRank(s, l.id) >= 2 || clan.cadetOf === l.id) && clanRegions(s, l.id).length) return l.id;
  }
  const sov = planetSovereign(s, clan.planetId);
  return sov && sov !== clanId ? sov : null;
}

export function vassalsOf(s: GameState, clanId: string): Clan[] {
  return Object.values(s.clans).filter((c) => c.id !== clanId && clanRegions(s, c.id).length > 0 && liegeOf(s, c.id) === clanId);
}

export function sovereignPlanets(s: GameState, clanId: string): string[] {
  return clanRegions(s, clanId)
    .filter((r) => r.capital)
    .map((r) => r.planetId);
}

const RANK_LABEL: Record<number, Record<'M' | 'F', string>> = {
  0: { M: 'Exile', F: 'Exile' },
  1: { M: 'Governor', F: 'Governor' },
  2: { M: 'Viceroy', F: 'Vicereine' },
  4: { M: 'Solar Emperor', F: 'Solar Empress' },
};

export function rankName(s: GameState, clanId: string, gender: 'M' | 'F'): string {
  const rank = clanRank(s, clanId);
  if (rank === 3) {
    const planets = sovereignPlanets(s, clanId);
    const clan = s.clans[clanId];
    const p = PLANET_BY_ID[planets.includes(clan.planetId) ? clan.planetId : planets[0]];
    return p.monarch[gender];
  }
  return RANK_LABEL[rank][gender];
}

export function clanTitle(s: GameState, clanId: string, gender: 'M' | 'F'): string {
  const rank = clanRank(s, clanId);
  const clan = s.clans[clanId];
  const regions = clanRegions(s, clanId);
  if (rank === 0) return 'Landless Exile';
  if (rank === 4) return `${RANK_LABEL[4][gender]} of the Sol System`;
  if (rank === 3) {
    const planets = sovereignPlanets(s, clanId);
    const main = planets.includes(clan.planetId) ? clan.planetId : planets[0];
    const p = PLANET_BY_ID[main];
    const extra = planets.length > 1 ? ` (+${planets.length - 1} worlds)` : '';
    return `${p.monarch[gender]} of ${p.name}${extra}`;
  }
  if (rank === 2) {
    const counts: Record<string, number> = {};
    for (const r of regions) counts[r.planetId] = (counts[r.planetId] ?? 0) + 1;
    const main = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return `${RANK_LABEL[2][gender]} of ${PLANET_BY_ID[main].name}`;
  }
  return `Governor of ${regions[0].name}`;
}

export function charTitle(s: GameState, c: Character): string {
  const clan = s.clans[c.clanId];
  if (clan && clan.headId === c.id && alive(c)) return clanTitle(s, clan.id, c.gender);
  return '';
}

export function dynastyMembers(s: GameState, includeDead = false): Character[] {
  return Object.values(s.characters).filter((c) => c.clanId === s.playerClanId && (includeDead || alive(c)));
}

/** The player's house or one of its cadet branches. */
export function isBloodlineClan(s: GameState, clanId: string | undefined): boolean {
  return !!clanId && (clanId === s.playerClanId || s.clans[clanId]?.cadetOf === s.playerClanId);
}

/** Everyone of the blood: the main house plus every cadet branch. */
export function bloodlineMembers(s: GameState, includeDead = false): Character[] {
  return Object.values(s.characters).filter((c) => isBloodlineClan(s, c.clanId) && (includeDead || alive(c)));
}

export function cadetClans(s: GameState): Clan[] {
  return Object.values(s.clans).filter((k) => k.cadetOf === s.playerClanId);
}

/** Everyone the player's court is responsible for: dynasty + their spouses. */
export function courtMembers(s: GameState): Character[] {
  const out = new Map<string, Character>();
  for (const c of dynastyMembers(s)) {
    out.set(c.id, c);
    const sp = ch(s, c.spouseId);
    if (alive(sp)) out.set(sp.id, sp);
  }
  return [...out.values()];
}

export function childrenOf(s: GameState, c: Character): Character[] {
  return c.childrenIds.map((id) => s.characters[id]).filter((x): x is Character => !!x);
}

export function siblingsOf(s: GameState, c: Character): Character[] {
  const parentIds = [c.fatherId, c.motherId].filter(Boolean) as string[];
  if (!parentIds.length) return [];
  return Object.values(s.characters).filter((o) => o.id !== c.id && ((c.fatherId && o.fatherId === c.fatherId) || (c.motherId && o.motherId === c.motherId)));
}

export function isCloseKin(a: Character, b: Character): boolean {
  if (a.id === b.id) return true;
  if (a.fatherId === b.id || a.motherId === b.id || b.fatherId === a.id || b.motherId === a.id) return true;
  if (a.fatherId && a.fatherId === b.fatherId) return true;
  if (a.motherId && a.motherId === b.motherId) return true;
  return false;
}

export function relationTo(s: GameState, c: Character): string {
  const r = ruler(s);
  if (c.id === r.id) return 'You';
  if (c.id === r.spouseId) return c.gender === 'M' ? 'Husband' : 'Wife';
  if (c.fatherId === r.id || c.motherId === r.id) return c.gender === 'M' ? 'Son' : 'Daughter';
  if (r.fatherId === c.id) return 'Father';
  if (r.motherId === c.id) return 'Mother';
  if ((r.fatherId && c.fatherId === r.fatherId) || (r.motherId && c.motherId === r.motherId)) return c.gender === 'M' ? 'Brother' : 'Sister';
  const parent = ch(s, c.fatherId) ?? ch(s, c.motherId);
  if (parent && (parent.fatherId === r.id || parent.motherId === r.id)) return c.gender === 'M' ? 'Grandson' : 'Granddaughter';
  const spouseOf = ch(s, c.spouseId);
  if (spouseOf && spouseOf.clanId === s.playerClanId && c.clanId !== s.playerClanId && spouseOf.id !== r.id) {
    const rel = relationTo(s, spouseOf);
    return `${rel}'s ${c.gender === 'M' ? 'husband' : 'wife'}`;
  }
  if (c.clanId === s.playerClanId) return 'Kin';
  return '';
}

export function clanStrength(s: GameState, clanId: string): number {
  return clanId === s.playerClanId ? s.fleet : (s.clans[clanId]?.fleet ?? 0);
}

export function regionIncome(_s: GameState, r: Region): number {
  return 20 + r.dev * 12;
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-GB');
}

export function cooldownReady(s: GameState, key: string): boolean {
  return (s.cooldowns[key] ?? 0) <= s.year;
}

export function setCooldown(s: GameState, key: string, years = 1): void {
  s.cooldowns[key] = s.year + years;
}

/** VIP mode (the sandbox) is switched on for this run. */
export function isVip(s: GameState): boolean {
  return !!s.vip?.on;
}

export function canAct(s: GameState): boolean {
  return !s.gameOver && ageOf(s, ruler(s)) >= ADULT_AGE;
}
