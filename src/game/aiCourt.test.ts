import { describe, expect, it } from 'vitest';
import {
  aiAffairsTick,
  aiArrests,
  beginAffair,
  exposeAffair,
  temptation,
  aiMarriages,
  alliesAbandon,
  captiveFates,
  captivesTick,
  executeCaptive,
  kinFleet,
  matchValue,
  pactMap,
  takeCaptive,
  wouldBetray,
} from './aiCourt';
import { createCharacter } from './character';
import { alive, ch, clanRegions, dynastyMembers, ruler } from './core';
import { addFeeling, feelingsSum } from './relations';
import type { Character, Clan, GameState } from './types';
import { createWorld, rollRuler, startGame } from './world';

function world(seed = 71): GameState {
  const s = createWorld(seed);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(seed, 'mars', 'M', 'Tav'), focus: 'dip', age: 40, family: 'married' });
  return s;
}

function landedAi(s: GameState): Clan[] {
  return Object.values(s.clans).filter((k) => !k.isPlayer && clanRegions(s, k.id).length && alive(ch(s, k.headId)));
}

/** A grown child of a house's head. */
function child(s: GameState, k: Clan, gender: 'M' | 'F', age = 22): Character {
  const head = s.characters[k.headId];
  head.born = Math.min(head.born, s.year - 50);
  const c = createCharacter(s, { gender, born: s.year - age, clanId: k.id, planetId: k.planetId, faithId: k.faithId, fatherId: head.id, adultExtras: true });
  head.childrenIds.push(c.id);
  return c;
}

function wed(a: Character, b: Character): void {
  a.spouseId = b.id;
  b.spouseId = a.id;
}

function setTraits(c: Character, traits: string[]): void {
  c.traits = c.traits.filter(
    (t) => !['kind', 'just', 'honest', 'content', 'cruel', 'wrathful', 'paranoid', 'ambitious', 'deceitful', 'greedy', 'generous'].includes(t),
  );
  c.traits.push(...traits);
}

describe('AI houses marry for advantage and stand by their kin', () => {
  it("a marriage between two heads' children binds the houses both ways; a marriage to a mere member doesn't", () => {
    const s = world();
    const [a, b, c] = landedAi(s);
    child(s, a, 'M'); // the heir
    const son = child(s, a, 'M', 20);
    child(s, b, 'F', 26);
    const daughter = child(s, b, 'F', 21);
    wed(son, daughter);
    const pacts = pactMap(s);
    expect(pacts.get(a.id)?.has(b.id)).toBe(true);
    expect(pacts.get(b.id)?.has(a.id)).toBe(true);
    const stranger = createCharacter(s, { gender: 'F', born: s.year - 25, clanId: c.id, planetId: c.planetId, adultExtras: true });
    const other = child(s, a, 'M', 24);
    wed(other, stranger);
    expect(pactMap(s).get(a.id)?.has(c.id)).toBeFalsy();
  });

  it('kin send ships to a war, unless they are kin to both sides', () => {
    const s = world();
    const [a, b, c] = landedAi(s);
    wed(child(s, a, 'M'), child(s, b, 'F'));
    b.fleet = 80;
    expect(kinFleet(s, a.id, c.id, pactMap(s), 0.25)).toBe(20);
    wed(child(s, b, 'M', 23), child(s, c, 'F', 23));
    expect(kinFleet(s, a.id, c.id, pactMap(s), 0.25)).toBe(0);
  });

  it('a head never marries into a house they hate, and favours one that shares their enemy', () => {
    const s = world();
    const [a, b, c, d] = landedAi(s);
    const [ha, hb, hc, hd] = [a, b, c, d].map((k) => s.characters[k.headId]);
    for (const h of [ha, hb, hc, hd]) setTraits(h, []);
    const base = matchValue(s, a, ha, b, new Set());
    addFeeling(s, ha.id, hd.id, { why: 'Murdered my son', value: -90, decay: 0, grave: true });
    addFeeling(s, hb.id, hd.id, { why: 'Burned my shipyards', value: -60, decay: 0 });
    expect(matchValue(s, a, ha, b, new Set())).toBeGreaterThan(base + 15);
    addFeeling(s, ha.id, hc.id, { why: 'Insulted me', value: -80, decay: 0 });
    expect(matchValue(s, a, ha, c, new Set())).toBe(0);
  });

  it('over the years, AI marriages bind real houses together', () => {
    const s = world();
    for (const k of landedAi(s)) {
      k.credits = 0;
      child(s, k, 'M', 20);
      child(s, k, 'M', 21);
      child(s, k, 'F', 20);
      child(s, k, 'F', 22);
    }
    for (let i = 0; i < 6; i++) aiMarriages(s);
    expect([...pactMap(s).values()].some((x) => x.size > 0)).toBe(true);
  });

  it('only a deceitful or ambitious lord who hates their kin will turn on them', () => {
    const s = world();
    const [a, b] = landedAi(s);
    const [ha, hb] = [s.characters[a.headId], s.characters[b.headId]];
    addFeeling(s, ha.id, hb.id, { why: 'Insulted me', value: -70, decay: 0 });
    setTraits(ha, ['honest']);
    expect(wouldBetray(s, ha, hb)).toBe(false);
    setTraits(ha, ['deceitful']);
    expect(wouldBetray(s, ha, hb)).toBe(true);
  });
});

describe('captives and executions', () => {
  it('the player can lose kin to a war, but never the ruler', () => {
    const s = world();
    const [a] = landedAi(s);
    child(s, s.clans[s.playerClanId], 'M', 20);
    child(s, s.clans[s.playerClanId], 'F', 18);
    for (let i = 0; i < 20; i++) {
      const c = takeCaptive(s, a.id, s.playerClanId, 1);
      if (!c) break;
      expect(c.id).not.toBe(s.rulerId);
      expect(c.prisonerOf).toBe(a.id);
    }
    expect(ruler(s).prisonerOf).toBeUndefined();
    expect(dynastyMembers(s).some((c) => c.prisonerOf === a.id)).toBe(true);
  });

  it('a cruel captor with a blood debt leans to the axe; a kind one to mercy', () => {
    const s = world();
    const [a, b] = landedAi(s);
    const [ha, hb] = [s.characters[a.headId], s.characters[b.headId]];
    const captive = child(s, b, 'M');
    captive.prisonerOf = a.id;
    const weight = (f: string) => captiveFates(s, ha, captive).find(([x]) => x === f)![1];
    setTraits(ha, ['cruel']);
    addFeeling(s, ha.id, hb.id, { why: 'Murdered my wife', value: -90, decay: 0, grave: true });
    expect(weight('execute')).toBeGreaterThan(weight('release') + 4);
    setTraits(ha, ['kind', 'just']);
    s.relations[ha.id] = {};
    expect(weight('release')).toBeGreaterThan(weight('execute'));
  });

  it("an executed captive's family hate the executioner for good, and your own dead start a blood feud", () => {
    const s = world();
    const [a, b] = landedAi(s);
    const ha = s.characters[a.headId];
    const hb = s.characters[b.headId];
    const captive = child(s, b, 'M');
    executeCaptive(s, a, ha, captive);
    expect(alive(captive)).toBe(false);
    expect(feelingsSum(s, hb, ha)).toBe(-75);
    const kin = dynastyMembers(s).find((c) => c.id !== s.rulerId && c.fatherId === s.rulerId) ?? child(s, s.clans[s.playerClanId], 'F');
    executeCaptive(s, a, ha, kin);
    expect(s.feuds).toContain(a.id);
    expect(s.pending.some((p) => p.kind === 'notice' && p.title === 'Executed in Captivity')).toBe(true);
  });

  it('AI captors ransom captives for real money, set them free, or kill them', () => {
    const fates = new Set<string>();
    for (let seed = 1; seed < 60 && fates.size < 3; seed++) {
      const s = world();
      const [a, b] = landedAi(s);
      const captive = child(s, b, 'M');
      captive.prisonerOf = a.id;
      s.characters[a.headId].traits.push('greedy');
      b.credits = 2000;
      const before = [a.credits, b.credits];
      s.seed = seed;
      for (let i = 0; i < 10 && captive.prisonerOf && alive(captive); i++) captivesTick(s);
      if (!alive(captive)) fates.add('executed');
      else if (b.credits < before[1]) {
        expect(a.credits - before[0]).toBe(before[1] - b.credits);
        fates.add('ransomed');
      } else if (!captive.prisonerOf) fates.add('freed');
    }
    expect(fates.has('ransomed')).toBe(true);
    expect(fates.has('freed')).toBe(true);
  });

  it('an AI liege throws a hated vassal in chains, or provokes a revolt trying', () => {
    let arrested = false;
    let revolted = false;
    for (let seed = 1; seed < 200 && !(arrested && revolted); seed++) {
      const s = world();
      const lord = landedAi(s).find((k) => clanRegions(s, k.id).some((r) => r.capital) && landedAi(s).some((v) => v.planetId === k.planetId && v.id !== k.id));
      if (!lord) continue;
      const vassal = landedAi(s).find((v) => v.planetId === lord.planetId && v.id !== lord.id)!;
      const [lh, vh] = [s.characters[lord.headId], s.characters[vassal.headId]];
      lh.born = Math.min(lh.born, s.year - 40);
      vh.born = Math.min(vh.born, s.year - 40);
      setTraits(lh, ['paranoid', 'cruel', 'wrathful']);
      addFeeling(s, lh.id, vh.id, { why: 'Plotted against me', value: -90, decay: 0 });
      s.seed = seed;
      aiArrests(s);
      if (vh.prisonerOf === lord.id) arrested = true;
      if (s.aiWars.some((w) => w.attacker === vassal.id && w.defender === lord.id)) revolted = true;
    }
    expect(arrested).toBe(true);
    expect(revolted).toBe(true);
  });
});

describe('your allies', () => {
  it('walk away once they hate you', () => {
    const s = world();
    const [a, b] = landedAi(s);
    a.allied = true;
    b.allied = true;
    a.opinion = -40;
    b.opinion = 30;
    alliesAbandon(s);
    expect(a.allied).toBe(false);
    expect(b.allied).toBe(true);
  });

  it("walk away when their lord can't forgive you, whatever the house thinks", () => {
    const s = world();
    const [a] = landedAi(s);
    a.allied = true;
    a.opinion = 20;
    addFeeling(s, a.headId, s.rulerId, { why: 'Murdered my wife', value: -90, decay: 0, grave: true });
    alliesAbandon(s);
    expect(a.allied).toBe(false);
  });
});

describe('AI love lives', () => {
  it('the lustful and the unhappily married stray most; the chaste hardly at all', () => {
    const s = world();
    const [a, b] = landedAi(s);
    const [ha, hb] = [s.characters[a.headId], s.characters[b.headId]];
    setTraits(ha, []);
    ha.traits = ha.traits.filter((t) => t !== 'lustful' && t !== 'chaste');
    const plain = temptation(s, ha);
    ha.traits.push('lustful');
    expect(temptation(s, ha)).toBeGreaterThan(plain * 3);
    hb.traits = hb.traits.filter((t) => t !== 'lustful' && t !== 'chaste');
    hb.traits.push('chaste');
    expect(temptation(s, hb)).toBeLessThan(plain);
  });

  it('an exposed affair turns the betrayed spouse on both of them, and lords make the news', () => {
    const s = world();
    const [a, b] = landedAi(s);
    const lord = s.characters[a.headId];
    const wife = createCharacter(s, { gender: lord.gender === 'M' ? 'F' : 'M', born: s.year - 30, clanId: a.id, planetId: a.planetId, adultExtras: true });
    wed(lord, wife);
    const lover = child(s, b, lord.gender);
    beginAffair(s, wife, lover);
    expect(wife.loverId).toBe(lover.id);
    expect(feelingsSum(s, lord, wife)).toBe(0);
    exposeAffair(s, wife, lover);
    expect(feelingsSum(s, lord, wife)).toBe(-40);
    expect(feelingsSum(s, lord, lover)).toBe(-50);
    expect(s.log.some((l) => l.k === 'news' && l.t.startsWith('Scandal'))).toBe(true);
  });

  it('over the years, AI courts have affairs and the odd awkward child, but never with your family', () => {
    const s = world();
    for (const k of landedAi(s)) {
      const h = s.characters[k.headId];
      if (!h.traits.includes('lustful')) h.traits.push('lustful');
      if (!alive(ch(s, h.spouseId)))
        wed(h, createCharacter(s, { gender: h.gender === 'M' ? 'F' : 'M', born: s.year - 30, clanId: k.id, planetId: k.planetId, adultExtras: true }));
    }
    const kids = Object.keys(s.characters).length;
    for (let i = 0; i < 30; i++) {
      s.year += 1;
      aiAffairsTick(s);
    }
    const lovers = Object.values(s.characters).filter((c) => alive(c) && c.loverId);
    expect(lovers.length + Object.values(s.characters).filter((c) => c.bastard).length).toBeGreaterThan(0);
    expect(Object.keys(s.characters).length).toBeGreaterThanOrEqual(kids);
    for (const c of lovers) expect(s.characters[c.loverId!].clanId).not.toBe(s.playerClanId);
    expect(dynastyMembers(s).some((c) => c.loverId)).toBe(false);
  });
});
