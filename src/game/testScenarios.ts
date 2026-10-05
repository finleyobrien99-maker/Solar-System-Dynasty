import { coalitionsTick } from './coalitions';
// Test data built through actual engine actions; never imported by the app.
import { declareWar, fightBattle } from './war';
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

/** An unfinished campaign, built by a real claim and battle, for saves and browser play. */
export function peaceCampaign() {
  const s = createWorld(97),
    home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(97, 'mars', 'F', 'Asha'), focus: 'dip', age: 40, family: 'married' });
  Object.assign(s, { credits: 2000, prestige: 1000, fleet: 300 });
  const enemy = Object.values(s.clans).find((k) => !k.isPlayer && k.planetId === 'mars' && clanRegions(s, k.id).length)!;
  const head = s.characters[enemy.headId];
  head.born = s.year - 40;
  head.prisonerOf = undefined;
  const target = clanRegions(s, enemy.id).find((r) => !r.capital) ?? clanRegions(s, enemy.id)[0];
  s.claims.push(target.id);
  if (!declareWar(s, target.id, 'claim')) throw new Error('Cannot start the peace fixture');
  fightBattle(s, s.wars[0].id);
  s.pending = [];
  return { s, enemy, target, war: s.wars[0] };
}

/** Conquest fear, an actual league and a real orbital victory, for reload and browser coverage. */
export function coalitionCampaign() {
  const s = createWorld(197),
    home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(197, 'mars', 'F', 'Asha'), focus: 'dip', age: 40, family: 'married' });
  Object.assign(s, { credits: 5000, prestige: 3000, fleet: 3000, pending: [] });
  // Four territorial campaigns create fear through actual victories.
  for (let n = 0; n < 4; n++) {
    const target = Object.values(s.regions).find(
      (r) =>
        !r.capital &&
        r.owner !== s.playerClanId &&
        !s.truces.some((t) => (t.a === r.owner || t.b === r.owner) && t.until > s.year) &&
        alive(ch(s, s.clans[r.owner]?.headId)) &&
        !ch(s, s.clans[r.owner]?.headId)?.prisonerOf,
    )!;
    if (!target || !declareWar(s, target.id, 'conquest')) throw new Error('Cannot build conquest fear');
    const war = s.wars[s.wars.length - 1];
    for (let battle = 0; s.wars.includes(war) && battle < 10; battle++) {
      fightBattle(s, war.id);
      s.pending = [];
      s.year++;
    }
    if (target.owner !== s.playerClanId) throw new Error('Conquest fixture did not win');
  }
  coalitionsTick(s);
  const target = Object.values(s.regions).find(
    (r) =>
      r.owner !== s.playerClanId &&
      !s.truces.some((t) => (t.a === r.owner || t.b === r.owner) && t.until > s.year) &&
      alive(ch(s, s.clans[r.owner]?.headId)) &&
      !ch(s, s.clans[r.owner]?.headId)?.prisonerOf,
  )!;
  s.claims.push(target.id);
  if (!declareWar(s, target.id, 'claim')) throw new Error('Cannot begin coalition campaign');
  const war = s.wars[s.wars.length - 1];
  if (!war.coalition?.length) throw new Error('No actual coalition defenders');
  for (let battle = 0; war.score < 25 && battle < 3; battle++) {
    fightBattle(s, war.id);
    s.pending = [];
    s.year++;
  }
  if (war.score < 25 || !s.wars.includes(war)) throw new Error('No siege control');
  return { s, war, target, enemy: s.clans[war.enemy] };
}
