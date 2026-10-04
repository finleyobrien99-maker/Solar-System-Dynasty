import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { clanRegions, effStats, ruler } from './core';
import { defineEvent, outcomeBounds, type OptionSpec, type Resource } from './dsl';
import { setFlag } from './eventKit';
import { buildCtx, EVENTS, queueEvent } from './events';
import type { EventCtx } from './eventKit';
import type { GameState, Pending } from './types';
import { createWorld, rollRuler, startGame } from './world';

function court(seed: number, rich: boolean): GameState {
  const s = createWorld(seed);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(seed, 'mars', seed % 2 ? 'M' : 'F', 'Ines'), focus: 'dip', age: 30 + seed * 3, family: 'kids' });
  const r = ruler(s);
  for (const age of [6, 12, 16]) r.childrenIds.push(createCharacter(s, { born: s.year - age, clanId: s.playerClanId, planetId: 'mars', motherId: r.id }).id);
  for (const k of Object.values(s.clans)) if (!k.isPlayer) k.opinion = -60;
  s.dynasty.rulers.unshift({ id: 'ghost', name: 'Old Varro', from: s.year - 40, to: s.year - 1, title: 'Governor of Somewhere' });
  Object.assign(s, rich ? { credits: 5000, fleet: 120, prestige: 500, faith: 500 } : { credits: 30, fleet: 6, prestige: 20, faith: 10 });
  return s;
}

const RESOURCES: Resource[] = ['credits', 'prestige', 'faith', 'fleet'];
const specOf = (c: unknown) => (c as { spec?: OptionSpec }).spec;
const dslEvents = EVENTS.filter((e) => e.choices.some(specOf));

describe('event DSL', () => {
  it('is used by the deck', () => {
    expect(dslEvents.length).toBeGreaterThanOrEqual(10);
  });

  it('every option does what its tooltip says, and only describing never changes anything', () => {
    let checked = 0;
    for (const def of dslEvents) {
      for (const rich of [true, false]) {
        for (let seed = 1; seed <= 12; seed++) {
          const s = court(seed % 4, rich);
          s.seed = seed * 104729;
          if (def.id === 'hatchling_grown') setFlag(s, 'hatchling', s.year, { keeper: ruler(s).childrenIds[0], pet: 'Pip' });
          if (def.id === 'loan_repaid' || def.id === 'loan_lost')
            setFlag(s, 'loan', s.year, { name: 'Tam', gender: 'M', ok: def.id === 'loan_repaid' ? 1 : 0 });
          if (def.when && !def.when(s)) continue;
          if (!queueEvent(s, def)) continue;
          def.choices.forEach((choice, i) => {
            const spec = specOf(choice);
            if (!spec) return;
            const t = structuredClone(s);
            const ctx: EventCtx = buildCtx(t, t.pending[t.pending.length - 1] as Extract<Pending, { kind: 'event' }>);
            if (choice.show && !choice.show(ctx)) return;
            if (choice.available && !choice.available(ctx)) {
              expect(choice.why?.(ctx), `${def.id} #${i} locked without a reason`).toBeTruthy();
              return;
            }
            const before = JSON.stringify(t);
            const tip = choice.describe!(ctx);
            expect(JSON.stringify(t), `${def.id} #${i}: describing changed the game`).toBe(before);
            expect(tip, `${def.id} #${i}`).not.toMatch(/undefined|NaN/);
            const bounds = outcomeBounds(ctx, spec.then);
            const was = Object.fromEntries(RESOURCES.map((k) => [k, t[k]]));
            choice.run(ctx);
            if (bounds === 'unknown') return;
            for (const k of RESOURCES) {
              const [lo, hi] = bounds[k] ?? [0, 0];
              const delta = t[k] - was[k];
              expect(delta, `${def.id} #${i} ${k} moved ${delta}, tooltip allows ${lo}..${hi}: "${tip}"`).toBeGreaterThanOrEqual(lo);
              expect(delta, `${def.id} #${i} ${k} moved ${delta}, tooltip allows ${lo}..${hi}: "${tip}"`).toBeLessThanOrEqual(hi);
            }
            checked++;
          });
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('writes tooltips with exact odds and gives the reason an option is locked', () => {
    const def = defineEvent({
      id: 'test',
      title: 'Test',
      icon: 'info',
      weight: 0,
      text: () => '',
      options: [
        {
          label: 'Gamble',
          needs: [
            { stat: 'int', min: 99 },
            { have: 'credits', n: 50 },
          ],
          then: {
            do: [{ lose: 'credits', n: 50 }],
            roll: { base: 0.3, per: { stat: 'dip', n: 0.05 } },
            pass: { do: [{ gain: 'credits', n: { roll: [100, 200] } }] },
            fail: { do: [{ trait: 'wounded', p: 0.5, or: 'scarred' }] },
          },
        },
      ],
    });
    const s = court(1, true);
    const r = ruler(s);
    r.base.dip = 6;
    r.traits = [];
    const ctx: EventCtx = { s, r, data: {} };
    // Odds use effective stats (traits, items, home world), as the old events did.
    const pct = Math.round(Math.min(1, 0.3 + 0.05 * effStats(s, r).dip) * 100);
    expect(def.choices[0].describe!(ctx)).toBe(`−50 credits, Diplomacy check (${pct}%): +100–200 credits · otherwise you gain Wounded or Scarred (50/50)`);
    expect(def.choices[0].available!(ctx)).toBe(false);
    expect(def.choices[0].why!(ctx)).toBe('Needs Intrigue 99');
  });
});
