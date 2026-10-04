import { describe, expect, it } from 'vitest';
import { aiDynastyDecision, aiDynastyTick, runHouseGenetics } from './aiDynasty';
import { createCharacter } from './character';
import { balanceGame } from './balance';
import { answerPending, BOTS } from './bots';
import { ageUp } from './tick';
import { clanRank, clanRegions, ruler, setOwner, SAVE_VERSION } from './core';
import { buildForge, buildVats, cloneCharacter, forgeTick, growVatHeir, researchRate, splice } from './forge';
import { lockTrait, purgeTrait } from './genetics';
import { geneticMatchWeight, newHouseGenetics } from './houseGenetics';
import { birthChance, makeChild, aiSucceed } from './life';
import { createViceroy } from './realm';
import { feelingsSum } from './relations';
import { exportSave, importSave, MIGRATIONS, migrate } from './save';
import { hashString } from './rng';
import type { Clan, GameState } from './types';
import { createWorld, rollRuler, startGame } from './world';

function world() {
  const s = createWorld(71);
  const player = Object.values(s.clans).find((k) => k.planetId === 'mars' && !clanRegions(s, k.id).some((r) => r.capital))!;
  startGame(s, { clanId: player.id, ruler: rollRuler(71, 'mars', 'M', 'Tav'), focus: 'dip', age: 40, family: 'kids' });
  const k = Object.values(s.clans).find((k) => !k.isPlayer && k.planetId === 'saturn')!;
  k.credits = 10000;
  k.prestige = 3000;
  k.faithId = 'veiled';
  k.titles.viceroy = true;
  const head = s.characters[k.headId];
  head.traits = [];
  head.base.sci = 10;
  head.born = s.year - 45;
  k.genetics = newHouseGenetics();
  s.pending = [];
  return { s, k, head };
}
function members(s: GameState, k: Clan) {
  return Object.values(s.characters).filter((c) => c.clanId === k.id);
}
function ownChild(s: GameState, k: Clan, age = 4, traits: string[] = []) {
  const h = s.characters[k.headId];
  const c = createCharacter(s, { clanId: k.id, planetId: k.planetId, faithId: k.faithId, born: s.year - age, fatherId: h.id, traits });
  h.childrenIds.push(c.id);
  return c;
}
function due(s: GameState, k: Clan) {
  while ((s.year - s.startYear + hashString(k.id)) % 8) s.year++;
}

describe('independent AI bloodline institutions', () => {
  it('ordinary unfunded AI houses actually build and sequence genes in a full game', () => {
    const s = balanceGame(1),
      bot = { seed: 7936 };
    for (let i = 0; i < 150 && !s.gameOver; i++) {
      answerPending(s, bot);
      if (s.gameOver) break;
      BOTS.passive.turn(s, bot);
      answerPending(s, bot);
      ageUp(s);
    }
    const ai = Object.values(s.clans).filter((k) => !k.isPlayer && k.genetics);
    expect(ai.some((k) => k.genetics!.locked.length)).toBe(true);
    expect(ai.some((k) => k.genetics!.purged.length)).toBe(true);
    expect(ai.some((k) => k.genetics!.forge.level > 0)).toBe(true);
    expect(ai.some((k) => k.genetics!.forge.researched.length)).toBe(true);
    expect(s.forge).toEqual({ level: 0, researched: [] });
  });

  it('migrates v3 without invented history, survives repeat migrations and round-trips', () => {
    const { s, k } = world();
    for (const clan of Object.values(s.clans)) delete clan.genetics;
    s.version = 3;
    const old = structuredClone(s);
    migrate(s);
    expect(s.version).toBe(SAVE_VERSION);
    expect(k.genetics).toEqual(newHouseGenetics());
    expect(s.clans[s.playerClanId].genetics).toBeUndefined();
    const before = structuredClone(s);
    MIGRATIONS[4](s);
    expect(s).toEqual(before);
    expect(importSave(exportSave(s))).toEqual(JSON.parse(JSON.stringify(s)));
    expect(s.dynasty).toEqual(old.dynasty);
    expect(s.characters).toEqual(old.characters);
  });

  it('AI pays full prices even with player VIP, and neither treasury nor vault leaks across houses', () => {
    const { s, k, head } = world();
    s.vip = { on: true, immortal: true };
    head.traits = ['genius'];
    const snapshot = JSON.stringify({
      dynasty: s.dynasty,
      forge: s.forge,
      credits: s.credits,
      prestige: s.prestige,
      faith: s.faith,
      stats: s.stats,
      pending: s.pending,
    });
    runHouseGenetics(s, k, members(s, k), (v) => {
      expect(lockTrait(v, 'genius')).toBe(true);
      expect(purgeTrait(v, 'sickly')).toBe(true);
    });
    expect(k.credits).toBe(10000 - 675 - 250);
    expect(k.prestige).toBe(3000 - 150 - 75);
    expect(k.genetics?.locked).toEqual(['genius']);
    expect(k.genetics?.purged).toEqual(['sickly']);
    expect(
      JSON.stringify({ dynasty: s.dynasty, forge: s.forge, credits: s.credits, prestige: s.prestige, faith: s.faith, stats: s.stats, pending: s.pending }),
    ).toBe(snapshot);
    runHouseGenetics(s, k, members(s, k), (v) => expect(lockTrait(v, 'radiant')).toBe(false));
  });

  it('children inherit their host house vault, including outside spouses; player locks stay private', () => {
    const { s, k, head } = world();
    const mother = createCharacter(s, { clanId: k.id, planetId: k.planetId, born: s.year - 25, gender: 'F', traits: ['sickly'] });
    k.genetics!.locked = ['genius'];
    k.genetics!.purged = ['sickly'];
    s.dynasty.locked = ['radiant'];
    for (let i = 0; i < 20; i++) {
      const c = makeChild(s, mother, head, k.id);
      expect(c.traits).toContain('genius');
      expect(c.traits).not.toContain('sickly');
    }
    k.genetics!.locked = ['fecund'];
    const playerChild = makeChild(s, mother, ruler(s), s.playerClanId);
    expect(playerChild.traits).toContain('radiant');
  });

  it('research charges yearly upkeep and uses its own Science without player council or relics', () => {
    const { s, k, head } = world();
    head.traits = [];
    const scientist = ownChild(s, s.clans[s.playerClanId], 30);
    scientist.base.sci = 100;
    s.council.scientist = scientist.id;
    s.vip = { on: true, immortal: false };
    k.genetics!.forge = { level: 1, researched: [], project: { trait: 'genius', progress: 0, needed: 46 } };
    s.year++; // research progresses even off the decision cycle
    const before = k.credits;
    aiDynastyTick(s);
    expect(k.credits).toBe(before - 40);
    expect(k.genetics!.forge.project?.progress).toBe(10.2); // Science 10 + Saturn 2, no player councillor
    runHouseGenetics(s, k, members(s, k), (v) => expect(researchRate(v)).toBe(10.2));
    k.credits = 39;
    aiDynastyTick(s);
    expect(k.credits).toBe(39);
    expect(k.genetics!.forge.project).toBeUndefined();
    expect(s.pending).toHaveLength(0);
  });

  it('completed research belongs to the AI ruler and creates world news, never a player pop-up', () => {
    const { s, k, head } = world();
    k.genetics!.forge = { level: 1, researched: [], project: { trait: 'genius', progress: 45, needed: 46 } };
    runHouseGenetics(s, k, members(s, k), forgeTick);
    expect(k.genetics!.forge.researched).toEqual(['genius']);
    expect(head.reputation?.deeds.research).toBe(1);
    expect(ruler(s).reputation?.deeds.research).toBeUndefined();
    expect(s.pending).toHaveLength(0);
    expect(s.log.some((e) => e.t.includes('House ' + k.name) && e.t.includes('synthesised Genius'))).toBe(true);
  });

  it('Forge heresy angers condemning rulers at the actual actor, without blaming the player', () => {
    const { s, k, head } = world();
    const condemner = Object.values(s.clans).find((c) => !c.isPlayer && c.id !== k.id)!;
    condemner.faithId = 'solar';
    s.clans[s.playerClanId].faithId = 'solar';
    const before = structuredClone(Object.values(s.clans).map((c) => [c.id, c.opinion, c.memories]));
    runHouseGenetics(s, k, members(s, k), (v) => {
      expect(buildForge(v)).toBe(true);
    });
    expect(Object.values(s.clans).map((c) => [c.id, c.opinion, c.memories])).toEqual(before);
    expect(feelingsSum(s, s.characters[condemner.headId], head)).toBe(-5);
    expect(feelingsSum(s, ruler(s), head)).toBe(-5);
    expect(s.faith).toBeGreaterThanOrEqual(0);
    expect(k.credits).toBe(9400);
    expect(k.prestige).toBe(2850);
  });

  it('Machine houses receive only their faith discount and their own faith reward', () => {
    const { s, k } = world();
    k.faithId = 'machine';
    k.genetics!.forge = { level: 1, researched: ['genius'] };
    const c = ownChild(s, k);
    runHouseGenetics(s, k, members(s, k), (v) => splice(v, c.id, 'genius'));
    expect(k.credits).toBe(10000 - Math.round(650 * 0.75));
    expect(k.genetics!.faith).toBe(5);
  });

  it('AI splices really can fail and hurt a child, even while the player is VIP', () => {
    let failures = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { s, k } = world();
      s.seed = seed;
      s.vip = { on: true, immortal: true };
      k.genetics!.forge = { level: 1, researched: ['genius'] };
      const c = ownChild(s, k, 20);
      const hp = c.health;
      runHouseGenetics(s, k, members(s, k), (v) => {
        if (!splice(v, c.id, 'genius')) {
          failures++;
          expect(c.health).toBe(hp - 15);
        }
      });
      expect(k.credits).toBe(9350);
      expect(s.pending).toHaveLength(0);
    }
    expect(failures).toBeGreaterThan(0);
  });

  it('vat children and clones are real members with the right parent, costs and personal deeds', () => {
    const { s, k, head } = world();
    runHouseGenetics(s, k, members(s, k), (v) => {
      buildForge(v);
      buildVats(v);
    });
    const original = ownChild(s, k, 30, ['genius', 'ironblood', 'ageless']);
    original.died = s.year - 1;
    const before = k.credits;
    runHouseGenetics(s, k, members(s, k), (v) => {
      const child = growVatHeir(v, head.id, []);
      expect(child?.clanId).toBe(k.id);
      expect(child?.fatherId ?? child?.motherId).toBe(head.id);
      expect(cloneCharacter(v, original.id)?.cloneOf).toBe(original.id);
    });
    expect(k.credits).toBe(before - 400 - 900);
    expect(head.childrenIds.every((id) => !!s.characters[id])).toBe(true);
    expect(head.reputation?.deeds.vats).toBe(1);
    expect(head.reputation?.deeds.clones).toBe(1);
    expect(s.pending).toHaveLength(0);
    const child = s.characters[head.childrenIds.at(-1)!];
    head.died = s.year;
    aiSucceed(s, k.id);
    expect(k.genetics!.forge.level).toBe(2);
    expect(child.reputation?.deeds.clones).toBeUndefined();
  });

  it('only the birth household gains the later fertility window; player VIP never grants it to a rival', () => {
    const { s, k, head } = world();
    const mother = createCharacter(s, { gender: 'F', clanId: k.id, planetId: k.planetId, born: s.year - 50, traits: [] });
    head.traits = [];
    s.vip = { on: true, immortal: false };
    expect(birthChance(s, mother, head)).toBe(0);
    k.genetics!.forge.level = 2;
    expect(birthChance(s, mother, head)).toBeGreaterThan(0);
    expect(birthChance(s, mother, head, s.playerClanId)).toBeGreaterThan(0);
    expect(birthChance(s, mother, head, Object.values(s.clans).find((c) => c.id !== k.id && !c.isPlayer)!.id)).toBe(0);
  });

  it('titles use the same cost and never increase the existing automatic AI rank', () => {
    const { s, k } = world();
    const rs = Object.values(s.regions);
    for (const r of clanRegions(s, k.id)) setOwner(s, r, s.playerClanId);
    for (const r of rs.filter((r) => !r.capital).slice(0, 3)) setOwner(s, r, k.id);
    k.titles.viceroy = false;
    const rank = clanRank(s, k.id),
      before = k.credits;
    runHouseGenetics(s, k, members(s, k), (v) => expect(createViceroy(v)).toBe(true));
    expect(k.titles.viceroy).toBe(true);
    expect(clanRank(s, k.id)).toBe(rank);
    expect(k.credits).toBe(before - 500);
    expect(k.prestige).toBe(2700);
    expect(s.clans[s.playerClanId].titles.viceroy).not.toBe(true);
  });

  it('decisions are staggered, do not run for captives or children, and cannot touch player/cadet institutions', () => {
    const { s, k, head } = world();
    for (const c of members(s, k)) c.traits = [];
    head.traits = ['genius'];
    due(s, k);
    head.prisonerOf = s.playerClanId;
    aiDynastyTick(s);
    expect(k.genetics!.locked).toEqual([]);
    head.prisonerOf = undefined;
    head.born = s.year - 10;
    aiDynastyTick(s);
    expect(k.genetics!.locked).toEqual([]);
    head.born = s.year - 45;
    aiDynastyTick(s);
    expect(k.genetics!.locked).toEqual(['genius']);
    const before = k.credits;
    aiDynastyTick(s); // no second lock or free money on repeated tick
    expect(k.credits).toBeLessThanOrEqual(before);
    const p = s.clans[s.playerClanId];
    runHouseGenetics(s, p, members(s, p), () => {
      throw Error('player view must not run');
    });
    k.cadetOf = p.id;
    runHouseGenetics(s, k, members(s, k), () => {
      throw Error('cadet view must not run');
    });
  });

  it('indexes a large dynasty once for all houses and keeps each actor view bounded', () => {
    const { s, k } = world();
    for (let i = 0; i < 10000; i++) {
      const r = ruler(s);
      s.characters['distant' + i] = { ...r, id: 'distant' + i, childrenIds: [], traits: [] };
    }
    for (const c of Object.values(s.clans))
      if (!c.isPlayer) {
        c.genetics ??= newHouseGenetics();
        c.genetics.forge = { level: 1, researched: [], project: { trait: 'genius', progress: 0, needed: 46 } };
      }
    let scans = 0;
    s.characters = new Proxy(s.characters, {
      ownKeys(target) {
        scans++;
        return Reflect.ownKeys(target);
      },
    });
    const kin = [s.characters[k.headId]];
    runHouseGenetics(s, k, kin, (v) => {
      expect(Object.keys(v.characters).length).toBeLessThanOrEqual(Object.keys(s.clans).length + kin.length);
      expect(v.characters.distant9999).toBeUndefined();
    });
    expect(scans).toBe(0);
    aiDynastyTick(s);
    expect(scans).toBe(1);
  });

  it('gene preferences are pure, bounded, favour healthy matching tiers and penalise harmful traits', () => {
    const { s, head } = world();
    head.traits = ['genius'];
    const b = { ...head, traits: [] };
    const seed = s.seed;
    expect(geneticMatchWeight(head, { ...b, traits: ['genius'] })).toBeGreaterThan(geneticMatchWeight(head, { ...b, traits: ['quick'] }));
    expect(geneticMatchWeight(head, { ...b, traits: ['sickly', 'dim'] })).toBeLessThan(geneticMatchWeight(head, b));
    expect(geneticMatchWeight(head, { ...b, traits: ['genius', 'ironblood', 'ageless', 'radiant', 'herculean'] })).toBeLessThanOrEqual(30);
    expect(s.seed).toBe(seed);
  });

  it('heirless rulers use vats; zealots with heirs avoid new Forge work', () => {
    const { s, k, head } = world();
    for (const c of members(s, k)) if (c.id !== head.id) c.died = s.year;
    head.childrenIds = [];
    head.traits = [];
    k.faithId = 'solar';
    k.genetics!.forge.level = 2;
    runHouseGenetics(s, k, members(s, k), (v) => aiDynastyDecision(v, members(s, k)));
    expect(head.childrenIds).toHaveLength(1);
    head.traits = ['zealous'];
    k.genetics!.forge.level = 0;
    runHouseGenetics(s, k, members(s, k), (v) => aiDynastyDecision(v, members(s, k)));
    expect(k.genetics!.forge.level).toBe(0);
  });
});
