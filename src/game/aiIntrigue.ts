// AI houses scheme too (ROADMAP 8.1; Fin: "I want AI characters to have the
// same freedom I have"). Each cycle some heads plot against other houses with
// the player's own toolkit: murder, sabotage, blackmail, seduction and charm.
// They choose by personality and by how they feel about each rival (grief and
// vendettas included), pay from their treasury, roll odds shaped like the
// player's, and leave the same scars: personal grief, feuds, deeds for
// epithets. The player hears about it as news. Plots against the player
// still come from sworn rivals (ai.ts) and from events.

import { ageOf, alive, ch, clanRank, clanRegions, effStats, fullName, hasTrait, isCloseKin, log } from './core';
import { recordDeed } from './epithets';
import { killCharacter } from './life';
import { addFeeling, attempted, blackmailed, cuckolded, lovers, murdered, opinionOf } from './relations';
import { chance, clamp, int, weighted } from './rng';
import type { Character, Clan, GameState } from './types';

export type AiScheme = 'assassinate' | 'sabotage' | 'blackmail' | 'seduce' | 'sway';

export const AI_SCHEME_COST: Record<AiScheme, number> = { assassinate: 150, sabotage: 90, blackmail: 20, seduce: 30, sway: 50 };

export interface AiPlan {
  kind: AiScheme;
  /** The person the plot is aimed at (for sabotage, the rival house's head). */
  target: Character;
  score: number;
}

function adultHead(s: GameState, k: Clan): Character | undefined {
  const h = ch(s, k.headId);
  return alive(h) && !h.prisonerOf && ageOf(s, h) >= 16 ? h : undefined;
}

/** How likely a head is to plot at all this cycle. */
export function plotChance(head: Character): number {
  let p = 0.12;
  for (const t of ['deceitful', 'ambitious', 'cruel', 'greedy', 'paranoid']) if (hasTrait(head, t)) p += 0.05;
  for (const t of ['honest', 'kind', 'content', 'just']) if (hasTrait(head, t)) p -= 0.04;
  return clamp(p, 0.02, 0.4);
}

function atWar(s: GameState, a: string, b: string): boolean {
  return s.aiWars.some((w) => (w.attacker === a && w.defender === b) || (w.attacker === b && w.defender === a));
}

/** Did this head lose close kin to that one? An eye for an eye. */
function vendetta(s: GameState, head: Character, rival: Character): boolean {
  return (s.relations[head.id]?.[rival.id]?.feelings ?? []).some((f) => f.grave);
}

/**
 * Every plot a head might hatch against the heads of other houses, scored.
 * Hatred drives murder and sabotage, greed drives blackmail, lust drives
 * seduction, and warmth drives charm. Scores at or below zero are never chosen.
 */
export function aiPlans(s: GameState, k: Clan): AiPlan[] {
  const head = adultHead(s, k);
  if (!head) return [];
  const plans: AiPlan[] = [];
  const has = (t: string) => hasTrait(head, t);
  for (const other of Object.values(s.clans)) {
    if (other.isPlayer || other.id === k.id || !clanRegions(s, other.id).length) continue;
    const t = adultHead(s, other);
    if (!t) continue;
    const war = atWar(s, k.id, other.id);
    const hate = -opinionOf(s, head, t) + (war ? 30 : 0);
    const blood = vendetta(s, head, t);
    const merciless = (has('cruel') ? 15 : 0) + (has('wrathful') ? 10 : 0) + (has('ambitious') ? 10 : 0) - (has('kind') ? 25 : 0) - (has('honest') ? 15 : 0);
    if (hate >= 60 || blood) plans.push({ kind: 'assassinate', target: t, score: hate - 50 + merciless + (blood ? 40 : 0) });
    if (war || hate >= 60) plans.push({ kind: 'sabotage', target: t, score: hate - 40 + (war ? 25 : 0) });
    if ((has('greedy') || has('deceitful')) && other.credits >= 100)
      plans.push({ kind: 'blackmail', target: t, score: 15 + hate / 3 + (has('greedy') ? 10 : 0) });
    const spouse = ch(s, t.spouseId);
    if (has('lustful') && alive(spouse) && spouse.gender !== head.gender && !alive(ch(s, head.loverId)) && ageOf(s, spouse) >= 18)
      plans.push({ kind: 'seduce', target: spouse, score: 20 + hate / 4 });
    if (hate <= -10 && (has('gregarious') || has('ambitious') || has('generous'))) plans.push({ kind: 'sway', target: t, score: 10 - hate / 4 });
  }
  return plans.filter((p) => p.score > 0 && k.credits >= AI_SCHEME_COST[p.kind]);
}

/** The odds a plot works: the plotter's Intrigue against the target's, as for the player. */
export function aiSchemeOdds(s: GameState, plotter: Character, plan: AiPlan): number {
  const bonus = { assassinate: -0.1, sabotage: 0, blackmail: 0, seduce: hasTrait(plan.target, 'lustful') ? 0.2 : 0.05, sway: 0.2 }[plan.kind];
  return clamp(0.35 + (effStats(s, plotter).int - effStats(s, plan.target).int) * 0.04 + bonus, 0.08, 0.85);
}

function house(s: GameState, c: Character): string {
  return s.clans[c.clanId]?.name ?? 'an unknown house';
}

/** Carry out one plot and its consequences. Returns whether it worked. */
export function runAiScheme(s: GameState, k: Clan, plan: AiPlan): boolean {
  const head = s.characters[k.headId];
  const t = plan.target;
  k.credits -= AI_SCHEME_COST[plan.kind];
  const success = chance(s, aiSchemeOdds(s, head, plan));
  const caught = chance(s, (success ? 0.2 : 0.55) - effStats(s, head).int * 0.015);
  const blame = caught ? `Agents of House ${k.name} were caught.` : 'Nobody can prove who was behind it.';
  if (success) recordDeed(s, head, 'schemes');
  switch (plan.kind) {
    case 'assassinate': {
      if (success) {
        recordDeed(s, head, 'assassinations');
        recordDeed(s, head, 'cruelty');
        if (isCloseKin(head, t)) recordDeed(s, head, 'kinslayings');
        murdered(s, t, head.id, caught);
        log(s, `${fullName(s, t)} of House ${house(s, t)} was found dead. ${blame}`, 'news');
        killCharacter(s, t.id, caught ? `assassinated by agents of House ${k.name}` : 'assassinated');
      } else {
        if (caught) attempted(s, t, head.id);
        if (caught) log(s, `An assassin from House ${k.name} was caught in ${fullName(s, t)}'s chambers.`, 'news');
      }
      break;
    }
    case 'sabotage': {
      const victim = s.clans[t.clanId];
      if (success && victim) {
        recordDeed(s, head, 'sabotages');
        victim.fleet -= Math.round(victim.fleet * (0.2 + int(s, 0, 15) / 100));
        log(s, `Explosions rip through House ${victim.name}'s shipyards. ${blame}`, 'news');
      }
      if (caught) addFeeling(s, t.id, head.id, { why: 'Burned my shipyards', value: -35, decay: 1 });
      break;
    }
    case 'blackmail': {
      const victim = s.clans[t.clanId];
      if (success && victim) {
        const amount = Math.min(Math.max(0, victim.credits), int(s, 40, 120) + clanRank(s, victim.id) * 30);
        victim.credits -= amount;
        k.credits += amount;
        recordDeed(s, head, 'blackmails');
        blackmailed(s, t, head.id);
      } else if (caught) addFeeling(s, t.id, head.id, { why: 'Tried to blackmail me', value: -30, decay: 1 });
      break;
    }
    case 'seduce': {
      if (success) {
        head.loverId = t.id;
        t.loverId = head.id;
        lovers(s, head, t);
        if (caught) {
          cuckolded(s, t, head.id);
          log(s, `Scandal: ${fullName(s, t)} is having an affair with ${fullName(s, head)}.`, 'news');
        }
      }
      break;
    }
    case 'sway': {
      if (success) {
        addFeeling(s, t.id, head.id, { why: 'Charmed me', value: int(s, 12, 24), decay: 1 });
        addFeeling(s, head.id, t.id, { why: 'Good company', value: 5, decay: 1 });
      }
      break;
    }
  }
  return success;
}

/** Each cycle, some AI heads pick a plot and carry it out. */
export function aiIntrigueTick(s: GameState): void {
  for (const k of Object.values(s.clans)) {
    if (k.isPlayer || !clanRegions(s, k.id).length) continue;
    const head = adultHead(s, k);
    if (!head || !chance(s, plotChance(head))) continue;
    const plans = aiPlans(s, k);
    if (!plans.length) continue;
    // Favour the plots they want most, with room for surprise.
    const plan = weighted(
      s,
      plans.map((p) => [p, p.score] as const),
    );
    runAiScheme(s, k, plan);
  }
}
