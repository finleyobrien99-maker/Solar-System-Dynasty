import { initialiseReputations } from './epithets';
import { initialiseHouseGenetics } from './houseGenetics';
// World generation: ten planets, their regions, the clans fighting over them,
// and the player's starting house.

import { createCharacter, eduTrait, inheritLooks, randomGenetic, randomLooks, randomPersonality } from './character';
import {
  ageOf,
  capitalOf,
  clanRank,
  clanRegions,
  clanTitle,
  log,
  newId,
  planetRegions,
  planetSovereign,
  rankName,
  SAVE_VERSION,
  setOwner,
  vassalsOf,
} from './core';
import { inheritGenetics, inheritPersonality } from './genetics';
import { makeItem } from './items';
import { remember } from './memory';
import { refreshShop } from './realm';
import { makeName, PLANETS, PLANET_BY_ID } from './planets';
import { chance, clamp, int, pick, rand, range, shuffle, type Seeded } from './rng';
import { addTrait } from './traits';
import { STAT_KEYS, type Appearance, type Character, type Clan, type GameState, type Gender, type ScenarioId, type SigilSpec, type StatKey } from './types';

export const START_YEAR = 2500;

export const SIGIL_COLORS = [
  '#c8102e',
  '#1f4fbf',
  '#d4a017',
  '#2e8b57',
  '#6a2dbd',
  '#e8e8e8',
  '#1b1f2e',
  '#e07a1f',
  '#0e9aa7',
  '#b5179e',
  '#7f1d1d',
  '#14532d',
  '#3b82f6',
  '#9ca3af',
  '#f472b6',
  '#84cc16',
];

export const SIGIL_CHARGES = 16;

export function randomSigil(s: Seeded, primary?: string): SigilSpec {
  const c1 = primary ?? pick(s, SIGIL_COLORS);
  const others = SIGIL_COLORS.filter((c) => c !== c1);
  const c2 = pick(s, others);
  const c3 = pick(
    s,
    others.filter((c) => c !== c2),
  );
  return { shape: int(s, 0, 4), division: int(s, 0, 6), charge: int(s, 0, SIGIL_CHARGES - 1), c1, c2, c3 };
}

export function fleetTarget(s: GameState, clanId: string): number {
  const regions = clanRegions(s, clanId);
  if (!regions.length) return 0;
  const devs = regions.reduce((a, r) => a + r.dev, 0);
  const rank = clanRank(s, clanId);
  return Math.round(18 + regions.length * 16 + devs * 2.5 + (rank >= 3 ? 40 : 0) + vassalsOf(s, clanId).length * 5);
}

function emptyState(seed: number): GameState {
  return {
    version: SAVE_VERSION,
    seed,
    year: START_YEAR,
    startYear: START_YEAR,
    nextId: 0,
    playerClanId: '',
    rulerId: '',
    characters: {},
    clans: {},
    regions: {},
    dynasty: { locked: [], purged: [], slots: 2, law: 'primogeniture', genderLaw: 'equal', rulers: [], founderId: '', growth: 'uncapped', autoMatch: true },
    credits: 0,
    fleet: 0,
    prestige: 0,
    faith: 0,
    items: [],
    equipped: {},
    shop: { year: 0, items: [] },
    wars: [],
    aiWars: [],
    claims: [],
    feuds: [],
    cooldowns: {},
    eventCooldowns: {},
    log: [],
    pending: [],
    leadPersonally: false,
    council: {},
    forge: { level: 0, researched: [] },
    routes: [],
    relations: {},
    secrets: [],
    hooks: [],
    successionCrises: [],
    stats: { battlesWon: 0, battlesLost: 0, schemes: 0, children: 0, peakRank: 1 },
    started: false,
  };
}

/** Builds a household for a clan: head, spouse, children. */
function seedFamily(s: GameState, clan: Clan): void {
  const otherClans = Object.values(s.clans).filter((c) => c.id !== clan.id);
  const headAge = int(s, 26, 62);
  const head = createCharacter(s, {
    born: s.year - headAge,
    clanId: clan.id,
    planetId: clan.planetId,
    faithId: clan.faithId,
    adultExtras: true,
  });
  clan.headId = head.id;
  if (chance(s, 0.85)) {
    const spouseClan = otherClans.length ? pick(s, otherClans) : clan;
    const spouse = createCharacter(s, {
      gender: head.gender === 'M' ? 'F' : 'M',
      born: s.year - Math.max(18, headAge + int(s, -6, 4)),
      clanId: spouseClan.id,
      planetId: clan.planetId,
      faithId: clan.faithId,
      adultExtras: true,
    });
    head.spouseId = spouse.id;
    spouse.spouseId = head.id;
    spouse.marriedIn = true;
    const mother = head.gender === 'F' ? head : spouse;
    const motherAge = s.year - mother.born;
    const kids = int(s, 0, 4);
    for (let i = 0; i < kids; i++) {
      const age = int(s, 0, Math.max(0, Math.min(motherAge - 18, 26)));
      const kid = createCharacter(s, {
        born: s.year - age,
        clanId: clan.id,
        planetId: clan.planetId,
        faithId: clan.faithId,
        fatherId: head.gender === 'M' ? head.id : spouse.id,
        motherId: mother.id,
        looks: inheritLooks(s, head.looks, spouse.looks, clan.planetId),
        adultExtras: true,
      });
      head.childrenIds.push(kid.id);
      spouse.childrenIds.push(kid.id);
    }
  }
}

export function createWorld(seed: number): GameState {
  const s = emptyState(seed);
  for (const p of PLANETS) {
    // Regions laid out round the planet with the capital in the middle.
    const names = [p.capital, ...p.regions];
    const regionIds: string[] = [];
    const n = names.length - 1;
    const spin = range(s, 0, Math.PI * 2);
    names.forEach((name, i) => {
      const id = `${p.id}-${i}`;
      let site: [number, number];
      if (i === 0) site = [0.5 + range(s, -0.05, 0.05), 0.5 + range(s, -0.05, 0.05)];
      else {
        const a = spin + ((i - 1) / n) * Math.PI * 2 + range(s, -0.25, 0.25);
        const rad = range(s, 0.27, 0.37);
        site = [0.5 + Math.cos(a) * rad, 0.5 + Math.sin(a) * rad];
      }
      s.regions[id] = { id, name, planetId: p.id, owner: '', dev: i === 0 ? int(s, 6, 8) : int(s, 2, 5), capital: i === 0, site };
      regionIds.push(id);
    });

    // Clans: one sovereign holding the capital, the rest share what's left.
    const clanCount = Math.min(5, Math.max(3, Math.floor(names.length * 0.7)));
    const clanNames = shuffle(s, p.clans).slice(0, clanCount);
    const colors = shuffle(s, SIGIL_COLORS);
    const clans: Clan[] = clanNames.map((name, i) => {
      const id = `${p.id}-k${i}`;
      const clan: Clan = {
        id,
        name,
        planetId: p.id,
        faithId: p.faithId,
        headId: '',
        sigil: randomSigil(s, colors[i % colors.length]),
        color: colors[i % colors.length],
        credits: int(s, 100, 400),
        fleet: 0,
        prestige: int(s, 50, 300),
        opinion: int(s, -10, 20),
        allied: false,
        liege: 'auto',
        titles: {},
        founded: START_YEAR - int(s, 40, 400),
      };
      s.clans[id] = clan;
      return clan;
    });
    const rest = shuffle(s, regionIds.slice(1));
    setOwner(s, s.regions[regionIds[0]], clans[0].id);
    // Every clan gets at least one region, the sovereign takes one extra.
    clans.forEach((c, i) => {
      const r = rest.shift();
      if (r && i > 0) setOwner(s, s.regions[r], c.id);
      else if (r) setOwner(s, s.regions[r], clans[0].id);
    });
    while (rest.length) setOwner(s, s.regions[rest.shift()!], pick(s, clans).id);
  }
  for (const clan of Object.values(s.clans)) seedFamily(s, clan);
  for (const clan of Object.values(s.clans)) clan.fleet = Math.round(fleetTarget(s, clan.id) * range(s, 0.8, 1.1));
  return s;
}

// ── Starting scenarios ────────────────────────────────────────────────────
// Like picking Count, Duke, King or Emperor: how high up the ladder you start.

export interface ScenarioDef {
  id: ScenarioId;
  name: string;
  tagline: string;
  blurb: string;
  credits: number;
  prestige: number;
  faith: number;
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'governor',
    name: 'Governor',
    tagline: 'Start at the bottom',
    blurb: "A minor house with a region or two, sworn to the planet's monarch. The classic climb.",
    credits: 350,
    prestige: 120,
    faith: 60,
  },
  {
    id: 'viceroy',
    name: 'Viceroy',
    tagline: 'A great house',
    blurb: "Three regions, the viceroy's title and two lesser houses sworn to you. Still kneels to the monarch.",
    credits: 900,
    prestige: 400,
    faith: 150,
  },
  {
    id: 'monarch',
    name: 'Monarch',
    tagline: 'Rule a whole world',
    blurb: 'You are the royal house. The capital is yours and every house on the planet is your vassal.',
    credits: 1800,
    prestige: 900,
    faith: 250,
  },
  {
    id: 'emperor',
    name: 'Solar Emperor',
    tagline: 'Sit the Solar Throne',
    blurb: 'Three throne-worlds already kneel. The deposed royal houses of your new worlds hold a grudge.',
    credits: 3500,
    prestige: 1800,
    faith: 400,
  },
];

export const SCENARIO_BY_ID = Object.fromEntries(SCENARIOS.map((x) => [x.id, x])) as Record<ScenarioId, ScenarioDef>;

/** The two worlds an emperor rules besides home: the nearest neighbours in orbit. */
export function emperorWorlds(planetId: string): string[] {
  const idx = PLANETS.findIndex((p) => p.id === planetId);
  return PLANETS.map((p, i) => ({ id: p.id, d: Math.abs(i - idx), i }))
    .filter((x) => x.id !== planetId)
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, 2)
    .map((x) => x.id);
}

/** Houses the player can lead on a planet for a scenario. Royal starts lead the ruling house. */
export function scenarioHouses(s: GameState, planetId: string, scenario: ScenarioId): Clan[] {
  const royal = planetSovereign(s, planetId);
  if (scenario === 'monarch' || scenario === 'emperor') return royal ? [s.clans[royal]] : [];
  return Object.values(s.clans).filter((c) => c.planetId === planetId && c.id !== royal && clanRegions(s, c.id).length > 0);
}

function applyScenario(s: GameState, clan: Clan, scenario: ScenarioId): void {
  if (scenario === 'viceroy') {
    const royal = planetSovereign(s, clan.planetId);
    // Take land from whoever can best spare it until the house holds three regions.
    for (let guard = 0; clanRegions(s, clan.id).length < 3 && guard < 10; guard++) {
      const pool = planetRegions(s, clan.planetId).filter((r) => !r.capital && r.owner !== clan.id);
      if (!pool.length) break;
      pool.sort((a, b) => clanRegions(s, b.owner).length - clanRegions(s, a.owner).length);
      const r = pool[0];
      const loser = r.owner;
      setOwner(s, r, clan.id);
      remember(s, loser, `Lost ${r.name} when House ${clan.name} was raised to the viceroyalty`, -20, 0.03);
    }
    clan.titles.viceroy = true;
    const lesser = Object.values(s.clans).filter((k) => k.planetId === clan.planetId && k.id !== clan.id && k.id !== royal && clanRegions(s, k.id).length > 0);
    for (const k of lesser.slice(0, 2)) k.liege = clan.id;
  }
  if (scenario === 'emperor') {
    for (const pid of emperorWorlds(clan.planetId)) {
      const cap = capitalOf(s, pid);
      if (!cap || cap.owner === clan.id) continue;
      const old = cap.owner;
      setOwner(s, cap, clan.id);
      remember(s, old, 'Lost their throne to the Solar Throne', -30, 0.02);
    }
    clan.titles.emperor = true;
  }
}

/** A rolled ruler shown on the new-game screen. */
export interface RulerPreview {
  seed: number;
  gender: Gender;
  name: string;
  base: Record<StatKey, number>;
  genetic: string[];
  personality: string[];
  looks: Appearance;
}

export function rollRuler(seed: number, planetId: string, gender: Gender, name?: string): RulerPreview {
  const s: Seeded = { seed };
  const base = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) base[k] = int(s, 3, 8);
  const genetic = randomGenetic(s, chance(s, 0.5) ? 2 : 1);
  const personality = randomPersonality(s, 3, []);
  return {
    seed,
    gender,
    name: name ?? makeName(planetId, gender, () => rand(s)),
    base,
    genetic,
    personality,
    looks: randomLooks(s, planetId),
  };
}

export type StartFamily = 'single' | 'married' | 'kids';

export interface StartOpts {
  clanId: string;
  clanName?: string;
  sigil?: SigilSpec;
  ruler: RulerPreview;
  focus: StatKey;
  growth?: 'capped' | 'uncapped';
  scenario?: ScenarioId;
  /** Starting age of the ruler, 16 to 70. */
  age?: number;
  family?: StartFamily;
  vip?: boolean;
  /** VIP only: acquired and cyber traits, and the education tier (1 to 4). */
  extraTraits?: string[];
  eduTier?: number;
}

export const MIN_START_AGE = 16;
export const MAX_START_AGE = 70;

/** Spouse and children for a ruler who starts with a family. */
function startingFamily(s: GameState, ruler: Character, clan: Clan, kids: boolean): void {
  const y = s.year;
  const age = ageOf(s, ruler);
  if (age < 18) return;
  const others = Object.values(s.clans).filter((c) => c.planetId === clan.planetId && c.id !== clan.id);
  const from = others.length ? pick(s, others) : clan;
  const spouse = createCharacter(s, {
    gender: ruler.gender === 'M' ? 'F' : 'M',
    born: y - clamp(age + int(s, -5, 3), 18, 80),
    clanId: from.id,
    planetId: clan.planetId,
    faithId: clan.faithId,
    adultExtras: true,
  });
  ruler.spouseId = spouse.id;
  spouse.spouseId = ruler.id;
  spouse.marriedIn = true;
  if (!kids) return;
  const father = ruler.gender === 'M' ? ruler : spouse;
  const mother = ruler.gender === 'F' ? ruler : spouse;
  const oldest = Math.min(age, ageOf(s, spouse)) - 18;
  if (oldest < 0) return;
  const n = int(s, 1, 3);
  for (let i = 0; i < n; i++) {
    const kidAge = int(s, 0, Math.min(oldest, 24));
    const traits = [...inheritGenetics(s, father, mother), ...(kidAge < 16 ? inheritPersonality(s, father, mother) : [])];
    const kid = createCharacter(s, {
      born: y - kidAge,
      clanId: clan.id,
      planetId: clan.planetId,
      faithId: clan.faithId,
      fatherId: father.id,
      motherId: mother.id,
      looks: inheritLooks(s, father.looks, mother.looks, clan.planetId),
      traits,
      adultExtras: true,
    });
    for (const k of STAT_KEYS) kid.base[k] = clamp(Math.round((father.base[k] + mother.base[k]) / 2 + int(s, -2, 2)), 0, 10);
    father.childrenIds.push(kid.id);
    mother.childrenIds.push(kid.id);
  }
}

export function startGame(s: GameState, o: StartOpts): GameState {
  const clan = s.clans[o.clanId];
  clan.isPlayer = true;
  if (o.clanName?.trim()) clan.name = o.clanName.trim();
  if (o.sigil) {
    clan.sigil = o.sigil;
    clan.color = o.sigil.c1;
  }
  clan.opinion = 100;
  clan.liege = 'auto';
  s.playerClanId = clan.id;
  s.dynasty.growth = o.growth ?? 'uncapped';
  const scenario = o.scenario ?? 'governor';
  const sc = SCENARIO_BY_ID[scenario];
  s.scenario = scenario;
  if (o.vip) s.vip = { on: true };
  applyScenario(s, clan, scenario);

  // Clear the AI household this clan started with.
  for (const c of Object.values(s.characters)) {
    if (c.clanId === clan.id) {
      const sp = c.spouseId ? s.characters[c.spouseId] : undefined;
      if (sp && sp.clanId !== clan.id) {
        // A foreign head can be married to somebody in this household. Keep their throne intact.
        if (s.clans[sp.clanId]?.headId === sp.id) sp.spouseId = undefined;
        else delete s.characters[sp.id];
      }
      delete s.characters[c.id];
    }
  }

  const y = s.year;
  const p = clan.planetId;
  const age = clamp(Math.round(o.age ?? 20), MIN_START_AGE, MAX_START_AGE);
  const otherClan = pick(
    s,
    Object.values(s.clans).filter((c) => c.planetId === p && c.id !== clan.id),
  );
  const father = createCharacter(s, { gender: 'M', born: y - age - int(s, 24, 34), clanId: clan.id, planetId: p, adultExtras: true });
  father.died = y - 1;
  father.deathCause = 'a long illness';
  const mother = createCharacter(s, { gender: 'F', born: y - age - int(s, 20, 30), clanId: otherClan?.id ?? clan.id, planetId: p, adultExtras: true });
  father.spouseId = mother.id;
  mother.spouseId = father.id;
  mother.marriedIn = true;
  if (ageOf(s, mother) > 85) {
    mother.died = y - int(s, 2, 10);
    mother.deathCause = 'old age';
  }

  const pr = o.ruler;
  let traits = [...pr.genetic, ...pr.personality];
  if (o.vip) for (const t of o.extraTraits ?? []) traits = addTrait(traits, t);
  const eduTier = o.vip && o.eduTier ? o.eduTier : age >= 35 ? 3 : 2;
  traits = addTrait(traits, eduTrait(o.focus, eduTier));
  const ruler = createCharacter(s, {
    gender: pr.gender,
    born: y - age,
    clanId: clan.id,
    planetId: p,
    fatherId: father.id,
    motherId: mother.id,
    traits,
    looks: pr.looks,
    name: pr.name,
  });
  ruler.base = { ...pr.base };
  ruler.base[o.focus] += 2;
  father.childrenIds.push(ruler.id);
  mother.childrenIds.push(ruler.id);

  const sibs = int(s, 0, 2);
  for (let i = 0; i < sibs; i++) {
    const sibAge = age - int(s, 2, 12);
    // Younger siblings only, and only while their mother could still bear them.
    if (sibAge < 1 || ageOf(s, mother) - sibAge > 45) continue;
    const sib = createCharacter(s, {
      born: y - sibAge,
      clanId: clan.id,
      planetId: p,
      fatherId: father.id,
      motherId: mother.id,
      looks: inheritLooks(s, father.looks, mother.looks, p),
    });
    sib.traits = sibAge >= 16 ? randomPersonality(s, 3, sib.traits) : randomPersonality(s, 2, sib.traits);
    father.childrenIds.push(sib.id);
    mother.childrenIds.push(sib.id);
  }

  if (o.family && o.family !== 'single') startingFamily(s, ruler, clan, o.family === 'kids');

  clan.headId = ruler.id;
  s.rulerId = ruler.id;
  s.dynasty.founderId = father.id;
  s.dynasty.rulers = [
    { id: father.id, name: father.name, from: y - 30, to: y - 1, title: rankName(s, clan.id, 'M') },
    { id: ruler.id, name: ruler.name, from: y, title: rankName(s, clan.id, ruler.gender) },
  ];
  s.credits = sc.credits;
  s.fleet = Math.max(35, Math.round(fleetTarget(s, clan.id) * 0.8));
  s.prestige = sc.prestige;
  s.faith = sc.faith;
  s.stats.peakRank = clanRank(s, clan.id);
  s.items = [makeItem(s, newId(s, 'i'), { slot: 'head', rarity: 'common', origin: 'Family heirloom' })];
  s.equipped = { head: s.items[0].id };
  s.started = true;
  refreshShop(s);
  if (scenario === 'governor') {
    log(s, `${ruler.name} of House ${clan.name} takes the seat of their late father, aged ${age}.`, 'info');
    log(s, `The ${PLANET_BY_ID[p].faction} watches the ${age < 30 ? 'young ' : ''}${ruler.gender === 'M' ? 'lord' : 'lady'} closely.`, 'info');
  } else {
    log(s, `${ruler.name} of House ${clan.name} inherits their late father's titles, aged ${age}: ${clanTitle(s, clan.id, ruler.gender)}.`, 'info');
    if (scenario === 'emperor')
      log(
        s,
        `The deposed royal houses of ${emperorWorlds(p)
          .map((id) => PLANET_BY_ID[id].name)
          .join(' and ')} swear fealty through gritted teeth.`,
        'war',
      );
  }
  initialiseReputations(s);
  initialiseHouseGenetics(s);
  if (o.vip) log(s, 'VIP mode is on: edit anyone, any time, and the Gene-Forge is yours without limit.', 'info');
  return s;
}
