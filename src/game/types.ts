import type { Reputation } from './epithetDefs';

// Core data shapes for the whole game. Everything in GameState must be plain
// JSON (no classes, no functions) so saves round-trip cleanly.

export type StatKey = 'dip' | 'cmd' | 'eco' | 'int' | 'sci';
export const STAT_KEYS: StatKey[] = ['dip', 'cmd', 'eco', 'int', 'sci'];

export type Gender = 'M' | 'F';
export type TutorKey = 'household' | 'academy' | 'ai';

export interface Appearance {
  skin: number; // 0..7 human range
  hair: number; // 0..7 (7 = planet exotic)
  hairStyle: number; // 0..7
  eyes: number; // 0..6 (6 = exotic)
  face: number; // 0..3
  nose: number; // 0..3
  mouth: number; // 0..3
  brow: number; // 0..2
  beard: number; // 0..3 (only drawn on adult men)
}

export interface Education {
  focus: StatKey;
  tutor: TutorKey;
  progress: number;
}

export interface Character {
  id: string;
  name: string;
  gender: Gender;
  born: number;
  died?: number;
  deathCause?: string;
  clanId: string; // birth house / dynasty
  planetId: string; // culture
  faithId: string;
  fatherId?: string;
  motherId?: string;
  spouseId?: string;
  betrothedId?: string;
  loverId?: string;
  childrenIds: string[];
  traits: string[];
  base: Record<StatKey, number>;
  health: number; // 0..100ish
  looks: Appearance;
  edu?: Education;
  bastard?: boolean;
  marriedIn?: boolean; // joined their spouse's household; children go to the spouse's house
  prisonerOf?: string; // clan id holding them
  reputation?: Reputation; // lifetime deeds and dated earned epithets; not inherited
  ambition?: RulerAmbition;
  cloneOf?: string; // id of the character this one was cloned from
}

export type AmbitionKind = 'dynasty' | 'builder' | 'warhero' | 'scholar' | 'geneticist' | 'patron' | 'prosperous' | 'peacemaker' | 'conqueror';
export interface RulerAmbition {
  kind: AmbitionKind;
  year: number;
  baseline: number;
  progress: number;
  status: 'active' | 'fulfilled' | 'failed';
  lastYear: number;
  ended?: number;
}
export interface SuccessionCrisis {
  id: string;
  clanId: string;
  predecessorId: string;
  incumbentId: string;
  claimantId: string;
  started: number;
  deadline: number;
  stage: 'dispute' | 'civil-war';
  reasons: string[];
  votes: { id: string; side: 'incumbent' | 'claimant'; reason: string }[];
  backerIds: string[];
  contributions: { clanId: string; ships: number }[];
  score: number;
  heard?: boolean;
  lastBattle?: number;
}

export interface SigilSpec {
  shape: number;
  division: number;
  charge: number;
  c1: string;
  c2: string;
  c3: string;
}

export type LiegeSetting = 'auto' | 'none' | string;

/** Something a house remembers about you. Negative = grudge, positive = favour. */
export interface Memory {
  text: string;
  year: number;
  value: number;
  decay: number; // fraction lost per cycle
  /** Murder, a murder attempt, blackmail, an execution, a stolen throne: barely fades, and favours can't buy it back. Older saves infer it from severity. */
  grave?: boolean;
}

export interface Clan {
  id: string;
  name: string;
  planetId: string;
  faithId: string;
  headId: string;
  sigil: SigilSpec;
  color: string;
  credits: number;
  fleet: number;
  prestige: number;
  opinion: number; // opinion of the player's clan, -100..100
  allied: boolean; // allied to the player
  liege: LiegeSetting; // 'auto' = sovereign of home planet
  titles: { viceroy?: boolean; emperor?: boolean };
  founded: number;
  isPlayer?: boolean;
  cadetOf?: string; // a cadet branch of this clan (the player's bloodline)
  memories?: Memory[];
  genetics?: HouseGenetics; // Independent AI vault and laboratory; player uses dynasty/forge.
}

export interface HouseGenetics {
  locked: string[];
  purged: string[];
  slots: number;
  faith: number;
  forge: ForgeState;
}

export interface Region {
  id: string;
  name: string;
  planetId: string;
  owner: string; // clan id
  dev: number; // 1..10
  capital: boolean;
  site: [number, number]; // position on planet map (0..1)
  lastDeveloped?: number;
}

export type SuccessionLaw = 'primogeniture' | 'ultimogeniture' | 'merit' | 'designated';
export type GenderLaw = 'equal' | 'male' | 'female';

export interface RulerRecord {
  id: string;
  name: string;
  from: number;
  to?: number;
  title: string;
  end?: 'death' | 'abdication' | 'deposed';
}

export interface Dynasty {
  locked: string[]; // traits always inherited by dynasty children
  purged: string[]; // traits never inherited by dynasty children
  slots: number;
  law: SuccessionLaw;
  genderLaw: GenderLaw;
  designatedHeir?: string;
  rulers: RulerRecord[];
  founderId: string;
  gestationVats?: boolean;
  familyPlanning?: boolean;
  growth: 'capped' | 'uncapped';
  autoMatch: boolean;
}

export type ItemSlot = 'head' | 'weapon' | 'suit' | 'flagship' | 'relic';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface ItemEffects {
  stats?: Partial<Record<StatKey, number>>;
  health?: number;
  fleetPct?: number;
  prestigeYr?: number;
  faithYr?: number;
  creditsYr?: number;
  fertility?: number;
  scheme?: number;
}

export interface Item {
  id: string;
  name: string;
  slot: ItemSlot;
  rarity: Rarity;
  fx: ItemEffects;
  price: number;
  seed: number;
  origin?: string;
}

export type CasusBelli = 'claim' | 'holy' | 'conquest' | 'independence' | 'feud' | 'revolt';

export interface War {
  id: string;
  enemy: string; // clan id
  playerAttacker: boolean;
  target: string; // region id ('' for independence/revolt wars)
  cb: CasusBelli;
  score: number; // from the player's point of view, -100..100
  started: number;
  lastPlayerBattle?: number;
}

export interface AiWar {
  id: string;
  attacker: string;
  defender: string;
  target: string; // region id
  started: number;
  progress: number; // -100..100 from attacker's view
}

export type LogKind = 'info' | 'good' | 'bad' | 'birth' | 'death' | 'war' | 'news' | 'family';

export interface LogEntry {
  y: number;
  t: string;
  k: LogKind;
}

export interface BattleReport {
  warId: string;
  enemy: string;
  playerStrength: number;
  enemyStrength: number;
  playerShips: number;
  enemyShips: number;
  playerLosses: number;
  enemyLosses: number;
  won: boolean;
  scoreChange: number;
  newScore: number;
  personal: boolean;
  note?: string;
}

export type Pending =
  | { kind: 'event'; uid: string; eventId: string; subjectId?: string; data?: Record<string, string | number> }
  | {
      kind: 'notice';
      uid: string;
      title: string;
      text: string;
      icon?: string;
      tone?: 'good' | 'bad' | 'neutral';
      portraitId?: string;
    }
  | { kind: 'battle'; uid: string; report: BattleReport }
  // deadId identifies the outgoing ruler; after abdication they are still alive.
  | { kind: 'succession'; uid: string; deadId: string; heirId: string };

export interface Suitor {
  char: Character;
  highborn: boolean;
  prestigeCost: number;
}

export interface SuitorList {
  forId: string;
  year: number;
  mode: 'marry' | 'betroth';
  list: Suitor[];
}

export type CouncilRole = 'envoy' | 'admiral' | 'treasurer' | 'spymaster' | 'scientist';

export interface ForgeState {
  level: 0 | 1 | 2; // 0 none, 1 Gene-Forge, 2 Vat Complex
  researched: string[];
  project?: { trait: string; progress: number; needed: number };
}

/** VIP mode: the sandbox. Only ever helps the player, never AI houses. */
export interface VipState {
  on: boolean;
  immortal?: boolean; // the ruler cannot die
}

export type ScenarioId = 'governor' | 'viceroy' | 'monarch' | 'emperor';

export interface TradeRoute {
  id: string;
  from: string; // player's region id
  partner: string; // partner clan id
  planetId: string; // destination world
  since: number;
}

export type RelationKind = 'friend' | 'rival' | 'lover' | 'nemesis';

/**
 * Something one character remembers about another. It fades by `decay`
 * points a cycle toward zero; 0 means it lasts until something fixes it.
 * A later feeling with the same `key` replaces it.
 */
export interface Feeling {
  why: string;
  value: number;
  decay: number;
  year: number;
  key?: string;
  /** A death or betrayal: the stuff of nemeses. */
  grave?: boolean;
}

/** How one character feels about another beyond the baseline (ROADMAP §1.1). Only pairs with history are stored. */
export interface Relation {
  kind?: RelationKind;
  since: number;
  feelings: Feeling[];
  /** The last cycle they spent time together. */
  together?: number;
}

/** A choice remembered for a follow-up event, due in a given year. */
export interface StoryFlag {
  due: number;
  data: Record<string, string | number>;
}

/** Proof of something that actually happened, separate from suspicions. */
export interface Secret {
  id: string;
  kind: 'affair' | 'murder';
  subjectId: string;
  otherId: string;
  subjectName: string;
  otherName: string;
  /** The spouse betrayed at the time, not a later marriage. */
  betrayedId?: string;
  year: number;
  knownTo: string[];
  exposedYear?: number;
  exposedBy?: string;
}

/** Personal, single-use leverage. A successor does not inherit it. */
export interface Hook {
  id: string;
  secretId: string;
  holderId: string;
  targetId: string;
  year: number;
  usedYear?: number;
}

/** A bilateral peace oath, valid while year < until. */
export interface Truce {
  a: string;
  b: string;
  started: number;
  until: number;
}

export interface GameState {
  version: number;
  seed: number;
  year: number;
  startYear: number;
  nextId: number;
  playerClanId: string;
  rulerId: string;
  characters: Record<string, Character>;
  clans: Record<string, Clan>;
  regions: Record<string, Region>;
  dynasty: Dynasty;
  credits: number;
  fleet: number;
  prestige: number;
  faith: number;
  items: Item[];
  equipped: Partial<Record<ItemSlot | 'relic2', string>>;
  shop: { year: number; items: Item[] };
  wars: War[];
  aiWars: AiWar[];
  claims: string[];
  feuds: string[];
  cooldowns: Record<string, number>;
  eventCooldowns: Record<string, number>;
  log: LogEntry[];
  pending: Pending[];
  suitors?: SuitorList;
  leadPersonally: boolean;
  council: Partial<Record<CouncilRole, string>>;
  forge: ForgeState;
  routes: TradeRoute[];
  flags?: Record<string, StoryFlag>;
  /** relations[a][b]: how a feels about b. Sparse: only pairs with history. */
  relations: Record<string, Record<string, Relation>>;
  secrets: Secret[];
  hooks: Hook[];
  successionCrises: SuccessionCrisis[];
  truces: Truce[];
  /** House campaign fatigue, 0..100. Zero entries need not be stored. */
  warWeariness: Record<string, number>;
  vip?: VipState;
  scenario?: ScenarioId;
  stats: { battlesWon: number; battlesLost: number; schemes: number; children: number; peakRank: number };
  gameOver?: { reason: string; year: number };
  started: boolean;
}
