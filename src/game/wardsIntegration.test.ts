import { describe, expect, it } from 'vitest';
import { exportSave, importSave } from './save';
import { prune } from './ai';
import { createCharacter } from './character';
import { ruler } from './core';
import { creditLines } from './economy';
import { dynastyKids, randomCourt } from './eventKit';
import { setEducation } from './family';
import { growthTick } from './life';
import { addFeeling, relationOf, relationsTick, spendTime, timeBlocker } from './relations';
import { aiWardsTick, appointMentor, endMentorship, hostWard, mentorshipOf, recallWard, sendAsWard, wardshipOf } from './wards';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';
import type { Character, GameState } from './types';

function fixture() {
  const s = createWorld(97);
  const home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(97, 'mars', 'F', 'Asha'), focus: 'dip', age: 40, family: 'married' });
  s.credits = 2000;
  for (const k of Object.values(s.clans)) if (!k.isPlayer) k.opinion = 90;
  const host = Object.values(s.clans).find((k) => !k.isPlayer && k.planetId === 'mars' && s.characters[k.headId]?.died === undefined)!;
  const child = (age: number, parent: Character = ruler(s)) => {
    const c = createCharacter(s, { born: s.year - age, clanId: parent.clanId, planetId: parent.planetId, motherId: parent.id, gender: 'M' });
    parent.childrenIds.push(c.id);
    c.edu = { focus: 'dip', tutor: 'ai', progress: 20 };
    return c;
  };
  return { s, host, child };
}
const tuition = (s: GameState) => creditLines(s).find((l) => l.label === 'Heir tuition')?.value ?? 0;

describe('upbringing across court systems', () => {
  it('exports active fostering and mentorships with the same seeded homecoming and personal bonds after import', () => {
    const { s, host, child } = fixture();
    const ward = child(8),
      pupil = child(9);
    expect(sendAsWard(s, ward.id, host.id, true)).toBe(true);
    expect(appointMentor(s, pupil.id, s.rulerId)).toBe(true);
    const restored = importSave(exportSave(s));
    expect(wardshipOf(restored, ward.id)).toEqual(wardshipOf(s, ward.id));
    expect(mentorshipOf(restored, pupil.id)).toEqual(mentorshipOf(s, pupil.id));
    s.year += 4;
    restored.year += 4;
    expect(recallWard(restored, ward.id)).toBe(recallWard(s, ward.id));
    expect(endMentorship(restored, pupil.id)).toBe(endMentorship(s, pupil.id));
    expect(restored.seed).toBe(s.seed);
    expect(restored.characters[ward.id].base).toEqual(ward.base);
    expect(restored.characters[ward.id].traits).toEqual(ward.traits);
    expect(restored.relations).toEqual(s.relations);
  });

  it('pauses home tuition, editing and visits abroad, then restores them after a real homecoming', () => {
    const { s, host, child } = fixture();
    const c = child(11);
    expect(tuition(s)).toBe(-60);
    expect(sendAsWard(s, c.id, host.id, true)).toBe(true);
    const before = structuredClone(s);
    expect(tuition(s)).toBe(0);
    expect(timeBlocker(s, c.id)).toMatch(/another court/);
    expect(spendTime(s, c.id, 'dinner')).toBe(false);
    setEducation(s, c.id, 'cmd', 'academy');
    expect(s).toEqual(before);
    s.year += 3;
    relationsTick(s);
    expect(relationOf(s, c.id, s.rulerId)?.feelings.some((f) => f.key === 'neglect')).not.toBe(true);
    addFeeling(s, c.id, s.rulerId, { why: 'A real grievance', key: 'test-grievance', value: -20, decay: 0 });
    recallWard(s, c.id);
    expect(tuition(s)).toBe(-60);
    expect(relationOf(s, c.id, s.rulerId)?.together).toBe(s.year);
    s.year++;
    relationsTick(s);
    expect(timeBlocker(s, c.id)).toBeNull();
    expect(relationOf(s, c.id, s.rulerId)?.feelings.some((f) => f.key === 'neglect')).not.toBe(true);
    expect(relationOf(s, c.id, s.rulerId)?.feelings.some((f) => f.key === 'test-grievance')).toBe(true);
    setEducation(s, c.id, 'cmd', 'academy');
    expect(c.edu?.tutor).toBe('academy');
  });

  it('uses foster household lessons rather than an unpaid home AI tutor or home scientist', () => {
    const { s, host, child } = fixture();
    const c = child(8);
    sendAsWard(s, c.id, host.id, true);
    const teacher = createCharacter(s, { clanId: s.playerClanId, born: s.year - 30, planetId: 'mars', gender: 'F' });
    teacher.base.sci = 12;
    s.council.scientist = teacher.id;
    const household = structuredClone(s);
    household.characters[c.id].edu!.tutor = 'household';
    household.council.scientist = undefined;
    growthTick(s);
    growthTick(household);
    expect(c.edu?.progress).toBe(household.characters[c.id].edu?.progress);
    expect(c.edu!.progress).toBeGreaterThan(20);
    expect(s.seed).toBe(household.seed);
    expect(c.base).toEqual(household.characters[c.id].base);
  });

  it('keeps distant wards out of local childhood and court events', () => {
    const { s, host, child } = fixture();
    const c = child(8);
    sendAsWard(s, c.id, host.id, true);
    expect(dynastyKids(s, 6, 14).map((k) => k.id)).not.toContain(c.id);
    for (let i = 0; i < 60; i++) expect(randomCourt(s)?.id).not.toBe(c.id);
    recallWard(s, c.id);
    expect(dynastyKids(s, 6, 14).map((k) => k.id)).toContain(c.id);
  });

  it('lets a guest ward at your own court visit and have a mentor without billing their parents home tuition', () => {
    const { s, host, child } = fixture();
    const guest = child(8, s.characters[host.headId]);
    expect(hostWard(s, guest.id)).toBe(true);
    expect(timeBlocker(s, guest.id)).toBeNull();
    expect(spendTime(s, guest.id, 'dinner')).toBe(true);
    expect(appointMentor(s, guest.id, s.rulerId)).toBe(true);
    expect(mentorshipOf(s, guest.id)?.mentorId).toBe(s.rulerId);
    expect(tuition(s)).toBe(0);
  });

  it('rejects stale adult, captive and hostile foster offers without consuming anything', () => {
    for (const reason of ['adult', 'captive', 'hostile'] as const) {
      const { s, host, child } = fixture();
      const guest = child(reason === 'adult' ? 16 : 8, s.characters[host.headId]);
      if (reason === 'captive') guest.prisonerOf = s.playerClanId;
      if (reason === 'hostile') host.opinion = -90;
      const before = structuredClone(s);
      expect(hostWard(s, guest.id)).toBe(false);
      expect(s).toEqual(before);
    }
  });

  it('retains original foster guardians for history and ends unavailable mentorships during a regency', () => {
    const { s, host, child } = fixture();
    const c = child(8);
    sendAsWard(s, c.id, host.id, true);
    const original = s.characters[host.headId];
    const replacement = createCharacter(s, { clanId: host.id, planetId: host.planetId, born: s.year - 30, gender: 'M' });
    original.died = s.year - 3;
    host.headId = replacement.id;
    prune(s);
    expect(s.characters[wardshipOf(s, c.id)!.guardianId]).toBe(original);
    const pupil = child(9);
    const mentor = s.characters[ruler(s).spouseId!];
    expect(appointMentor(s, pupil.id, mentor.id)).toBe(true);
    mentor.prisonerOf = host.id;
    ruler(s).born = s.year - 10;
    aiWardsTick(s);
    expect(mentorshipOf(s, pupil.id)).toBeUndefined();
    expect(s.log.some((l) => l.t.includes(pupil.name) && l.k === 'family')).toBe(true);
  });
});
