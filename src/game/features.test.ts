import { describe, expect, it } from 'vitest';
import { cadetBlocker, foundCadet } from './cadets';
import { createCharacter } from './character';
import { alive, clanRegions, dynastyMembers, isBloodlineClan, liegeOf, ruler } from './core';
import { appoint, candidates, councilStat } from './council';
import { creditLines } from './economy';
import { buildForge, buildVats, cloneCharacter, forgeTick, growVatHeir, splice, startResearch } from './forge';
import { lockBlocker } from './genetics';
import { executePrisoner } from './intrigue';
import { killCharacter, makeChild } from './life';
import { isRival, memorySum, memoryTick, remember } from './memory';
import { routeBlocker, openRoute, tradeTick, partnerPort } from './trade';
import { TRAITS } from './traits';
import type { GameState } from './types';
import { declareWar } from './war';
import { cadetSigil, createWorld, rollRuler, startGame } from './world';
import { exportSave, importSave } from './save';

function game(seed = 3): GameState {
  const s = createWorld(seed);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(seed, 'mars', 'M', 'Kor'), focus: 'cmd' });
  s.credits = 50000;
  s.prestige = 50000;
  s.faith = 50000;
  return s;
}

/** Give the player a second, non-capital region and an adult kinsman. */
function withKin(s: GameState) {
  const extra = Object.values(s.regions).find((r) => r.planetId === 'mars' && !r.capital && r.owner !== s.playerClanId)!;
  extra.owner = s.playerClanId; // test setup only
  s.regions = { ...s.regions }; // invalidate the region index
  const r = ruler(s);
  const kin = createCharacter(s, {
    gender: 'F',
    born: s.year - 25,
    clanId: s.playerClanId,
    planetId: 'mars',
    fatherId: r.fatherId,
    motherId: r.motherId,
    adultExtras: true,
  });
  const grandkid = createCharacter(s, { gender: 'M', born: s.year - 2, clanId: s.playerClanId, planetId: 'mars', motherId: kin.id });
  kin.childrenIds.push(grandkid.id);
  // Make sure the kinsman isn't the heir.
  const heirKid = createCharacter(s, { gender: 'M', born: s.year - 1, clanId: s.playerClanId, planetId: 'mars', fatherId: r.id });
  r.childrenIds.push(heirKid.id);
  return { extra, kin, grandkid };
}

describe('cadet branches', () => {
  it('founding moves the founder and descendants and swears fealty', () => {
    const s = game();
    const { extra, kin, grandkid } = withKin(s);
    const parent = structuredClone(s.clans[s.playerClanId].sigil);
    const seed = s.seed;
    expect(cadetBlocker(s, kin.id, extra.id)).toBeNull();
    const id = foundCadet(s, kin.id, extra.id, 'Test-Branch')!;
    expect(s.clans[id].cadetOf).toBe(s.playerClanId);
    expect(kin.clanId).toBe(id);
    expect(grandkid.clanId).toBe(id);
    expect(extra.owner).toBe(id);
    expect(liegeOf(s, id)).toBe(s.playerClanId);
    expect(isBloodlineClan(s, id)).toBe(true);
    const branch = s.clans[id];
    expect([branch.sigil.shape, branch.sigil.division, branch.sigil.charge]).toEqual([parent.shape, parent.division, parent.charge]);
    expect(new Set([branch.sigil.c1, branch.sigil.c2, branch.sigil.c3]).size).toBe(3);
    for (const colour of [branch.sigil.c1, branch.sigil.c2, branch.sigil.c3]) expect([parent.c1, parent.c2, parent.c3]).not.toContain(colour);
    expect(branch.color).toBe(branch.sigil.c1);
    expect(s.clans[s.playerClanId].sigil).toEqual(parent);
    expect(s.seed).toBe(seed);
    expect(importSave(exportSave(s)).clans[id].sigil).toEqual(branch.sigil);
  });

  it('cadet colours are deterministic, varied and independent of future simulation rolls', () => {
    const parent = { shape: 4, division: 6, charge: 15, c1: '#c8102e', c2: '#1f4fbf', c3: '#d4a017' };
    const before = structuredClone(parent),
      rng = { seed: 123 },
      palettes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const arms = cadetSigil(rng, parent, `branch-${i}`);
      expect(arms).toEqual(cadetSigil({ seed: 123 }, parent, `branch-${i}`));
      expect([arms.shape, arms.division, arms.charge]).toEqual([4, 6, 15]);
      expect(new Set([arms.c1, arms.c2, arms.c3]).size).toBe(3);
      for (const c of [arms.c1, arms.c2, arms.c3]) {
        expect(c).toMatch(/^#[a-f\d]{6}$/);
        expect([parent.c1, parent.c2, parent.c3]).not.toContain(c);
      }
      palettes.add([arms.c1, arms.c2, arms.c3].join(','));
    }
    expect(palettes.size).toBeGreaterThan(80);
    expect(rng.seed).toBe(123);
    expect(parent).toEqual(before);
  });

  it('locked genes reach cadet children', () => {
    const s = game();
    const { extra, kin } = withKin(s);
    const id = foundCadet(s, kin.id, extra.id)!;
    s.dynasty.locked = ['genius'];
    const dad = createCharacter(s, { gender: 'M', born: s.year - 30, clanId: Object.keys(s.clans)[0], planetId: 'venus' });
    for (let i = 0; i < 20; i++) expect(makeChild(s, kin, dad, id).traits).toContain('genius');
  });

  it('a cadet takes the crown when the main line dies out', () => {
    const s = game();
    const { extra, kin } = withKin(s);
    const cadetId = foundCadet(s, kin.id, extra.id)!;
    for (const c of dynastyMembers(s)) if (c.id !== s.rulerId) c.died = s.year;
    killCharacter(s, s.rulerId, 'test');
    expect(s.gameOver).toBeUndefined();
    expect(s.rulerId).toBe(kin.id);
    expect(kin.clanId).toBe(s.playerClanId);
    expect(s.clans[cadetId]).toBeUndefined();
    expect(extra.owner).toBe(s.playerClanId);
  });
});

describe('gene-forge', () => {
  it('research lets you lock a gene nobody carries, then splice it', () => {
    const s = game();
    expect(lockBlocker(s, 'genius')).toMatch(/carries/);
    expect(buildForge(s)).toBe(true);
    expect(startResearch(s, 'genius')).toBe(true);
    for (let i = 0; i < 60 && s.forge.project; i++) forgeTick(s);
    expect(s.forge.researched).toContain('genius');
    expect(lockBlocker(s, 'genius')).toBeNull();
    const r = ruler(s);
    r.traits = r.traits.filter((t) => !['dim', 'slow', 'quick', 'brilliant', 'genius'].includes(t));
    let ok = false;
    for (let i = 0; i < 10 && !ok; i++) ok = splice(s, r.id, 'genius');
    expect(ok).toBe(true);
    expect(r.traits).toContain('genius');
  });

  it('vat heirs carry the designed genes and clones copy the genome', () => {
    const s = game();
    buildForge(s);
    buildVats(s);
    s.forge.researched = ['genius', 'ironblood'];
    const r = ruler(s);
    const kid = growVatHeir(s, r.id, ['genius', 'ironblood'])!;
    expect(kid.traits).toEqual(expect.arrayContaining(['genius', 'ironblood', 'vatborn']));
    expect(kid.clanId).toBe(s.playerClanId);
    const father = s.characters[r.fatherId!];
    expect(alive(father)).toBe(false);
    const clone = cloneCharacter(s, father.id)!;
    const genes = (c: typeof father) => c.traits.filter((t) => TRAITS[t]?.cat === 'genetic').sort();
    expect(clone.cloneOf).toBe(father.id);
    expect(clone.traits).toContain('clone');
    expect(genes(clone)).toEqual(genes(father));
    expect(clone.looks).toEqual(father.looks);
  });
});

describe('council', () => {
  it('a treasurer adds an income line', () => {
    const s = game();
    withKin(s);
    const best = candidates(s, 'treasurer')[0];
    appoint(s, 'treasurer', best.id);
    expect(councilStat(s, 'treasurer')).toBeGreaterThan(0);
    expect(creditLines(s).some((l) => l.label.startsWith('Treasurer'))).toBe(true);
  });
});

describe('grudges', () => {
  it('executions are remembered, fade slowly, and survive a change of head', () => {
    const s = game();
    const victimClan = Object.values(s.clans).find((c) => !c.isPlayer && c.planetId === 'jupiter')!;
    const head = s.characters[victimClan.headId];
    head.prisonerOf = s.playerClanId;
    executePrisoner(s, head.id);
    expect(isRival(victimClan)).toBe(true);
    const before = memorySum(victimClan);
    for (let i = 0; i < 20; i++) memoryTick(s);
    expect(memorySum(victimClan)).toBeLessThan(0);
    expect(Math.abs(memorySum(victimClan))).toBeGreaterThan(Math.abs(before) * 0.6);
    expect(victimClan.headId).not.toBe(head.id);
  });

  it('favours fade faster than murders', () => {
    const s = game();
    const clan = Object.values(s.clans).find((c) => !c.isPlayer)!;
    clan.memories = [];
    remember(s, clan.id, 'gift', 20, 0.15);
    remember(s, clan.id, 'murder', -20, 0.015);
    for (let i = 0; i < 15; i++) memoryTick(s);
    expect(clan.memories!.map((m) => m.text)).toEqual(['murder']);
  });
});

describe('trade', () => {
  it('routes pay out and close when war breaks out', () => {
    const s = game();
    const from = clanRegions(s, s.playerClanId)[0];
    const partner = Object.values(s.clans).find((c) => !c.isPlayer && partnerPort(s, c.id) && partnerPort(s, c.id) !== 'mars')!;
    partner.opinion = -10;
    expect(routeBlocker(s, from.id, partner.id)).toMatch(/won't trade/);
    partner.opinion = 50;
    expect(openRoute(s, from.id, partner.id)).toBeTruthy();
    expect(creditLines(s).find((l) => l.label.startsWith('Trade routes'))!.value).toBeGreaterThan(20);
    const target = clanRegions(s, partner.id)[0];
    s.claims.push(target.id);
    expect(declareWar(s, target.id, 'claim')).toBe(true);
    tradeTick(s);
    expect(s.routes.length).toBe(0);
  });
});
