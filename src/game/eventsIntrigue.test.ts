import { learnSecret, recordAffair } from './secrets';
import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { alive, ch, clanRegions, ruler } from './core';
import { buildCtx, EVENT_BY_ID, queueEvent } from './events';
import { INTRIGUE_EVENTS } from './eventsIntrigue';
import { addFeeling } from './relations';
import type { Character, Clan, GameState, Pending } from './types';
import { createWorld, rollRuler, startGame } from './world';

function court(): GameState {
  const s = createWorld(61);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(61, 'mars', 'M', 'Oren'), focus: 'dip', age: 40, family: 'married' });
  Object.assign(s, { credits: 2000, prestige: 300 });
  return s;
}

function aiHouse(s: GameState): [Clan, Character] {
  const k = Object.values(s.clans).find((x) => !x.isPlayer && clanRegions(s, x.id).length && alive(ch(s, x.headId)))!;
  const h = s.characters[k.headId];
  h.born = Math.min(h.born, s.year - 40);
  return [k, h];
}

const SETUP: Record<string, (s: GameState) => void> = {
  blackmail_letter: (s) => {
    const lover = createCharacter(s, { gender: 'F', born: s.year - 30, clanId: aiHouse(s)[0].id, planetId: 'venus', adultExtras: true });
    ruler(s).loverId = lover.id;
    const [k, h] = aiHouse(s);
    h.traits.push('greedy');
    k.opinion = -40;
    const secret = recordAffair(s, ruler(s), lover)[0];
    learnSecret(s, secret.id, h.id);
  },
  seducer: (s) => {
    const sp = s.characters[ruler(s).spouseId!];
    addFeeling(s, sp.id, s.rulerId, { why: 'Neglect', value: -60, decay: 0 });
    const [, h] = aiHouse(s);
    h.traits.push('lustful');
    h.gender = sp.gender === 'M' ? 'F' : 'M';
  },
};

describe('AI lords use your own tools on you', () => {
  for (const def of INTRIGUE_EVENTS) {
    it(`${def.id}: fires in its situation and every option resolves`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const s = court();
        SETUP[def.id](s);
        s.seed = seed * 7919;
        expect(!def.when || def.when(s), `${def.id} should fire`).toBe(true);
        expect(queueEvent(s, def)).toBe(true);
        const p = s.pending[s.pending.length - 1] as Extract<Pending, { kind: 'event' }>;
        expect(def.text(buildCtx(s, p))).not.toMatch(/undefined|NaN/);
        def.choices.forEach((choice, i) => {
          const t = structuredClone(s);
          const ctx = buildCtx(t, t.pending[t.pending.length - 1] as typeof p);
          const before = JSON.stringify(t);
          expect(choice.describe(ctx), `${def.id} #${i}`).not.toMatch(/undefined|NaN|someone/);
          expect(JSON.stringify(t)).toBe(before);
          if (choice.available && !choice.available(ctx)) return;
          expect(choice.run(ctx)).not.toMatch(/undefined|NaN/);
        });
      }
    });
  }

  it('paying a blackmailer moves your money into their treasury', () => {
    const s = court();
    SETUP.blackmail_letter(s);
    const def = EVENT_BY_ID.blackmail_letter;
    queueEvent(s, def);
    const ctx = buildCtx(s, s.pending[s.pending.length - 1] as Extract<Pending, { kind: 'event' }>);
    const theirs = s.clans[ctx.subject!.clanId];
    const [mine, before] = [s.credits, theirs.credits];
    def.choices[0].run(ctx);
    const amount = Number(ctx.data.amount);
    expect(s.credits).toBe(mine - amount);
    expect(theirs.credits).toBe(before + amount);
    expect(s.hooks).toBeDefined();
    expect(s.hooks.find((x) => x.id === ctx.data.hookId)?.usedYear).toBe(s.year);
    expect(def.when!(s)).toBe(false);
  });

  it('a seducer really takes up with your spouse, and forgiving ends it', () => {
    const s = court();
    SETUP.seducer(s);
    const def = EVENT_BY_ID.seducer;
    queueEvent(s, def);
    const sp = s.characters[ruler(s).spouseId!];
    const ctx = buildCtx(s, s.pending[s.pending.length - 1] as Extract<Pending, { kind: 'event' }>);
    expect(sp.loverId).toBe(ctx.subject!.id);
    def.choices[2].run(ctx);
    expect(sp.loverId).toBeUndefined();
  });

  it('a botched killing leaves their house with a grave grudge', () => {
    let done = false;
    for (let seed = 1; seed < 100 && !done; seed++) {
      const s = court();
      SETUP.blackmail_letter(s);
      s.seed = seed;
      const def = EVENT_BY_ID.blackmail_letter;
      queueEvent(s, def);
      const ctx = buildCtx(s, s.pending[s.pending.length - 1] as Extract<Pending, { kind: 'event' }>);
      def.choices[2].run(ctx);
      if (alive(ctx.subject)) {
        done = true;
        const k = s.clans[ctx.subject!.clanId];
        expect(k.memories!.some((m) => m.grave && m.text.startsWith('Sent an assassin'))).toBe(true);
      }
    }
    expect(done).toBe(true);
  });
});
