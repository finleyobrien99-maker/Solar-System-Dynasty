/// <reference types="node" />
// Performance budget check (ROADMAP §0.4): grow an uncapped dynasty as fast as
// it will go (the Breeder bot, plus half of all single adults married off each
// cycle) and measure, at each size checkpoint:
//   - Age Up: the yearly tick (median of 5)
//   - act(): the full-state copy the UI makes on every click
//   - the autosave: writeSave() for real, against an in-memory localStorage
//
//   npm run bench
//   npm run bench -- --sizes 500,2000 --seed 7
//   npm run bench -- --dump big.json   (also writes the final state, for profiling)
//
// Budget: a 10k-member dynasty ages up in under 100ms on a mid phone, and the
// compressed save stays under 2MB. Phones are several times slower than a
// desktop, so treat these numbers as a floor.

import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { balanceGame } from '../src/game/balance';
import { answerPending, BOTS } from '../src/game/bots';
import { ageOf, dynastyMembers } from '../src/game/core';
import { acceptSuitor, canSeekSpouse, generateSuitors } from '../src/game/family';
import { chance, type Seeded } from '../src/game/rng';
import { writeSave } from '../src/game/save';
import { ageUp } from '../src/game/tick';
import type { GameState } from '../src/game/types';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const sizes = arg('sizes', '500,2000,10000').split(',').map(Number);
const seed = Number(arg('seed', '7'));
const maxCycles = Number(arg('max-cycles', '400'));
const dump = arg('dump', '');

// An in-memory stand-in for the browser's localStorage, so writeSave runs for real.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const time = (f: () => void) => {
  const t = performance.now();
  f();
  return performance.now() - t;
};
const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const kb = (chars: number, bytesPerChar: number) => Math.round((chars * bytesPerChar) / 1024);

/** Marry off half the single adults, free suitors only: the sprawling-dynasty stress case. */
function sprawl(s: GameState, rng: Seeded): void {
  for (const c of dynastyMembers(s)) {
    if (ageOf(s, c) < 18 || ageOf(s, c) > 40 || canSeekSpouse(s, c) || !chance(rng, 0.5)) continue;
    generateSuitors(s, c.id);
    const free = s.suitors?.list.findIndex((x) => x.prestigeCost === 0) ?? -1;
    if (free >= 0) acceptSuitor(s, free);
  }
}

function cycle(s: GameState, rng: Seeded): number {
  answerPending(s, rng);
  BOTS.breeder.turn(s, rng);
  sprawl(s, rng);
  answerPending(s, rng);
  return time(() => ageUp(s));
}

const s = balanceGame(seed);
s.dynasty.growth = 'uncapped';
const rng: Seeded = { seed };
let cycles = 0;
const rows: string[] = [];

for (const target of sizes) {
  while (dynastyMembers(s).length < target && cycles < maxCycles && !s.gameOver) {
    cycle(s, rng);
    cycles++;
  }
  if (s.gameOver || dynastyMembers(s).length < target) {
    rows.push(`| ${target} | not reached (${dynastyMembers(s).length} after ${cycles} cycles${s.gameOver ? ', dynasty ended' : ''}) | | | | | | |`);
    break;
  }
  const living = dynastyMembers(s).length;
  const all = Object.keys(s.characters).length;
  const ticks = Array.from({ length: 5 }, () => cycle(s, rng));
  cycles += 5;
  const clone = median(Array.from({ length: 5 }, () => time(() => structuredClone(s))));
  const save = () => {
    const res = writeSave('auto', s);
    if (!res.ok) throw new Error(res.error);
  };
  save(); // the first write has no previous save to rotate into the backup
  const autosave = median(Array.from({ length: 3 }, () => time(save)));
  const saved = store.get('solar-dynasty:auto')!.length;
  rows.push(
    `| ${living} | ${all} | ${cycles} | ${median(ticks).toFixed(1)} | ${clone.toFixed(1)} | ${autosave.toFixed(0)} | ${kb(JSON.stringify(s).length, 1)} | ${kb(saved, 2)} |`,
  );
  console.log(`checkpoint ${target}: done at cycle ${cycles}`);
}

console.log(`
Seed ${seed}, Breeder bot plus forced sprawl, uncapped growth. Times in ms on this machine.

| Living dynasty | All characters | Cycle | Age Up (median) | act() copy | Autosave | State JSON KB | Saved KB |
|---|---|---|---|---|---|---|---|
${rows.join('\n')}

Budget (ROADMAP §0.4): 10k members age up in < 100ms on a mid phone; compressed save < 2MB (2048 KB).`);

if (dump) {
  writeFileSync(dump, JSON.stringify(s));
  console.log(`State written to ${dump}`);
}
