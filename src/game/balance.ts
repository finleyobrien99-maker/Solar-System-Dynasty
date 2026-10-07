// The balance harness (ROADMAP §17): play many seeded games with strategy
// bots and measure how the game actually plays. Pure engine code; the CLI in
// scripts/balance.ts runs it and writes the reports.

import { unitedUntil } from './realmDefence';
import type { RealmCallAnswer } from './diplomacyTypes';
import { BOTS, answerPending, type BotId } from './bots';
import { ageOf, clanRank, dynastyMembers } from './core';
import { bloodlineScore } from './genetics';
import { PLANETS } from './planets';
import type { Seeded } from './rng';
import { ageUp } from './tick';
import type { GameState } from './types';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';

export interface Sample {
  cycle: number;
  year: number;
  rank: number;
  credits: number;
  fleet: number;
  prestige: number;
  dynasty: number;
  grade: string;
}

export interface RunResult {
  bot: BotId;
  seed: number;
  planet: string;
  cycles: number; // cycles actually played
  gameOver?: string;
  gameOverCycle?: number;
  /** First cycle at which each rank was held (2 Viceroy, 3 Sovereign, 4 Solar Emperor). */
  reached: Partial<Record<2 | 3 | 4, number>>;
  peakRank: number;
  end: Sample;
  samples: Sample[];
  rulers: number;
  avgReign: number;
  avgRulerLifespan: number;
  battlesWon: number;
  battlesLost: number;
  deaths: Record<string, number>; // causes of death in the dynasty
  events: Record<string, number>; // event id -> times answered
  /** Realm calls in every war of the run, AI wars included (realmDefence.ts): answers by kind, counted once per war. */
  realm: { accepted: number; refused: number; blocked: number; pending: number; unities: number };
  /** Treaties signed anywhere in the run (AI with AI and with you), each counted once. */
  treaties: number;
}

const GRADES = ['-', 'F', 'D', 'C', 'B', 'A', 'S'];
const gradeRank = (g: string) => GRADES.indexOf(g);

/** A Governor start (the §17 baseline) on a world that rotates with the seed. */
export function balanceGame(seed: number, planet = PLANETS[seed % PLANETS.length].id): GameState {
  if (!PLANETS.some((p) => p.id === planet)) throw new Error(`Unknown starting realm: ${planet}`);
  const w = createWorld(seed);
  const clan = scenarioHouses(w, planet, 'governor')[0];
  return startGame(w, { clanId: clan.id, ruler: rollRuler(seed, planet, seed % 2 ? 'M' : 'F'), focus: 'dip', scenario: 'governor' });
}

function sample(s: GameState, cycle: number): Sample {
  return {
    cycle,
    year: s.year,
    rank: clanRank(s, s.playerClanId),
    credits: Math.round(s.credits),
    fleet: s.fleet,
    prestige: Math.round(s.prestige),
    dynasty: dynastyMembers(s).length,
    grade: bloodlineScore(s).grade,
  };
}

/** Play one game with one bot. `every` sets how often (in cycles) to sample. */
export function playRun(bot: BotId, seed: number, cycles: number, every = 10, planetId?: string): RunResult {
  const s = balanceGame(seed, planetId);
  const rng: Seeded = { seed: seed * 7919 + 17 };
  const events: Record<string, number> = {};
  const onEvent = (id: string) => (events[id] = (events[id] ?? 0) + 1);
  const reached: RunResult['reached'] = {};
  const samples = [sample(s, 0)];
  const realm: RunResult['realm'] = { accepted: 0, refused: 0, blocked: 0, pending: 0, unities: 0 };
  const counted = new Map<string, RealmCallAnswer['answer']>();
  const unitySeen = new Map<string, number>();
  const countRealm = () => {
    for (const w of [...s.wars, ...s.aiWars])
      for (const a of w.realmCalls ?? []) {
        const key = w.id + ':' + a.clanId,
          old = counted.get(key);
        if (old === a.answer) continue;
        if (old) realm[old]--;
        realm[a.answer]++;
        counted.set(key, a.answer);
      }
    for (const p of PLANETS) {
      const until = unitedUntil(s, p.id);
      if (until !== undefined && unitySeen.get(p.id) !== until) {
        realm.unities++;
        unitySeen.set(p.id, until);
      }
    }
  };
  const signed = new Set<string>();
  let cycle = 0;
  while (cycle < cycles && !s.gameOver) {
    answerPending(s, rng, onEvent);
    if (s.gameOver) break;
    BOTS[bot].turn(s, rng);
    countRealm();
    answerPending(s, rng, onEvent);
    countRealm();
    ageUp(s);
    countRealm();
    for (const t of s.diplomacy?.treaties ?? []) signed.add(t.id);
    cycle++;
    const rank = clanRank(s, s.playerClanId);
    for (const k of [2, 3, 4] as const) if (rank >= k) reached[k] ??= cycle;
    if (cycle % every === 0) samples.push(sample(s, cycle));
  }
  if (!s.gameOver) answerPending(s, rng, onEvent);
  countRealm();

  const rulerChars = s.dynasty.rulers.map((r) => ({ r, c: s.characters[r.id] }));
  const reigns = s.dynasty.rulers.filter((r) => r.to !== undefined).map((r) => r.to! - r.from);
  const lifespans = rulerChars.filter(({ c }) => c?.died !== undefined).map(({ c }) => ageOf(s, c!));
  const deaths: Record<string, number> = {};
  for (const c of dynastyMembers(s, true)) {
    if (c.died === undefined || c.died <= s.startYear) continue;
    // Group causes across runs: 'assassinated by agents of House Moreau' -> '... of a rival house'.
    const cause = (c.deathCause ?? 'unknown').replace(/House [A-Z][\w'-]*/g, 'a rival house');
    deaths[cause] = (deaths[cause] ?? 0) + 1;
  }

  return {
    bot,
    seed,
    planet: s.clans[s.playerClanId].planetId,
    cycles: cycle,
    gameOver: s.gameOver?.reason,
    gameOverCycle: s.gameOver ? s.gameOver.year - s.startYear : undefined,
    reached,
    peakRank: s.stats.peakRank,
    end: sample(s, cycle),
    samples,
    rulers: s.dynasty.rulers.length,
    avgReign: mean(reigns),
    avgRulerLifespan: mean(lifespans),
    battlesWon: s.stats.battlesWon,
    battlesLost: s.stats.battlesLost,
    deaths,
    events,
    realm,
    treaties: signed.size,
  };
}

// ── Summaries ─────────────────────────────────────────────────────────────

function mean(xs: number[]): number {
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const v = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : NaN);
const at = (r: RunResult, cycle: number) => r.samples.find((x) => x.cycle === cycle);

function medianGrade(gs: string[]): string {
  if (!gs.length) return 'n/a';
  return GRADES[Math.round(median(gs.map(gradeRank)))];
}

function eventStats(runs: RunResult[]) {
  const counts: Record<string, number> = {};
  for (const r of runs) for (const [id, n] of Object.entries(r.events)) counts[id] = (counts[id] ?? 0) + n;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const [topEvent, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? ['-', 0];
  const cycles = runs.reduce((a, r) => a + r.cycles, 0);
  return {
    total,
    distinct: Object.keys(counts).length,
    perCycle: cycles ? Math.round((total / cycles) * 100) / 100 : 0,
    topEvent,
    topShare: pct(topCount, total),
  };
}

export interface BotSummary {
  bot: BotId;
  runs: number;
  medianCycles: number;
  gameOverBy100: number; // % of runs
  viceroyBy150: number;
  sovereignBy150: number;
  emperorBy250: number;
  creditsAt20: number;
  creditsAtEnd: number;
  dynastyAtEnd: number;
  rulers: number;
  avgReign: number;
  avgRulerLifespan: number;
  battlesWon: number;
  battlesLost: number;
  gradeAt50: string;
  bestGradeBy150: string;
  eventsPerCycle: number;
  topEvent: string;
  topEventShare: number;
  /** Mean realm answers per run: accepted / refused / blocked. */
  realmCalls: string;
  unitedWorlds: number;
  /** Mean treaties signed per run. */
  treaties: number;
}

export function summariseBot(bot: BotId, runs: RunResult[]): BotSummary {
  const ev = eventStats(runs);
  const by = (k: 2 | 3 | 4, cycle: number) => pct(runs.filter((r) => (r.reached[k] ?? Infinity) <= cycle).length, runs.length);
  return {
    bot,
    runs: runs.length,
    medianCycles: median(runs.map((r) => r.cycles)),
    gameOverBy100: pct(runs.filter((r) => r.gameOverCycle !== undefined && r.gameOverCycle <= 100).length, runs.length),
    viceroyBy150: by(2, 150),
    sovereignBy150: by(3, 150),
    emperorBy250: by(4, 250),
    creditsAt20: median(runs.flatMap((r) => at(r, 20)?.credits ?? [])),
    creditsAtEnd: median(runs.map((r) => r.end.credits)),
    dynastyAtEnd: median(runs.map((r) => r.end.dynasty)),
    rulers: mean(runs.map((r) => r.rulers)),
    avgReign: mean(runs.map((r) => r.avgReign).filter(Boolean)),
    avgRulerLifespan: mean(runs.map((r) => r.avgRulerLifespan).filter(Boolean)),
    battlesWon: median(runs.map((r) => r.battlesWon)),
    unitedWorlds: mean(runs.map((r) => r.realm?.unities ?? 0)),
    realmCalls: (['accepted', 'refused', 'blocked'] as const).map((k) => mean(runs.map((r) => r.realm?.[k] ?? 0))).join(' / '),
    treaties: mean(runs.map((r) => r.treaties ?? 0)),
    battlesLost: median(runs.map((r) => r.battlesLost)),
    gradeAt50: medianGrade(runs.flatMap((r) => at(r, 50)?.grade ?? [])),
    bestGradeBy150: GRADES[Math.max(0, ...runs.flatMap((r) => r.samples.filter((x) => x.cycle <= 150).map((x) => gradeRank(x.grade))))],
    eventsPerCycle: ev.perCycle,
    topEvent: ev.topEvent,
    topEventShare: ev.topShare,
  };
}

export interface TargetCheck {
  target: string;
  actual: string;
  /** null when the run was too short (or lacked the bot) to judge. */
  ok: boolean | null;
}

/** The §17 targets for Standard mode, Governor start. */
export function checkTargets(runs: RunResult[], cycles: number): TargetCheck[] {
  const of = (bot: BotId) => runs.filter((r) => r.bot === bot);
  const out: TargetCheck[] = [];
  const add = (target: string, need: number, has: boolean, actual: () => string, ok: () => boolean) =>
    out.push(
      cycles < need || !has ? { target, actual: `n/a (needs ${need} cycles${has ? '' : ' and the bot'})`, ok: null } : { target, actual: actual(), ok: ok() },
    );

  const over = (bot: BotId) => summariseBot(bot, of(bot)).gameOverBy100;
  add(
    'Passive: dynasty ends within 100 cycles in 5–15% of runs',
    100,
    !!of('passive').length,
    () => `${over('passive')}%`,
    () => over('passive') >= 5 && over('passive') <= 15,
  );
  add(
    'Breeder: dynasty ends within 100 cycles in under 5% of runs',
    100,
    !!of('breeder').length,
    () => `${over('breeder')}%`,
    () => over('breeder') < 5,
  );

  const sov = (bot: BotId) => summariseBot(bot, of(bot)).sovereignBy150;
  add(
    'Builder: about 30% reach Sovereign by cycle 150',
    150,
    !!of('builder').length,
    () => `${sov('builder')}%`,
    () => Math.abs(sov('builder') - 30) <= 15,
  );
  add(
    'Warmonger: about 50% reach Sovereign by cycle 150',
    150,
    !!of('warmonger').length,
    () => `${sov('warmonger')}%`,
    () => Math.abs(sov('warmonger') - 50) <= 15,
  );

  const skilled = runs.filter((r) => r.bot !== 'passive');
  const throne = pct(skilled.filter((r) => (r.reached[4] ?? Infinity) <= 250).length, skilled.length);
  add(
    'About 10% of skilled runs take the Solar Throne by cycle 250',
    250,
    !!skilled.length,
    () => `${throne}%`,
    () => throne >= 5 && throne <= 20,
  );

  const g50 = medianGrade(runs.flatMap((r) => at(r, 50)?.grade ?? []));
  add(
    'Bloodline grade is C at 50 cycles (median, all bots)',
    50,
    !!runs.length,
    () => g50,
    () => g50 === 'C',
  );
  const breederA = of('breeder').some((r) => r.samples.some((x) => x.cycle <= 150 && gradeRank(x.grade) >= gradeRank('A')));
  add(
    'A Breeder can reach grade A by cycle 150',
    150,
    !!of('breeder').length,
    () => (breederA ? 'yes' : 'no'),
    () => breederA,
  );
  const nonForgeS = runs.filter((r) => r.bot !== 'breeder' && r.samples.some((x) => x.grade === 'S'));
  add(
    'Grade S only with the Forge (no non-Breeder run hits S)',
    1,
    !!runs.length,
    () => `${nonForgeS.length} runs hit S`,
    () => nonForgeS.length === 0,
  );

  const c20 = median(runs.flatMap((r) => at(r, 20)?.credits ?? []));
  const c200 = median(runs.flatMap((r) => at(r, 200)?.credits ?? []));
  const ratio = Math.round((c200 / Math.max(1, c20)) * 10) / 10;
  add(
    'Median credits at cycle 200 under 20× cycle 20',
    200,
    !!runs.length,
    () => `${c20} → ${c200} (${ratio}×)`,
    () => ratio < 20,
  );
  const dyn200 = median(runs.flatMap((r) => at(r, 200)?.dynasty ?? []));
  add(
    'Uncapped dynasty at 200 cycles: hundreds to low thousands',
    200,
    !!runs.length,
    () => `median ${dyn200}`,
    () => dyn200 >= 100 && dyn200 <= 3000,
  );

  const ev = eventStats(runs);
  add(
    'At least one event per cycle on average',
    1,
    !!runs.length,
    () => `${ev.perCycle}`,
    () => ev.perCycle >= 1,
  );
  add(
    'No single event over 3% of all fired',
    1,
    !!runs.length,
    () => `${ev.topEvent} ${ev.topShare}% (${ev.distinct} distinct events)`,
    () => ev.topShare <= 3,
  );
  return out;
}

// ── Reports ───────────────────────────────────────────────────────────────

function csv(rows: (string | number | undefined)[][]): string {
  const cell = (v: string | number | undefined) => {
    const t = v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? '' : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

export function runsCsv(runs: RunResult[]): string {
  const head = [
    'bot',
    'seed',
    'planet',
    'cycles',
    'game_over_cycle',
    'game_over',
    'viceroy_at',
    'sovereign_at',
    'emperor_at',
    'peak_rank',
    'rank',
    'credits',
    'fleet',
    'prestige',
    'dynasty',
    'grade',
    'rulers',
    'avg_reign',
    'avg_ruler_lifespan',
    'battles_won',
    'battles_lost',
  ];
  return csv([
    head,
    ...runs.map((r) => [
      r.bot,
      r.seed,
      r.planet,
      r.cycles,
      r.gameOverCycle,
      r.gameOver,
      r.reached[2],
      r.reached[3],
      r.reached[4],
      r.peakRank,
      r.end.rank,
      r.end.credits,
      r.end.fleet,
      r.end.prestige,
      r.end.dynasty,
      r.end.grade,
      r.rulers,
      r.avgReign,
      r.avgRulerLifespan,
      r.battlesWon,
      r.battlesLost,
    ]),
  ]);
}

export function seriesCsv(runs: RunResult[]): string {
  return csv([
    ['bot', 'seed', 'cycle', 'year', 'rank', 'credits', 'fleet', 'prestige', 'dynasty', 'grade'],
    ...runs.flatMap((r) => r.samples.map((x) => [r.bot, r.seed, x.cycle, x.year, x.rank, x.credits, x.fleet, x.prestige, x.dynasty, x.grade])),
  ]);
}

export function markdown(runs: RunResult[], cycles: number): string {
  const bots = [...new Set(runs.map((r) => r.bot))];
  const sums = bots.map((b) =>
    summariseBot(
      b,
      runs.filter((r) => r.bot === b),
    ),
  );
  const n = (v: number) => (Number.isNaN(v) ? '–' : String(v));
  const lines = [
    `# Balance report`,
    '',
    `${runs.length} runs, up to ${cycles} cycles each, Governor start, Standard rules.`,
    '',
    '## Targets (ROADMAP §17)',
    '',
    '| | Target | Actual |',
    '|---|---|---|',
    ...checkTargets(runs, cycles).map((t) => `| ${t.ok === null ? '➖' : t.ok ? '✅' : '❌'} | ${t.target} | ${t.actual} |`),
    '',
    '## By bot',
    '',
    '| | ' + sums.map((x) => BOTS[x.bot].name).join(' | ') + ' |',
    '|---|' + sums.map(() => '---').join('|') + '|',
  ];
  const row = (label: string, f: (x: BotSummary) => string | number) =>
    lines.push(`| ${label} | ${sums.map((x) => (typeof f(x) === 'number' ? n(f(x) as number) : f(x))).join(' | ')} |`);
  row('Runs', (x) => x.runs);
  row('Median cycles survived', (x) => x.medianCycles);
  row('Dynasty ended by 100 (%)', (x) => x.gameOverBy100);
  row('Viceroy by 150 (%)', (x) => x.viceroyBy150);
  row('Sovereign by 150 (%)', (x) => x.sovereignBy150);
  row('Solar Emperor by 250 (%)', (x) => x.emperorBy250);
  row('Median credits at 20', (x) => x.creditsAt20);
  row('Median credits at end', (x) => x.creditsAtEnd);
  row('Median living dynasty at end', (x) => x.dynastyAtEnd);
  row('Rulers per run (mean)', (x) => x.rulers);
  row('Reign length (mean)', (x) => x.avgReign);
  row('Ruler lifespan (mean)', (x) => x.avgRulerLifespan);
  row('Battles won / lost (median)', (x) => `${n(x.battlesWon)} / ${n(x.battlesLost)}`);
  row('Bloodline grade at 50 (median)', (x) => x.gradeAt50);
  row('Best grade by 150', (x) => x.bestGradeBy150);
  row('Events per cycle', (x) => x.eventsPerCycle);
  row('Most common event', (x) => `${x.topEvent} (${n(x.topEventShare)}%)`);
  row('Realm calls answered / refused / blocked (mean)', (x) => x.realmCalls);
  row('Treaties signed per run (mean)', (x) => x.treaties);
  row('Worlds united after actual foreign conquest (mean)', (x) => x.unitedWorlds);

  const deaths: Record<string, number> = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.deaths)) deaths[k] = (deaths[k] ?? 0) + v;
  const totalDeaths = Object.values(deaths).reduce((a, b) => a + b, 0);
  lines.push('', '## Top causes of death in the dynasty', '', '| Cause | Share |', '|---|---|');
  for (const [k, v] of Object.entries(deaths)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8))
    lines.push(`| ${k} | ${pct(v, totalDeaths)}% |`);

  const ends: Record<string, number> = {};
  for (const r of runs)
    if (r.gameOver)
      ends[r.gameOver.replace(/^.*?(died with no heir|lost every last region).*$/, '$1')] =
        (ends[r.gameOver.replace(/^.*?(died with no heir|lost every last region).*$/, '$1')] ?? 0) + 1;
  if (Object.keys(ends).length) {
    lines.push('', '## How dynasties ended', '', '| Reason | Runs |', '|---|---|');
    for (const [k, v] of Object.entries(ends).sort((a, b) => b[1] - a[1])) lines.push(`| ${k} | ${v} |`);
  }
  return lines.join('\n') + '\n';
}
