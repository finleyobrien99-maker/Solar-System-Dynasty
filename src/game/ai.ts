import { recordMurder } from './secrets';
import { breakPeace, isCloseKin, recordDeed } from './epithets';
// The rest of the solar system: rival houses grow, marry, feud, and sometimes
// come for you.

import {
  alive,
  ch,
  clanRank,
  clanRegions,
  dynastyMembers,
  effStats,
  hasTrait,
  fullName,
  homePlanet,
  liegeOf,
  log,
  notice,
  newId,
  planetSovereign,
  playerClan,
  ruler,
  setOwner,
  traitSum,
  vassalsOf,
} from './core';
import { grossRegionIncome } from './economy';
import { aiSucceed, isCloseFamily, killCharacter, currentHeir } from './life';
import { councilStat } from './council';
import { capOpinion, grudgeOpinion, isRival, opinionCeiling } from './memory';
import { addFeeling, feelingsSum, murdered, opinionOf } from './relations';
import { aiIntrigueTick } from './aiIntrigue';
import { aiDynastyTick } from './aiDynasty';
import { allMentorships, allWardships, aiWardsTick } from './wards';
import { aiCommandersTick, commanderAfterBattle, leadFactor } from './commanders';
import { aiAmbition, ambitionHouse, AMBITION_AGGRESSION, type AmbitionKind } from './aiAmbition';
import { aiAffairsTick, aiArrests, aiMarriages, alliesAbandon, betrayPact, captivesTick, kinFleet, pactMap, takeCaptive, wouldBetray } from './aiCourt';
import { neighbourPlanets, PLANET_BY_ID } from './planets';
import { chance, clamp, int, pick, range, weighted } from './rng';
import type { AiWar, Clan, GameState } from './types';
import { aiDeclareWar, atWarWith } from './war';
import { fleetTarget } from './world';

export const GRACE_YEARS = 3;

function landed(s: GameState): Clan[] {
  return Object.values(s.clans).filter((c) => !c.isPlayer && clanRegions(s, c.id).length > 0);
}

function aggression(s: GameState, clan: Clan): number {
  const head = ch(s, clan.headId);
  if (!head) return 1;
  let a = 1;
  if (hasTrait(head, 'ambitious')) a += 0.6;
  if (hasTrait(head, 'wrathful')) a += 0.4;
  if (hasTrait(head, 'cruel')) a += 0.3;
  if (hasTrait(head, 'content')) a -= 0.4;
  if (hasTrait(head, 'craven')) a -= 0.4;
  if (hasTrait(head, 'kind')) a -= 0.2;
  return Math.max(0.2, a);
}

/** Houses that have married into your dynasty. Computed once per pass. */
export function familyTies(s: GameState): Set<string> {
  const ties = new Set<string>();
  for (const m of dynastyMembers(s)) {
    const sp = ch(s, m.spouseId);
    if (sp) ties.add(sp.clanId);
  }
  return ties;
}

export function baselineOpinion(s: GameState, clan: Clan, ties: Set<string> = familyTies(s)): number {
  const r = ruler(s);
  const st = effStats(s, r);
  const pc = playerClan(s);
  let o = (st.dip - 5) * 3;
  o += clan.faithId === pc.faithId ? 10 : -8;
  if (clan.allied) o += 25;
  if (liegeOf(s, clan.id) === pc.id) o -= 5;
  for (const t of ['just', 'kind', 'generous', 'honest']) if (hasTrait(r, t)) o += 4;
  for (const t of ['cruel', 'arbitrary', 'tyrant', 'kinslayer', 'deceitful']) if (hasTrait(r, t)) o -= 6;
  o += clamp(Math.round(s.prestige / 100), -10, 15);
  o += grudgeOpinion(clan);
  // The head's own history with you: personal hatred drags the whole house down.
  const head = ch(s, clan.headId);
  if (alive(head)) {
    const f = feelingsSum(s, head, r);
    o += Math.round(f < 0 ? f * 0.5 : f * 0.25);
  }
  o += Math.floor(councilStat(s, 'envoy') / 3);
  if (clan.cadetOf === pc.id) o += 30; // blood is thicker than vacuum
  if (homePlanet(s) === 'earth') o += 10;
  if (atWarWith(s, clan.id)) o -= 60;
  // Family ties: anyone in their house married into yours.
  if (ties.has(clan.id)) o += 15;
  return o;
}

/** Each cycle a house's opinion drifts toward its baseline, never above the ceiling a grave grudge sets. */
export function opinionDrift(s: GameState): void {
  const ties = familyTies(s);
  for (const clan of Object.values(s.clans)) {
    if (clan.isPlayer) continue;
    const ceiling = opinionCeiling(clan);
    const base = ceiling === null ? baselineOpinion(s, clan, ties) : Math.min(ceiling, baselineOpinion(s, clan, ties));
    // Gifts and favours can lift opinion for a moment, never above the ceiling.
    clan.opinion = capOpinion(clan, clamp(Math.round(clan.opinion + (base - clan.opinion) * 0.15), -100, 100));
  }
}

function resources(s: GameState): void {
  for (const clan of Object.values(s.clans)) {
    if (clan.isPlayer) continue;
    if (!alive(ch(s, clan.headId))) aiSucceed(s, clan.id);
    const regs = clanRegions(s, clan.id);
    if (!regs.length) {
      clan.fleet = Math.round(clan.fleet * 0.7);
      continue;
    }
    const income = Math.round(grossRegionIncome(s, clan.id) * 0.3);
    clan.credits += income;
    recordDeed(s, clan.headId, 'income', Math.max(0, income));
    clan.prestige += clanRank(s, clan.id) * 3;
    const target = fleetTarget(s, clan.id);
    if (clan.fleet < target) {
      const built = Math.max(1, Math.round((target - clan.fleet) * 0.18));
      clan.fleet += built;
      recordDeed(s, clan.headId, 'shipsBuilt', built);
    } else clan.fleet -= Math.round((clan.fleet - target) * 0.08);
  }
}

// ── AI vs AI wars ─────────────────────────────────────────────────────────

function startAiWar(s: GameState): void {
  if (s.aiWars.length >= 3) return;
  const pool = landed(s).filter((c) => c.fleet > 35 && !s.aiWars.some((w) => w.attacker === c.id || w.defender === c.id));
  if (!pool.length) return;
  const attacker = weighted(
    s,
    pool.map((c) => [c, c.fleet * aggression(s, c) * AMBITION_AGGRESSION[aiAmbition(s, c).kind]] as const),
  );
  const rank = clanRank(s, attacker.id);
  let targets = Object.values(s.regions).filter((r) => r.owner !== attacker.id && r.owner !== s.playerClanId && r.owner);
  if (rank >= 3) {
    const near = new Set(neighbourPlanets(attacker.planetId));
    targets = targets.filter((r) => near.has(r.planetId) && (!r.capital || chance(s, 0.25)));
  } else {
    // Feuds inside a planet: never against your own liege's throne.
    targets = targets.filter((r) => r.planetId === attacker.planetId && !r.capital && liegeOf(s, attacker.id) !== r.owner);
  }
  targets = targets.filter((r) => !s.clans[r.owner]?.isPlayer && !s.aiWars.some((w) => w.defender === r.owner));
  // Houses bound by marriage leave each other alone, unless the lord is treacherous and hates them.
  const lord = ch(s, attacker.headId);
  const pacts = pactMap(s);
  const kin = pacts.get(attacker.id);
  if (kin?.size && alive(lord)) targets = targets.filter((r) => !kin.has(r.owner) || wouldBetray(s, lord, ch(s, s.clans[r.owner]?.headId)));
  if (!targets.length) return;
  // Grudges and ambition pick the enemy: the more the attacker's head hates a house, the likelier its land.
  const aim = ambitionHouse(s, aiAmbition(s, attacker));
  const target = weighted(
    s,
    targets.map((r) => {
      const theirs = ch(s, s.clans[r.owner]?.headId);
      const hate = alive(lord) && alive(theirs) ? Math.max(0, -opinionOf(s, lord, theirs)) : 0;
      return [r, (1 + hate / 20) * (r.owner === aim ? 4 : 1)] as const;
    }),
  );
  const war: AiWar = { id: newId(s, 'aw'), attacker: attacker.id, defender: target.owner, target: target.id, started: s.year, progress: 0 };
  s.aiWars.push(war);
  recordDeed(s, attacker.headId, 'warsStarted');
  breakPeace(s, s.clans[target.owner].headId);
  const defender = s.clans[target.owner];
  if (kin?.has(defender.id)) betrayPact(s, attacker, defender);
  const theirs = ch(s, defender.headId);
  if (alive(lord) && alive(theirs)) addFeeling(s, theirs.id, lord.id, { why: 'Made war on us', value: -20, decay: 1 });
  log(s, `House ${attacker.name} (${PLANET_BY_ID[attacker.planetId].name}) declares war on House ${defender.name} over ${target.name}.`, 'news');
  const friends = [...(pacts.get(defender.id) ?? [])].filter((id) => id !== attacker.id && !pacts.get(id)?.has(attacker.id)).map((id) => s.clans[id].name);
  if (friends.length) log(s, `House ${defender.name}'s kin by marriage (${friends.map((n) => `House ${n}`).join(', ')}) send ships to defend them.`, 'news');
}

function tickAiWars(s: GameState): void {
  const pacts = s.aiWars.length ? pactMap(s) : new Map<string, Set<string>>();
  for (const w of s.aiWars.slice()) {
    const a = s.clans[w.attacker];
    const d = s.clans[w.defender];
    const target = s.regions[w.target];
    const done = () => (s.aiWars = s.aiWars.filter((x) => x.id !== w.id));
    if (!a || !d || !target || target.owner !== d.id || !clanRegions(s, a.id).length) {
      done();
      continue;
    }
    let def = d.fleet;
    const liege = liegeOf(s, d.id);
    if (liege && liege !== a.id && liegeOf(s, a.id) !== liege && liege !== s.playerClanId) def += s.clans[liege].fleet * 0.3;
    // Kin by marriage stand by each other, more readily in defence than in attack.
    def += kinFleet(s, d.id, a.id, pacts, 0.25);
    // Each side fights as well as its named commander leads it (commanders.ts).
    def *= leadFactor(s, d.id);
    const att = (a.fleet + kinFleet(s, a.id, d.id, pacts, 0.15)) * leadFactor(s, a.id);
    const pAtt = att / Math.max(1, att + def);
    const attWins = chance(s, pAtt);
    recordDeed(s, a.headId, attWins ? 'battlesWon' : 'battlesLost');
    recordDeed(s, d.headId, attWins ? 'battlesLost' : 'battlesWon');
    for (const [k, won, foe] of [
      [a, attWins, d],
      [d, !attWins, a],
    ] as const) {
      const fate = commanderAfterBattle(s, k.id, won, foe.id, 0.5);
      if (fate?.died || fate?.captured) log(s, `House ${k.name}: ${fate.note}`, 'news');
    }
    w.progress += attWins ? int(s, 25, 45) : -int(s, 25, 45);
    a.fleet = Math.round(a.fleet * range(s, 0.85, 0.95));
    d.fleet = Math.round(d.fleet * range(s, 0.85, 0.95));
    if (w.progress >= 100) {
      const wasCapital = target.capital;
      setOwner(s, target, a.id);
      recordDeed(s, a.headId, 'warsWon');
      recordDeed(s, d.headId, 'warsLost');
      recordDeed(s, a.headId, 'regionsTaken', 1, target.id);
      if (wasCapital) recordDeed(s, a.headId, 'capitalsTaken', 1, target.planetId);
      done();
      // Losing land is not forgotten.
      const [ah, dh] = [ch(s, a.headId), ch(s, d.headId)];
      if (alive(ah) && alive(dh))
        addFeeling(s, dh.id, ah.id, { why: `Took ${target.name} from us`, value: wasCapital ? -50 : -35, decay: 0.5, key: `took:${target.id}` });
      takeCaptive(s, a.id, d.id, 0.4);
      const p = PLANET_BY_ID[target.planetId];
      if (wasCapital) log(s, `House ${a.name} has seized ${target.name} and the throne of ${p.name}!`, 'news');
      else log(s, `House ${a.name} took ${target.name} (${p.name}) from House ${d.name}.`, 'news');
    } else if (w.progress <= -100 || s.year - w.started >= 5) {
      if (w.progress <= -100) {
        recordDeed(s, d.headId, 'warsWon');
        recordDeed(s, d.headId, 'defensiveWins');
        recordDeed(s, a.headId, 'warsLost');
        const [ah, dh] = [ch(s, a.headId), ch(s, d.headId)];
        if (alive(ah) && alive(dh)) addFeeling(s, ah.id, dh.id, { why: 'Humiliated us in war', value: -15, decay: 1 });
        takeCaptive(s, d.id, a.id, 0.4);
      } else {
        recordDeed(s, a.headId, 'peaceTreaties');
        recordDeed(s, d.headId, 'peaceTreaties');
      }
      done();
      log(s, `House ${d.name} beat off House ${a.name}'s attack on ${target.name}.`, 'news');
    }
  }
}

// ── Threats to the player ─────────────────────────────────────────────────

function aggressionOnPlayer(s: GameState): void {
  if (s.year - s.startYear < GRACE_YEARS || s.wars.length >= 2) return;
  const mine = clanRegions(s, s.playerClanId);
  if (!mine.length) return;
  const myPlanets = new Set(mine.map((r) => r.planetId));
  const settled = s.year - s.startYear >= 10;
  const pool = landed(s).filter((c) => {
    if (c.allied || atWarWith(s, c.id) || s.aiWars.some((w) => w.attacker === c.id)) return false;
    if (liegeOf(s, c.id) === s.playerClanId) return false;
    const near = myPlanets.has(c.planetId) || neighbourPlanets(c.planetId).some((p) => myPlanets.has(p));
    // Sworn rivals and lords sworn to revenge on you come from anywhere, and with less of an edge.
    if (isRival(c) || aimsAtPlayer(s, c) === 'revenge') return c.fleet > s.fleet * 0.7;
    // A conqueror or crusader eyeing your land needs less provocation than most, but still some,
    // and leaves a new dynasty its first decade to find its feet.
    if (aimsAtPlayer(s, c)) return near && settled && c.opinion < -10 && c.fleet > s.fleet * 0.9;
    return near && c.opinion < -25 && c.fleet > s.fleet * 0.9;
  });
  if (!pool.length) return;
  const attacker = pick(s, pool);
  const bent = isRival(attacker) || aimsAtPlayer(s, attacker) === 'revenge';
  if (!chance(s, 0.1 * aggression(s, attacker) * (bent ? 1.8 : 1))) return;
  const onPlanet = mine.filter((r) => r.planetId === attacker.planetId && !(r.capital && clanRank(s, attacker.id) < 2));
  const target = onPlanet.length ? pick(s, onPlanet) : pick(s, mine);
  const cb = s.claims.length && chance(s, 0.3) ? 'feud' : 'conquest';
  aiDeclareWar(s, attacker.id, cb, target.id);
}

/** Whether a house's ambition is aimed at you: revenge on your people, or your land. */
function aimsAtPlayer(s: GameState, c: Clan): AmbitionKind | undefined {
  const a = aiAmbition(s, c);
  return a.kind !== 'security' && ambitionHouse(s, a) === s.playerClanId ? a.kind : undefined;
}

/** Sworn rivals, and lords sworn to revenge, scheme against you: assassins, sabotage and theft. */
function rivalPlots(s: GameState): void {
  if (s.year - s.startYear < GRACE_YEARS) return;
  const rivals = landed(s).filter((c) => (isRival(c) || aimsAtPlayer(s, c) === 'revenge') && alive(ch(s, c.headId)) && !ch(s, c.headId)?.prisonerOf);
  if (!rivals.length || !chance(s, Math.min(0.35, 0.12 * rivals.length))) return;
  const rival = pick(s, rivals);
  const head = ch(s, rival.headId)!;
  const myDefence = Math.max(effStats(s, ruler(s)).int, councilStat(s, 'spymaster'));
  const odds = clamp(0.35 + (effStats(s, head).int - myDefence) * 0.03 - traitSum(ruler(s), 'defense'), 0.08, 0.7);
  const success = chance(s, odds);
  if (success) recordDeed(s, head, 'schemes');
  const kind = weighted(s, [
    ['assassinate', 0.35],
    ['sabotage', 0.35],
    ['theft', 0.3],
  ] as const);
  const caught = !success || chance(s, 0.4);
  if (caught && !s.feuds.includes(rival.id)) s.feuds.push(rival.id);
  const blame = caught ? ` Agents of House ${rival.name} were caught. You have a Blood Feud against them.` : ' Nobody can prove who did it.';
  if (kind === 'assassinate') {
    const heir = currentHeir(s);
    const family = Object.values(s.characters).filter((c) => alive(c) && c.clanId === s.playerClanId && isCloseFamily(s, c) && c.id !== s.rulerId);
    const target = chance(s, 0.25) ? ruler(s) : heir && chance(s, 0.6) ? heir : family.length ? pick(s, family) : ruler(s);
    if (success) {
      notice(s, 'Assassination!', `${fullName(s, target)} was found dead this morning.${blame}`, { icon: 'death', tone: 'bad', portraitId: target.id });
      recordDeed(s, head, 'assassinations');
      recordDeed(s, head, 'cruelty');
      if (isCloseKin(head, target)) recordDeed(s, head, 'kinslayings');
      killCharacter(s, target.id, `assassinated by agents of House ${rival.name}`);
      // Immortality can prevent the death; a failed killing is not murder evidence.
      if (!alive(target)) {
        recordMurder(s, head, target, caught);
        if (caught) murdered(s, target, head.id, true);
      }
    } else {
      notice(
        s,
        'Assassin Foiled',
        `An assassin from House ${rival.name} was caught creeping toward ${target.name}'s chambers. You have a Blood Feud against them.`,
        {
          icon: 'scheme',
          tone: 'good',
          portraitId: target.id,
        },
      );
    }
  } else if (kind === 'sabotage' && success) {
    recordDeed(s, head, 'sabotages');
    const lost = Math.round(s.fleet * range(s, 0.08, 0.18));
    s.fleet -= lost;
    notice(s, 'Sabotage!', `Explosions rip through your docks. ${lost} ships are lost.${blame}`, { icon: 'war', tone: 'bad' });
  } else if (kind === 'theft' && success) {
    const stolen = Math.round(Math.min(Math.max(0, s.credits) * 0.15, 300));
    s.credits -= stolen;
    notice(s, 'Treasury Robbed', `${stolen} credits have vanished from your vaults.${blame}`, { icon: 'credits', tone: 'bad' });
  } else {
    notice(s, 'Plot Foiled', `Your guards stopped agents of House ${rival.name} before they could strike. You have a Blood Feud against them.`, {
      icon: 'scheme',
      tone: 'good',
    });
  }
  log(s, `House ${rival.name} plotted against you (${kind}${success ? ', succeeded' : ', failed'}).`, success ? 'bad' : 'war');
}

function revolts(s: GameState): void {
  for (const v of vassalsOf(s, s.playerClanId)) {
    if (v.opinion >= -40 || atWarWith(s, v.id) || s.wars.length >= 3) continue;
    const head = ch(s, v.headId);
    if (!alive(head) || head.prisonerOf) continue;
    if (v.fleet < s.fleet * 0.35) continue;
    if (chance(s, 0.12)) {
      const mine = clanRegions(s, s.playerClanId).find((r) => r.planetId === v.planetId);
      aiDeclareWar(s, v.id, 'revolt', mine?.id ?? '');
    }
  }
}

/** Liege flavours: AI sovereign clans keep their own vassals in line. */
export function aiTick(s: GameState): void {
  resources(s);
  aiDynastyTick(s);
  aiMarriages(s);
  aiAffairsTick(s);
  opinionDrift(s);
  aiCommandersTick(s);
  tickAiWars(s);
  if (chance(s, 0.3)) startAiWar(s);
  aggressionOnPlayer(s);
  rivalPlots(s);
  aiIntrigueTick(s);
  aiArrests(s);
  aiWardsTick(s);
  captivesTick(s);
  alliesAbandon(s);
  revolts(s);
}

// ── Housekeeping ──────────────────────────────────────────────────────────

/** Drop dead strangers so saves stay small. Dynasty history is always kept. */
export function prune(s: GameState): void {
  const keep = new Set<string>();
  for (const c of Object.values(s.characters)) {
    if (c.clanId !== s.playerClanId) continue;
    keep.add(c.id);
    if (c.spouseId) keep.add(c.spouseId);
    if (c.fatherId) keep.add(c.fatherId);
    if (c.motherId) keep.add(c.motherId);
  }
  for (const clan of Object.values(s.clans)) keep.add(clan.headId);
  for (const w of allWardships(s)) {
    keep.add(w.childId);
    keep.add(w.guardianId);
  }
  for (const m of allMentorships(s)) {
    keep.add(m.childId);
    keep.add(m.mentorId);
  }
  for (const crisis of s.successionCrises) {
    keep.add(crisis.predecessorId);
    keep.add(crisis.claimantId);
    keep.add(crisis.incumbentId);
    for (const vote of crisis.votes) keep.add(vote.id);
  }
  for (const secret of s.secrets) {
    keep.add(secret.otherId); // Victim/lover ancestry is needed when old evidence is exposed.
    if (secret.betrayedId) keep.add(secret.betrayedId);
  }
  for (const c of Object.values(s.characters)) {
    if (c.died !== undefined && !c.reputation?.earned.length && !keep.has(c.id) && c.died < s.year - 2) delete s.characters[c.id];
  }
}

export function sovereignOf(s: GameState, planetId: string): Clan | undefined {
  const id = planetSovereign(s, planetId);
  return id ? s.clans[id] : undefined;
}
