// Saves are sacred: every save any build has ever written must keep loading.
//
// __fixtures__ holds frozen saves from every SAVE_VERSION. Never edit or
// regenerate them. After bumping SAVE_VERSION, `npm run fixtures` adds saves
// for the new version and leaves the old ones alone.

/// <reference types="node" />
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { compressToUTF16, decompressFromBase64 } from 'lz-string';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAVE_VERSION } from './core';
import type { Seeded } from './rng';
import { deleteSave, exportSave, importSave, listSaves, migrate, MIGRATIONS, NewerSaveError, readBackup, readSave, writeSave } from './save';
import { botTurn, checkInvariants, drain } from './testkit';
import { ageUp } from './tick';
import { killCharacter } from './life';
import type { GameState, ScenarioId } from './types';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';

const DIR = new URL('./__fixtures__/', import.meta.url);
const WRITE = import.meta.env.MODE === 'fixtures';

function fixtures(): string[] {
  return existsSync(DIR)
    ? readdirSync(DIR)
        .filter((f) => /^save-v\d+-.+\.json$/.test(f))
        .sort()
    : [];
}

/** The raw state inside a fixture, before any migration runs. */
function rawState(file: string): GameState {
  const env = JSON.parse(readFileSync(new URL(file, DIR), 'utf8'));
  return JSON.parse(decompressFromBase64(env.data));
}

function play(s: GameState, cycles: number, bot: Seeded): void {
  for (let i = 0; i < cycles && !s.gameOver; i++) {
    drain(s, bot);
    if (s.gameOver) break;
    botTurn(s, bot);
    drain(s, bot);
    ageUp(s);
    checkInvariants(s);
  }
}

// One save per starting scenario plus a VIP run, each played long enough to
// have wars, kids, a council, a forge and trade routes in it. Saved straight
// after an age-up, so pop-ups are still waiting, as they are for players.
// A separate deterministic finished-game recipe covers extinction even when
// a new AI action changes the seeded sequence of births and deaths.
const RECIPES: { name: string; scenario: ScenarioId; planet: string; seed: number; vip?: boolean; finished?: boolean }[] = [
  { name: 'governor', scenario: 'governor', planet: 'mars', seed: 101 },
  { name: 'viceroy', scenario: 'viceroy', planet: 'venus', seed: 202 },
  { name: 'monarch', scenario: 'monarch', planet: 'jupiter', seed: 306 },
  { name: 'emperor', scenario: 'emperor', planet: 'earth', seed: 404 },
  { name: 'vip', scenario: 'monarch', planet: 'mars', seed: 505, vip: true },
  { name: 'ended', scenario: 'monarch', planet: 'jupiter', seed: 303 },
  { name: 'finished', scenario: 'governor', planet: 'mars', seed: 303, finished: true },
];

describe.runIf(WRITE)('freeze fixture saves', () => {
  it(`writes saves for version ${SAVE_VERSION}`, { timeout: 120000 }, () => {
    mkdirSync(DIR, { recursive: true });
    for (const r of RECIPES) {
      const file = `save-v${SAVE_VERSION}-${r.name}.json`;
      if (existsSync(new URL(file, DIR))) continue;
      const w = createWorld(r.seed);
      const clan = scenarioHouses(w, r.planet, r.scenario)[0];
      const s = startGame(w, { clanId: clan.id, ruler: rollRuler(r.seed, r.planet, 'F', 'Ysolde'), focus: 'dip', scenario: r.scenario, vip: r.vip });
      if (r.finished) {
        // Let the normal first annual update settle the replaced AI household.
        ageUp(s);
        killCharacter(s, s.rulerId, 'old age');
        expect(s.gameOver).toBeTruthy();
      } else play(s, 40, { seed: r.seed });
      writeFileSync(new URL(file, DIR), exportSave(s) + '\n');
      // eslint-disable-next-line no-console
      console.log(`froze ${file}: year ${s.year}, ${Object.keys(s.characters).length} characters`);
    }
  });
});

describe('save migrations', () => {
  it('has a migration step for every version bump', () => {
    for (let v = 2; v <= SAVE_VERSION; v++) expect(MIGRATIONS[v], `MIGRATIONS[${v}]`).toBeTypeOf('function');
  });

  it('has frozen saves for every version (run `npm run fixtures` after a bump)', () => {
    const files = fixtures();
    for (let v = 1; v <= SAVE_VERSION; v++)
      expect(
        files.some((f) => f.startsWith(`save-v${v}-`)),
        `fixtures for v${v}`,
      ).toBe(true);
  });

  for (const file of fixtures()) {
    it(`${file} loads, plays 20 cycles and round-trips`, { timeout: 60000 }, () => {
      const s = importSave(readFileSync(new URL(file, DIR), 'utf8'));
      expect(s.version).toBe(SAVE_VERSION);
      checkInvariants(s);
      play(s, 20, { seed: 9 });
      // Compare with what JSON can hold (it writes -0 as 0, which toEqual minds).
      expect(importSave(exportSave(s))).toEqual(JSON.parse(JSON.stringify(s)));
    });

    it(`${file} migrates the same however many times it runs`, () => {
      const raw = rawState(file);
      const once = migrate(structuredClone(raw));
      const again = migrate({ ...structuredClone(once), version: raw.version });
      expect(again).toEqual(once);
    });
  }

  it('fills in fields that early version 1 saves never had', () => {
    type Loose = Record<string, unknown> & { dynasty: Record<string, unknown>; characters: Record<string, Record<string, unknown>> };
    const s = rawState('save-v1-governor.json') as unknown as Loose;
    for (const k of ['items', 'equipped', 'shop', 'wars', 'aiWars', 'claims', 'feuds', 'cooldowns', 'eventCooldowns', 'stats', 'council', 'forge', 'routes'])
      delete s[k];
    for (const k of ['locked', 'purged', 'slots', 'rulers', 'growth', 'autoMatch']) delete s.dynasty[k];
    for (const c of Object.values(s.characters)) delete c.childrenIds;
    const m = migrate(s as unknown as GameState);
    expect(m.forge).toEqual({ level: 0, researched: [] });
    expect(m.dynasty.slots).toBe(2);
    play(m, 10, { seed: 3 });
  });

  it('refuses a save from a newer build instead of mangling it', () => {
    const s = importSave(readFileSync(new URL(fixtures()[0], DIR), 'utf8'));
    s.version = SAVE_VERSION + 1;
    expect(() => importSave(exportSave(s))).toThrow(NewerSaveError);
  });
});

describe('browser storage', () => {
  // A stand-in for localStorage, so the real write and read paths run.
  function fakeStorage(): Map<string, string> {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    return store;
  }
  const fixture = () => importSave(readFileSync(new URL('save-v1-governor.json', DIR), 'utf8'));
  afterEach(() => {
    for (const slot of ['auto', 'slot1'] as const) deleteSave(slot);
    vi.unstubAllGlobals();
  });

  it('writes deflated saves and reads them back exactly', () => {
    const store = fakeStorage();
    const s = fixture();
    expect(writeSave('slot1', s).ok).toBe(true);
    expect(JSON.parse(store.get('solar-dynasty:slot1')!).z).toBe('df');
    expect(readSave('slot1')).toEqual({ state: JSON.parse(JSON.stringify(s)), fromBackup: false });
    expect(listSaves().map((x) => x.slot)).toEqual(['slot1']);
  });

  it('still reads saves older builds wrote with lz-string', () => {
    const store = fakeStorage();
    const s = fixture();
    const json = JSON.stringify(s);
    // What the v1 builds put in storage: lz-string UTF16, checksum of the JSON.
    writeSave('auto', s);
    const env = JSON.parse(store.get('solar-dynasty:auto')!);
    store.set('solar-dynasty:auto', JSON.stringify({ ...env, z: 'utf16', data: compressToUTF16(json) }));
    expect(readSave('auto')?.state.year).toBe(s.year);
  });

  it('keeps the previous save as a backup and falls back to it if the main one is corrupt', () => {
    const store = fakeStorage();
    const s = fixture();
    writeSave('auto', s);
    const first = s.year;
    s.year += 1;
    writeSave('auto', s);
    expect(readBackup('auto')?.year).toBe(first);
    store.set('solar-dynasty:auto', store.get('solar-dynasty:auto')!.slice(0, 500));
    expect(readSave('auto')).toMatchObject({ fromBackup: true, state: { year: first } });
  });

  it('exports in lz-string base64 so older builds can import them', () => {
    expect(JSON.parse(exportSave(fixture())).z).toBe('b64');
  });
});
