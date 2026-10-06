// Shared deterministic real-action recipe for regression tests and frozen saves.
import { ch } from './core';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';
import type { GameState } from './types';
export function goalWorld(): GameState {
  const s = createWorld(61),
    home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(61, 'mars', 'F', 'Asha'), age: 40, family: 'married', focus: 'dip' });
  Object.assign(s, { credits: 5000, prestige: 2000, fleet: 300, pending: [], truces: [] });
  for (const k of Object.values(s.clans)) {
    k.liege = 'none';
    k.fleet = 100;
    k.prestige = 1000;
    k.credits = 100;
    k.allied = false;
    const head = ch(s, k.headId);
    if (head) {
      head.born = s.year - 40;
      head.prisonerOf = undefined;
      head.traits = [];
    }
  }
  return s;
}
