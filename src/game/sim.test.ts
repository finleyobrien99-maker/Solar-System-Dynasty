import { setImmediate } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { clanRegions, dynastyMembers, ruler, setOwner } from './core';
import { acceptSuitor, generateSuitors } from './family';
import { inheritGenetics } from './genetics';
import { chance, type Seeded } from './rng';
import { exportSave, importSave } from './save';
import { botTurn, checkInvariants, drain } from './testkit';
import { ageUp } from './tick';
import type { Character, GameState } from './types';
import { createWorld, rollRuler, startGame } from './world';

// Long synchronous simulations must let the worker receive progress replies between tests.
// Otherwise a whole file can exceed the runner RPC deadline even though every assertion passes.
afterEach(() => setImmediate());

function newGame(seed: number, growth: 'capped' | 'uncapped' = 'uncapped'): GameState {
  const s = createWorld(seed);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  return startGame(s, { clanId: clan.id, ruler: rollRuler(seed, 'mars', 'F', 'Tess'), focus: 'cmd', growth });
}

describe('long simulation', () => {
  const runs: [number, 'capped' | 'uncapped'][] = [
    [1, 'uncapped'],
    [42, 'uncapped'],
    [1337, 'capped'],
    [9001, 'capped'],
  ];
  for (const [seed, growth] of runs) {
    it(`survives 200 cycles (seed ${seed}, ${growth})`, { timeout: 120000 }, () => {
      const s = newGame(seed, growth);
      const bot: Seeded = { seed: seed * 7 };
      let years = 0;
      for (; years < 200 && !s.gameOver; years++) {
        drain(s, bot);
        if (s.gameOver) break;
        botTurn(s, bot);
        drain(s, bot);
        ageUp(s);
        checkInvariants(s);
      }
      const json = exportSave(s);
      const back = importSave(json);
      expect(back.year).toBe(s.year);
      // eslint-disable-next-line no-console
      console.log(
        `seed ${seed} (${growth}): ${years} cycles, year ${s.year}, rulers ${s.dynasty.rulers.length}, chars ${Object.keys(s.characters).length}, living dynasty ${dynastyMembers(s).length}, regions ${clanRegions(s, s.playerClanId).length}, save ${Math.round(json.length / 1024)}KB, over: ${s.gameOver?.reason ?? 'no'}`,
      );
    });
  }
});

describe('dynasty growth', () => {
  it('capped mode keeps the dynasty smaller than uncapped', { timeout: 120000 }, () => {
    const sizes: Record<string, number> = {};
    for (const growth of ['capped', 'uncapped'] as const) {
      const s = newGame(77, growth);
      // Compare birth caps over equal lifetimes; conquest must not stop one population early.
      for (const region of Object.values(s.regions)) setOwner(s, region, s.playerClanId);
      const bot: Seeded = { seed: 5 };
      for (let y = 0; y < 150 && !s.gameOver; y++) {
        drain(s, bot);
        const r = ruler(s);
        if (!r.spouseId && s.year - r.born >= 18) {
          generateSuitors(s, r.id);
          acceptSuitor(
            s,
            s.suitors!.list.findIndex((x) => x.prestigeCost <= s.prestige),
          );
        }
        for (const kid of dynastyMembers(s)) {
          if (kid.id !== r.id && !kid.spouseId && !kid.betrothedId && s.year - kid.born >= 16 && chance(bot, 0.3)) {
            generateSuitors(s, kid.id);
            acceptSuitor(s, 0);
          }
        }
        s.credits = Math.max(s.credits, 500);
        drain(s, bot);
        ageUp(s);
      }
      expect(s.gameOver).toBeUndefined();
      expect(s.year).toBe(s.startYear + 150);
      sizes[growth] = dynastyMembers(s).length;
    }
    // eslint-disable-next-line no-console
    console.log('dynasty sizes after 150 cycles', sizes);
    expect(sizes.capped).toBeLessThan(sizes.uncapped);
    expect(sizes.capped).toBeLessThanOrEqual(75);
  });
});

describe('gene vault', () => {
  it('locked traits are always inherited and purged ones never', () => {
    const s = newGame(5);
    const mk = (traits: string[]) => ({ traits }) as unknown as Character;
    const rng: Seeded = { seed: 3 };
    for (let i = 0; i < 300; i++) {
      const kid = inheritGenetics(rng, mk(['slow', 'gene_rot']), mk(['gene_rot']), { locked: ['genius'], purged: ['gene_rot'] });
      expect(kid).toContain('genius');
      expect(kid).not.toContain('slow');
      expect(kid).not.toContain('gene_rot');
    }
    expect(s.dynasty.slots).toBe(2);
  });

  it('two brilliant parents can produce a genius', () => {
    const rng: Seeded = { seed: 11 };
    const mk = (traits: string[]) => ({ traits }) as unknown as Character;
    let genius = 0;
    for (let i = 0; i < 2000; i++) if (inheritGenetics(rng, mk(['brilliant']), mk(['brilliant'])).includes('genius')) genius++;
    expect(genius).toBeGreaterThan(100);
  });
});
