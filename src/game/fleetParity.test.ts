import { describe, expect, it } from 'vitest';
import { clanRank, clanRegions, vassalsOf } from './core';
import { AI_FLEET_PARITY, createWorld, fleetTarget } from './world';

describe('AI fleets grow towards the cap you would have for the same lands', () => {
  it('closes AI_FLEET_PARITY of the gap between the old levy and your cap, never less than the levy', () => {
    const s = createWorld(5);
    let checked = 0;
    for (const k of Object.values(s.clans)) {
      const regions = clanRegions(s, k.id);
      if (!regions.length) {
        expect(fleetTarget(s, k.id)).toBe(0);
        continue;
      }
      const devs = regions.reduce((a, r) => a + r.dev, 0);
      const rank = clanRank(s, k.id);
      const levy = 18 + regions.length * 16 + devs * 2.5 + (rank >= 3 ? 40 : 0) + vassalsOf(s, k.id).length * 5;
      const cap = 60 + regions.length * 35 + rank * 40;
      expect(fleetTarget(s, k.id)).toBe(Math.round(levy + AI_FLEET_PARITY * Math.max(0, cap - levy)));
      expect(fleetTarget(s, k.id)).toBeGreaterThanOrEqual(Math.round(levy));
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
    expect(AI_FLEET_PARITY).toBe(0.4);
  });
});
