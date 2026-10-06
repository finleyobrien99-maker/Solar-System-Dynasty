import { describe, expect, it } from 'vitest';
import { inheritLooks } from './character';
import { ruler } from './core';
import { canEditPortrait, hexColour, normalisePortrait, setHouseIdentity, setPortrait } from './identity';
import { exportSave, importSave, MIGRATIONS } from './save';
import { goalWorld } from './warGoalScenarios';

describe('cosmetic identity', () => {
  it('saves arbitrary RGB colours without spending, rolling or changing inherited appearance', () => {
    const s = goalWorld(),
      before = structuredClone(s),
      c = ruler(s);
    expect(setPortrait(s, c.id, { hairColor: '#ABC', skinColor: '#123456', eyeColor: '#ffffff', face: 3 })).toBe(true);
    const expected = structuredClone(before);
    expected.characters[c.id].portrait = { hairColor: '#aabbcc', skinColor: '#123456', eyeColor: '#ffffff', face: 3 };
    expect(s).toEqual(expected);
    expect(importSave(exportSave(s)).characters[c.id]).toEqual(c);
    expect(inheritLooks({ seed: 123 }, c.looks, c.looks, c.planetId)).toEqual(
      inheritLooks({ seed: 123 }, before.characters[c.id].looks, before.characters[c.id].looks, c.planetId),
    );
    expect(setPortrait(s, c.id, {})).toBe(true);
    expect(s).toEqual(before);
  });
  it('edits house identity while preserving land, resources and diplomatic ties', () => {
    const s = goalWorld(),
      before = structuredClone(s),
      clan = s.clans[s.playerClanId];
    const spec = { shape: 4, division: 6, charge: 15, c1: '#ABC', c2: '#345678', c3: '#fedcba' };
    expect(setHouseIdentity(s, clan.id, '  Starlight  ', spec)).toBe(true);
    const expected = structuredClone(before);
    Object.assign(expected.clans[clan.id], { name: 'Starlight', sigil: { ...spec, c1: '#aabbcc' }, color: '#aabbcc' });
    expect(s).toEqual(expected);
    spec.c2 = '#000000';
    expect(clan.sigil.c2).toBe('#345678');
    expect(importSave(exportSave(s)).clans[clan.id]).toEqual(clan);
  });
  it('allows own dynasty and spouse, gates rival cosmetics, and never allows rival house edits', () => {
    const s = goalWorld(),
      c = ruler(s),
      foreign = Object.values(s.characters).find((x) => x.clanId !== s.playerClanId)!;
    expect(canEditPortrait(s, c)).toBe(true);
    const before = structuredClone(s);
    expect(setPortrait(s, foreign.id, { face: 3 })).toBe(false);
    expect(setHouseIdentity(s, foreign.clanId, 'Nope', s.clans[foreign.clanId].sigil)).toBe(false);
    expect(setPortrait(s, 'missing', {})).toBe(false);
    expect(s).toEqual(before);
    c.spouseId = foreign.id;
    expect(setPortrait(s, foreign.id, { face: 3 })).toBe(true);
    c.spouseId = undefined;
    s.vip = { on: true };
    expect(setPortrait(s, foreign.id, { face: 1 })).toBe(true);
    expect(setHouseIdentity(s, foreign.clanId, 'Nope', s.clans[foreign.clanId].sigil)).toBe(false);
  });
  it.each([{ face: -1 }, { hairStyle: 8 }, { beard: 1.5 }, { eyes: NaN }, { hairColor: 'red' }, { skinColor: 'url(example)' }, { base: 30 }, []])(
    'invalid appearance %j is wholly inert',
    (draft) => {
      const s = goalWorld(),
        before = structuredClone(s);
      expect(normalisePortrait(draft)).toBeNull();
      expect(setPortrait(s, s.rulerId, draft as never)).toBe(false);
      expect(s).toEqual(before);
    },
  );
  it.each([{ c1: 'red' }, { shape: -1 }, { charge: 16 }, { division: 7 }, { shape: 1.5 }])('invalid house design %j is wholly inert', (patch) => {
    const s = goalWorld(),
      before = structuredClone(s);
    expect(setHouseIdentity(s, s.playerClanId, 'New', { ...s.clans[s.playerClanId].sigil, ...patch })).toBe(false);
    expect(s).toEqual(before);
  });
  it('v12 migration is idempotent and invents no cosmetics', () => {
    const s = goalWorld(),
      before = structuredClone(s);
    MIGRATIONS[12](s);
    expect(s).toEqual(before);
    s.characters[s.rulerId].portrait = { hairColor: '#AbC', face: 3 };
    MIGRATIONS[12](s);
    expect(ruler(s).portrait).toEqual({ hairColor: '#aabbcc', face: 3 });
    const once = structuredClone(s);
    MIGRATIONS[12](s);
    expect(s).toEqual(once);
  });
  it('accepts compact and full hex colours only', () => {
    expect(hexColour(' #aB9 ')).toBe('#aabb99');
    expect(hexColour('#000000')).toBe('#000000');
    for (const text of ['#abcd', '336699', '#12345678', 'transparent', '#gggggg', '']) expect(hexColour(text)).toBeNull();
  });
});
