import { describe, expect, it } from 'vitest';
import { kinship } from './ancestry';
import { createCharacter } from './character';
import { createWorld, rollRuler, startGame } from './world';
import { acceptSuitor, generateSuitors } from './family';
import { ruler } from './core';

function setup() {
  const s = createWorld(61);
  const house = Object.values(s.clans).find((k) => k.planetId === 'mars')!;
  startGame(s, { clanId: house.id, ruler: rollRuler(61, 'mars', 'F'), focus: 'dip', age: 40 });
  const person = (name: string, fatherId?: string, motherId?: string) =>
    createCharacter(s, { name, clanId: house.id, planetId: 'mars', born: s.year - 20, fatherId, motherId });
  return { s, person };
}
describe('recorded ancestry', () => {
  it('recognises full siblings, half siblings and parent-child across house names', () => {
    const { s, person } = setup(),
      father = person('Father'),
      mother = person('Mother');
    const a = person('A', father.id, mother.id),
      b = person('B', father.id, mother.id),
      half = person('Half', father.id);
    b.clanId = Object.keys(s.clans).find((id) => id !== a.clanId)!;
    expect(kinship(s, a, b)).toMatchObject({ label: 'Siblings', coefficient: 0.25, close: true });
    expect(kinship(s, a, half)).toMatchObject({ label: 'Half-siblings', coefficient: 0.125 });
    expect(kinship(s, father, a)).toMatchObject({ label: 'Parent and child', coefficient: 0.25 });
  });
  it('counts first cousins once per independent common-parent path', () => {
    const { s, person } = setup(),
      g = person('Grandfather'),
      m = person('Grandmother');
    const p = person('Parent1', g.id, m.id),
      q = person('Parent2', g.id, m.id);
    const a = person('A', p.id),
      b = person('B', q.id);
    const before = JSON.stringify(s);
    expect(kinship(s, a, b)).toMatchObject({ label: 'First cousins', coefficient: 0.0625 });
    expect(JSON.stringify(s)).toBe(before);
  });
  it('does not infer kinship from a shared house, identical genes or missing ancestors', () => {
    const { s, person } = setup(),
      a = person('A'),
      b = person('B');
    a.traits = b.traits = ['genius', 'beautiful'];
    a.fatherId = 'unknown-a';
    b.fatherId = 'unknown-b';
    expect(kinship(s, a, b).coefficient).toBe(0);
  });
  it('uses known parent IDs even if an old parent record was pruned', () => {
    const { s, person } = setup(),
      a = person('A', 'recorded-parent'),
      b = person('B', 'recorded-parent');
    expect(kinship(s, a, b)).toMatchObject({ label: 'Half-siblings', coefficient: 0.125 });
  });
  it('handles repeated family paths and corrupt ancestry cycles without looping', () => {
    const { s, person } = setup(),
      a = person('A'),
      b = person('B');
    a.fatherId = b.id;
    b.fatherId = a.id;
    expect(Number.isFinite(kinship(s, a, b).coefficient)).toBe(true);
  });
  it('records offered highborn ancestry before acceptance without adding unchosen children', () => {
    const { s } = setup(),
      r = ruler(s);
    for (const k of Object.values(s.clans)) if (k.id !== s.playerClanId && s.characters[k.headId]) s.characters[k.headId].born = s.year - 80;
    const originals = new Map(Object.values(s.characters).map((c) => [c.id, [...c.childrenIds]]));
    for (let i = 0; i < 10 && !s.suitors?.list.some((x) => x.highborn); i++) generateSuitors(s, r.id);
    const index = s.suitors!.list.findIndex((x) => x.highborn),
      candidate = s.suitors!.list[index].char;
    const parentId = candidate.fatherId ?? candidate.motherId;
    expect(parentId).toBeTruthy();
    expect(s.characters[candidate.id]).toBeUndefined();
    for (const [id, children] of originals) expect(s.characters[id].childrenIds).toEqual(children);
    const house = s.clans[candidate.clanId],
      former = house.headId;
    house.headId = createCharacter(s, { clanId: house.id, planetId: house.planetId, born: s.year - 30 }).id;
    s.prestige = 1000;
    expect(acceptSuitor(s, index)).toBe(true);
    expect(candidate.fatherId ?? candidate.motherId).toBe(former);
    expect(s.characters[former].childrenIds).toContain(candidate.id);
  });
});
