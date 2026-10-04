// What each AI lord wants (ROADMAP 8.1: goals). Worked out fresh each time
// from the lord's traits, grudges and situation, so there's no save change
// and it shifts as their life does: a widower turns to revenge, an old lord
// with no children to finding an heir, a zealot to crusade. Ambitions steer
// their wars, plots, marriages and spending, and the house screen shows them,
// so you can see what's coming.

import { ageOf, alive, ch, clanRegions, fullName, hasTrait } from './core';
import { neighbourPlanets } from './planets';
import { feelingNow } from './relations';
import type { Character, Clan, GameState } from './types';

export type AmbitionKind = 'revenge' | 'heir' | 'crusade' | 'conquest' | 'security' | 'wealth' | 'peace';

export interface Ambition {
  kind: AmbitionKind;
  /** A character for revenge; a house for crusade, conquest and security. */
  target?: string;
  text: string;
}

/** How keen each ambition makes a house to start a war. */
export const AMBITION_AGGRESSION: Record<AmbitionKind, number> = {
  revenge: 1.3,
  conquest: 1.5,
  crusade: 1.4,
  security: 0.7,
  wealth: 0.8,
  heir: 0.8,
  peace: 0.6,
};

/** The person this lord most wants to see suffer: a grave wrong, still bitterly felt. */
function nemesis(s: GameState, head: Character): { who: Character; why: string } | undefined {
  let best: { who: Character; why: string; sum: number } | undefined;
  for (const [id, rel] of Object.entries(s.relations[head.id] ?? {})) {
    const who = s.characters[id];
    if (!alive(who) || who.clanId === head.clanId) continue;
    const grave = rel.feelings.filter((f) => f.grave);
    if (!grave.length) continue;
    const sum = rel.feelings.reduce((n, f) => n + feelingNow(f, s.year), 0);
    if (sum <= -50 && (!best || sum < best.sum)) {
      const worst = grave.reduce((a, b) => (feelingNow(a, s.year) <= feelingNow(b, s.year) ? a : b));
      best = { who, why: worst.why, sum };
    }
  }
  return best;
}

/** Landed houses on this house's planet or the next orbit in or out. */
function neighbours(s: GameState, k: Clan): Clan[] {
  const near = new Set([k.planetId, ...neighbourPlanets(k.planetId)]);
  return Object.values(s.clans).filter((o) => o.id !== k.id && near.has(o.planetId) && clanRegions(s, o.id).length > 0);
}

/** Your fleet lives on the game state, not your house. */
export function fleetOf(s: GameState, k: Clan): number {
  return k.isPlayer ? s.fleet : k.fleet;
}

function headOf(s: GameState, k: Clan): Character | undefined {
  return k.isPlayer ? ch(s, s.rulerId) : ch(s, k.headId);
}

function hates(s: GameState, a: Character, b: Character | undefined): number {
  if (!alive(b)) return 0;
  return -(s.relations[a.id]?.[b.id]?.feelings ?? []).reduce((n, f) => n + feelingNow(f, s.year), 0);
}

/**
 * The lord's ambition, first match wins: revenge for a grave wrong, an heir
 * when they're getting on without one, a crusade for zealots, conquest for
 * the ambitious and wrathful, safety for the fearful or threatened, money for
 * the greedy, and otherwise a quiet life.
 */
export function aiAmbition(s: GameState, k: Clan): Ambition {
  const head = ch(s, k.headId);
  if (k.isPlayer || !alive(head)) return { kind: 'peace', text: 'Prosper in peace' };
  const has = (t: string) => hasTrait(head, t);

  const foe = nemesis(s, head);
  if (foe) return { kind: 'revenge', target: foe.who.id, text: `Revenge on ${fullName(s, foe.who)} (${foe.why.toLowerCase()})` };

  const kids = head.childrenIds.map((id) => s.characters[id]).filter((c) => alive(c) && c.clanId === k.id);
  if (ageOf(s, head) >= 40 && !kids.length) return { kind: 'heir', text: alive(ch(s, head.spouseId)) ? 'Secure an heir' : 'Marry and secure an heir' };

  const near = neighbours(s, k);
  if (has('zealous')) {
    const infidels = near.filter((o) => o.faithId !== k.faithId && fleetOf(s, o) < k.fleet * 1.2);
    if (infidels.length) {
      const t = infidels.reduce((a, b) => (fleetOf(s, a) <= fleetOf(s, b) ? a : b));
      return { kind: 'crusade', target: t.id, text: `Crusade against the unbelievers of House ${t.name}` };
    }
  }

  if ((has('ambitious') || has('wrathful')) && k.fleet >= 30) {
    const prey = near.filter((o) => fleetOf(s, o) < k.fleet * 1.1);
    if (prey.length) {
      // The most hated, then the weakest.
      const t = prey.reduce((a, b) => {
        const d = hates(s, head, headOf(s, b)) - hates(s, head, headOf(s, a));
        return d > 0 || (d === 0 && fleetOf(s, b) < fleetOf(s, a)) ? b : a;
      });
      return { kind: 'conquest', target: t.id, text: `Take House ${t.name}'s land` };
    }
  }

  const threat = near.find((o) => {
    const theirs = headOf(s, o);
    return fleetOf(s, o) >= k.fleet * 1.5 && alive(theirs) && hates(s, theirs, head) >= 30;
  });
  const besieged = s.aiWars.find((w) => w.defender === k.id);
  if (besieged) return { kind: 'security', target: besieged.attacker, text: `Survive House ${s.clans[besieged.attacker]?.name ?? 'its enemies'}` };
  if (threat) return { kind: 'security', target: threat.id, text: `Find strong friends against House ${threat.name}` };
  if (has('paranoid') || has('craven')) return { kind: 'security', text: 'Find strong friends' };

  if (has('greedy')) return { kind: 'wealth', text: 'Fill the treasury' };
  return { kind: 'peace', text: 'Prosper in peace' };
}

/** The house an ambition is aimed at, if any (a revenge target's house included). */
export function ambitionHouse(s: GameState, a: Ambition): string | undefined {
  if (a.kind === 'revenge') return ch(s, a.target)?.clanId;
  return a.target;
}
