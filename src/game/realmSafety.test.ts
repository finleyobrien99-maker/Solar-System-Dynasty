import { describe, expect, it } from 'vitest';
import { declareHouseWar } from './ai';
import { createCharacter } from './character';
import { ch, clanRegions, liegeOf, ruler, setOwner } from './core';
import { realmCallPreview, answerRealmCall, pendingRealmCall, realmDefenceTick, realmPeaceBlocker } from './realmDefence';
import { addFeeling, opinionOf } from './relations';
import { makeTruce } from './peace';
import { aiDeclareWar, answerRealm, callRealm, declareWar } from './war';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';
import type { GameState } from './types';

function fixture() {
  const s = createWorld(61),
    home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(61, 'mars', 'F', 'Asha'), focus: 'cmd', age: 40, family: 'married' });
  Object.assign(s, { fleet: 120, prestige: 1000, pending: [] });
  for (const k of Object.values(s.clans)) {
    const h = ch(s, k.headId)!;
    h.born = s.year - 40;
    h.prisonerOf = undefined;
    h.traits = h.traits.filter((t) => !['brave', 'craven', 'wrathful', 'honest', 'deceitful'].includes(t));
    k.fleet = 100;
    k.prestige = 1000; // Both sides must fund the existing conquest price.
    k.allied = false;
  }
  return s;
}
const vassal = (s: GameState, planet: string, skip = '') =>
  Object.values(s.clans).find(
    (k) => !k.isPlayer && k.planetId === planet && k.id !== skip && clanRegions(s, k.id).length && !clanRegions(s, k.id).some((r) => r.capital),
  )!;
const region = (s: GameState, id: string) => clanRegions(s, id)[0];
function called() {
  const s = fixture(),
    d = vassal(s, 'mars'),
    a = vassal(s, 'venus');
  expect(declareHouseWar(s, a.id, region(s, d.id).id)).toBe(true);
  return { s, w: s.aiWars[0] };
}
describe('current realm duties and promises', () => {
  it('independent neighbours on one world keep their feud local', () => {
    const s = fixture(),
      d = vassal(s, 'mars');
    s.clans[s.playerClanId].liege = 'none';
    expect(declareWar(s, region(s, d.id).id, 'conquest')).toBe(true);
    expect(s.wars[0].realmCalls).toEqual([]);
  });
  it('uses the direct liege for a nested house loyalty explanation', () => {
    const s = fixture(),
      d = vassal(s, 'neptune'),
      helper = vassal(s, 'neptune', d.id);
    const duke = Object.values(s.clans).find(
      (k) => k.planetId === 'neptune' && k.id !== d.id && k.id !== helper.id && clanRegions(s, k.id).length && !clanRegions(s, k.id).some((r) => r.capital),
    )!;
    helper.liege = duke.id;
    helper.cadetOf = duke.id;
    addFeeling(s, helper.headId, duke.headId, { why: 'Abandoned us', value: -90, decay: 0, key: 'test' });
    const offer = realmCallPreview(s, s.playerClanId, d.id, region(s, d.id).id).find((o) => o.clanId === helper.id)!;
    expect(offer.reasons[0].label).toBe('Sworn to House ' + duke.name);
    expect(offer.reasons).toContainEqual({ label: 'Resents their liege', value: Math.round(opinionOf(s, ch(s, helper.headId)!, ch(s, duke.headId)!)) });
  });
  it('recognises a reciprocal dynastic marriage to the player, never a one-sided link', () => {
    const s = fixture(),
      d = vassal(s, 'neptune'),
      helper = vassal(s, 'neptune', d.id),
      h = ch(s, helper.headId)!;
    h.spouseId = s.rulerId;
    ruler(s).spouseId = h.id;
    const offer = () => realmCallPreview(s, s.playerClanId, d.id, region(s, d.id).id).find((o) => o.clanId === helper.id)!;
    expect(offer().reasons.some((r) => r.label.includes('Kin by marriage to House ' + s.clans[s.playerClanId].name))).toBe(true);
    ruler(s).spouseId = undefined;
    expect(offer().reasons.some((r) => r.label.includes('Kin by marriage to House ' + s.clans[s.playerClanId].name))).toBe(false);
  });
  it('uses actual ruler faith after fostering, rather than stale house faith', () => {
    const s = fixture(),
      d = vassal(s, 'neptune'),
      helper = vassal(s, 'neptune', d.id);
    ch(s, helper.headId)!.faithId = ruler(s).faithId;
    helper.faithId = 'old-house-faith';
    const offer = realmCallPreview(s, s.playerClanId, d.id, region(s, d.id).id, 'holy').find((o) => o.clanId === helper.id)!;
    expect(offer.reasons.some((r) => r.label === "Shares the attacker's faith in a holy war")).toBe(true);
  });
  it('an AI regent retaining an adult seal blocks aid as well', () => {
    const s = fixture(),
      d = vassal(s, 'neptune'),
      helper = vassal(s, 'neptune', d.id),
      ward = ch(s, helper.headId)!;
    ward.born = s.year - 16;
    const regent = createCharacter(s, { clanId: helper.id, planetId: helper.planetId, born: s.year - 40, adultExtras: true });
    (s.flags ??= {})['regent:' + helper.id] = { due: 0, data: { id: regent.id, ward: ward.id, since: s.year - 3, until: s.year + 2 } };
    expect(realmCallPreview(s, s.playerClanId, d.id, region(s, d.id).id).find((o) => o.clanId === helper.id)?.blocker).toMatch(/regent/);
  });
  it('a sovereign truce cannot be sidestepped through a vassal in any declaration path', () => {
    for (const path of ['player', 'ai-player', 'ai-ai']) {
      const s = fixture(),
        d = path === 'ai-player' ? s.clans[s.playerClanId] : vassal(s, 'neptune'),
        a = path === 'player' ? s.clans[s.playerClanId] : vassal(s, 'venus');
      const top = s.clans[liegeOf(s, d.id)!];
      makeTruce(s, a.id, top.id);
      const target = region(s, d.id).id,
        before = structuredClone(s);
      expect(realmPeaceBlocker(s, a.id, d.id, target)).toContain(top.name);
      const ok =
        path === 'player'
          ? declareWar(s, target, 'conquest', true)
          : path === 'ai-player'
            ? aiDeclareWar(s, a.id, 'conquest', target, true)
            : declareHouseWar(s, a.id, target, true);
      expect(ok).toBe(false);
      expect(s).toEqual(before);
    }
  });
  it('transferred targets, changed allegiance and ended dynasties make both answers inert', () => {
    for (const change of ['target', 'liege', 'ended']) {
      const { s, w } = called();
      if (change === 'target') setOwner(s, s.regions[w.target], w.attacker);
      if (change === 'liege') s.clans[s.playerClanId].liege = 'none';
      if (change === 'ended') s.gameOver = { reason: 'extinct', year: s.year };
      const before = structuredClone(s);
      expect(answerRealm(s, w.id, true)).toBe(false);
      expect(answerRealm(s, w.id, false)).toBe(false);
      expect(s).toEqual(before);
      expect(pendingRealmCall(s, w.id)).toBeUndefined();
      realmDefenceTick(s);
      expect(w.realmCalls!.find((a) => a.clanId === s.playerClanId)?.answer).toBe('blocked');
    }
  });
  it('answers the requested war when two calls are waiting', () => {
    const { s, w } = called(),
      d = vassal(s, 'mars', w.defender),
      a = vassal(s, 'mercury');
    expect(declareHouseWar(s, a.id, region(s, d.id).id)).toBe(true);
    const second = s.aiWars[1];
    expect(pendingRealmCall(s, second.id)?.war.id).toBe(second.id);
    expect(answerRealm(s, second.id, true)).toBe(true);
    expect(w.realmCalls!.find((a) => a.clanId === s.playerClanId)?.answer).toBe('pending');
    expect(second.realmAid!.find((p) => p.clanId === s.playerClanId)?.sent).toBe(60);
  });
  it('invalid shares and repeated calls never debit ships or reroll decisions', () => {
    const { s, w } = called();
    for (const share of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.6]) {
      const before = structuredClone(s);
      expect(answerRealmCall(s, w.id, true, share)).toBeUndefined();
      expect(s).toEqual(before);
    }
    const before = structuredClone(s),
      again = callRealm(s, w.id, w.attacker, w.defender, w.target, 'conquest');
    expect(again.realmAid).toBe(w.realmAid);
    expect(s).toEqual(before);
  });
});
