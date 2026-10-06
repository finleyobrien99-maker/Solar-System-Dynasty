// Saves are sacred: every save any build has ever written must keep loading.
//
// __fixtures__ holds frozen saves from every SAVE_VERSION. Never edit or
// regenerate them. After bumping SAVE_VERSION, `npm run fixtures` adds saves
// for the new version and leaves the old ones alone.

/// <reference types="node" />
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { compressToUTF16, decompressFromBase64 } from 'lz-string';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { declareHouseWar } from './ai';
import { pendingRealmCall } from './realmDefence';
import { clanRegions } from './core';
import { declareWar, conductSiege, endWar, fightBattle } from './war';
import { createCharacter } from './character';
import { appointCommander, commandersTick } from './commanders';
import { SAVE_VERSION } from './core';
import type { Seeded } from './rng';
import { deleteSave, exportSave, importSave, listSaves, migrate, MIGRATIONS, NewerSaveError, readBackup, readSave, writeSave } from './save';
import { botTurn, checkInvariants, drain } from './testkit';
import { ageUp } from './tick';
import { killCharacter } from './life';
import type { GameState, ScenarioId } from './types';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';
import { coalitionCampaign, peaceCampaign, disputedInheritance } from './testScenarios';
import { successionTick } from './succession';
import { ambitionChoices, chooseAmbition } from './ambitions';

// Long synchronous simulations must let the worker receive progress replies between tests.
// Otherwise a whole file can exceed the runner RPC deadline even though every assertion passes.
afterEach(() => setImmediate());

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

describe.runIf(WRITE)('freeze contested inheritance', () => {
  it('freezes a disputed crown and a civil war with an active personal vow', () => {
    for (const name of ['dispute', 'civil-war']) {
      const file = new URL(`save-v${SAVE_VERSION}-${name}.json`, DIR);
      if (existsSync(file)) continue;
      const { s, crisis } = disputedInheritance();
      chooseAmbition(s, ambitionChoices(s)[0]);
      if (name === 'civil-war') {
        s.year = crisis.deadline;
        successionTick(s);
      }
      writeFileSync(file, exportSave(s) + '\n');
    }
  });
});

describe.runIf(WRITE)('freeze peace and campaign weariness', () => {
  it('freezes an actual battle and a signed peace without reconstructing historical wars', () => {
    for (const name of ['campaign', 'peace-oath']) {
      const file = new URL(`save-v${SAVE_VERSION}-${name}.json`, DIR);
      if (existsSync(file)) continue;
      const { s, war } = peaceCampaign();
      if (name === 'peace-oath') endWar(s, war, 'white');
      writeFileSync(file, exportSave(s) + '\n');
    }
  });
});

describe.runIf(WRITE)('freeze a commanded battle', () => {
  it('freezes real appointments and the leaders snapshotted in a pending report', () => {
    const file = new URL(`save-v${SAVE_VERSION}-commanded-battle.json`, DIR);
    if (existsSync(file)) return;
    const { s, war } = peaceCampaign(),
      head = s.characters[s.rulerId];
    const child = createCharacter(s, { clanId: s.playerClanId, planetId: 'mars', born: s.year - 25, motherId: head.id });
    head.childrenIds.push(child.id);
    appointCommander(s, s.playerClanId, child.id);
    commandersTick(s);
    s.year++;
    expect(fightBattle(s, war.id)?.playerCommanderId).toBe(child.id);
    writeFileSync(file, exportSave(s) + '\n');
  });
});

describe.runIf(WRITE)('freeze coalition ships and siege orders', () => {
  it('freezes actual conquest fear, detached survivors and a paid operation', () => {
    for (const name of ['coalition-campaign', 'siege-order']) {
      const file = new URL(`save-v${SAVE_VERSION}-${name}.json`, DIR);
      if (existsSync(file)) continue;
      const { s, war } = coalitionCampaign();
      if (name === 'siege-order') expect(conductSiege(s, war.id, 'starve')).toBeTruthy();
      writeFileSync(file, exportSave(s) + '\n');
    }
  });
});

describe.runIf(WRITE)('freeze realm decisions and physical history', () => {
  it('freezes actual realm defenders and an unanswered call', () => {
    for (const name of ['realm-campaign', 'realm-call']) {
      const file = new URL(`save-v${SAVE_VERSION}-${name}.json`, DIR);
      if (existsSync(file)) continue;
      const s = createWorld(61),
        home = scenarioHouses(s, 'mars', 'governor')[0];
      startGame(s, { clanId: home.id, ruler: rollRuler(61, 'mars', 'F', 'Asha'), focus: 'cmd', age: 40, family: 'married' });
      Object.assign(s, { fleet: 120, prestige: 1000, pending: [] });
      for (const k of Object.values(s.clans)) {
        const h = s.characters[k.headId];
        h.born = s.year - 40;
        h.prisonerOf = undefined;
        k.fleet = 100;
        k.allied = false;
      }
      const d = Object.values(s.clans).find(
        (k) =>
          !k.isPlayer &&
          k.planetId === (name === 'realm-call' ? 'mars' : 'neptune') &&
          clanRegions(s, k.id).length &&
          !clanRegions(s, k.id).some((r) => r.capital),
      )!;
      const target = clanRegions(s, d.id)[0].id;
      if (name === 'realm-campaign') {
        expect(declareWar(s, target, 'conquest')).toBe(true);
        expect(fightBattle(s, s.wars[0].id)?.realmLosses?.length).toBeGreaterThan(0);
      } else {
        const a = Object.values(s.clans).find((k) => k.planetId === 'venus')!;
        expect(declareHouseWar(s, a.id, target)).toBe(true);
        expect(pendingRealmCall(s)).toBeTruthy();
      }
      checkInvariants(s);
      writeFileSync(file, exportSave(s) + '\n');
    }
  });
});

describe('save migrations', () => {
  it('v9 invents no past and preserves existing calls, oaths and uncertain loan history', () => {
    const { s, war } = coalitionCampaign();
    s.version = 8;
    const loans = structuredClone(war.coalition),
      calls = structuredClone(war.realmCalls),
      aid = structuredClone(war.realmAid),
      truces = structuredClone(s.truces),
      seed = s.seed;
    const first = migrate(s);
    expect(first.version).toBe(9);
    expect(war.realmCalls).toEqual(calls);
    expect(war.realmAid).toEqual(aid);
    expect(war.coalition).toEqual(loans);
    expect(s.truces).toEqual(truces);
    expect(s.seed).toBe(seed);
    expect(migrate(structuredClone(first))).toEqual(first);
    const old = structuredClone(first);
    old.version = 8;
    for (const w of [...old.wars, ...old.aiWars]) {
      delete w.realmAid;
      delete w.realmCalls;
    }
    migrate(old);
    for (const w of [...old.wars, ...old.aiWars]) {
      expect(w.realmAid).toEqual([]);
      expect(w.realmCalls).toEqual([]);
    }
  });
  it('keeps foreign rulers alive when replacing the starting household, and recovers legacy missing heads once', () => {
    const s = createWorld(31),
      house = scenarioHouses(s, 'mars', 'viceroy')[0];
    startGame(s, { clanId: house.id, ruler: rollRuler(31, 'mars', 'F'), focus: 'dip', scenario: 'viceroy' });
    for (const clan of Object.values(s.clans)) expect(s.characters[clan.headId]).toBeTruthy();
    const foreign = Object.values(s.clans).find((c) => c.id !== s.playerClanId)!;
    delete s.characters[foreign.headId];
    migrate(s);
    expect(s.characters[foreign.headId]).toBeTruthy();
    expect(migrate(structuredClone(s))).toEqual(s);
  });
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
