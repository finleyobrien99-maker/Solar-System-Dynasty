import { describe, expect, it } from 'vitest';
import { beginAffair, exposeAffair } from './aiCourt';
import { createCharacter } from './character';
import { alive, ch, clanRegions, ruler } from './core';
import { dossier, hasDossier, type Dossier } from './dossier';
import { addFeeling, murdered } from './relations';
import type { Character, Clan, GameState } from './types';
import { createWorld, rollRuler, startGame } from './world';

function world(): GameState {
  const s = createWorld(113);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(113, 'mars', 'M', 'Aldo'), focus: 'int', age: 40, family: 'married' });
  return s;
}

function houses(s: GameState): Clan[] {
  return Object.values(s.clans).filter((k) => !k.isPlayer && clanRegions(s, k.id).length && alive(ch(s, k.headId)));
}

function adult(s: GameState, k: Clan, gender: 'M' | 'F', age = 30): Character {
  return createCharacter(s, { gender, born: s.year - age, clanId: k.id, planetId: k.planetId, adultExtras: true });
}

function wed(a: Character, b: Character): void {
  a.spouseId = b.id;
  b.spouseId = a.id;
}

const all = (d: Dossier) => [...d.facts, ...d.rumours, ...d.leverage, ...d.againstYou].map((l) => l.text).join(' | ');

describe('noble dossiers show what you could know, and nothing more', () => {
  it('a secret affair stays secret; once exposed it is a fact', () => {
    const s = world();
    const [a, b] = houses(s);
    const lord = s.characters[a.headId];
    const wife = adult(s, a, lord.gender === 'M' ? 'F' : 'M');
    wed(lord, wife);
    const lover = adult(s, b, lord.gender);
    beginAffair(s, wife, lover);
    expect(all(dossier(s, wife.id))).not.toMatch(/affair|lover/i);
    exposeAffair(s, wife, lover);
    const d = dossier(s, wife.id);
    expect(d.facts.some((l) => l.text.includes(`affair with ${lover.name}`))).toBe(true);
  });

  it('a suspected killing is a rumour with a named source, never a fact', () => {
    const s = world();
    const [a, b] = houses(s);
    const killer = s.characters[a.headId];
    const victim = adult(s, b, 'M');
    const brother = s.characters[b.headId];
    const father = createCharacter(s, { gender: 'M', born: s.year - 70, clanId: b.id, planetId: b.planetId });
    victim.fatherId = father.id;
    brother.fatherId = father.id;
    father.childrenIds.push(victim.id, brother.id);
    murdered(s, victim, killer.id, false);
    const d = dossier(s, killer.id);
    const rumour = d.rumours.find((l) => l.text.includes(victim.name));
    expect(rumour).toBeTruthy();
    expect(rumour!.source).toMatch(/suspects it/);
    expect(d.facts.some((l) => l.text.includes(victim.name))).toBe(false);
  });

  it('a known murder makes a sworn enemy, in the open', () => {
    const s = world();
    const [a, b] = houses(s);
    const killer = s.characters[a.headId];
    const lord = s.characters[b.headId];
    const son = createCharacter(s, { gender: 'M', born: s.year - 20, clanId: b.id, planetId: b.planetId, fatherId: lord.id });
    lord.childrenIds.push(son.id);
    murdered(s, son, killer.id, true);
    expect(dossier(s, lord.id).facts.some((l) => l.text.startsWith(`Sworn enemy of ${killer.name}`))).toBe(true);
  });

  it("someone who can't forgive you says so; someone who suspects you shows it", () => {
    const s = world();
    const [a] = houses(s);
    const lord = s.characters[a.headId];
    addFeeling(s, lord.id, s.rulerId, { why: 'Murdered my wife', value: -90, decay: 0, grave: true });
    addFeeling(s, lord.id, s.rulerId, { why: 'Suspected of killing Bran', value: -30, decay: 1, key: 'suspect:x' });
    const d = dossier(s, lord.id);
    expect(d.facts.some((l) => l.text === 'Will not forgive you: murdered my wife')).toBe(true);
    expect(d.againstYou.some((l) => l.text.startsWith('Suspects you'))).toBe(true);
    expect(d.facts.find((l) => l.source === 'how they treat you')!.tone).toBe('bad');
  });

  it('gratitude, kin in your cells and a shared secret count as leverage', () => {
    const s = world();
    const [a] = houses(s);
    const lord = s.characters[a.headId];
    addFeeling(s, lord.id, s.rulerId, { why: 'Paid my debts', value: 25, decay: 1, key: 'debt' });
    const son = createCharacter(s, { gender: 'M', born: s.year - 20, clanId: a.id, planetId: a.planetId, fatherId: lord.id });
    lord.childrenIds.push(son.id);
    son.prisonerOf = s.playerClanId;
    const d = dossier(s, lord.id);
    expect(d.leverage.some((l) => l.text.startsWith('Owes you: paid my debts'))).toBe(true);
    expect(d.leverage.some((l) => l.text === `You hold their son, ${son.name}`)).toBe(true);

    const r = ruler(s);
    const mistress = adult(s, a, r.gender === 'M' ? 'F' : 'M');
    const husband = adult(s, a, r.gender);
    wed(mistress, husband);
    mistress.loverId = r.id;
    r.loverId = mistress.id;
    expect(dossier(s, mistress.id).leverage.some((l) => l.text === `Your lover; ${husband.name} does not know`)).toBe(true);
  });

  it('a lord whose house holds your kin has that on you', () => {
    const s = world();
    const [a] = houses(s);
    const kid = createCharacter(s, { gender: 'F', born: s.year - 18, clanId: s.playerClanId, planetId: 'mars', fatherId: s.rulerId });
    ruler(s).childrenIds.push(kid.id);
    kid.prisonerOf = a.id;
    expect(dossier(s, a.headId).againstYou.some((l) => l.text === `Their house holds ${kid.name} captive`)).toBe(true);
  });

  it('a lord’s dossier names their ambition and their marriage ties', () => {
    const s = world();
    const [a] = houses(s);
    const d = dossier(s, a.headId);
    expect(d.facts.some((l) => l.text.startsWith('Ambition: '))).toBe(true);
    expect(d.facts.some((l) => l.text.includes(`head of House ${a.name}`))).toBe(true);
  });

  it('reading a dossier never changes the game', () => {
    const s = world();
    const [a, b] = houses(s);
    addFeeling(s, a.headId, s.rulerId, { why: 'Tried to have me killed', value: -70, decay: 0.2, grave: true });
    murdered(s, adult(s, b, 'M'), a.headId, false);
    const before = JSON.stringify(s);
    for (const c of Object.values(s.characters)) if (hasDossier(s, c)) dossier(s, c.id);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('only living people other than you, aged 12 or more, get one', () => {
    const s = world();
    const [a] = houses(s);
    expect(hasDossier(s, ruler(s))).toBe(false);
    expect(hasDossier(s, s.characters[a.headId])).toBe(true);
    const baby = createCharacter(s, { gender: 'M', born: s.year - 2, clanId: a.id, planetId: a.planetId });
    expect(hasDossier(s, baby)).toBe(false);
  });
});
