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
  cloneOf?: string; // id of the character this one was cloned from
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

export interface TradeRoute {
  id: string;
  from: string; // player's region id
  partner: string; // partner clan id
  planetId: string; // destination world
  since: number;
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
  stats: { battlesWon: number; battlesLost: number; schemes: number; children: number; peakRank: number };
  gameOver?: { reason: string; year: number };
  started: boolean;
}
