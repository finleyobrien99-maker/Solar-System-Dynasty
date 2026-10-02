// World generation: ten planets, their regions, the clans fighting over them,
// and the player's starting house.

import { createCharacter, eduTrait, inheritLooks, randomGenetic, randomLooks, randomPersonality } from './character';
import { clanRegions, clanRank, log, newId, SAVE_VERSION, setOwner, vassalsOf } from './core';
import { makeItem } from './items';
import { refreshShop } from './realm';
import { makeName, PLANETS, PLANET_BY_ID } from './planets';
import { chance, int, pick, rand, range, shuffle, type Seeded } from './rng';
import { addTrait } from './traits';
import { STAT_KEYS, type Appearance, type Clan, type GameState, type Gender, type SigilSpec, type StatKey } from './types';

export const START_YEAR = 2500;

export const SIGIL_COLORS = [
  '#c8102e', '#1f4fbf', '#d4a017', '#2e8b57', '#6a2dbd', '#e8e8e8', '#1b1f2e', '#e07a1f',
  '#0e9aa7', '#b5179e', '#7f1d1d', '#14532d', '#3b82f6', '#9ca3af', '#f472b6', '#84cc16',
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

export interface StartOpts {
  clanId: string;
  clanName?: string;
  sigil?: SigilSpec;
  ruler: RulerPreview;
  focus: StatKey;
  growth?: 'capped' | 'uncapped';
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
  s.playerClanId = clan.id;
  s.dynasty.growth = o.growth ?? 'uncapped';

  // Clear the AI household this clan started with.
  for (const c of Object.values(s.characters)) {
    if (c.clanId === clan.id) {
      const sp = c.spouseId ? s.characters[c.spouseId] : undefined;
      if (sp && sp.clanId !== clan.id) delete s.characters[sp.id];
      delete s.characters[c.id];
    }
  }

  const y = s.year;
  const p = clan.planetId;
  const otherClan = pick(
    s,
    Object.values(s.clans).filter((c) => c.planetId === p && c.id !== clan.id),
  );
  const father = createCharacter(s, { gender: 'M', born: y - 58, clanId: clan.id, planetId: p, adultExtras: true });
  father.died = y - 1;
  father.deathCause = 'a long illness';
  const mother = createCharacter(s, { gender: 'F', born: y - 49, clanId: otherClan?.id ?? clan.id, planetId: p, adultExtras: true });
  father.spouseId = mother.id;
  mother.spouseId = father.id;
  mother.marriedIn = true;

  const pr = o.ruler;
  let traits = [...pr.genetic, ...pr.personality];
  traits = addTrait(traits, eduTrait(o.focus, 2));
  const ruler = createCharacter(s, {
    gender: pr.gender,
    born: y - 20,
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
    const sib = createCharacter(s, {
      born: y - int(s, 9, 18),
      clanId: clan.id,
      planetId: p,
      fatherId: father.id,
      motherId: mother.id,
      looks: inheritLooks(s, father.looks, mother.looks, p),
    });
    sib.traits = randomPersonality(s, 2, sib.traits);
    father.childrenIds.push(sib.id);
    mother.childrenIds.push(sib.id);
  }

  clan.headId = ruler.id;
  s.rulerId = ruler.id;
  s.dynasty.founderId = father.id;
  s.dynasty.rulers = [
    { id: father.id, name: father.name, from: y - 30, to: y - 1, title: 'Governor' },
    { id: ruler.id, name: ruler.name, from: y, title: 'Governor' },
  ];
  s.credits = 350;
  s.fleet = Math.max(35, Math.round(fleetTarget(s, clan.id) * 0.8));
  s.prestige = 120;
  s.faith = 60;
  s.items = [makeItem(s, newId(s, 'i'), { slot: 'head', rarity: 'common', origin: 'Family heirloom' })];
  s.equipped = { head: s.items[0].id };
  s.started = true;
  refreshShop(s);
  log(s, `${ruler.name} of House ${clan.name} takes the seat of their late father, aged 20.`, 'info');
  log(s, `The ${PLANET_BY_ID[p].faction} watches the young ${ruler.gender === 'M' ? 'lord' : 'lady'} closely.`, 'info');
  return s;
}
