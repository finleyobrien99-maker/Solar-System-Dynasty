import { coalitionCall, recordExpansion } from './coalitions';
import { answerRealmCall, realmCall, recordPlanetConquest } from './realmDefence';
import type { RealmCallAnswer } from './diplomacyTypes';
import {
  homeFleet,
  reserveAid,
  aidBattleNotes,
  aidStrength,
  aidLosses,
  aidTruces,
  committedShips,
  recallAid,
  releaseAid,
  snapshotAid,
  warContributions,
} from './warAid';
import { siegeOptions as baseSiegeOptions, siegeBlocker, performSiege, chooseAiSiege, type SiegeOption } from './siege';
import { battleWeariness, warStrengthFactor, breakTruce, makeTruce, OATH_BREAK_COST, truceBreakBlocker, truceOf } from './peace';
import { breakPeace, recordDeed } from './epithets';
// Wars and fleet battles involving the player.

import {
  alive,
  ch,
  clanRank,
  clanRegions,
  effStats,
  fullName,
  homePlanet,
  itemSum,
  liegeOf,
  log,
  newId,
  notice,
  playerClan,
  regentHolding,
  ruler,
  setOwner,
  traitSum,
  vassalsOf,
} from './core';
import { canAfford, costText, pay, type Cost } from './genetics';
import { PLANET_BY_ID } from './planets';
import { chance, clamp, range } from './rng';
import { addTrait } from './traits';
import type { BattleReport, CasusBelli, FleetContribution, GameState, Region, SiegeKind, SiegeResult, War } from './types';
import { killCharacter } from './life';
import { councilStat } from './council';
import { remember } from './memory';
import { takeCaptive } from './aiCourt';
import { commandFactor, commanderOf, onCommandedBattle, personalCommand } from './commanders';

export const CB_INFO: Record<CasusBelli, { name: string; desc: string }> = {
  claim: { name: 'Press Claim', desc: 'You hold a claim on this region. No prestige penalty.' },
  holy: { name: 'Holy War', desc: 'The target follows a different faith. Costs 150 faith.' },
  conquest: { name: 'Naked Conquest', desc: 'No justification at all. Costs 120 prestige and every clan likes you less.' },
  independence: { name: 'War of Independence', desc: 'Throw off your liege. Win and you answer to nobody.' },
  feud: { name: 'Blood Feud', desc: 'They wronged you. Revenge is free.' },
  revolt: { name: 'Revolt', desc: 'A vassal rising against its liege.' },
};

export interface CBOption {
  cb: CasusBelli;
  cost: Cost;
  ok: boolean;
  reason?: string;
}

export function atWarWith(s: GameState, clanId: string): War | undefined {
  return s.wars.find((w) => w.enemy === clanId);
}

export function cbOptions(s: GameState, region: Region): CBOption[] {
  const enemy = region.owner;
  const clan = playerClan(s);
  const opts: CBOption[] = [];
  if (s.claims.includes(region.id)) opts.push({ cb: 'claim', cost: {}, ok: true });
  if (s.feuds.includes(enemy)) opts.push({ cb: 'feud', cost: {}, ok: true });
  const enemyClan = s.clans[enemy];
  if (enemyClan && enemyClan.faithId !== clan.faithId) {
    const cost = { faith: 150 };
    opts.push({ cb: 'holy', cost, ok: canAfford(s, cost), reason: canAfford(s, cost) ? undefined : `Need ${costText(cost)}` });
  }
  const cost = { prestige: 120 };
  opts.push({ cb: 'conquest', cost, ok: canAfford(s, cost), reason: canAfford(s, cost) ? undefined : `Need ${costText(cost)}` });
  return opts;
}

export function warBlocker(s: GameState, region: Region, breakOath = false): string | null {
  if (s.gameOver) return 'The dynasty has ended.';
  if (region.owner === s.playerClanId) return 'You already hold this region.';
  if (committedShips(s, s.playerClanId)) return 'Recall your coalition ships before starting another war.';
  if (s.wars.length >= 3) return 'You are already fighting three wars.';
  if (atWarWith(s, region.owner)) return 'Already at war with this clan.';
  const r = ruler(s);
  if (r.prisonerOf) return 'A captive ruler cannot declare war.';
  if (s.year - r.born < 16 || regentHolding(s)) return 'A regency cannot declare war.';
  const enemy = s.clans[region.owner];
  if (!enemy) return 'Nobody holds this region.';
  const truce = truceOf(s, s.playerClanId, enemy.id);
  if (truce) return breakOath ? truceBreakBlocker(s, s.playerClanId, enemy.id) : `You swore a truce with House ${enemy.name} until ${truce.until}.`;
  return null;
}

export function declareWar(s: GameState, regionId: string, cb: CasusBelli, breakOath = false): boolean {
  const region = s.regions[regionId];
  if (!region || warBlocker(s, region, breakOath)) return false;
  const opt = cbOptions(s, region).find((o) => o.cb === cb);
  if (!opt || !opt.ok) return false;
  const violates = !!truceOf(s, s.playerClanId, region.owner);
  if (violates && (!canAfford(s, { ...opt.cost, prestige: (opt.cost.prestige ?? 0) + OATH_BREAK_COST }) || !breakTruce(s, s.playerClanId, region.owner)))
    return false;
  pay(s, opt.cost);
  const enemy = s.clans[region.owner];
  if (cb === 'conquest') {
    for (const c of Object.values(s.clans)) if (!c.isPlayer) c.opinion -= 8;
  }
  if (enemy.allied) {
    enemy.allied = false;
    if (!violates) {
      recordDeed(s, ruler(s), 'oathsBroken');
      s.prestige -= 50;
    }
    log(s, `You broke your alliance with House ${enemy.name}. Oath-breaker!`, 'bad');
  }
  enemy.opinion = Math.min(enemy.opinion, -40) - 20;
  remember(s, enemy.id, cb === 'conquest' ? 'Attacked us without any cause' : `Made war on us over ${region.name}`, cb === 'conquest' ? -30 : -15);
  s.feuds = s.feuds.filter((f) => f !== enemy.id || cb !== 'feud');
  recallAid(s, enemy.id);
  const war: War = { id: newId(s, 'w'), enemy: enemy.id, playerAttacker: true, target: regionId, cb, score: 0, started: s.year, coalition: [] };
  s.wars.push(war);
  recordDeed(s, ruler(s), 'warsStarted');
  breakPeace(s, enemy.headId);
  log(s, `War! You declared a ${CB_INFO[cb].name} on House ${enemy.name} for ${region.name}.`, 'war');
  // The defender's realm answers first; its helpers are then not asked again by a league.
  Object.assign(war, callRealm(s, war.id, s.playerClanId, enemy.id, regionId, cb));
  war.coalition = coalitionCall(s, s.playerClanId, enemy.id, realmHelpers(war));
  return true;
}

export function independenceBlocker(s: GameState, breakOath = false): string | null {
  const liege = liegeOf(s, s.playerClanId);
  if (s.gameOver) return 'The dynasty has ended.';
  if (!liege) return 'You already answer to nobody.';
  if (committedShips(s, s.playerClanId)) return 'Recall your coalition ships before starting another war.';
  if (atWarWith(s, liege)) return 'Already at war with your liege.';
  if (s.wars.length >= 3) return 'You are already fighting three wars.';
  if (s.year - ruler(s).born < 16 || regentHolding(s) || ruler(s).prisonerOf) return 'A free adult ruler must declare independence.';
  const truce = truceOf(s, s.playerClanId, liege);
  return truce ? (breakOath ? truceBreakBlocker(s, s.playerClanId, liege) : `Your truce with House ${s.clans[liege].name} lasts until ${truce.until}.`) : null;
}

export function declareIndependence(s: GameState, breakOath = false): boolean {
  if (independenceBlocker(s, breakOath)) return false;
  const liege = liegeOf(s, s.playerClanId)!;
  if (truceOf(s, s.playerClanId, liege) && !breakTruce(s, s.playerClanId, liege)) return false;
  s.wars.push({ id: newId(s, 'w'), enemy: liege, playerAttacker: true, target: '', cb: 'independence', score: 0, started: s.year });
  s.clans[liege].opinion = -80;
  recordDeed(s, ruler(s), 'warsStarted');
  recordDeed(s, ruler(s), 'rebellions');
  breakPeace(s, s.clans[liege].headId);
  log(s, `You declared independence from House ${s.clans[liege].name}!`, 'war');
  return true;
}

/** AI declares war on the player. */
export function aiDeclareWar(s: GameState, enemyId: string, cb: CasusBelli, targetRegionId: string, breakOath = false): boolean {
  if (s.gameOver || atWarWith(s, enemyId) || s.wars.length >= 3 || committedShips(s, enemyId)) return false;
  const enemy = s.clans[enemyId],
    head = ch(s, enemy?.headId);
  if (!enemy || enemy.isPlayer || !alive(head) || head.prisonerOf || s.year - head.born < 16 || !clanRegions(s, enemyId).length) return false;
  const target = s.regions[targetRegionId];
  if (!target || target.owner !== s.playerClanId || (cb === 'revolt' && liegeOf(s, enemyId) !== s.playerClanId)) return false;
  if (truceOf(s, enemyId, s.playerClanId) && (!breakOath || !breakTruce(s, enemyId, s.playerClanId))) return false;
  recallAid(s, s.playerClanId);
  const war: War = { id: newId(s, 'w'), enemy: enemyId, playerAttacker: false, target: targetRegionId, cb, score: 0, started: s.year, coalition: [] };
  s.wars.push(war);
  recordDeed(s, enemy.headId, 'warsStarted');
  if (cb === 'revolt') recordDeed(s, enemy.headId, 'rebellions');
  breakPeace(s, s.rulerId);
  const what = cb === 'revolt' ? 'rises in revolt against you' : `declares war on you over ${s.regions[targetRegionId]?.name ?? 'your lands'}`;
  log(s, `House ${enemy.name} ${what}!`, 'war');
  notice(s, 'War Declared!', `House ${enemy.name} ${what}. Fight battles from the Realm tab, or sue for peace.`, {
    icon: 'war',
    tone: 'bad',
    portraitId: enemy.headId,
  });
  if (cb !== 'revolt') {
    Object.assign(war, callRealm(s, war.id, enemyId, s.playerClanId, targetRegionId, cb));
    war.coalition = coalitionCall(s, enemyId, s.playerClanId, realmHelpers(war));
  }
  return true;
}

// ── Realm defence (realmDefence.ts decides; these reserve the real ships) ──

/** Call the defender's realm and reserve the ships of every house that answers. Returns what the war saves. */
export function callRealm(
  s: GameState,
  warId: string,
  attackerId: string,
  defenderId: string,
  regionId: string,
  cb: CasusBelli,
): { realmCalls: RealmCallAnswer[]; realmAid: FleetContribution[] } {
  const realmCalls = realmCall(s, { warId, attackerId, defenderId, regionId, cb });
  const realmAid: FleetContribution[] = [];
  for (const a of realmCalls) {
    if (a.answer !== 'accepted') continue;
    const loan = reserveAid(s, a.clanId, Math.min(a.proposedShips, homeFleet(s, a.clanId)));
    if (loan) realmAid.push(loan);
  }
  return { realmCalls, realmAid };
}

/** Houses already lending ships to this war's realm defence. */
export function realmHelpers(war: { realmAid?: FleetContribution[] }): Set<string> {
  return new Set((war.realmAid ?? []).filter((p) => p.sent > 0).map((p) => p.clanId));
}

/** Your answer to your realm's call, with the ships really sent. False when nothing changed. */
export function answerRealm(s: GameState, warId: string, accept: boolean, share?: number): boolean {
  const answer = answerRealmCall(s, warId, accept, share);
  if (!answer) return false;
  const war = s.aiWars.find((w) => w.id === warId);
  if (answer.answer === 'accepted' && war) {
    const loan = reserveAid(s, s.playerClanId, Math.min(answer.proposedShips, s.fleet));
    if (loan) (war.realmAid ??= []).push(loan);
  }
  return true;
}

// ── Strength ──────────────────────────────────────────────────────────────

export interface Side {
  ships: number;
  strength: number;
  helpers: string[];
}

export function playerSide(s: GameState, war: War, personal: boolean): Side {
  const r = ruler(s);
  let ships = s.fleet;
  const helpers: string[] = [];
  const used = new Set(
    warContributions(war)
      .filter((p) => p.sent > 0)
      .map((p) => p.clanId),
  );
  for (const c of Object.values(s.clans)) {
    if (c.isPlayer || c.id === war.enemy || used.has(c.id) || committedShips(s, c.id)) continue;
    if (c.allied && c.opinion >= 10 && clanRegions(s, c.id).length) {
      const add = Math.round(c.fleet * 0.3);
      if (add > 0) {
        ships += add;
        used.add(c.id);
        helpers.push(`House ${c.name} (ally, ${add})`);
      }
    }
  }
  // In a defence your realm was called to, each vassal already answered with real ships or not at all (realmDefence.ts).
  const called = new Set(war.playerAttacker ? [] : (war.realmCalls ?? []).map((a) => a.clanId));
  for (const v of vassalsOf(s, s.playerClanId)) {
    if (v.id === war.enemy || v.opinion <= 0 || used.has(v.id) || called.has(v.id) || committedShips(s, v.id)) continue;
    const add = Math.round(v.fleet * (v.cadetOf === s.playerClanId ? 0.35 : 0.2));
    if (add > 0) {
      ships += add;
      helpers.push(`House ${v.name} (${v.cadetOf === s.playerClanId ? 'cadet' : 'vassal'}, ${add})`);
    }
  }
  // A named commander leads any battle you don't lead yourself, on their own Command and traits alone:
  // no council seat or VIP bonus (commanders.ts). Without one, the admiral advises as before.
  const defenders = war.playerAttacker ? [] : warContributions(war).filter((p) => p.ships > 0);
  const coalitionShips = defenders.reduce((n, p) => n + p.ships, 0);
  const coalitionPower = aidStrength(s, defenders);
  for (const p of defenders) helpers.push(`House ${s.clans[p.clanId]?.name ?? 'unknown'} (${war.coalition?.includes(p) ? 'coalition' : 'realm'}, ${p.ships})`);
  const general = personal ? undefined : commanderOf(s, s.playerClanId);
  if (general) {
    let gmod = 1 + itemSum(s, 'fleetPct');
    if (homePlanet(s) === 'mars') gmod += 0.15;
    if (s.year - r.born < 16) gmod -= 0.2; // regency
    return {
      ships: ships + coalitionShips,
      strength: ships * commandFactor(s, general) * gmod * warStrengthFactor(s, s.playerClanId) + coalitionPower,
      helpers,
    };
  }
  // An admiral commands any battle you don't lead yourself, if they're better at it.
  const cmd = personal ? effStats(s, r).cmd : Math.max(effStats(s, r).cmd, councilStat(s, 'admiral'));
  let mod = 1 + traitSum(r, 'fleetPct') + itemSum(s, 'fleetPct') + councilStat(s, 'admiral') * 0.01;
  if (homePlanet(s) === 'mars') mod += 0.15;
  if (personal) mod += 0.15;
  if (s.year - r.born < 16) mod -= 0.2; // regency
  return { ships: ships + coalitionShips, strength: ships * (1 + cmd * 0.04) * mod * warStrengthFactor(s, s.playerClanId) + coalitionPower, helpers };
}

export function enemySide(s: GameState, war: War): Side {
  const enemy = s.clans[war.enemy];
  const head = ch(s, enemy.headId);
  let ships = enemy.fleet;
  const helpers: string[] = [];
  const used = new Set(
    warContributions(war)
      .filter((p) => p.sent > 0)
      .map((p) => p.clanId),
  );
  const target = s.regions[war.target];
  // A liege's help is no longer an invisible share of its fleet: the realm answers with real ships (realmAid).
  if (war.cb === 'independence' && target === undefined) {
    // The liege calls in its other vassals.
    for (const v of vassalsOf(s, enemy.id)) {
      if (v.isPlayer || used.has(v.id) || committedShips(s, v.id)) continue;
      const add = Math.round(v.fleet * 0.15);
      ships += add;
    }
  }
  // Their named commander leads if they have one (commanders.ts); otherwise their lord.
  const general = commanderOf(s, enemy.id);
  const cmd = general ? personalCommand(s, general) : head && alive(head) ? effStats(s, head).cmd : 4;
  let mod = 1 + (general ? traitSum(general, 'fleetPct') : head ? traitSum(head, 'fleetPct') : 0);
  if (enemy.planetId === 'mars') mod += 0.15;
  const defenders = war.playerAttacker ? warContributions(war).filter((p) => p.ships > 0) : [];
  const coalitionShips = defenders.reduce((n, p) => n + p.ships, 0);
  for (const p of defenders) helpers.push(`House ${s.clans[p.clanId]?.name ?? 'unknown'} (${war.coalition?.includes(p) ? 'coalition' : 'realm'}, ${p.ships})`);
  return {
    ships: ships + coalitionShips,
    strength: ships * (1 + cmd * 0.04) * mod * warStrengthFactor(s, enemy.id) + aidStrength(s, defenders),
    helpers,
  };
}

// ── Battles ───────────────────────────────────────────────────────────────

export function canFightBattle(s: GameState, war: War): boolean {
  return !s.gameOver && liveCampaign(s, war) && war.lastPlayerBattle !== s.year && s.fleet > 0;
}

export function fightBattle(s: GameState, warId: string, aiInitiated = false): BattleReport | undefined {
  const war = s.wars.find((w) => w.id === warId);
  if (!war || s.gameOver || !liveCampaign(s, war) || (aiInitiated ? war.lastAiOperation === s.year : !canFightBattle(s, war))) return undefined;
  const enemy = s.clans[war.enemy];
  const actorId = s.rulerId,
    enemyActorId = enemy.headId;
  const personal = !aiInitiated && s.leadPersonally && !ruler(s).prisonerOf && s.year - ruler(s).born >= 16;
  const ps = playerSide(s, war, personal);
  const es = enemySide(s, war);
  // Who actually leads each side, snapshotted before anyone can fall. A ruler leading in person keeps the old roll below, so nobody rolls twice.
  const ownCommander = personal ? undefined : commanderOf(s, s.playerClanId)?.id;
  const theirCommander = commanderOf(s, enemy.id)?.id;
  const [ownShips, theirShips] = [s.fleet, enemy.fleet];
  const aidSnapshot = snapshotAid(s, warContributions(war));
  for (const row of aidSnapshot) row.contribution.commanderId = row.commanderId;
  const pStr = ps.strength * range(s, 0.75, 1.25);
  const eStr = es.strength * range(s, 0.75, 1.25) * (aiInitiated ? 1.05 : 1);
  const won = pStr >= eStr;
  const margin = Math.abs(pStr - eStr) / Math.max(1, pStr + eStr);
  const delta = Math.round(clamp(18 + margin * 60, 10, 45));
  const scoreChange = won ? delta : -delta;
  war.score = clamp(war.score + scoreChange, -100, 100);
  if (!aiInitiated) war.lastPlayerBattle = s.year;
  else war.lastAiOperation = s.year;

  const pLossRate = won ? range(s, 0.04, 0.12) : range(s, 0.15, 0.3);
  const eLossRate = won ? range(s, 0.15, 0.3) : range(s, 0.04, 0.12);
  const playerLosses = Math.min(s.fleet, Math.round(s.fleet * pLossRate));
  const enemyLosses = Math.min(enemy.fleet, Math.round(enemy.fleet * eLossRate));
  battleWeariness(s, s.playerClanId, s.fleet, playerLosses);
  battleWeariness(s, enemy.id, enemy.fleet, enemyLosses);
  s.fleet -= playerLosses;
  enemy.fleet -= enemyLosses;
  const helperLosses = aidLosses(s, warContributions(war), war.playerAttacker ? eLossRate : pLossRate);

  recordDeed(s, actorId, won ? 'battlesWon' : 'battlesLost');
  recordDeed(s, enemy.headId, won ? 'battlesLost' : 'battlesWon');
  if (personal) recordDeed(s, actorId, 'personalBattles');
  let note: string | undefined;
  if (won) {
    s.stats.battlesWon += 1;
    s.prestige += personal ? 20 : 8;
  } else {
    s.stats.battlesLost += 1;
  }
  if (personal) {
    const r = ruler(s);
    const danger = won ? 1 : 2;
    if (chance(s, 0.012 * danger)) {
      note = `${r.name} was killed leading the charge.`;
      killCharacter(s, r.id, 'killed in battle');
    } else if (chance(s, 0.05 * danger)) {
      recordDeed(s, r, 'battleWounds');
      r.traits = addTrait(r.traits, 'wounded');
      if (chance(s, 0.4)) r.traits = addTrait(r.traits, 'scarred');
      note = `${r.name} was wounded on the bridge.`;
    } else if (won && !r.traits.includes('war_hero') && chance(s, 0.15)) {
      r.traits = addTrait(r.traits, 'war_hero');
      note = `${r.name} is hailed as a War Hero!`;
    }
  }

  // Named commanders on both sides earn their reputations, and risk wounds, capture or death (commanders.ts).
  const fateNotes = onCommandedBattle(s, {
    id: `${warId}@${s.year}${aiInitiated ? ':defence' : ''}`,
    attacker: aiInitiated ? enemy.id : s.playerClanId,
    defender: aiInitiated ? s.playerClanId : enemy.id,
    attackerCommanderId: aiInitiated ? theirCommander : ownCommander,
    defenderCommanderId: aiInitiated ? ownCommander : theirCommander,
    attackerWon: aiInitiated ? !won : won,
    attackerShips: aiInitiated ? theirShips : ownShips,
    attackerLosses: aiInitiated ? enemyLosses : playerLosses,
    defenderShips: aiInitiated ? ownShips : theirShips,
    defenderLosses: aiInitiated ? playerLosses : enemyLosses,
  });
  fateNotes.push(...aidBattleNotes(s, aidSnapshot, war.playerAttacker ? s.playerClanId : enemy.id, war.playerAttacker ? won : !won, helperLosses));
  if (fateNotes.length) note = [note, ...fateNotes].filter(Boolean).join(' ');

  const report: BattleReport = {
    warId,
    enemy: enemy.id,
    playerStrength: Math.round(pStr),
    enemyStrength: Math.round(eStr),
    playerShips: ps.ships,
    enemyShips: es.ships,
    playerLosses,
    enemyLosses,
    won,
    scoreChange,
    newScore: war.score,
    personal,
    playerCommanderId: personal ? actorId : ownCommander,
    enemyCommanderId: theirCommander,
    coalitionLosses: helperLosses,
    note,
  };
  s.pending.push({ kind: 'battle', uid: newId(s, 'b'), report });
  log(
    s,
    `${won ? 'Victory' : 'Defeat'} against House ${enemy.name}${aiInitiated ? ' (they attacked)' : ''}: you lost ${playerLosses} ships, they lost ${enemyLosses}.`,
    won ? 'good' : 'bad',
  );
  if (war.score >= 100) endWar(s, war, 'win', actorId, enemyActorId);
  else if (war.score <= -100) endWar(s, war, 'lose', actorId, enemyActorId);
  return report;
}

export function endWar(s: GameState, war: War, outcome: 'win' | 'lose' | 'white', actorId = s.rulerId, enemyActorId = s.clans[war.enemy]?.headId): void {
  if (!s.wars.some((w) => w.id === war.id)) return;
  if (!liveCampaign(s, war)) {
    releaseAid(s, warContributions(war));
    s.wars = s.wars.filter((w) => w.id !== war.id);
    return;
  }
  aidTruces(s, war.playerAttacker ? s.playerClanId : war.enemy, warContributions(war));
  releaseAid(s, warContributions(war));
  s.wars = s.wars.filter((w) => w.id !== war.id);
  const enemy = s.clans[war.enemy];
  const region = s.regions[war.target];
  const clan = playerClan(s);
  makeTruce(s, clan.id, war.enemy);
  if (outcome === 'white') {
    recordDeed(s, actorId, 'peaceTreaties');
    recordDeed(s, enemyActorId, 'peaceTreaties');
    log(s, `White peace with House ${enemy.name}. Nobody gains anything.`, 'war');
    notice(s, 'Peace', `The war with House ${enemy.name} ends in a white peace.`, { icon: 'peace' });
    return;
  }
  recordDeed(s, actorId, outcome === 'win' ? 'warsWon' : 'warsLost');
  recordDeed(s, enemyActorId, outcome === 'win' ? 'warsLost' : 'warsWon');
  if (outcome === 'win' && !war.playerAttacker) recordDeed(s, actorId, 'defensiveWins');
  if (outcome === 'lose' && war.playerAttacker) recordDeed(s, enemyActorId, 'defensiveWins');
  if (outcome === 'lose' && war.cb === 'revolt') recordDeed(s, enemyActorId, 'independence');
  // The winner may carry off the loser's lord or kin, whichever side you're on.
  const captive = outcome === 'win' ? takeCaptive(s, clan.id, enemy.id, 0.25) : takeCaptive(s, enemy.id, clan.id, 0.3);
  if (captive && outcome === 'win')
    notice(s, 'Captive Taken', `Your troops drag ${fullName(s, captive)} back in chains. Decide their fate under Prisoners on the Realm tab.`, {
      icon: 'scheme',
      tone: 'good',
      portraitId: captive.id,
    });
  else if (captive)
    notice(s, 'Taken Captive', `House ${enemy.name} has carried off ${fullName(s, captive)}. Expect a ransom demand, if they're feeling businesslike.`, {
      icon: 'scheme',
      tone: 'bad',
      portraitId: captive.id,
    });
  if (outcome === 'win') {
    s.prestige += 60;
    enemy.opinion = Math.max(-100, enemy.opinion - 20);
    if (war.cb === 'independence') {
      recordDeed(s, actorId, 'independence');
      clan.liege = 'none';
      s.prestige += 80;
      log(s, `Independence won! House ${clan.name} bows to nobody.`, 'good');
      notice(s, 'Independence!', `House ${enemy.name} concedes. You are now an independent power.`, { icon: 'crown', tone: 'good' });
      return;
    }
    if (war.playerAttacker && region) {
      const wasCapital = region.capital;
      remember(s, enemy.id, wasCapital ? `Stole our throne, ${region.name}` : `Took ${region.name} from us`, wasCapital ? -55 : -35, 0.025);
      setOwner(s, region, clan.id);
      recordExpansion(s, clan.id, region, war.cb);
      recordPlanetConquest(s, clan.id, region, war.cb);
      recordDeed(s, actorId, 'regionsTaken', 1, region.id);
      if (wasCapital) recordDeed(s, actorId, 'capitalsTaken', 1, region.planetId);
      s.claims = s.claims.filter((c) => c !== region.id);
      log(s, `${region.name} is yours!`, 'good');
      if (wasCapital) {
        const p = PLANET_BY_ID[region.planetId];
        s.prestige += 150;
        notice(
          s,
          `Crowned ${p.monarch[ruler(s).gender]} of ${p.name}!`,
          `You seized ${region.name}, the throne of the ${p.faction}. Every clan on ${p.name} is now your vassal.`,
          { icon: 'crown', tone: 'good', portraitId: s.rulerId },
        );
      } else {
        notice(s, 'Victory!', `House ${enemy.name} yields ${region.name} to you.`, { icon: 'win', tone: 'good' });
      }
      return;
    }
    // Defensive win (including crushed revolts).
    const loot = Math.round(Math.max(60, enemy.credits * 0.4));
    enemy.credits -= loot;
    s.credits += loot;
    if (war.cb === 'revolt') {
      enemy.opinion = 0;
      enemy.liege = s.playerClanId;
    }
    notice(s, 'Victory!', `House ${enemy.name} is beaten back and pays ${loot} credits in reparations.`, { icon: 'win', tone: 'good' });
    log(s, `House ${enemy.name} sues for peace and pays ${loot} credits.`, 'good');
    return;
  }
  // Lost.
  s.prestige -= 50;
  if (war.playerAttacker) {
    const fine = Math.round(Math.max(0, s.credits) * 0.25);
    s.credits -= fine;
    notice(s, 'Defeat', `Your war against House ${enemy.name} has failed. You pay ${fine} credits in reparations.`, { icon: 'lose', tone: 'bad' });
    log(s, `Defeated by House ${enemy.name}.`, 'bad');
    return;
  }
  if (war.cb === 'revolt') {
    enemy.liege = 'none';
    notice(s, 'Revolt Succeeds', `House ${enemy.name} has broken free of your rule.`, { icon: 'lose', tone: 'bad' });
    log(s, `House ${enemy.name} is no longer your vassal.`, 'bad');
    return;
  }
  if (region && region.owner === s.playerClanId) {
    setOwner(s, region, enemy.id);
    recordExpansion(s, enemy.id, region, war.cb);
    recordPlanetConquest(s, enemy.id, region, war.cb);
    recordDeed(s, enemyActorId, 'regionsTaken', 1, region.id);
    if (region.capital) recordDeed(s, enemyActorId, 'capitalsTaken', 1, region.planetId);
    notice(s, 'Region Lost', `House ${enemy.name} takes ${region.name} from you.`, { icon: 'lose', tone: 'bad' });
    log(s, `You lost ${region.name} to House ${enemy.name}.`, 'bad');
  }
}

export function peaceChance(s: GameState, war: War): number {
  const dip = effStats(s, ruler(s)).dip + councilStat(s, 'envoy') / 2;
  if (war.score >= 50) return clamp(0.5 + dip * 0.02, 0, 0.95);
  if (war.score >= -20) return clamp(0.3 + dip * 0.02 + (war.score + 20) / 200, 0.05, 0.9);
  return 0.05;
}

export function offerPeace(s: GameState, warId: string): boolean {
  const war = s.wars.find((w) => w.id === warId);
  if (!war || s.gameOver || !liveCampaign(s, war) || s.cooldowns[`peace:${warId}`] === s.year) return false;
  s.cooldowns[`peace:${warId}`] = s.year;
  if (chance(s, peaceChance(s, war))) {
    if (war.score >= 50 && war.playerAttacker) endWar(s, war, 'win');
    else endWar(s, war, 'white');
    return true;
  }
  notice(s, 'Peace Refused', `House ${s.clans[war.enemy].name} laughs off your envoy.`, { icon: 'war', tone: 'bad' });
  return false;
}

export function surrender(s: GameState, warId: string): void {
  const war = s.wars.find((w) => w.id === warId);
  if (war) endWar(s, war, 'lose');
}

/** Year-end: enemies attack, stale wars fizzle out, dead wars are cleared. */
export function tickPlayerWars(s: GameState): void {
  for (const war of s.wars.slice()) {
    const enemy = s.clans[war.enemy];
    const target = s.regions[war.target];
    const enemyGone = !enemy || clanRegions(s, enemy.id).length === 0;
    const targetMoved = target && ((war.playerAttacker && target.owner !== war.enemy) || (!war.playerAttacker && target.owner !== s.playerClanId));
    const indepMoot = war.cb === 'independence' && liegeOf(s, s.playerClanId) !== war.enemy;
    if (enemyGone || targetMoved || indepMoot || !liveCampaign(s, war)) {
      releaseAid(s, warContributions(war));
      s.wars = s.wars.filter((w) => w.id !== war.id);
      log(s, `The war with House ${enemy?.name ?? 'unknown'} fizzles out; the prize has changed hands.`, 'war');
      continue;
    }
    if (s.year - war.started >= 7) {
      endWar(s, war, 'white');
      continue;
    }
    if (war.lastAiOperation !== s.year && enemy.fleet > 5 && chance(s, 0.75)) {
      const order = war.playerAttacker ? undefined : chooseAiSiege(s, war.id);
      if (order) conductSiege(s, war.id, order, true);
      else fightBattle(s, war.id, true);
    }
  }
}

export function clanPower(s: GameState, clanId: string): string {
  const rank = clanRank(s, clanId);
  return ['Landless', 'Minor', 'Major', 'Sovereign', 'Imperial'][rank];
}

export function warLabel(s: GameState, war: War): string {
  const enemy = s.clans[war.enemy];
  const target = s.regions[war.target];
  const what = target ? ` for ${target.name}` : '';
  return `${CB_INFO[war.cb].name}${what} vs House ${enemy?.name ?? '?'}`;
}

export function enemyHeadName(s: GameState, war: War): string {
  const head = ch(s, s.clans[war.enemy]?.headId);
  return head ? fullName(s, head) : 'Unknown';
}

/** A vanished or externally transferred prize cannot be won by an old report. */
function liveCampaign(s: GameState, war: War): boolean {
  if (!s.clans[war.enemy] || !clanRegions(s, war.enemy).length || !clanRegions(s, s.playerClanId).length) return false;
  if (war.cb === 'independence') return liegeOf(s, s.playerClanId) === war.enemy;
  const target = s.regions[war.target];
  return !!target && target.owner === (war.playerAttacker ? war.enemy : s.playerClanId);
}
/** Pure preview includes every actual helper, each with its own command and fatigue. */
export function siegeOptions(s: GameState, warId: string, aiInitiated = false): SiegeOption[] {
  const war = s.wars.find((w) => w.id === warId);
  const options = baseSiegeOptions(s, warId, aiInitiated);
  if (!war || !s.clans[war.enemy]) return options;
  const personal = !aiInitiated && s.leadPersonally && !ruler(s).prisonerOf && s.year - ruler(s).born >= 16;
  const ours = playerSide(s, war, personal).strength;
  const theirs = enemySide(s, war).strength * (aiInitiated ? 1.05 : 1);
  const attacker = war.playerAttacker ? ours : theirs;
  return options.map((o) =>
    o.kind === 'assault'
      ? {
          ...o,
          chance: attacker / Math.max(1, ours + theirs),
          desc: 'Launch an ordinary fleet battle. Win 18-45 progress or lose as much. The estimate shows your share of both sides strength, including helpers, before the 75-125% battle rolls. Ships and commanders face normal battle risks.',
        }
      : o,
  );
}
/** Assault reuses the real battle once; every other order shares its cycle allowance. */
export function conductSiege(s: GameState, warId: string, kind: SiegeKind, aiInitiated = false): SiegeResult | undefined {
  if (siegeBlocker(s, warId, kind, aiInitiated)) return undefined;
  const war = s.wars.find((w) => w.id === warId);
  if (!war) return undefined; // Other-house campaigns are resolved by ai.ts.
  const actor = s.rulerId,
    enemyActor = s.clans[war.enemy].headId;
  if (kind === 'assault') {
    const before = war.score;
    const report = fightBattle(s, warId, aiInitiated);
    if (!report) return undefined;
    const result: SiegeResult = {
      kind,
      year: s.year,
      attacker: war.playerAttacker ? s.playerClanId : war.enemy,
      success: war.playerAttacker ? report.won : !report.won,
      cost: 0,
      losses: war.playerAttacker ? report.playerLosses : report.enemyLosses,
      progress: (war.score - before) * (war.playerAttacker ? 1 : -1),
      leaderId: war.playerAttacker ? (report.playerCommanderId ?? actor) : (report.enemyCommanderId ?? enemyActor),
    };
    war.siege = result;
    return result;
  }
  const result = performSiege(s, warId, kind, aiInitiated);
  if (result && war.score >= 100) endWar(s, war, 'win', actor, enemyActor);
  else if (result && war.score <= -100) endWar(s, war, 'lose', actor, enemyActor);
  return result;
}
