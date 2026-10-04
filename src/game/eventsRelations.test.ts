import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { clanRegions, ruler } from './core';
import { buildCtx, EVENT_BY_ID, queueEvent } from './events';
import { RELATION_EVENTS } from './eventsRelations';
import { addFeeling, lovers, opinionOf, passedOver, relationOf, relationsTick } from './relations';
import { TRAITS } from './traits';
import type { Character, GameState, Pending } from './types';
import { createWorld, rollRuler, startGame } from './world';

function court(): GameState {
  const s = createWorld(31);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(31, 'mars', 'F', 'Ines'), focus: 'dip', age: 45, family: 'married' });
  Object.assign(s, { credits: 1000, prestige: 300, faith: 200, fleet: 50 });
  return s;
}

function kid(s: GameState, age: number): Character {
  const r = ruler(s);
  const c = createCharacter(s, { born: s.year - age, clanId: s.playerClanId, planetId: 'mars', motherId: r.id, faithId: r.faithId });
  r.childrenIds.push(c.id);
  return c;
}

function stranger(s: GameState, age = 40): Character {
  const k = Object.values(s.clans).find((x) => !x.isPlayer)!;
  return createCharacter(s, { born: s.year - age, clanId: k.id, planetId: k.planetId, faithId: k.faithId, adultExtras: true });
}

/** Make each event's situation true. */
const SETUP: Record<string, (s: GameState) => void> = {
  cold_marriage: (s) => addFeeling(s, ruler(s).spouseId!, s.rulerId, { why: 'Test', value: -60, decay: 0 }),
  jealous_spouse: (s) => {
    const lover = stranger(s, 30);
    ruler(s).loverId = lover.id;
    lovers(s, ruler(s), lover);
  },
  anniversary: (s) => {
    addFeeling(s, ruler(s).spouseId!, s.rulerId, { why: 'Test', value: 40, decay: 0 });
    addFeeling(s, s.rulerId, ruler(s).spouseId!, { why: 'Test', value: 20, decay: 0 });
  },
  crush: (s) => void kid(s, 16),
  kindred_spirit: (s) => {
    const head = Object.values(s.clans)
      .filter((k) => !k.isPlayer)
      .map((k) => s.characters[k.headId])
      .find((h) => h.traits.some((t) => TRAITS[t]?.cat === 'personality'))!;
    ruler(s).traits.push(head.traits.find((t) => TRAITS[t]?.cat === 'personality')!);
  },
  friend_favour: (s) => void (relationOf(s, s.rulerId, kid(s, 25).id, true)!.kind = 'friend'),
  friend_counsel: (s) => void (relationOf(s, s.rulerId, kid(s, 25).id, true)!.kind = 'friend'),
  gala_mockery: (s) => addFeeling(s, kid(s, 25).id, s.rulerId, { why: 'Test', value: -90, decay: 0 }),
  envoy_slight: () => {},
  nemesis_strikes: (s) => addFeeling(s, stranger(s).id, s.rulerId, { why: 'Executed my son', value: -90, decay: 0, grave: true }),
  resentful_child: (s) => addFeeling(s, kid(s, 10).id, s.rulerId, { why: 'Test', value: -60, decay: 0 }),
  child_drawing: (s) => void kid(s, 6),
  sibling_war: (s) => {
    const a = kid(s, 12);
    const b = kid(s, 14);
    addFeeling(s, a.id, b.id, { why: 'Test', value: -40, decay: 0 });
  },
  passed_over_demands: (s) => passedOver(s, kid(s, 22)),
  olive_branch: (s) => addFeeling(s, kid(s, 25).id, s.rulerId, { why: 'Test', value: -50, decay: 0 }),
};

describe('relationship events', () => {
  it('are fifteen, in the main deck, each with a test situation', () => {
    expect(RELATION_EVENTS).toHaveLength(15);
    for (const e of RELATION_EVENTS) {
      expect(EVENT_BY_ID[e.id], e.id).toBe(e);
      expect(SETUP[e.id], `${e.id} has a test situation`).toBeTypeOf('function');
    }
  });

  for (const def of RELATION_EVENTS) {
    it(`${def.id}: fires in its situation and every option resolves`, () => {
      for (let seed = 1; seed <= 6; seed++) {
        const s = court();
        SETUP[def.id](s);
        s.seed = seed * 7919;
        expect(!def.when || def.when(s), `${def.id} should fire`).toBe(true);
        expect(queueEvent(s, def), `${def.id} queued`).toBe(true);
        const p = s.pending[s.pending.length - 1] as Extract<Pending, { kind: 'event' }>;
        expect(def.text(buildCtx(s, p))).not.toMatch(/undefined|NaN/);
        def.choices.forEach((choice, i) => {
          const t = structuredClone(s);
          const ctx = buildCtx(t, t.pending[t.pending.length - 1] as typeof p);
          if (choice.show && !choice.show(ctx)) return;
          expect(choice.describe(ctx), `${def.id} #${i} tooltip`).not.toMatch(/undefined|NaN|someone/);
          if (choice.available && !choice.available(ctx)) return;
          const out = choice.run(ctx);
          expect(out, `${def.id} #${i}`).toBeTruthy();
          expect(out).not.toMatch(/undefined|NaN/);
          relationsTick(t);
        });
      }
    });
  }

  it('a shared bottle with a kindred spirit makes a friend', () => {
    let friends = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = court();
      SETUP.kindred_spirit(s);
      s.seed = seed;
      const def = EVENT_BY_ID.kindred_spirit;
      queueEvent(s, def);
      const p = s.pending[s.pending.length - 1] as Extract<Pending, { kind: 'event' }>;
      const ctx = buildCtx(s, p);
      def.choices[0].run(ctx);
      relationsTick(s);
      if (relationOf(s, s.rulerId, ctx.subject!.id)?.kind === 'friend') friends++;
    }
    expect(friends).toBeGreaterThanOrEqual(7);
  });

  it('asking a resentful child what is wrong can mend neglect', () => {
    let mended = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = court();
      const k = kid(s, 10);
      addFeeling(s, k.id, s.rulerId, { why: 'Neglected me', value: -60, decay: 0, key: 'neglect' });
      s.seed = seed;
      const def = EVENT_BY_ID.resentful_child;
      queueEvent(s, def);
      const ctx = buildCtx(s, s.pending[s.pending.length - 1] as Extract<Pending, { kind: 'event' }>);
      const before = opinionOf(s, k, ruler(s));
      def.choices[0].run(ctx);
      if (opinionOf(s, k, ruler(s)) > before + 30) mended++;
    }
    expect(mended).toBeGreaterThan(5);
  });
});
