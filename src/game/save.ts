import { initialiseSecrets } from './secrets';
import { initialiseReputations } from './epithets';
import { initialiseHouseGenetics } from './houseGenetics';
// Bulletproof saves.
//
// Every slot is written with a checksum. Before overwriting, the previous good
// save is rotated into a ".bak" key, and the new write is read back and
// verified. If a save is ever corrupted, the backup is used automatically.
// Players can also export/import saves as files.

import { compressToBase64, decompressFromBase64, decompressFromUTF16 } from 'lz-string';
import { mirror } from '../native';
import { deflateString, inflateString } from './codec';
import { aiSucceed } from './life';
import { clanTitle, ruler, SAVE_VERSION } from './core';
import { hashString } from './rng';
import type { GameState } from './types';

const PREFIX = 'solar-dynasty';
export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const SLOTS: SlotId[] = ['auto', 'slot1', 'slot2', 'slot3'];

export interface SaveSummary {
  ruler: string;
  house: string;
  title: string;
  year: number;
  gameOver: boolean;
  vip?: boolean;
}

interface Envelope {
  v: number;
  savedAt: number;
  checksum: number; // hash of the uncompressed JSON
  summary: SaveSummary;
  /**
   * How `data` is compressed. 'df' is deflate (codec.ts), used for saves in
   * storage. 'b64' is lz-string base64, still used for exported files so an
   * older build (say, a phone app that hasn't updated) can import them.
   * 'utf16' is lz-string from older builds' storage; none means raw JSON.
   */
  z?: 'df' | 'b64' | 'utf16';
  data: string;
}

export interface SaveInfo {
  slot: SlotId;
  savedAt: number;
  summary: SaveSummary;
  fromBackup: boolean;
}

function key(slot: SlotId): string {
  return `${PREFIX}:${slot}`;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function summarise(s: GameState): SaveSummary {
  const r = ruler(s);
  const clan = s.clans[s.playerClanId];
  return {
    ruler: r?.name ?? '?',
    house: clan?.name ?? '?',
    title: r && clan ? clanTitle(s, clan.id, r.gender) : '',
    year: s.year,
    gameOver: !!s.gameOver,
    vip: !!s.vip?.on,
  };
}

// Saves are compressed: a sprawling dynasty can run to thousands of
// characters, and browser storage is only a few megabytes.
function envelope(s: GameState, z: 'df' | 'b64' = 'df'): Envelope {
  const json = JSON.stringify(s);
  const data = z === 'df' ? deflateString(json) : compressToBase64(json);
  return { v: SAVE_VERSION, savedAt: Date.now(), checksum: hashString(json), summary: summarise(s), z, data };
}

function unpack(env: Envelope): string | null {
  if (!env.z) return env.data;
  const json = env.z === 'df' ? inflateString(env.data) : env.z === 'utf16' ? decompressFromUTF16(env.data) : decompressFromBase64(env.data);
  return json || null;
}

function parseEnvelope(raw: string | null): (Envelope & { json: string }) | null {
  if (!raw) return null;
  try {
    const env = JSON.parse(raw) as Envelope;
    if (typeof env.data !== 'string') return null;
    const json = unpack(env);
    if (!json || hashString(json) !== env.checksum) return null;
    return { ...env, json };
  } catch {
    return null;
  }
}

/** Null if the data is unreadable. Throws NewerSaveError so the player is told why. */
function stateFrom(env: { json: string }): GameState | null {
  try {
    return migrate(JSON.parse(env.json) as GameState);
  } catch (e) {
    if (e instanceof NewerSaveError) throw e;
    return null;
  }
}

export interface WriteResult {
  ok: boolean;
  error?: string;
}

/** What this session last wrote and verified in each slot, so the next write needn't re-check it. */
const verified = new Map<SlotId, string>();

export function writeSave(slot: SlotId, s: GameState): WriteResult {
  const ls = storage();
  if (!ls) return { ok: false, error: 'Browser storage is unavailable.' };
  const env = envelope(s);
  const raw = JSON.stringify(env);
  const prev = ls.getItem(key(slot));
  const prevGood = prev !== null && (verified.get(slot) === prev || !!parseEnvelope(prev));
  const attempt = (withBackup: boolean) => {
    if (withBackup && prevGood) ls.setItem(`${key(slot)}.bak`, prev!);
    ls.setItem(key(slot), raw);
  };
  try {
    try {
      attempt(true);
    } catch (e) {
      if (!isQuota(e)) throw e;
      // A huge dynasty can outgrow the browser's few megabytes. Drop this
      // slot's backup to make room rather than failing to save at all.
      ls.removeItem(`${key(slot)}.bak`);
      attempt(false);
    }
    if (!parseEnvelope(ls.getItem(key(slot)))) {
      if (prev) ls.setItem(key(slot), prev);
      return { ok: false, error: 'Save verification failed; kept the previous save.' };
    }
    verified.set(slot, raw);
    mirror(key(slot), raw);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: isQuota(e) ? 'Browser storage is full. Delete an old save slot or export your save to a file.' : String(e) };
  }
}

function isQuota(e: unknown): boolean {
  return e instanceof Error && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

export function readSave(slot: SlotId): { state: GameState; fromBackup: boolean } | null {
  const ls = storage();
  if (!ls) return null;
  for (const [k, fromBackup] of [
    [key(slot), false],
    [`${key(slot)}.bak`, true],
  ] as const) {
    const env = parseEnvelope(ls.getItem(k));
    const state = env && stateFrom(env);
    if (state) return { state, fromBackup };
  }
  return null;
}

/** The slot's previous good save, one write behind. Used to step back past a crash. */
export function readBackup(slot: SlotId): GameState | null {
  const env = parseEnvelope(storage()?.getItem(`${key(slot)}.bak`) ?? null);
  return env && stateFrom(env);
}

export function listSaves(): SaveInfo[] {
  const ls = storage();
  if (!ls) return [];
  const out: SaveInfo[] = [];
  for (const slot of SLOTS) {
    const main = parseEnvelope(ls.getItem(key(slot)));
    const env = main ?? parseEnvelope(ls.getItem(`${key(slot)}.bak`));
    if (env) out.push({ slot, savedAt: env.savedAt, summary: env.summary, fromBackup: !main });
  }
  return out;
}

export function deleteSave(slot: SlotId): void {
  const ls = storage();
  ls?.removeItem(key(slot));
  ls?.removeItem(`${key(slot)}.bak`);
  verified.delete(slot);
  mirror(key(slot), null);
}

export function exportSave(s: GameState): string {
  return JSON.stringify(envelope(s, 'b64'));
}

export function importSave(text: string): GameState {
  const env = parseEnvelope(text.trim());
  if (!env) throw new Error('That file is not a valid Solar Dynasty save (or it was edited and the checksum no longer matches).');
  const state = stateFrom(env);
  if (!state) throw new Error('The save data could not be read.');
  return state;
}

/** A save written by a newer build than this one. Loading it here could mangle it, so we refuse. */
export class NewerSaveError extends Error {
  constructor() {
    super('This save comes from a newer version of Solar Dynasty. Update the game (reload the page, or update the app), then load it again.');
    this.name = 'NewerSaveError';
  }
}

/**
 * Schema upgrades: `MIGRATIONS[n]` turns a version n-1 save into version n.
 *
 * To change GameState: bump SAVE_VERSION in core.ts, add the step here, then
 * run `npm run fixtures` to freeze saves of the new version for the tests.
 * Steps see old shapes that no longer match GameState, hence `any`. Every
 * step must be idempotent, since a save can meet the same step twice.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MIGRATIONS: Record<number, (s: any) => void> = {
  // Only future peace creates a truce: never reconstruct old treaties from history.
  7: (s) => {
    s.truces ??= [];
    s.warWeariness ??= {};
  },
  // Existing reigns may choose a vow; no historical disputes or achievements are invented.
  6: (s) => {
    s.successionCrises ??= [];
    // An old, unaccepted highborn offer had its parent assigned only on acceptance.
    for (const offer of s.suitors?.list ?? []) {
      const c = offer.char,
        head = s.characters[s.clans[c.clanId]?.headId];
      if (offer.highborn && !c.fatherId && !c.motherId && head && c.born - head.born >= 16) {
        if (head.gender === 'M') c.fatherId = head.id;
        else c.motherId = head.id;
      }
    }
  },
  5: (s) => initialiseSecrets(s),
  4: (s) => initialiseHouseGenetics(s),
  // Lifetime reputations start counting real deeds from this update.
  3: (s) => initialiseReputations(s),
  // Relationships between characters (ROADMAP 1.1).
  2: (s) => {
    s.relations ??= {};
  },
};

/** Bring any older save up to SAVE_VERSION so it keeps loading forever. */
export function migrate(s: GameState): GameState {
  const from = s.version >= 1 ? s.version : 1;
  if (from > SAVE_VERSION) throw new NewerSaveError();
  if (from === 1) backfillV1(s);
  for (let v = from + 1; v <= SAVE_VERSION; v++) MIGRATIONS[v](s);
  s.version = SAVE_VERSION;
  // Early new-game cleanup could delete a foreign spouse who was also a house head.
  // Recover that house through its normal succession, once, rather than leaving a dangling ID.
  for (const clan of Object.values(s.clans)) if (clan.id !== s.playerClanId && !s.characters[clan.headId]) aiSucceed(s, clan.id);
  return s;
}

/** Fields added during version 1, before versions were bumped. */
function backfillV1(s: GameState): void {
  s.items ??= [];
  s.equipped ??= {};
  s.shop ??= { year: 0, items: [] };
  s.wars ??= [];
  s.aiWars ??= [];
  s.claims ??= [];
  s.feuds ??= [];
  s.cooldowns ??= {};
  s.eventCooldowns ??= {};
  s.log ??= [];
  s.pending ??= [];
  s.stats ??= { battlesWon: 0, battlesLost: 0, schemes: 0, children: 0, peakRank: 1 };
  s.council ??= {};
  s.forge ??= { level: 0, researched: [] };
  s.routes ??= [];
  s.dynasty.locked ??= [];
  s.dynasty.purged ??= [];
  s.dynasty.slots ??= 2;
  s.dynasty.rulers ??= [];
  s.dynasty.growth ??= 'uncapped';
  s.dynasty.autoMatch ??= true;
  for (const c of Object.values(s.characters)) {
    c.childrenIds ??= [];
    c.traits ??= [];
  }
}
