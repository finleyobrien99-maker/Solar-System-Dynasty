import { describe, expect, it } from 'vitest';
import { AMBITIONS, ambitionChoices, ambitionProgress, ambitionsTick, chooseAmbition, finishAmbition, observeAmbition } from './ambitions';
import { recordDeed } from './epithets';
import { ruler } from './core';
import { createWorld, rollRuler, startGame } from './world';
import { exportSave, importSave } from './save';
import { killCharacter } from './life';
import { createCharacter } from './character';

function setup() {
  const s = createWorld(52);
  const clan = Object.values(s.clans).find((k) => k.planetId === 'mars')!;
  startGame(s, { clanId: clan.id, ruler: rollRuler(52, 'mars', 'F'), focus: 'dip' });
  return s;
}
describe('coronation vows', () => {
  it('offers three pure personality-based choices and permits only one personal vow', () => {
    const s = setup(),
      c = ruler(s);
    c.traits = ['calm', 'content', 'craven'];
    const before = JSON.stringify(s);
    const choices = ambitionChoices(s);
    expect(choices).toHaveLength(3);
    expect(choices[0]).toBe('peacemaker');
    expect(JSON.stringify(s)).toBe(before);
    expect(chooseAmbition(s, choices[0])).toBe(true);
    expect(chooseAmbition(s, choices[1])).toBe(false);
    c.born = s.year - 12;
    c.ambition = undefined;
    expect(ambitionChoices(s)).toEqual([]);
    expect(chooseAmbition(s, 'peacemaker')).toBe(false);
  });
  it('counts only new personal deeds and pays one lasting reward', () => {
    const s = setup(),
      c = ruler(s);
    c.traits = ['diligent', 'patient'];
    recordDeed(s, c, 'development', 20);
    const prestige = s.prestige;
    expect(chooseAmbition(s, 'builder')).toBe(true);
    expect(ambitionProgress(c)).toBe(0);
    recordDeed(s, c, 'development', 7);
    observeAmbition(s, c);
    expect(c.ambition?.status).toBe('active');
    recordDeed(s, c, 'development');
    observeAmbition(s, c);
    expect(c.ambition?.status).toBe('fulfilled');
    expect(c.traits).toContain('fulfilled');
    expect(s.prestige).toBe(prestige + AMBITIONS.builder.reward);
    observeAmbition(s, c);
    ambitionsTick(s);
    expect(s.prestige).toBe(prestige + AMBITIONS.builder.reward);
  });
  it('requires consecutive peaceful cycles, resets on war and never counts a year twice', () => {
    const s = setup(),
      c = ruler(s);
    c.traits = ['calm', 'content'];
    chooseAmbition(s, 'peacemaker');
    for (let i = 0; i < 4; i++) {
      s.year++;
      ambitionsTick(s);
      ambitionsTick(s);
    }
    expect(ambitionProgress(c)).toBe(4);
    s.wars.push({
      id: 'test-war',
      enemy: Object.keys(s.clans).find((id) => id !== s.playerClanId)!,
      target: '',
      playerAttacker: true,
      cb: 'conquest',
      score: 0,
      started: s.year,
    });
    s.year++;
    ambitionsTick(s);
    expect(ambitionProgress(c)).toBe(0);
    s.wars = [];
    for (let i = 0; i < 8; i++) {
      s.year++;
      ambitionsTick(s);
    }
    expect(c.ambition?.status).toBe('fulfilled');
  });
  it("does not count somebody else's deeds or starting children", () => {
    const s = setup(),
      c = ruler(s);
    c.traits = ['gregarious'];
    const child = createCharacter(s, { clanId: s.playerClanId, planetId: 'mars', motherId: c.id, born: s.year - 4 });
    c.childrenIds.push(child.id);
    chooseAmbition(s, 'dynasty');
    expect(ambitionProgress(c)).toBe(0);
    for (let i = 0; i < 3; i++) c.childrenIds.push(createCharacter(s, { clanId: c.clanId, planetId: 'mars', motherId: c.id, born: s.year }).id);
    observeAmbition(s, c);
    expect(c.ambition?.status).toBe('fulfilled');
  });
  it('records failure when a ruler dies without passing their vow to the heir', () => {
    const s = setup(),
      c = ruler(s),
      kind = ambitionChoices(s)[0];
    chooseAmbition(s, kind);
    const heir = createCharacter(s, { clanId: c.clanId, planetId: 'mars', motherId: c.id, born: s.year - 18 });
    c.childrenIds.push(heir.id);
    killCharacter(s, c.id, 'old age');
    expect(c.ambition?.status).toBe('failed');
    expect(ruler(s).ambition).toBeUndefined();
    expect(ambitionChoices(s)).toHaveLength(3);
  });
  it('lets AI heads pursue real goals using their own rewards with VIP enabled', () => {
    const s = setup();
    s.vip = { on: true };
    const house = Object.values(s.clans).find((k) => k.id !== s.playerClanId)!;
    const c = s.characters[house.headId];
    c.traits = ['greedy'];
    c.ambition = undefined;
    expect(ambitionChoices(s, c)[0]).toBe('prosperous');
    chooseAmbition(s, 'prosperous', c.id);
    const player = s.prestige,
      own = house.prestige;
    recordDeed(s, c, 'income', 1200);
    observeAmbition(s, c);
    expect(s.characters[c.id].ambition?.status).toBe('fulfilled');
    expect(house.prestige).toBe(own + 80);
    expect(s.prestige).toBe(player);
  });
  it('round-trips an active ambition and freezes its recorded progress on retirement', () => {
    const s = setup(),
      c = ruler(s);
    c.traits = ['diligent', 'patient'];
    chooseAmbition(s, 'builder');
    recordDeed(s, c, 'development', 3);
    const restored = importSave(exportSave(s));
    expect(ambitionProgress(ruler(restored))).toBe(3);
    finishAmbition(restored, ruler(restored));
    recordDeed(restored, ruler(restored), 'development', 10);
    expect(ambitionProgress(ruler(restored))).toBe(3);
    expect(ruler(restored).ambition?.status).toBe('failed');
  });
});
