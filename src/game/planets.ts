// Static world data: the ten great powers of the solar system, their faiths,
// cultures and naming styles.

import type { Gender } from './types';

export type PlanetType = 'rocky' | 'cloud' | 'ocean' | 'red' | 'asteroid' | 'gas' | 'ringed' | 'ice' | 'deep' | 'dwarf';

export interface PlanetDef {
  id: string;
  name: string;
  faction: string;
  adjective: string;
  type: PlanetType;
  base: string;
  accent: string;
  orbit: number; // order from the sun
  faithId: string;
  monarch: Record<Gender, string>;
  blurb: string;
  bonus: string;
  capital: string;
  regions: string[];
  clans: string[];
  names: { start: string[]; m: string[]; f: string[] };
}

export const PLANETS: PlanetDef[] = [
  {
    id: 'mercury',
    name: 'Mercury',
    faction: 'Helion Forge-Dominion',
    adjective: 'Mercurian',
    type: 'rocky',
    base: '#8f857c',
    accent: '#d29a62',
    orbit: 1,
    faithId: 'solar',
    monarch: { M: 'Forge-King', F: 'Forge-Queen' },
    blurb: 'Sun-scorched forge-cities crawl along the terminator line, smelting the metal the whole system runs on.',
    bonus: '+15% credit income from the sun-forges.',
    capital: 'Caloris Forge',
    regions: ['Tolstoj Rim', 'Beethoven Flats', 'Rembrandt Deep', 'Borealis Shade', 'Terminator Rail', 'Kuiper Crater'],
    clans: ['Vantor', 'Ashcroft', 'Embersmith', 'Calderon', 'Helix', 'Brightforge'],
    names: {
      start: ['Hel', 'Sol', 'Pyr', 'Aur', 'Cal', 'Ign', 'Lum', 'Vul', 'Ther', 'Ash', 'Bra', 'Cor'],
      m: ['ius', 'an', 'or', 'ex', 'os', 'ar', 'ion'],
      f: ['a', 'ine', 'ia', 'essa', 'ora', 'is'],
    },
  },
  {
    id: 'venus',
    name: 'Venus',
    faction: 'Venusian Cloud-Courts',
    adjective: 'Venusian',
    type: 'cloud',
    base: '#d9b46a',
    accent: '#f3e0a8',
    orbit: 2,
    faithId: 'veiled',
    monarch: { M: 'Doge', F: 'Dogaressa' },
    blurb: 'Floating palaces drift above acid storms. Everyone smiles, everyone lies, and the parties never end.',
    bonus: '+2 Intrigue and +10% scheme success.',
    capital: 'Ishtar Cloud-Spire',
    regions: ['Aphrodite Terra', 'Maxwell Heights', 'Lakshmi Planum', 'Beta Regio', 'Alpha Regio', 'Lada Terra'],
    clans: ['Velluto', 'Amarante', 'Delacroix', 'Sereno', 'Moriell', 'Luminelle'],
    names: {
      start: ['Ves', 'Lu', 'Ser', 'Ama', 'Cel', 'Vio', 'Isa', 'Ro', 'Fio', 'Mir', 'Dela', 'Ori'],
      m: ['enzo', 'ard', 'ien', 'ano', 'eon', 'iel', 'ius'],
      f: ['ette', 'ina', 'elle', 'ia', 'ara', 'isse', 'ena'],
    },
  },
  {
    id: 'earth',
    name: 'Earth',
    faction: 'Terran Concord',
    adjective: 'Terran',
    type: 'ocean',
    base: '#2f6fb3',
    accent: '#4f9e5f',
    orbit: 3,
    faithId: 'solar',
    monarch: { M: 'Prince-Consul', F: 'Princess-Consul' },
    blurb: 'The old homeworld. Crowded, proud and tangled in paperwork, but nobody out-talks a Terran.',
    bonus: '+2 Diplomacy and warmer opinions from every clan.',
    capital: 'New Geneva',
    regions: ['Sahara Solar Fields', 'Pacific Seasteads', 'Himalaya Spire', 'Amazon Biome', 'Siberian Reach', 'Luna Docks', 'Antarctic Vaults'],
    clans: ['Hartwell', 'Castellan', 'Okafor', 'Lindqvist', 'Takeda', 'Moreau'],
    names: {
      start: ['Al', 'Jon', 'Mar', 'El', 'Kai', 'Na', 'Ro', 'Sa', 'Ti', 'Ade', 'Ha', 'Le'],
      m: ['ex', 'an', 'iel', 'o', 'us', 'ar', 'eon'],
      f: ['a', 'ina', 'ise', 'ya', 'enne', 'ora', 'ie'],
    },
  },
  {
    id: 'mars',
    name: 'Mars',
    faction: 'Iron Hegemony of Mars',
    adjective: 'Martian',
    type: 'red',
    base: '#b0482d',
    accent: '#e0844f',
    orbit: 4,
    faithId: 'red',
    monarch: { M: 'Warlord-King', F: 'Warlord-Queen' },
    blurb: 'Red dust, iron discipline and shipyards that never sleep. Martians settle arguments with broadsides.',
    bonus: '+15% fleet strength in battle.',
    capital: 'Olympus Citadel',
    regions: ['Valles Marineris', 'Tharsis Ridge', 'Hellas Basin', 'Elysium Plains', 'Utopia Planitia', 'Phobos Yard', 'Deimos Watch'],
    clans: ['Kravos', 'Redmane', 'Dragunov', 'Ironvale', 'Tharsk', 'Volkar'],
    names: {
      start: ['Kor', 'Dra', 'Vul', 'Tor', 'Mag', 'Gar', 'Zar', 'Bran', 'Krav', 'Rad', 'Vog', 'Hest'],
      m: ['ax', 'ok', 'an', 'rik', 'dan', 'ur', 'os'],
      f: ['a', 'ka', 'yra', 'ena', 'ith', 'ova', 'ra'],
    },
  },
  {
    id: 'ceres',
    name: 'Ceres',
    faction: 'Free Clans of the Belt',
    adjective: 'Belter',
    type: 'asteroid',
    base: '#7d7972',
    accent: '#a8a297',
    orbit: 5,
    faithId: 'machine',
    monarch: { M: 'Pirate-King', F: 'Pirate-Queen' },
    blurb: 'Smugglers, miners and chancers hollowing out the asteroid belt. Everything is for sale on Ceres.',
    bonus: 'Bazaar prices 20% cheaper and +10% credit income.',
    capital: 'Occator Bazaar',
    regions: ['Vesta Rock', 'Pallas Drift', 'Hygiea Deep', 'Juno Hollow', 'Psyche Mine'],
    clans: ['Rockjaw', 'Driftwell', 'Nyx-Kane', 'Saltbones', 'Quickfuse', 'Marrow'],
    names: {
      start: ['Jax', 'Ri', 'Ko', 'Zee', 'Ty', 'Mo', 'Ba', 'Ne', 'Pip', 'Su', 'Dex', 'Lo'],
      m: ['o', 'ix', 'er', 'an', 'ek', 'ly', 'us'],
      f: ['a', 'ie', 'ra', 'ix', 'ey', 'na', 'zy'],
    },
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    faction: 'Jovian Storm-Throne',
    adjective: 'Jovian',
    type: 'gas',
    base: '#c49766',
    accent: '#ecd6b2',
    orbit: 6,
    faithId: 'solar',
    monarch: { M: 'Storm-King', F: 'Storm-Queen' },
    blurb: 'An empire of moons ruled from Ganymede, all marble, ceremony and enormous egos.',
    bonus: '+3 prestige every cycle.',
    capital: 'Ganymede Throne',
    regions: ['Europa', 'Io', 'Callisto', 'Amalthea', 'Himalia', 'Red Spot Barge'],
    clans: ['Jovanni', 'Stormcrown', 'Valerian', 'Augustine', 'Galilei', 'Maximar'],
    names: {
      start: ['Jov', 'Aug', 'Max', 'Tib', 'Hadr', 'Val', 'Cass', 'Luc', 'Sev', 'Aur', 'Oct', 'Cyr'],
      m: ['ian', 'us', 'imus', 'erius', 'ianus', 'or', 'ent'],
      f: ['ia', 'ina', 'illa', 'ena', 'ora', 'essa', 'a'],
    },
  },
  {
    id: 'saturn',
    name: 'Saturn',
    faction: 'Saturnine Synod',
    adjective: 'Saturnine',
    type: 'ringed',
    base: '#d4bb83',
    accent: '#efe0b5',
    orbit: 7,
    faithId: 'machine',
    monarch: { M: 'Archon', F: 'Archon' },
    blurb: 'Scholars, engineers and machine-priests running the ring-stations like one giant university.',
    bonus: '+2 Science and faster heir education.',
    capital: 'Titan Synod',
    regions: ['Enceladus', 'Rhea', 'Iapetus', 'Dione', 'Mimas', 'Ring-Halo'],
    clans: ['Kronos', 'Enceladi', 'Ringwright', 'Tycho', 'Halcyon', 'Iapetan'],
    names: {
      start: ['Ty', 'Kro', 'Eno', 'Rhe', 'Dio', 'Iap', 'Mi', 'Hyp', 'Pan', 'Ath', 'Ze', 'The'],
      m: ['on', 'os', 'eus', 'ar', 'ix', 'em', 'al'],
      f: ['a', 'eia', 'one', 'ys', 'ea', 'ira', 'e'],
    },
  },
  {
    id: 'uranus',
    name: 'Uranus',
    faction: 'Uranian Seerdom',
    adjective: 'Uranian',
    type: 'ice',
    base: '#7fcfd6',
    accent: '#c3eff1',
    orbit: 8,
    faithId: 'abyssal',
    monarch: { M: 'High Seer', F: 'High Seer' },
    blurb: 'A sideways world of mystics who read the future in methane storms. Unsettlingly calm.',
    bonus: '+3 faith every cycle.',
    capital: 'Titania Spire',
    regions: ['Oberon', 'Miranda', 'Ariel', 'Umbriel', 'Cordelia Station'],
    clans: ['Ophelian', 'Skyveil', 'Mirandel', 'Titanis', 'Aelion', 'Umbrian'],
    names: {
      start: ['Oph', 'Ar', 'Mir', 'Tit', 'Umb', 'Cres', 'Ael', 'Syl', 'Ori', 'Ise', 'Ven', 'Lyr'],
      m: ['iel', 'anth', 'or', 'eon', 'is', 'ael', 'uin'],
      f: ['iel', 'a', 'wen', 'ys', 'ae', 'ith', 'enne'],
    },
  },
  {
    id: 'neptune',
    name: 'Neptune',
    faction: 'Neptunian Tide-Kingdom',
    adjective: 'Neptunian',
    type: 'deep',
    base: '#2c4fc4',
    accent: '#6b8af0',
    orbit: 9,
    faithId: 'abyssal',
    monarch: { M: 'Tide-King', F: 'Tide-Queen' },
    blurb: 'Hard folk from the frozen oceans of Triton. They live long, hold grudges longer.',
    bonus: '+10 max health for your rulers.',
    capital: 'Triton Deep',
    regions: ['Proteus', 'Nereid', 'Larissa', 'Galatea', 'Halimede'],
    clans: ['Tidemark', 'Halvard', 'Deepwater', 'Thalassa', 'Nereon', 'Skoll'],
    names: {
      start: ['Tri', 'Nar', 'Hal', 'Thal', 'Ner', 'Sko', 'Mar', 'Vel', 'Gal', 'Fjor', 'Bry', 'Sel'],
      m: ['ton', 'eus', 'ric', 'vald', 'in', 'ar', 'und'],
      f: ['a', 'ys', 'ine', 'dra', 'wyn', 'is', 'ea'],
    },
  },
  {
    id: 'pluto',
    name: 'Pluto',
    faction: 'Plutonian Wardens',
    adjective: 'Plutonian',
    type: 'dwarf',
    base: '#c2a88e',
    accent: '#efe3d2',
    orbit: 10,
    faithId: 'fardark',
    monarch: { M: 'Warden-Lord', F: 'Warden-Lady' },
    blurb: 'Exiles and frontier wardens at the edge of the dark. Paranoid, tough, and very hard to kill.',
    bonus: '+20% defence against schemes and +5 max health.',
    capital: 'Tombaugh Hold',
    regions: ['Charon', 'Nix', 'Hydra', 'Kerberos', 'Styx'],
    clans: ['Charonne', 'Frostholm', 'Kerberus', 'Tombaugh', 'Duskvale', 'Grimm'],
    names: {
      start: ['Cha', 'Nyx', 'Hy', 'Ker', 'Sty', 'Tom', 'Bau', 'Dusk', 'Gri', 'Vor', 'Shae', 'Eld'],
      m: ['ron', 'ek', 'as', 'an', 'or', 'ix', 'ul'],
      f: ['ra', 'a', 'ys', 'iel', 'yx', 'en', 'ira'],
    },
  },
];

export const PLANET_BY_ID: Record<string, PlanetDef> = Object.fromEntries(PLANETS.map((p) => [p.id, p]));

export interface FaithDef {
  id: string;
  name: string;
  color: string;
  blurb: string;
  virtues: string[];
  sins: string[];
}

export const FAITHS: Record<string, FaithDef> = {
  solar: {
    id: 'solar',
    name: 'Solar Orthodoxy',
    color: '#f5b942',
    blurb: 'Worship of the Undying Sun, giver of all light. Grand cathedrals, grander tithes.',
    virtues: ['generous', 'just', 'humble'],
    sins: ['greedy', 'arbitrary', 'arrogant'],
  },
  veiled: {
    id: 'veiled',
    name: 'The Veiled Mystery',
    color: '#c77dd9',
    blurb: 'Truth is a mask behind a mask. Secrets are sacred, and the clever are blessed.',
    virtues: ['deceitful', 'gregarious', 'patient'],
    sins: ['honest', 'shy', 'wrathful'],
  },
  red: {
    id: 'red',
    name: 'The Red Codex',
    color: '#e0533a',
    blurb: 'The war-scripture of Mars. Strength is holy, cowardice is the only sin worth naming.',
    virtues: ['brave', 'wrathful', 'diligent'],
    sins: ['craven', 'lazy', 'content'],
  },
  machine: {
    id: 'machine',
    name: 'Machine Synod',
    color: '#5ec8d8',
    blurb: 'The machine is the perfected soul. Augment the flesh and approach the divine circuit.',
    virtues: ['diligent', 'patient', 'cynical'],
    sins: ['lazy', 'zealous', 'impatient'],
  },
  abyssal: {
    id: 'abyssal',
    name: 'Abyssal Choir',
    color: '#4c7cf0',
    blurb: 'The deep oceans of the outer moons sing. Those who listen live long and speak little.',
    virtues: ['patient', 'calm', 'humble'],
    sins: ['impatient', 'wrathful', 'gregarious'],
  },
  fardark: {
    id: 'fardark',
    name: 'Cult of the Far Dark',
    color: '#8d8aa8',
    blurb: 'Beyond Pluto lies the Dark, and the Dark is watching. Trust nothing that stands in the light.',
    virtues: ['paranoid', 'brave', 'chaste'],
    sins: ['trusting', 'craven', 'lustful'],
  },
};

/** "the Red Codex", "the Solar Orthodoxy": reads right in the middle of a sentence. */
export function theFaith(id: string): string {
  return `the ${(FAITHS[id]?.name ?? 'Old Faith').replace(/^The /, '')}`;
}

export function makeName(planetId: string, gender: Gender, r: () => number): string {
  const p = PLANET_BY_ID[planetId] ?? PLANETS[2];
  const s = p.names.start[Math.floor(r() * p.names.start.length)];
  const endings = gender === 'M' ? p.names.m : p.names.f;
  const e = endings[Math.floor(r() * endings.length)];
  // Avoid ugly doubled letters across the join, e.g. "Iapp" or "Saa".
  if (s[s.length - 1].toLowerCase() === e[0]) return s + e.slice(1);
  return s + e;
}
