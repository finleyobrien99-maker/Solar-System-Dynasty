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

export function warBlocker(s: GameState, region: Region): string | null {
  if (region.owner === s.playerClanId) return 'You already hold this region.';
  if (s.wars.length >= 3) return 'You are already fighting three wars.';
  if (atWarWith(s, region.owner)) return 'Already at war with this clan.';
  const r = ruler(s);
  if ((s.year - r.born) < 16) return 'A regency council cannot declare war.';
  const enemy = s.clans[region.owner];
  if (!enemy) return 'Nobody holds this region.';
  return null;
}

export function declareWar(s: GameState, regionId: string, cb: CasusBelli): boolean {
  const region = s.regions[regionId];
  if (!region || warBlocker(s, region)) return false;
  const opt = cbOptions(s, region).find((o) => o.cb === cb);
  if (!opt || !opt.ok) return false;
  pay(s, opt.cost);
  const enemy = s.clans[region.owner];
  if (cb === 'conquest') {
    for (const c of Object.values(s.clans)) if (!c.isPlayer) c.opinion -= 8;
  }
  if (enemy.allied) {
    enemy.allied = false;
    s.prestige -= 50;
    log(s, `You broke your alliance with House ${enemy.name}. Oath-breaker!`, 'bad');
  }
  enemy.opinion = Math.min(enemy.opinion, -40) - 20;
  s.feuds = s.feuds.filter((f) => f !== enemy.id || cb !== 'feud');
  s.wars.push({ id: newId(s, 'w'), enemy: enemy.id, playerAttacker: true, target: regionId, cb, score: 0, started: s.year });
  log(s, `War! You declared a ${CB_INFO[cb].name} on House ${enemy.name} for ${region.name}.`, 'war');
  return true;
}

export function declareIndependence(s: GameState): boolean {
  const liege = liegeOf(s, s.playerClanId);
  if (!liege || atWarWith(s, liege) || s.wars.length >= 3) return false;
  s.wars.push({ id: newId(s, 'w'), enemy: liege, playerAttacker: true, target: '', cb: 'independence', score: 0, started: s.year });
  s.clans[liege].opinion = -80;
  log(s, `You declared independence from House ${s.clans[liege].name}!`, 'war');
  return true;
}

/** AI declares war on the player. */
export function aiDeclareWar(s: GameState, enemyId: string, cb: CasusBelli, targetRegionId: string): void {
  if (atWarWith(s, enemyId)) return;
  const enemy = s.clans[enemyId];
  s.wars.push({ id: newId(s, 'w'), enemy: enemyId, playerAttacker: false, target: targetRegionId, cb, score: 0, started: s.year });
  const what = cb === 'revolt' ? 'rises in revolt against you' : `declares war on you over ${s.regions[targetRegionId]?.name ?? 'your lands'}`;
  log(s, `House ${enemy.name} ${what}!`, 'war');
  notice(s, 'War Declared!', `House ${enemy.name} ${what}. Fight battles from the Realm tab, or sue for peace.`, {
    icon: 'war',
    tone: 'bad',
    portraitId: enemy.headId,
  });
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
    const add = Math.round(v.fleet * 0.2);
    if (add > 0) {
      ships += add;
      helpers.push(`House ${v.name} (vassal, ${add})`);
    }
  }
  const cmd = effStats(s, r).cmd;
  let mod = 1 + traitSum(r, 'fleetPct') + itemSum(s, 'fleetPct');
  if (homePlanet(s) === 'mars') mod += 0.15;
  if (personal) mod += 0.15;
  if ((s.year - r.born) < 16) mod -= 0.2; // regency
  return { ships, strength: ships * (1 + cmd * 0.04) * mod, helpers };
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
  return { ships, strength: ships * (1 + cmd * 0.04) * mod, helpers };
}

// ── Battles ───────────────────────────────────────────────────────────────

export function canFightBattle(s: GameState, war: War): boolean {
  return war.lastPlayerBattle !== s.year && s.fleet > 0;
}

export function fightBattle(s: GameState, warId: string, aiInitiated = false): BattleReport | undefined {
  const war = s.wars.find((w) => w.id === warId);
  if (!war) return undefined;
  const enemy = s.clans[war.enemy];
  const personal = !aiInitiated && s.leadPersonally && (s.year - ruler(s).born) >= 16;
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
  s.fleet -= playerLosses;
  enemy.fleet -= enemyLosses;

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
  if (war.score >= 100) endWar(s, war, 'win');
  else if (war.score <= -100) endWar(s, war, 'lose');
  return report;
}

export function endWar(s: GameState, war: War, outcome: 'win' | 'lose' | 'white'): void {
  s.wars = s.wars.filter((w) => w.id !== war.id);
  const enemy = s.clans[war.enemy];
  const region = s.regions[war.target];
  const clan = playerClan(s);
  if (outcome === 'white') {
    log(s, `White peace with House ${enemy.name}. Nobody gains anything.`, 'war');
    notice(s, 'Peace', `The war with House ${enemy.name} ends in a white peace.`, { icon: 'peace' });
    return;
  }
  if (outcome === 'win') {
    s.prestige += 60;
    enemy.opinion = Math.max(-100, enemy.opinion - 20);
    if (war.cb === 'independence') {
      clan.liege = 'none';
      s.prestige += 80;
      log(s, `Independence won! House ${clan.name} bows to nobody.`, 'good');
      notice(s, 'Independence!', `House ${enemy.name} concedes. You are now an independent power.`, { icon: 'crown', tone: 'good' });
      return;
    }
    if (war.playerAttacker && region) {
      const wasCapital = region.capital;
      setOwner(s, region, clan.id);
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
    notice(s, 'Region Lost', `House ${enemy.name} takes ${region.name} from you.`, { icon: 'lose', tone: 'bad' });
    log(s, `You lost ${region.name} to House ${enemy.name}.`, 'bad');
  }
}

export function peaceChance(s: GameState, war: War): number {
  const dip = effStats(s, ruler(s)).dip;
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
    const targetMoved =
      target && ((war.playerAttacker && target.owner !== war.enemy) || (!war.playerAttacker && target.owner !== s.playerClanId));
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
