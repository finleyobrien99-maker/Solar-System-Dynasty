/// <reference types="node" />
// The balance harness CLI (ROADMAP §17). Plays seeded games with each bot and
// writes runs.csv, series.csv, runs.json and summary.md.
//
//   npm run balance
//   npm run balance -- --runs 20 --cycles 250 --bots builder,warmonger --out balance-report
//
// Seeds 1..runs are shared by every bot, so bots are compared on the same worlds.

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { markdown, playRun, runsCsv, seriesCsv, type RunResult } from '../src/game/balance';
import { BOTS, type BotId } from '../src/game/bots';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const runs = Number(arg('runs', '10'));
const cycles = Number(arg('cycles', '200'));
const out = arg('out', 'balance-report');
const bots = arg('bots', Object.keys(BOTS).join(',')).split(',') as BotId[];
for (const b of bots) if (!BOTS[b]) throw new Error(`Unknown bot "${b}". Try: ${Object.keys(BOTS).join(', ')}`);

const results: RunResult[] = [];
const started = Date.now();
for (const bot of bots) {
  for (let seed = 1; seed <= runs; seed++) {
    const t = Date.now();
    const r = playRun(bot, seed, cycles);
    results.push(r);
    const fate = r.gameOver ? `ended at cycle ${r.gameOverCycle}` : `rank ${r.end.rank}, dynasty ${r.end.dynasty}, grade ${r.end.grade}`;
    console.log(`${BOTS[bot].name.padEnd(9)} seed ${String(seed).padStart(3)} (${r.planet}): ${fate} [${Date.now() - t}ms]`);
  }
}

mkdirSync(out, { recursive: true });
const md = markdown(results, cycles);
writeFileSync(join(out, 'summary.md'), md);
writeFileSync(join(out, 'runs.csv'), runsCsv(results));
writeFileSync(join(out, 'series.csv'), seriesCsv(results));
writeFileSync(join(out, 'runs.json'), JSON.stringify(results, null, 1));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);

console.log(`\n${md}`);
console.log(`${results.length} runs in ${((Date.now() - started) / 1000).toFixed(1)}s. Reports in ${out}/`);
