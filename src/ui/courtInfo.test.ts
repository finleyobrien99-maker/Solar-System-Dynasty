import { describe, expect, it } from 'vitest';
import { beginAffair, captiveRansom, exposeAffair } from '../game/aiCourt';
import { createCharacter } from '../game/character';
import { ruler } from '../game/core';
import { addFeeling } from '../game/relations';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../game/world';
import { affairInfo, captivityInfo } from './courtInfo';

function game() {
  const s = createWorld(71),
    k = scenarioHouses(s, 'mars', 'monarch')[0];
  return startGame(s, { clanId: k.id, ruler: rollRuler(71, 'mars', 'M', 'Tav'), focus: 'dip', age: 40, family: 'kids' });
}
describe('court facts shown to the player', () => {
  it('shows the current ransom price, preserves an issued quote, and never changes the save or dice', () => {
    const s = game(),
      c = s.characters[ruler(s).childrenIds[0]],
      captor = Object.values(s.clans).find((k) => !k.isPlayer)!;
    c.prisonerOf = captor.id;
    const price = captiveRansom(s, c),
      before = JSON.stringify(s);
    expect(captivityInfo(s, c)).toMatchObject({ captor, amount: price, quoted: false });
    expect(JSON.stringify(s)).toBe(before);
    s.pending.push({ kind: 'event', uid: 'ransom', eventId: 'kin_ransom', subjectId: c.id, data: { clan: captor.id, amount: 999 } });
    const quoted = JSON.stringify(s);
    expect(captivityInfo(s, c)).toMatchObject({ amount: 999, quoted: true });
    expect(JSON.stringify(s)).toBe(quoted);
    s.pending[0] = { kind: 'event', uid: 'other', eventId: 'kin_ransom', subjectId: ruler(s).id, data: { clan: captor.id, amount: 500 } };
    expect(captivityInfo(s, c)?.amount).toBe(price);
  });
  it('does not label the dead, freed kin, missing captors or prisoners held by the player as captive relatives', () => {
    const s = game(),
      c = s.characters[ruler(s).childrenIds[0]],
      k = Object.values(s.clans).find((k) => !k.isPlayer)!;
    for (const id of [undefined, 'missing-house', s.playerClanId]) {
      c.prisonerOf = id;
      expect(captivityInfo(s, c)).toBeUndefined();
    }
    c.prisonerOf = k.id;
    c.died = s.year;
    expect(captivityInfo(s, c)).toBeUndefined();
  });
  it('reads secret and exposed AI affairs from actual discoveries without inventing a new discovery', () => {
    const s = game(),
      a = ruler(s),
      k = Object.values(s.clans).find((k) => !k.isPlayer)!;
    const b = createCharacter(s, { clanId: k.id, planetId: k.planetId, faithId: k.faithId, gender: 'F', born: s.year - 30 });
    beginAffair(s, a, b);
    const before = JSON.stringify(s);
    expect(affairInfo(s, a)).toMatchObject({ lover: b, status: 'No discovery recorded' });
    expect(JSON.stringify(s)).toBe(before);
    // Discovering another lover must not falsely expose this pair.
    addFeeling(s, a.spouseId!, 'someone-else', { key: 'seduced:' + a.id, why: 'An old affair', value: -50, decay: 0.5 });
    expect(affairInfo(s, a)?.status).toBe('No discovery recorded');
    exposeAffair(s, a, b);
    expect(affairInfo(s, a)?.status).toBe('Exposed affair');
    expect(affairInfo(s, b)?.status).toBe('Exposed affair');
  });
  it('distinguishes unmarried lovers from affairs and hides dead or missing lovers', () => {
    const s = game(),
      a = ruler(s),
      b = s.characters[a.spouseId!];
    a.spouseId = undefined;
    b.spouseId = undefined;
    beginAffair(s, a, b);
    expect(affairInfo(s, a)?.status).toBe('Lovers');
    b.died = s.year;
    expect(affairInfo(s, a)).toBeUndefined();
    a.loverId = 'missing';
    expect(affairInfo(s, a)).toBeUndefined();
  });
});
