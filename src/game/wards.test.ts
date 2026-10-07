import { describe, expect, it } from 'vitest';
import { createCharacter } from './character';
import { alive, ch, clanRegions, ruler } from './core';
import { currentHeir } from './life';
import { heldKin } from './eventsCourt';
import { feelingsSum, relationOf } from './relations';
import type { Character, Clan, GameState } from './types';
import {
  aiWardsTick,
  allWardships,
  appointMentor,
  completeWardship,
  detainWard,
  endMentorship,
  fosterBlocker,
  fosterChance,
  fosterOptions,
  hostWard,
  isAway,
  mentorBlocker,
  mentorCandidates,
  mentorshipOf,
  sendAsWard,
  teachingOf,
  wardshipOf,
  MAX_PUPILS,
} from './wards';
import { createWorld, rollRuler, startGame } from './world';

function world(seed = 7): GameState {
  const s = createWorld(seed + 200);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(seed, 'mars', 'F', 'Ines'), focus: 'dip', age: 40, family: 'married' });
  Object.assign(s, { credits: 2000, prestige: 400 });
  for (const k of Object.values(s.clans)) if (!k.isPlayer) k.opinion = 40;
  return s;
}

function child(s: GameState, age: number, clanId = s.playerClanId, parentId = s.rulerId): Character {
  const parent = s.characters[parentId];
  const c = createCharacter(s, {
    gender: age % 2 ? 'M' : 'F',
    born: s.year - age,
    clanId,
    planetId: parent.planetId,
    fatherId: parent.gender === 'M' ? parent.id : undefined,
    motherId: parent.gender === 'F' ? parent.id : undefined,
  });
  parent.childrenIds.push(c.id);
  return c;
}

function houses(s: GameState): Clan[] {
  return Object.values(s.clans).filter((k) => !k.isPlayer && clanRegions(s, k.id).length > 0 && alive(ch(s, k.headId)));
}

/** A house whose lord is a strong, brave, cruel commander. */
function sternHouse(s: GameState): Clan {
  const k = houses(s)[0];
  const lord = s.characters[k.headId];
  lord.born = Math.min(lord.born, s.year - 45);
  lord.prisonerOf = undefined;
  lord.base = { dip: 0, cmd: 11, eco: 0, int: 0, sci: 0 };
  lord.traits = ['brave'];
  return k;
}

describe('sending a child to be raised at another court', () => {
  it('only takes children of the right age, to houses that are willing and not hostile', () => {
    const s = world();
    const k = sternHouse(s);
    expect(fosterBlocker(s, child(s, 4).id, k.id)).toMatch(/between 6 and 14/);
    expect(fosterBlocker(s, child(s, 15).id, k.id)).toMatch(/between 6 and 14/);
    const kid = child(s, 8);
    expect(fosterBlocker(s, kid.id, k.id)).toBeNull();
    k.opinion = -50;
    expect(fosterBlocker(s, kid.id, k.id)).toMatch(/would not have/);
    k.opinion = 40;
    kid.prisonerOf = houses(s)[1].id;
    expect(fosterBlocker(s, kid.id, k.id)).toMatch(/captive/);
  });

  it('a house that likes you is likelier to agree, and a refusal means a few years before you ask again', () => {
    const s = world();
    const k = sternHouse(s);
    k.opinion = 80;
    const warm = fosterChance(s, k.id);
    k.opinion = -20;
    expect(fosterChance(s, k.id)).toBeLessThan(warm);
    let refused = false;
    for (let seed = 1; seed < 40 && !refused; seed++) {
      const t = world();
      const host = sternHouse(t);
      host.opinion = -20;
      t.seed = seed;
      const kid = child(t, 8);
      if (!sendAsWard(t, kid.id, host.id)) {
        refused = true;
        expect(fosterBlocker(t, kid.id, host.id)).toMatch(/turned you down/);
        expect(t.pending.some((p) => p.kind === 'notice' && p.title === 'Politely Declined')).toBe(true);
      }
    }
    expect(refused).toBe(true);
  });

  it('a ward is away until 16, and the house that takes them remembers the trust', () => {
    const s = world();
    const k = sternHouse(s);
    const kid = child(s, 8);
    expect(sendAsWard(s, kid.id, k.id, true)).toBe(true);
    const w = wardshipOf(s, kid.id)!;
    expect(w.hostId).toBe(k.id);
    expect(w.due).toBe(kid.born + 16);
    expect(isAway(s, kid)).toBe(true);
    expect(k.memories?.some((m) => m.text === 'Entrusted their child to us')).toBe(true);
    expect(fosterOptions(s, kid.id)).toHaveLength(0);
  });

  it('coming home: the lord’s skill, bonds with the family who raised them, and a friend for life', () => {
    const s = world();
    const k = sternHouse(s);
    const lord = s.characters[k.headId];
    lord.childrenIds = []; // This case has one deliberately chosen foster sibling.
    const fosterSibling = child(s, 9, k.id, lord.id);
    const kid = child(s, 8);
    kid.base.cmd = 3;
    sendAsWard(s, kid.id, k.id, true);
    s.year += 8;
    const summary = completeWardship(s, kid.id);
    expect(summary).toContain(`comes home from House ${k.name}`);
    expect(wardshipOf(s, kid.id)).toBeUndefined();
    expect(kid.base.cmd).toBe(5);
    expect(feelingsSum(s, kid, lord)).toBeGreaterThan(20);
    expect(feelingsSum(s, lord, kid)).toBeGreaterThan(15);
    expect(relationOf(s, kid.id, fosterSibling.id)?.kind).toBe('friend');
    expect(relationOf(s, fosterSibling.id, kid.id)?.kind).toBe('friend');
  });

  it('a skill is never taught past the teacher’s own', () => {
    const s = world();
    const k = sternHouse(s);
    const kid = child(s, 8);
    const t = teachingOf(s, s.characters[k.headId]);
    kid.base[t.stat] = t.level;
    sendAsWard(s, kid.id, k.id, true);
    s.year += 8;
    completeWardship(s, kid.id);
    expect(kid.base[t.stat]).toBe(t.level);
  });

  it('raised young and long at a court of another faith, some children take it up; a short stay never converts', () => {
    let converted = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = world();
      const k = sternHouse(s);
      k.faithId = ruler(s).faithId === 'solar' ? 'veiled' : 'solar';
      const kid = child(s, 6);
      sendAsWard(s, kid.id, k.id, true);
      s.seed = seed * 101;
      s.year += 9;
      completeWardship(s, kid.id);
      if (kid.faithId === k.faithId) converted++;
      const t = world();
      const host = sternHouse(t);
      host.faithId = ruler(t).faithId === 'solar' ? 'veiled' : 'solar';
      const brief = child(t, 9);
      sendAsWard(t, brief.id, host.id, true);
      t.seed = seed * 101;
      t.year += 2;
      completeWardship(t, brief.id);
      expect(brief.faithId).not.toBe(host.faithId);
    }
    expect(converted).toBeGreaterThan(3);
    expect(converted).toBeLessThan(27);
  });

  it('a cruel guardian can leave scars', () => {
    let scarred = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = world();
      const k = sternHouse(s);
      s.characters[k.headId].traits.push('cruel');
      const kid = child(s, 8);
      sendAsWard(s, kid.id, k.id, true);
      s.seed = seed * 7;
      s.year += 6;
      completeWardship(s, kid.id);
      if ((s.relations[kid.id]?.[k.headId]?.feelings ?? []).some((f) => f.key === 'harsh')) scarred++;
    }
    expect(scarred).toBeGreaterThan(3);
  });

  it('war turns a ward into a hostage, and their family hears the ransom demand', () => {
    const s = world();
    const k = sternHouse(s);
    const kid = child(s, 8);
    sendAsWard(s, kid.id, k.id, true);
    detainWard(s, kid.id);
    expect(kid.prisonerOf).toBe(k.id);
    expect(wardshipOf(s, kid.id)).toBeUndefined();
    expect(heldKin(s)?.id).toBe(kid.id);
  });

  it('you can raise another house’s child too, and they go home bound to you', () => {
    const s = world();
    const k = sternHouse(s);
    const theirs = child(s, 7, k.id, k.headId);
    expect(hostWard(s, theirs.id)).toBe(true);
    expect(wardshipOf(s, theirs.id)?.hostId).toBe(s.playerClanId);
    s.year += 9;
    completeWardship(s, theirs.id);
    expect(feelingsSum(s, theirs, ruler(s))).toBeGreaterThan(20);
    expect(k.memories?.some((m) => m.text === 'Raised our child')).toBe(true);
  });
});

describe('mentors', () => {
  it('can be you, your spouse, your kin or a councillor, and each takes at most two pupils', () => {
    const s = world();
    const a = child(s, 7);
    const b = child(s, 8);
    const c = child(s, 9);
    const names = mentorCandidates(s, a.id).map((x) => x.id);
    expect(names).toContain(s.rulerId);
    expect(names).toContain(ruler(s).spouseId);
    expect(appointMentor(s, a.id, s.rulerId)).toBe(true);
    expect(appointMentor(s, b.id, s.rulerId)).toBe(true);
    expect(mentorBlocker(s, c.id, s.rulerId)).toMatch(new RegExp(`${MAX_PUPILS} pupils`));
    expect(mentorBlocker(s, child(s, 3).id, s.rulerId)).toMatch(/aged 6 to 15/);
  });

  it('a mentor’s years leave a skill, a bond, and better lessons in their field', () => {
    const s = world();
    const kid = child(s, 8);
    const mentor = ch(s, ruler(s).spouseId)!;
    const t = teachingOf(s, mentor);
    kid.base[t.stat] = Math.max(1, t.level - 4);
    kid.edu = { focus: t.stat, tutor: 'household', progress: 10 };
    appointMentor(s, kid.id, mentor.id);
    const before = kid.base[t.stat];
    s.year += 6;
    const summary = endMentorship(s, kid.id);
    expect(summary).toContain(`years with ${mentor.name}`);
    expect(mentorshipOf(s, kid.id)).toBeUndefined();
    expect(kid.base[t.stat]).toBe(before + 2);
    expect(kid.edu!.progress).toBe(10 + 24);
    expect(feelingsSum(s, kid, mentor)).toBeGreaterThan(20);
    expect(relationOf(s, kid.id, mentor.id)?.kind).toBe('friend');
  });

  it('an ordinary child’s lessons end quietly at 16; the heir’s wait for you', () => {
    const s = world();
    const heir = child(s, 12);
    const younger = child(s, 9);
    expect(currentHeir(s)?.id).toBe(heir.id);
    appointMentor(s, heir.id, s.rulerId);
    appointMentor(s, younger.id, ruler(s).spouseId!);
    s.year = younger.born + 16;
    aiWardsTick(s);
    expect(mentorshipOf(s, younger.id)).toBeUndefined();
    expect(s.log.some((l) => l.t.includes(`${younger.name}'s years with`))).toBe(true);
    expect(mentorshipOf(s, heir.id)).toBeDefined();
  });

  it('sending a child away as a ward ends their mentorship at home', () => {
    const s = world();
    const k = sternHouse(s);
    const kid = child(s, 8);
    appointMentor(s, kid.id, s.rulerId);
    sendAsWard(s, kid.id, k.id, true);
    expect(mentorshipOf(s, kid.id)).toBeUndefined();
    expect(mentorBlocker(s, kid.id, s.rulerId)).toMatch(/children of your court/);
  });
});

describe('AI houses foster their children too', () => {
  it('over the years AI lords send children to kin and friends, and bring them home bonded', () => {
    const s = world();
    for (const k of houses(s)) {
      const lord = s.characters[k.headId];
      lord.born = Math.min(lord.born, s.year - 45);
      for (const age of [6, 7, 8]) child(s, age, k.id, lord.id);
    }
    let started = 0;
    for (let i = 0; i < 30; i++) {
      s.year += 1;
      const before = allWardships(s).length;
      aiWardsTick(s);
      started += Math.max(0, allWardships(s).length - before);
    }
    expect(started).toBeGreaterThan(2);
    const bonded = Object.values(s.characters).some((c) =>
      s.relations[c.id] ? Object.values(s.relations[c.id]).some((r) => r.feelings.some((f) => f.key === 'fostered')) : false,
    );
    expect(bonded).toBe(true);
  });

  it('an AI ward whose houses go to war becomes a hostage', () => {
    const s = world();
    const [a, b] = houses(s);
    const kid = child(s, 8, a.id, a.headId);
    s.flags = { ...(s.flags ?? {}), [`ward:${kid.id}`]: { due: s.year + 8, data: { host: b.id, home: a.id, guardian: b.headId, since: s.year } } };
    s.aiWars.push({ id: 'aw-t', attacker: a.id, defender: b.id, target: clanRegions(s, b.id)[0].id, started: s.year, progress: 0 });
    aiWardsTick(s);
    expect(kid.prisonerOf).toBe(b.id);
  });

  it('under a regency your wards still come home on time', () => {
    const s = world();
    const k = sternHouse(s);
    const kid = child(s, 8);
    sendAsWard(s, kid.id, k.id, true);
    s.year = kid.born + 16;
    ruler(s).born = s.year - 10;
    aiWardsTick(s);
    expect(wardshipOf(s, kid.id)).toBeUndefined();
  });
});
