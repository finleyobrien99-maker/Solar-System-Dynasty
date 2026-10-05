// Realm defence wired into real wars (WAVE-5-CONTRACT.md slice 1): answers are
// saved with the war, accepted houses lend real ships (realmAid), and those
// loans live beside, never inside, a league's coalition.
import { describe, expect, it } from 'vitest';
import { declareHouseWar, tickAiWars } from './ai';
import { coalitionsTick } from './coalitions';
import { ch, clanRegions, liegeOf, setOwner } from './core';
import { EVENT_BY_ID } from './events';
import { pendingRealmCall, planetOutrageOf, realmOf } from './realmDefence';
import { truceOf } from './peace';
import type { Clan, GameState, Region } from './types';
import { answerRealm, declareWar, endWar, enemySide, fightBattle } from './war';
import { committedShips, warContributions } from './warAid';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';

const PERSONAL = ['brave', 'craven', 'wrathful', 'honest', 'deceitful'];

/** You govern on Mars, sworn to its sovereign; every landed AI ruler is a free adult with 100 ships and no oaths. */
function world(seed = 61): GameState {
  const s = createWorld(seed);
  const home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(seed, 'mars', 'F', 'Asha'), focus: 'cmd', age: 40, family: 'married' });
  Object.assign(s, { credits: 5000, prestige: 1000, fleet: 120, pending: [] });
  for (const k of Object.values(s.clans)) {
    if (k.isPlayer) continue;
    const head = ch(s, k.headId);
    if (head) {
      head.born = Math.min(head.born, s.year - 35);
      head.prisonerOf = undefined;
      head.traits = head.traits.filter((t) => !PERSONAL.includes(t));
    }
    k.fleet = 100;
    k.allied = false;
  }
  return s;
}
const capital = (s: GameState, planet: string): Region => Object.values(s.regions).find((r) => r.capital && r.planetId === planet)!;
function vassal(s: GameState, planet: string, skip: string[] = []): Clan {
  return Object.values(s.clans).find(
    (k) => !k.isPlayer && k.planetId === planet && clanRegions(s, k.id).length && !clanRegions(s, k.id).some((r) => r.capital) && !skip.includes(k.id),
  )!;
}
/** Every ship that exists: home fleets plus every loan still out. */
function ships(s: GameState): number {
  const home = s.fleet + Object.values(s.clans).reduce((n, k) => n + (k.isPlayer ? 0 : k.fleet), 0);
  return home + [...s.wars, ...s.aiWars].flatMap(warContributions).reduce((n, p) => n + p.ships, 0);
}

describe('realm defence in real wars', () => {
  it('attacking a Neptunian house from Mars saves every answer and lends real ships, with no invisible liege share', () => {
    const s = world();
    const d = vassal(s, 'neptune');
    const before = ships(s);
    expect(declareWar(s, clanRegions(s, d.id)[0].id, 'conquest')).toBe(true);
    const w = s.wars[0];
    expect(ships(s)).toBe(before);
    const sov = w.realmCalls!.find((a) => a.role === 'sovereign')!;
    expect(sov).toMatchObject({ clanId: capital(s, 'neptune').owner, answer: 'accepted' });
    const accepted = w.realmCalls!.filter((a) => a.answer === 'accepted');
    expect(w.realmAid!.map((p) => [p.clanId, p.sent]).sort()).toEqual(accepted.map((a) => [a.clanId, a.proposedShips]).sort());
    for (const p of w.realmAid!) expect(s.clans[p.clanId].fleet).toBe(100 - p.sent);
    const side = enemySide(s, w);
    expect(side.ships).toBe(d.fleet + w.realmAid!.reduce((n, p) => n + p.ships, 0) + (w.coalition ?? []).reduce((n, p) => n + p.ships, 0));
    expect(side.helpers.some((h) => h.includes('liege'))).toBe(false);
    expect(side.helpers.filter((h) => h.includes('(realm,'))).toHaveLength(w.realmAid!.length);
  });

  it('a fight inside your own realm stays local', () => {
    const s = world();
    const neighbour = vassal(s, 'mars');
    expect(realmOf(s, neighbour.id)).toBe(realmOf(s, s.playerClanId));
    expect(declareWar(s, clanRegions(s, neighbour.id)[0].id, 'conquest')).toBe(true);
    expect(s.wars[0].realmCalls ?? []).toEqual([]);
    expect(s.wars[0].realmAid ?? []).toEqual([]);
  });

  it('a league dissolving recalls only league loans, never the realm’s defenders', () => {
    const s = world();
    s.houseThreat[s.playerClanId] = 80;
    coalitionsTick(s);
    const d = vassal(s, 'neptune');
    declareWar(s, clanRegions(s, d.id)[0].id, 'conquest');
    const w = s.wars[0];
    const realm = w.realmAid!.map((p) => p.ships);
    s.houseThreat[s.playerClanId] = 0;
    coalitionsTick(s);
    expect((w.coalition ?? []).every((p) => p.ships === 0)).toBe(true);
    expect(w.realmAid!.map((p) => p.ships)).toEqual(realm);
  });

  it('defenders bear their own losses, earn a truce with you and come home exactly once', () => {
    const s = world();
    const d = vassal(s, 'neptune');
    declareWar(s, clanRegions(s, d.id)[0].id, 'conquest');
    const w = s.wars[0];
    const total = ships(s);
    const report = fightBattle(s, w.id)!;
    const lost = report.playerLosses + report.enemyLosses + (report.coalitionLosses ?? []).reduce((n, r) => n + r.losses, 0);
    expect(ships(s)).toBe(total - lost);
    endWar(s, w, 'white');
    for (const p of w.realmAid!) {
      expect(truceOf(s, s.playerClanId, p.clanId)).toBeTruthy();
      expect(p.ships).toBe(0);
      expect(committedShips(s, p.clanId)).toBe(0);
    }
    const after = structuredClone(s);
    endWar(s, w, 'white');
    expect(s).toEqual(after);
  });

  it('AI-against-AI wars call realms by the same rules, and the loans come home when it ends', () => {
    const s = world();
    const attacker = vassal(s, 'venus');
    attacker.liege = 'none';
    const d = vassal(s, 'neptune');
    expect(declareHouseWar(s, attacker.id, clanRegions(s, d.id)[0].id)).toBe(true);
    const w = s.aiWars.at(-1)!;
    expect(w.realmCalls!.some((a) => a.role === 'sovereign' && a.answer === 'accepted')).toBe(true);
    expect(w.realmAid!.length).toBeGreaterThan(0);
    setOwner(s, s.regions[w.target], attacker.id);
    tickAiWars(s);
    expect(s.aiWars.some((x) => x.id === w.id)).toBe(false);
    for (const p of w.realmAid!) expect(committedShips(s, p.clanId)).toBe(0);
  });

  it('as sovereign you defend your own vassal without being asked, exactly like an AI sovereign', () => {
    const s = world();
    setOwner(s, capital(s, 'mars'), s.playerClanId);
    const d = vassal(s, 'mars');
    expect(liegeOf(s, d.id)).toBe(s.playerClanId);
    const invader = vassal(s, 'venus');
    invader.liege = 'none';
    expect(declareHouseWar(s, invader.id, clanRegions(s, d.id)[0].id)).toBe(true);
    const w = s.aiWars.at(-1)!;
    expect(w.realmCalls!.find((a) => a.clanId === s.playerClanId)?.answer).toBe('accepted');
    expect(w.realmAid!.find((p) => p.clanId === s.playerClanId)?.sent).toBe(60);
    expect(s.fleet).toBe(60);
  });

  it('as a sworn house you are asked; your answer sends real ships to that war, or none', () => {
    for (const accept of [true, false]) {
      const s = world();
      const d = vassal(s, 'mars');
      const invader = vassal(s, 'venus');
      invader.liege = 'none';
      expect(declareHouseWar(s, invader.id, clanRegions(s, d.id)[0].id)).toBe(true);
      const w = s.aiWars.at(-1)!;
      expect(pendingRealmCall(s)?.war.id).toBe(w.id);
      expect(EVENT_BY_ID.realm_call.when!(s)).toBe(true);
      expect(answerRealm(s, w.id, accept)).toBe(true);
      const mine = w.realmAid!.find((p) => p.clanId === s.playerClanId);
      expect(mine?.sent).toBe(accept ? 60 : undefined);
      expect(s.fleet).toBe(accept ? 60 : 120);
      expect(answerRealm(s, w.id, true)).toBe(false);
    }
  });

  it('taking a Neptunian region from Mars angers Neptune', () => {
    const s = world();
    const d = vassal(s, 'neptune');
    declareWar(s, clanRegions(s, d.id)[0].id, 'conquest');
    endWar(s, s.wars[0], 'win');
    expect(planetOutrageOf(s, 'neptune')).toBe(1);
  });
});
