// Saves are sacred: every save any build has ever written must keep loading.
//
// __fixtures__ holds frozen saves from every SAVE_VERSION. Never edit or
// regenerate them. After bumping SAVE_VERSION, `npm run fixtures` adds saves
// for the new version and leaves the old ones alone.

/// <reference types="node" />
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decompressFromBase64 } from 'lz-string';
import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from './core';
import type { Seeded } from './rng';
import { exportSave, importSave, migrate, MIGRATIONS, NewerSaveError } from './save';
import { botTurn, checkInvariants, drain } from './testkit';
import { ageUp } from './tick';
import type { GameState, ScenarioId } from './types';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';

const DIR = new URL('./__fixtures__/', import.meta.url);
const WRITE = import.meta.env.MODE === 'fixtures';

function fixtures(): string[] {
  return existsSync(DIR) ? readdirSync(DIR).filter((f) => /^save-v\d+-.+\.json$/.test(f)).sort() : [];
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
// Seed 303's ruler dies heirless in two cycles, giving a finished-game save.
const RECIPES: { name: string; scenario: ScenarioId; planet: string; seed: number; vip?: boolean }[] = [
  { name: 'governor', scenario: 'governor', planet: 'mars', seed: 101 },
  { name: 'viceroy', scenario: 'viceroy', planet: 'venus', seed: 202 },
  { name: 'monarch', scenario: 'monarch', planet: 'jupiter', seed: 306 },
  { name: 'emperor', scenario: 'emperor', planet: 'earth', seed: 404 },
  { name: 'vip', scenario: 'monarch', planet: 'mars', seed: 505, vip: true },
  { name: 'ended', scenario: 'monarch', planet: 'jupiter', seed: 303 },
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
      play(s, 40, { seed: r.seed });
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
    for (let v = 1; v <= SAVE_VERSION; v++) expect(files.some((f) => f.startsWith(`save-v${v}-`)), `fixtures for v${v}`).toBe(true);
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
    for (const k of ['items', 'equipped', 'shop', 'wars', 'aiWars', 'claims', 'feuds', 'cooldowns', 'eventCooldowns', 'stats', 'council', 'forge', 'routes']) delete s[k];
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
