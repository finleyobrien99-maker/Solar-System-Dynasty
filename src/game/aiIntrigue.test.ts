import { describe, expect, it } from 'vitest';
import { learnSecret, recordMurder } from './secrets';
import { aiPlans, runAiScheme, type AiPlan } from './aiIntrigue';
import { alive, ch, clanRegions } from './core';
import { createCharacter } from './character';
import { addFeeling, feelingsSum } from './relations';
import { answerPending, BOTS } from './bots';
import { balanceGame } from './balance';
import { ageUp } from './tick';
import type { Clan, GameState } from './types';
import { createWorld, rollRuler, startGame } from './world';

function world(): GameState {
  const s = createWorld(51);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(51, 'mars', 'F', 'Ines'), focus: 'dip', age: 40 });
  return s;
}

/** Two landed AI houses with adult heads; the second head is married. */
function twoHouses(s: GameState): [Clan, Clan] {
  const landed = Object.values(s.clans).filter((k) => !k.isPlayer && clanRegions(s, k.id).length && alive(ch(s, k.headId)));
  const [a, b] = landed;
  for (const k of [a, b]) {
    const h = s.characters[k.headId];
    h.born = Math.min(h.born, s.year - 40);
    k.credits = 1000;
  }
  const hb = s.characters[b.headId];
  if (!alive(ch(s, hb.spouseId))) {
    const w = createCharacter(s, {
      gender: hb.gender === 'M' ? 'F' : 'M',
      born: s.year - 35,
      clanId: b.id,
      planetId: b.planetId,
      faithId: b.faithId,
      adultExtras: true,
    });
    hb.spouseId = w.id;
    w.spouseId = hb.id;
  }
  return [a, b];
}

describe('AI houses scheme like the player', () => {
  it('a head with a blood vendetta wants the man responsible dead above all', () => {
    const s = world();
    const [a, b] = twoHouses(s);
    addFeeling(s, a.headId, b.headId, { why: 'Murdered my son', value: -90, decay: 0, grave: true });
    const plans = aiPlans(s, a);
    const best = plans.sort((x, y) => y.score - x.score)[0];
    expect(best.kind).toBe('assassinate');
    expect(best.target.id).toBe(b.headId);
  });

  it("a caught AI murder leaves the victim's family hating the killer for life, and the house gets a new lord", () => {
    let done = false;
    for (let seed = 1; seed < 400 && !done; seed++) {
      const s = world();
      const [a, b] = twoHouses(s);
      const victim = s.characters[b.headId];
      const widow = s.characters[victim.spouseId!];
      s.seed = seed;
      const plan: AiPlan = { kind: 'assassinate', target: victim, score: 100 };
      if (!runAiScheme(s, a, plan) || !s.log.some((l) => l.t.includes(`Agents of House ${a.name} were caught`))) continue;
      done = true;
      expect(alive(victim)).toBe(false);
      expect(feelingsSum(s, widow, s.characters[a.headId])).toBe(-90);
      expect(b.headId).not.toBe(victim.id);
    }
    expect(done).toBe(true);
  });

  it('AI blackmail moves money from the victim to the blackmailer', () => {
    let done = false;
    for (let seed = 1; seed < 200 && !done; seed++) {
      const s = world();
      const [a, b] = twoHouses(s);
      s.seed = seed;
      const victim = createCharacter(s, { clanId: b.id, planetId: b.planetId, born: s.year - 30 });
      learnSecret(s, recordMurder(s, s.characters[b.headId], victim).id, a.headId);
      const before = [a.credits, b.credits];
      if (!runAiScheme(s, a, { kind: 'blackmail', target: s.characters[b.headId], score: 50 })) continue;
      done = true;
      const paid = before[1] - b.credits;
      expect(paid).toBeGreaterThan(0);
      expect(a.credits).toBe(before[0] - 20 + paid);
      expect(feelingsSum(s, s.characters[b.headId], s.characters[a.headId])).toBe(-50);
    }
    expect(done).toBe(true);
  });

  it('over a long game, AI houses murder, sabotage, seduce and blackmail each other', { timeout: 120000 }, () => {
    const news: string[] = [];
    for (const seed of [1, 2, 3]) {
      const s = balanceGame(seed);
      const rng = { seed };
      for (let i = 0; i < 150 && !s.gameOver; i++) {
        answerPending(s, rng);
        BOTS.passive.turn(s, rng);
        answerPending(s, rng);
        ageUp(s);
        news.push(...s.log.filter((l) => l.k === 'news' && l.y === s.year).map((l) => l.t));
      }
    }
    expect(news.some((t) => t.includes('was found dead'))).toBe(true);
    expect(news.some((t) => t.includes('shipyards'))).toBe(true);
  });
});
