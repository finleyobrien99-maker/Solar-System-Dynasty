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
  ruler,
  setOwner,
  traitSum,
  vassalsOf,
} from './core';
import { canAfford, costText, pay, type Cost } from './genetics';
import { PLANET_BY_ID } from './planets';
import { chance, clamp, range } from './rng';
import { addTrait } from './traits';
import type { BattleReport, CasusBelli, GameState, Region, War } from './types';
import { killCharacter } from './life';
import { councilStat } from './council';
import { remember } from './memory';
import { takeCaptive } from './aiCourt';

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
  if (s.wars.length >= 3) return 'You are already fighting three wars.';
  if (atWarWith(s, region.owner)) return 'Already at war with this clan.';
  const r = ruler(s);
  if (r.prisonerOf) return 'A captive ruler cannot declare war.';
  if (s.year - r.born < 16) return 'A regency council cannot declare war.';
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
  s.wars.push({ id: newId(s, 'w'), enemy: enemy.id, playerAttacker: true, target: regionId, cb, score: 0, started: s.year });
  recordDeed(s, ruler(s), 'warsStarted');
  breakPeace(s, enemy.headId);
  log(s, `War! You declared a ${CB_INFO[cb].name} on House ${enemy.name} for ${region.name}.`, 'war');
  return true;
}

export function independenceBlocker(s: GameState, breakOath = false): string | null {
  const liege = liegeOf(s, s.playerClanId);
  if (s.gameOver) return 'The dynasty has ended.';
  if (!liege) return 'You already answer to nobody.';
  if (atWarWith(s, liege)) return 'Already at war with your liege.';
  if (s.wars.length >= 3) return 'You are already fighting three wars.';
  if (s.year - ruler(s).born < 16 || ruler(s).prisonerOf) return 'A free adult ruler must declare independence.';
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
  if (s.gameOver || atWarWith(s, enemyId) || s.wars.length >= 3) return false;
  const enemy = s.clans[enemyId],
    head = ch(s, enemy?.headId);
  if (!enemy || enemy.isPlayer || !alive(head) || head.prisonerOf || s.year - head.born < 16 || !clanRegions(s, enemyId).length) return false;
  const target = s.regions[targetRegionId];
  if (!target || target.owner !== s.playerClanId || (cb === 'revolt' && liegeOf(s, enemyId) !== s.playerClanId)) return false;
  if (truceOf(s, enemyId, s.playerClanId) && (!breakOath || !breakTruce(s, enemyId, s.playerClanId))) return false;
  s.wars.push({ id: newId(s, 'w'), enemy: enemyId, playerAttacker: false, target: targetRegionId, cb, score: 0, started: s.year });
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
  for (const c of Object.values(s.clans)) {
    if (c.isPlayer || c.id === war.enemy) continue;
    if (c.allied && c.opinion >= 10 && clanRegions(s, c.id).length) {
      const add = Math.round(c.fleet * 0.3);
      if (add > 0) {
        ships += add;
        helpers.push(`House ${c.name} (ally, ${add})`);
      }
    }
  }
  for (const v of vassalsOf(s, s.playerClanId)) {
    if (v.id === war.enemy || v.opinion <= 0) continue;
    const add = Math.round(v.fleet * (v.cadetOf === s.playerClanId ? 0.35 : 0.2));
    if (add > 0) {
      ships += add;
      helpers.push(`House ${v.name} (${v.cadetOf === s.playerClanId ? 'cadet' : 'vassal'}, ${add})`);
    }
  }
  // An admiral commands any battle you don't lead yourself, if they're better at it.
  const cmd = personal ? effStats(s, r).cmd : Math.max(effStats(s, r).cmd, councilStat(s, 'admiral'));
  let mod = 1 + traitSum(r, 'fleetPct') + itemSum(s, 'fleetPct') + councilStat(s, 'admiral') * 0.01;
  if (homePlanet(s) === 'mars') mod += 0.15;
  if (personal) mod += 0.15;
  if (s.year - r.born < 16) mod -= 0.2; // regency
  return { ships, strength: ships * (1 + cmd * 0.04) * mod * warStrengthFactor(s, s.playerClanId), helpers };
}

export function enemySide(s: GameState, war: War): Side {
  const enemy = s.clans[war.enemy];
  const head = ch(s, enemy.headId);
  let ships = enemy.fleet;
  const helpers: string[] = [];
  const liege = liegeOf(s, enemy.id);
  const target = s.regions[war.target];
  if (liege && liege !== s.playerClanId && war.cb !== 'revolt' && war.cb !== 'independence') {
    // A sovereign defends its vassals from outsiders, not from internal feuds.
    const sameRealm = liegeOf(s, s.playerClanId) === liege;
    if (!sameRealm) {
      const add = Math.round(s.clans[liege].fleet * 0.4);
      ships += add;
      helpers.push(`House ${s.clans[liege].name} (liege, ${add})`);
    }
  }
  if (war.cb === 'independence' && target === undefined) {
    // The liege calls in its other vassals.
    for (const v of vassalsOf(s, enemy.id)) {
      if (v.isPlayer) continue;
      const add = Math.round(v.fleet * 0.15);
      ships += add;
    }
  }
  const cmd = head && alive(head) ? effStats(s, head).cmd : 4;
  let mod = 1 + (head ? traitSum(head, 'fleetPct') : 0);
  if (enemy.planetId === 'mars') mod += 0.15;
  return { ships, strength: ships * (1 + cmd * 0.04) * mod * warStrengthFactor(s, enemy.id), helpers };
}

// ── Battles ───────────────────────────────────────────────────────────────

export function canFightBattle(s: GameState, war: War): boolean {
  return war.lastPlayerBattle !== s.year && s.fleet > 0;
}

export function fightBattle(s: GameState, warId: string, aiInitiated = false): BattleReport | undefined {
  const war = s.wars.find((w) => w.id === warId);
  if (!war || (!aiInitiated && !canFightBattle(s, war))) return undefined;
  const enemy = s.clans[war.enemy];
  const actorId = s.rulerId;
  const personal = !aiInitiated && s.leadPersonally && s.year - ruler(s).born >= 16;
  const ps = playerSide(s, war, personal);
  const es = enemySide(s, war);
  const pStr = ps.strength * range(s, 0.75, 1.25);
  const eStr = es.strength * range(s, 0.75, 1.25) * (aiInitiated ? 1.05 : 1);
  const won = pStr >= eStr;
  const margin = Math.abs(pStr - eStr) / Math.max(1, pStr + eStr);
  const delta = Math.round(clamp(18 + margin * 60, 10, 45));
  const scoreChange = won ? delta : -delta;
  war.score = clamp(war.score + scoreChange, -100, 100);
  if (!aiInitiated) war.lastPlayerBattle = s.year;

  const pLossRate = won ? range(s, 0.04, 0.12) : range(s, 0.15, 0.3);
  const eLossRate = won ? range(s, 0.15, 0.3) : range(s, 0.04, 0.12);
  const playerLosses = Math.min(s.fleet, Math.round(s.fleet * pLossRate));
  const enemyLosses = Math.min(enemy.fleet, Math.round(enemy.fleet * eLossRate));
  battleWeariness(s, s.playerClanId, s.fleet, playerLosses);
  battleWeariness(s, enemy.id, enemy.fleet, enemyLosses);
  s.fleet -= playerLosses;
  enemy.fleet -= enemyLosses;

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
    note,
  };
  s.pending.push({ kind: 'battle', uid: newId(s, 'b'), report });
  log(
    s,
    `${won ? 'Victory' : 'Defeat'} against House ${enemy.name}${aiInitiated ? ' (they attacked)' : ''}: you lost ${playerLosses} ships, they lost ${enemyLosses}.`,
    won ? 'good' : 'bad',
  );
  if (war.score >= 100) endWar(s, war, 'win', actorId);
  else if (war.score <= -100) endWar(s, war, 'lose', actorId);
  return report;
}

export function endWar(s: GameState, war: War, outcome: 'win' | 'lose' | 'white', actorId = s.rulerId): void {
  if (!s.wars.some((w) => w.id === war.id)) return;
  s.wars = s.wars.filter((w) => w.id !== war.id);
  const enemy = s.clans[war.enemy];
  const region = s.regions[war.target];
  const clan = playerClan(s);
  makeTruce(s, clan.id, war.enemy);
  if (outcome === 'white') {
    recordDeed(s, actorId, 'peaceTreaties');
    recordDeed(s, enemy.headId, 'peaceTreaties');
    log(s, `White peace with House ${enemy.name}. Nobody gains anything.`, 'war');
    notice(s, 'Peace', `The war with House ${enemy.name} ends in a white peace.`, { icon: 'peace' });
    return;
  }
  recordDeed(s, actorId, outcome === 'win' ? 'warsWon' : 'warsLost');
  recordDeed(s, enemy.headId, outcome === 'win' ? 'warsLost' : 'warsWon');
  if (outcome === 'win' && !war.playerAttacker) recordDeed(s, actorId, 'defensiveWins');
  if (outcome === 'lose' && war.playerAttacker) recordDeed(s, enemy.headId, 'defensiveWins');
  if (outcome === 'lose' && war.cb === 'revolt') recordDeed(s, enemy.headId, 'independence');
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
    recordDeed(s, enemy.headId, 'regionsTaken', 1, region.id);
    if (region.capital) recordDeed(s, enemy.headId, 'capitalsTaken', 1, region.planetId);
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
  if (!war || s.cooldowns[`peace:${warId}`] === s.year) return false;
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
    if (enemyGone || targetMoved || indepMoot) {
      s.wars = s.wars.filter((w) => w.id !== war.id);
      log(s, `The war with House ${enemy?.name ?? 'unknown'} fizzles out; the prize has changed hands.`, 'war');
      continue;
    }
    if (s.year - war.started >= 7) {
      endWar(s, war, 'white');
      continue;
    }
    if (enemy.fleet > 5 && chance(s, 0.75)) fightBattle(s, war.id, true);
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
