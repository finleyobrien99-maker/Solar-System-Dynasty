// Strategy bots for headless play (the balance harness and tests). Each one
// plays a cycle's worth of moves through the same functions the UI calls, so
// they obey every rule a player does. Their own choices draw on a separate
// seeded stream, so a run is fully repeatable.
//
// The roadmap (§17) wants Passive, Builder, Warmonger, Breeder and Schemer
// bots, plus a VIP "God" bot as a sanity check. The first four are here.

import { manageCrisis } from './succession';
import { ambitionChoices, chooseAmbition } from './ambitions';
import { ageOf, alive, childrenOf, clanRank, clanRegions, dynastyMembers, homePlanet, planetRegions, ruler } from './core';
import { appoint, candidates, ROLE_KEYS } from './council';
import { fleetCap } from './economy';
import { buildCtx, EVENT_BY_ID, resolveEvent } from './events';
import { acceptSuitor, canSeekSpouse, generateSuitors } from './family';
import { buildForge, buildVats, researchable, splice, startResearch } from './forge';
import { buySlot, lockTrait, purgeTrait, vaultSlots, vaultUsed } from './genetics';
import { currentHeir, isCloseFamily } from './life';
import { createViceroy, developCost, developRegion, forgeSolarThrone, recruitShips, shipCost } from './realm';
import { neglectedFor, spendTime, timeLeft } from './relations';
import { pick, type Seeded } from './rng';
import { openRoute } from './trade';
import { appointMentor, canBeMentored, fosterOptions, mentorBlocker, mentorCandidates, mentorshipOf, sendAsWard, teachingOf, wardshipOf } from './wards';
import { isHeritable, TRAITS } from './traits';
import type { Character, GameState, Region } from './types';
import { canFightBattle, cbOptions, declareWar, fightBattle, offerPeace, warBlocker } from './war';

export type BotId = 'passive' | 'builder' | 'warmonger' | 'breeder';

export interface Bot {
  id: BotId;
  name: string;
  blurb: string;
  turn: (s: GameState, rng: Seeded) => void;
}

/** Answer every pending pop-up with a random allowed choice, reporting each event answered. */
export function answerPending(s: GameState, rng: Seeded, onEvent?: (eventId: string) => void): void {
  let guard = 0;
  while (s.pending.length && guard++ < 50) {
    const p = s.pending[0];
    if (p.kind === 'event') {
      const def = EVENT_BY_ID[p.eventId];
      const ctx = buildCtx(s, p);
      const ok = def.choices.map((c, i) => [c, i] as const).filter(([c]) => (!c.show || c.show(ctx)) && (!c.available || c.available(ctx)));
      if (!ok.length) {
        s.pending.shift();
        continue;
      }
      onEvent?.(p.eventId);
      resolveEvent(s, p.uid, pick(rng, ok)[1]);
    } else s.pending.shift();
  }
}

// ── Building blocks ───────────────────────────────────────────────────────

/** Net genetic quality: good genes count up by tier, bad ones down. */
export function geneScore(c: Character): number {
  let n = 0;
  for (const id of c.traits) {
    const t = TRAITS[id];
    if (t?.cat !== 'genetic' || t.good === null) continue;
    n += (t.good ? 1 : -1) * Math.max(1, Math.abs(t.level ?? 1));
  }
  return n;
}

/** Marry (or betroth) someone to the best suitor we can afford. */
function arrangeMatch(s: GameState, c: Character | undefined, score: (x: Character) => number = () => 0): boolean {
  if (!c || canSeekSpouse(s, c)) return false;
  generateSuitors(s, c.id);
  const best = (s.suitors?.list ?? [])
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.prestigeCost <= s.prestige)
    .sort((a, b) => score(b.x.char) - score(a.x.char))[0];
  return best ? acceptSuitor(s, best.i) : false;
}

/** The bare minimum to keep a dynasty alive: a married ruler and a matched heir. */
function secureLine(s: GameState, score?: (x: Character) => number): void {
  const choice = ambitionChoices(s)[0];
  if (choice) chooseAmbition(s, choice);
  const r = ruler(s);
  if (ageOf(s, r) >= 16) arrangeMatch(s, r, score);
  arrangeMatch(s, currentHeir(s), score);
}

function fillCouncil(s: GameState): void {
  const serving = new Set(Object.values(s.council));
  for (const role of ROLE_KEYS) {
    if (s.council[role] && alive(s.characters[s.council[role]!])) continue;
    const c = candidates(s, role).find((x) => !serving.has(x.id));
    if (c) {
      appoint(s, role, c.id);
      serving.add(c.id);
    }
  }
}

/** Develop the poorest regions first, keeping a reserve. */
function develop(s: GameState, reserve: number): void {
  const regions = clanRegions(s, s.playerClanId)
    .slice()
    .sort((a, b) => a.dev - b.dev);
  for (const r of regions) if (s.credits - developCost(r.dev) >= reserve) developRegion(s, r.id);
}

/** Recruit up to a share of the fleet cap without dipping below a reserve. */
function recruitTo(s: GameState, share: number, reserve: number): void {
  const want = Math.round(fleetCap(s) * share) - s.fleet;
  const affordable = Math.floor((s.credits - reserve) / shipCost(s));
  if (want > 0 && affordable > 0) recruitShips(s, Math.min(want, affordable));
}

function takeTitles(s: GameState): void {
  createViceroy(s);
  forgeSolarThrone(s);
}

/** Fight every war we can, and sue for peace when ahead (or badly behind). */
function fightWars(s: GameState): void {
  for (const w of s.wars.slice()) {
    if (canFightBattle(s, w) && s.fleet >= 10) fightBattle(s, w.id);
    const war = s.wars.find((x) => x.id === w.id);
    if (!war) continue;
    if ((war.playerAttacker && war.score >= 50) || (!war.playerAttacker && war.score >= -20) || war.score <= -40) offerPeace(s, war.id);
  }
}

/**
 * Start an offensive war if none is running: a capital (the road to Sovereign
 * and the Solar Throne) when our fleet beats its owner's by `edge`, otherwise
 * the weakest neighbour on the home world.
 */
function goToWar(s: GameState, edge: number): boolean {
  if (s.wars.some((w) => w.playerAttacker) || s.fleet < 20) return false;
  const me = s.playerClanId;
  const holdsHomeCapital = planetRegions(s, homePlanet(s)).some((r) => r.capital && r.owner === me);
  const pool = holdsHomeCapital ? Object.values(s.regions).filter((r) => r.capital) : planetRegions(s, homePlanet(s));
  const fleetOf = (r: Region) => s.clans[r.owner]?.fleet ?? 0;
  const targets = pool
    .filter((r) => r.owner !== me && !warBlocker(s, r) && s.fleet >= edge * fleetOf(r))
    .sort((a, b) => Number(b.capital) - Number(a.capital) || fleetOf(a) - fleetOf(b));
  for (const r of targets) {
    const opt = cbOptions(s, r).find((o) => o.ok);
    if (opt && declareWar(s, r.id, opt.cb)) return true;
  }
  return false;
}

function openTrade(s: GameState): void {
  if (s.routes.length >= clanRegions(s, s.playerClanId).length) return;
  const from = clanRegions(s, s.playerClanId).find((r) => !s.routes.some((t) => t.from === r.id));
  if (!from) return;
  const partners = Object.values(s.clans)
    .filter((c) => !c.isPlayer && clanRank(s, c.id) > 0)
    .sort((a, b) => b.opinion - a.opinion);
  for (const p of partners.slice(0, 3)) if (openRoute(s, from.id, p.id)) return;
}

const goodGene = (id: string) => isHeritable(id) && TRAITS[id].cat === 'genetic' && TRAITS[id].good === true;

/** Lock the best good genes the bloodline carries, purge the bad ones, buy slots when full. */
function tendVault(s: GameState): void {
  const present = new Set(dynastyMembers(s).flatMap((c) => c.traits));
  const bad = [...present].filter((id) => TRAITS[id]?.cat === 'genetic' && TRAITS[id].good === false);
  for (const id of bad) purgeTrait(s, id);
  const good = [...present].filter(goodGene).sort((a, b) => (TRAITS[b].level ?? 0) - (TRAITS[a].level ?? 0));
  for (const id of good) lockTrait(s, id);
  if (vaultUsed(s) >= vaultSlots(s)) buySlot(s);
}

function tendForge(s: GameState): void {
  buildForge(s);
  buildVats(s);
  if (!s.forge.project) {
    const next = researchable(s).sort((a, b) => (TRAITS[b].level ?? 0) - (TRAITS[a].level ?? 0))[0];
    if (next) startResearch(s, next);
  }
  const heir = currentHeir(s);
  for (const c of [ruler(s), heir]) {
    const gene = c && s.forge.researched.find((g) => !c.traits.includes(g));
    if (c && gene) splice(s, c.id, gene);
  }
}

/** See the children who have gone longest without you, as many as the cycle allows. */
function tendFamily(s: GameState): void {
  const kids = childrenOf(s, ruler(s))
    .filter((k) => alive(k) && ageOf(s, k) <= 15)
    .sort((a, b) => neglectedFor(s, b) - neglectedFor(s, a));
  for (const k of kids) if (timeLeft(s) > 0) spendTime(s, k.id, 'dinner');
}

/**
 * Give every child of fostering age the best mentor with room for a pupil
 * and, if `foster`, send one younger child who isn't the heir to the most
 * willing court that would raise them (wave 2 wards and mentors).
 */
function raiseChildren(s: GameState, foster: boolean): void {
  const heir = currentHeir(s);
  const kids = childrenOf(s, ruler(s)).filter((k) => canBeMentored(s, k) && !wardshipOf(s, k.id));
  for (const k of kids) {
    if (mentorshipOf(s, k.id)) continue;
    const best = mentorCandidates(s, k.id)
      .filter((m) => !mentorBlocker(s, k.id, m.id))
      .sort((a, b) => teachingOf(s, b).level - teachingOf(s, a).level)[0];
    if (best) appointMentor(s, k.id, best.id);
  }
  if (!foster || childrenOf(s, ruler(s)).some((k) => wardshipOf(s, k.id))) return;
  const young = kids.find((k) => k.id !== heir?.id && ageOf(s, k) <= 10);
  const court = young && fosterOptions(s, young.id)[0];
  if (young && court && court.chance >= 0.6) sendAsWard(s, young.id, court.clan.id);
}

// ── The bots ──────────────────────────────────────────────────────────────

export const BOTS: Record<BotId, Bot> = {
  passive: {
    id: 'passive',
    name: 'Passive',
    blurb: 'Answers pop-ups and marries off the ruler and heir. Nothing else.',
    turn: (s) => secureLine(s),
  },
  builder: {
    id: 'builder',
    name: 'Builder',
    blurb: 'Economy first: council, development, trade, a modest fleet, time with the children. Fights only with a clear edge.',
    turn: (s) => {
      manageCrisis(s, s.playerClanId);
      s.leadPersonally = false;
      secureLine(s);
      tendFamily(s);
      raiseChildren(s, true);
      fillCouncil(s);
      develop(s, 150);
      recruitTo(s, 0.6, 150);
      openTrade(s);
      takeTitles(s);
      fightWars(s);
      goToWar(s, 1.5);
    },
  },
  warmonger: {
    id: 'warmonger',
    name: 'Warmonger',
    blurb: 'Fleet first and always at war, ruler leading from the front.',
    turn: (s) => {
      manageCrisis(s, s.playerClanId, true);
      s.leadPersonally = true;
      secureLine(s);
      fillCouncil(s);
      recruitTo(s, 1, 0);
      develop(s, 0);
      takeTitles(s);
      fightWars(s);
      goToWar(s, 1);
    },
  },
  breeder: {
    id: 'breeder',
    name: 'Breeder',
    blurb: 'Matches close family for genes, tends the Gene Vault and Gene-Forge, defends but never attacks.',
    turn: (s) => {
      manageCrisis(s, s.playerClanId);
      s.leadPersonally = false;
      secureLine(s, geneScore);
      tendFamily(s);
      raiseChildren(s, false);
      // Hand-pick matches for close family; auto-matchmaking handles distant kin, as for a player.
      for (const c of dynastyMembers(s)) if (ageOf(s, c) >= 16 && isCloseFamily(s, c)) arrangeMatch(s, c, geneScore);
      fillCouncil(s);
      tendVault(s);
      tendForge(s);
      develop(s, 200);
      recruitTo(s, 0.4, 200);
      takeTitles(s);
      fightWars(s);
    },
  },
};
