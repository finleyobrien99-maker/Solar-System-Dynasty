import { beforeAll, describe, expect, it } from 'vitest';
import { checkTargets, markdown, playRun, runsCsv, seriesCsv, type RunResult } from './balance';
import { BOTS, type BotId } from './bots';
import { createCharacter } from './character';
import { ruler } from './core';
import { goalWorld } from './warGoalScenarios';

describe('balance harness', () => {
  const ids = Object.keys(BOTS) as BotId[];
  let runs: Record<BotId, RunResult>;
  beforeAll(() => {
    runs = Object.fromEntries(ids.map((b) => [b, playRun(b, 3, 40)])) as Record<BotId, RunResult>;
  });

  it('plays every bot with sane numbers', () => {
    for (const r of Object.values(runs)) {
      expect(r.cycles).toBeGreaterThan(0);
      for (const v of [r.end.credits, r.end.fleet, r.end.prestige, r.end.dynasty]) expect(Number.isFinite(v)).toBe(true);
      expect(r.samples[0].cycle).toBe(0);
    }
  });

  it('is repeatable: the same seed plays the same game', () => {
    expect(playRun('warmonger', 3, 40)).toEqual(runs.warmonger);
  });

  it('bots play to their strategy', () => {
    expect(runs.warmonger.battlesWon + runs.warmonger.battlesLost).toBeGreaterThan(0);
    // Test the strategy's actual choices. Births and survival belong in the many-seed balance report.
    const s = goalWorld(),
      parent = ruler(s);
    const children = [18, 19, 20].map((age) => {
      const c = createCharacter(s, {
        gender: 'M',
        born: s.year - age,
        clanId: s.playerClanId,
        planetId: 'mars',
        faithId: parent.faithId,
        motherId: parent.id,
        fatherId: parent.spouseId,
        adultExtras: true,
      });
      parent.childrenIds.push(c.id);
      return c.id;
    });
    const passive = structuredClone(s),
      breeder = structuredClone(s);
    BOTS.passive.turn(passive, { seed: 3 });
    BOTS.breeder.turn(breeder, { seed: 3 });
    const matched = (state: typeof s) => children.filter((id) => !!state.characters[id].spouseId || !!state.characters[id].betrothedId).length;
    expect(matched(passive)).toBeLessThanOrEqual(1);
    expect(matched(breeder)).toBe(3);
  });

  it('writes a report row per run and per sample', () => {
    const all = Object.values(runs);
    expect(runsCsv(all).trim().split('\n')).toHaveLength(all.length + 1);
    expect(seriesCsv(all).trim().split('\n')).toHaveLength(all.reduce((a, r) => a + r.samples.length, 0) + 1);
    expect(markdown(all, 40)).toContain('## Targets');
    // Targets that need longer runs are reported as unjudged, not failed.
    expect(checkTargets(all, 40).find((t) => t.target.startsWith('Passive'))?.ok).toBeNull();
  });
});
