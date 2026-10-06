import { describe, expect, it } from 'vitest';
import { alive, ch, clanRegions, ruler, setOwner } from './core';
import { createCharacter } from './character';
import { declareHouseWar, tickAiWars } from './ai';
import { coalitionOf, committedShips, joinCoalition, leaveCoalition, coalitionsTick } from './coalitions';
import { campaignsOf, peaceTick, truceOf, warWeariness } from './peace';
import { creditLines, fleetCap, UPKEEP_PER_SHIP } from './economy';
import { recruitShips } from './realm';
import { aiDeclareWar, declareWar, endWar, enemySide, fightBattle, playerSide, tickPlayerWars, warBlocker } from './war';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';

function fixture() {
  const s = createWorld(97),
    home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(97, 'mars', 'F', 'Asha'), focus: 'dip', age: 40, family: 'married' });
  Object.assign(s, { credits: 10000, prestige: 1000, fleet: 300, pending: [] });
  for (const c of Object.values(s.characters)) c.spouseId = undefined;
  const houses = Object.values(s.clans).filter((c) => !c.isPlayer && alive(ch(s, c.headId)) && clanRegions(s, c.id).length);
  for (const k of houses) {
    ch(s, k.headId)!.born = s.year - 40;
    ch(s, k.headId)!.prisonerOf = undefined;
    k.fleet = 100;
    k.prestige = 1000; // Both sides must fund the existing conquest price.
    k.allied = false;
    k.liege = 'none';
  }
  return { s, a: houses[0], d: houses[1], h: houses[2], other: houses[3] };
}
function pledge(s: ReturnType<typeof fixture>['s'], target: string, members: string[]) {
  s.houseThreat[target] = 75;
  s.coalitions.push({ target, members, formed: s.year });
}

describe('campaign wiring', () => {
  it('a valid player declaration detaches helpers, previews them once and the battle debits only their loan', () => {
    const { s, a, h } = fixture();
    pledge(s, s.playerClanId, [h.id]);
    const target = clanRegions(s, a.id)[0];
    expect(declareWar(s, target.id, 'conquest')).toBe(true);
    const w = s.wars[0];
    expect(h.fleet).toBe(50);
    expect(committedShips(s, h.id)).toBe(50);
    expect(enemySide(s, w).ships).toBe(a.fleet + 50);
    const before = h.fleet + committedShips(s, h.id);
    const report = fightBattle(s, w.id)!;
    expect(report.coalitionLosses).toHaveLength(1);
    expect(h.fleet).toBe(50);
    expect(h.fleet + committedShips(s, h.id)).toBe(before - report.coalitionLosses![0].losses);
    endWar(s, w, 'white');
    expect(h.fleet).toBe(before - report.coalitionLosses![0].losses);
    expect(truceOf(s, s.playerClanId, h.id)).toBeTruthy();
    expect(committedShips(s, h.id)).toBe(0);
  });
  it('invalid declarations do not recall or borrow ships and a moved prize returns survivors without false peace', () => {
    const { s, a, d, h } = fixture();
    pledge(s, s.playerClanId, [h.id]);
    s.prestige = 0;
    const before = structuredClone(s);
    expect(declareWar(s, clanRegions(s, a.id)[0].id, 'conquest')).toBe(false);
    expect(s).toEqual(before);
    s.prestige = 1000;
    expect(declareWar(s, clanRegions(s, a.id)[0].id, 'conquest')).toBe(true);
    const w = s.wars[0];
    setOwner(s, s.regions[w.target], d.id);
    const moved = structuredClone(s);
    expect(fightBattle(s, w.id)).toBeUndefined();
    expect(s).toEqual(moved);
    endWar(s, w, 'win');
    expect(s.regions[w.target].owner).toBe(d.id);
    expect(h.fleet).toBe(100);
    expect(s.truces).toHaveLength(0);
    expect(s.houseThreat[s.playerClanId]).toBe(75);
  });
  it('a player pledge in an AI campaign reserves capacity and upkeep until withdrawal', () => {
    const { s, a, d } = fixture();
    s.fleet = fleetCap(s);
    s.houseThreat[a.id] = 75;
    expect(joinCoalition(s, a.id)).toBe(true);
    expect(declareHouseWar(s, a.id, clanRegions(s, d.id)[0].id)).toBe(true);
    const loan = committedShips(s, s.playerClanId);
    expect(loan).toBeGreaterThan(0);
    expect(s.fleet + loan).toBe(fleetCap(s));
    expect(recruitShips(s, 10)).toBe(0);
    expect(creditLines(s).find((l) => l.label.startsWith('Fleet upkeep'))!.value).toBe(-Math.round(fleetCap(s) * UPKEEP_PER_SHIP));
    expect(warBlocker(s, clanRegions(s, a.id)[0])).toMatch(/Recall/);
    expect(leaveCoalition(s, a.id)).toBe(true);
    expect(s.fleet).toBe(fleetCap(s));
  });
  it('incoming valid war recalls the defender own loans before borrowing aid', () => {
    const { s, a, d, h } = fixture();
    pledge(s, a.id, [s.playerClanId]);
    expect(declareHouseWar(s, a.id, clanRegions(s, d.id)[0].id)).toBe(true);
    expect(s.fleet).toBe(150);
    expect(aiDeclareWar(s, h.id, 'conquest', clanRegions(s, s.playerClanId)[0].id)).toBe(true);
    expect(s.fleet).toBe(300);
    expect(committedShips(s, s.playerClanId)).toBe(0);
  });
  it('AI-vs-AI and AI-vs-player defenders receive physical aid, whose weariness counts once', () => {
    for (const playerTarget of [false, true]) {
      const { s, a, d, h } = fixture();
      pledge(s, a.id, [h.id]);
      if (playerTarget) expect(aiDeclareWar(s, a.id, 'conquest', clanRegions(s, s.playerClanId)[0].id)).toBe(true);
      else expect(declareHouseWar(s, a.id, clanRegions(s, d.id)[0].id)).toBe(true);
      expect(h.fleet).toBe(50);
      expect(campaignsOf(s, h.id)).toBe(1);
      peaceTick(s);
      expect(warWeariness(s, h.id)).toBe(3);
      if (playerTarget) {
        const w = s.wars[0];
        // The pledged league house, plus your own realm answering an outsider's attack (realmDefence.ts).
        const realm = (w.realmAid ?? []).reduce((n, p) => n + p.ships, 0);
        expect(playerSide(s, w, false).ships).toBe(s.fleet + 50 + realm);
        fightBattle(s, w.id, true);
        endWar(s, w, 'white');
      } else {
        tickAiWars(s);
        const w = s.aiWars[0];
        const survivors = committedShips(s, h.id);
        setOwner(s, s.regions[w.target], a.id);
        tickAiWars(s);
        expect(h.fleet).toBe(50 + survivors);
        expect(truceOf(s, a.id, h.id)).toBeUndefined();
      }
      expect(committedShips(s, h.id)).toBe(0);
    }
  });
  it('an ally who is also a vassal is counted once, and loaned helpers are never borrowed a second time', () => {
    const { s, a, h } = fixture();
    h.allied = true;
    h.opinion = 50;
    h.liege = s.playerClanId;
    // Force a sovereign player for a real fealty relationship.
    const capital = Object.values(s.regions).find((r) => r.capital && r.planetId === h.planetId)!;
    setOwner(s, capital, s.playerClanId);
    const target = clanRegions(s, a.id)[0];
    expect(declareWar(s, target.id, 'conquest')).toBe(true);
    expect(playerSide(s, s.wars[0], false).helpers.filter((x) => x.includes('House ' + h.name))).toHaveLength(1);
  });
  it('valid succession keeps a house pledge and its fleet loan intact', () => {
    const { s, a, d, h } = fixture();
    pledge(s, a.id, [h.id]);
    expect(declareHouseWar(s, a.id, clanRegions(s, d.id)[0].id)).toBe(true);
    const replacement = createCharacter(s, { clanId: h.id, planetId: h.planetId, born: s.year - 30 });
    h.headId = replacement.id;
    coalitionsTick(s);
    expect(coalitionOf(s, a.id)!.members).toContain(h.id);
    expect(committedShips(s, h.id)).toBe(50);
    expect(h.fleet).toBe(50);
    expect(ruler(s).id).toBe(s.rulerId);
  });
  it('stale player campaigns clear and return surviving detached ships on the year tick', () => {
    const { s, a, h } = fixture();
    pledge(s, s.playerClanId, [h.id]);
    expect(declareWar(s, clanRegions(s, a.id)[0].id, 'conquest')).toBe(true);
    setOwner(s, s.regions[s.wars[0].target], s.playerClanId);
    tickPlayerWars(s);
    expect(h.fleet).toBe(100);
    expect(s.wars).toHaveLength(0);
    expect(s.truces).toHaveLength(0);
  });
});
