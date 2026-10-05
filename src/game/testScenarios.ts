// Test data built through actual engine actions; never imported by the app.
import { createCharacter } from './character';
import { alive, ch, clanRank, clanRegions } from './core';
import { killCharacter } from './life';
import { addFeeling } from './relations';
import { successionCrisis } from './succession';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';

export function disputedInheritance(ai = false) {
  for (let seed = 1; seed < 100; seed++) {
    const s = createWorld(31);
    const home = scenarioHouses(s, 'mars', 'viceroy')[0];
    startGame(s, { clanId: home.id, ruler: rollRuler(31, 'mars', 'F', 'Asha'), focus: 'dip', scenario: 'viceroy', age: 55 });
    const house = ai ? Object.values(s.clans).find((k) => k.id !== s.playerClanId && clanRegions(s, k.id).length)! : home;
    const old = s.characters[house.headId];
    old.born = s.year - 55;
    old.childrenIds = [];
    const kid = (name: string, age: number, traits: string[]) => {
      const c = createCharacter(s, {
        name,
        born: s.year - age,
        gender: 'F',
        clanId: house.id,
        planetId: house.planetId,
        faithId: house.faithId,
        motherId: old.id,
        traits,
      });
      c.marriedIn = false;
      c.bastard = false;
      c.prisonerOf = undefined;
      old.childrenIds.push(c.id);
      return c;
    };
    const heir = kid('Liora', 28, ['calm']),
      claimant = kid('Vesper', 25, ['ambitious', 'wrathful']);
    addFeeling(s, claimant.id, heir.id, { why: 'Bitter sibling rivalry', value: -90, decay: 0, key: 'rivalry' });
    addFeeling(s, claimant.id, old.id, { why: 'Neglected me', value: -45, decay: 0, key: 'neglect' });
    const backer = Object.values(s.clans).find(
      (k) => k.id !== house.id && k.id !== s.playerClanId && clanRegions(s, k.id).length && clanRank(s, k.id) < 3 && alive(ch(s, k.headId)),
    )!;
    backer.liege = house.id;
    backer.fleet = 100;
    addFeeling(s, backer.headId, heir.id, { why: 'Humiliated me', value: -90, decay: 0 });
    if (!ai) s.fleet = 300;
    else house.fleet = 300;
    if (!ai) {
      const voter = (name: string, supports: string) => {
        const c = createCharacter(s, { name, clanId: house.id, planetId: house.planetId, faithId: house.faithId, born: s.year - 35 });
        addFeeling(s, c.id, supports, { why: 'Trusted confidant', value: 60, decay: 0 });
        return c;
      };
      s.council.envoy = voter('Seren', heir.id).id;
      s.council.treasurer = voter('Orren', claimant.id).id;
    }
    s.seed = seed;
    killCharacter(s, old.id, 'old age');
    const crisis = successionCrisis(s, house.id);
    if (!crisis) continue;
    s.pending = [];
    return { s, house, old, heir, claimant, crisis, backer };
  }
  throw new Error('No seeded dispute found');
}
