import { isCloseKin, recordDeed } from './epithets';
// Schemes, diplomacy and prisoners.

import { ageOf, alive, ch, clanRank, effStats, fullName, homePlanet, itemSum, liegeOf, log, notice, playerClan, ruler, traitSum, vassalsOf } from './core';
import { canAfford, pay, type Cost } from './genetics';
import { killCharacter } from './life';
import { addFeeling, attempted, blackmailed, cuckolded, executed, lovers, murdered } from './relations';
import { chance, clamp, int } from './rng';
import { addTrait } from './traits';
import type { Character, GameState } from './types';
import { aiDeclareWar } from './war';
import { councilStat } from './council';
import { remember } from './memory';

export type SchemeKind = 'assassinate' | 'sabotage' | 'blackmail' | 'fabricate' | 'sway' | 'seduce';

export const SCHEMES: Record<SchemeKind, { name: string; desc: string; cost: Cost; target: 'char' | 'clan' | 'region' }> = {
  assassinate: {
    name: 'Assassin Drone',
    desc: 'Send a silent drone after a target. If it works, they die. If you are caught, expect war.',
    cost: { credits: 150 },
    target: 'char',
  },
  sabotage: { name: 'Sabotage Shipyards', desc: "Wreck a rival clan's fleet in dock. Destroys 20-35% of their ships.", cost: { credits: 90 }, target: 'clan' },
  blackmail: { name: 'Blackmail', desc: 'Dig up dirt on a clan head and make them pay for your silence.', cost: { credits: 20 }, target: 'clan' },
  fabricate: {
    name: 'Forge a Claim',
    desc: 'Forge old records proving a region is rightfully yours. Gives a war justification.',
    cost: { credits: 80 },
    target: 'region',
  },
  sway: { name: 'Sway', desc: 'Charm, gifts and flattery to make a clan like you.', cost: { credits: 50 }, target: 'clan' },
  seduce: { name: 'Seduce', desc: 'Start an affair. Lovers can give you children, and secrets.', cost: { credits: 30 }, target: 'char' },
};

export const SCHEMES_PER_CYCLE = 3;

export function schemesLeft(s: GameState): number {
  return SCHEMES_PER_CYCLE - (s.cooldowns[`schemes@${s.year}`] ?? 0);
}

function myIntrigue(s: GameState): number {
  return effStats(s, ruler(s)).int;
}

function schemeBonus(s: GameState): number {
  return traitSum(ruler(s), 'scheme') + itemSum(s, 'scheme') + (homePlanet(s) === 'venus' ? 0.1 : 0);
}

function defenseOf(_s: GameState, target: Character | undefined): number {
  if (!target) return 0;
  return traitSum(target, 'defense') + (target.planetId === 'pluto' ? 0.2 : 0);
}

export function schemeChance(s: GameState, kind: SchemeKind, targetId: string): number {
  const me = myIntrigue(s);
  let target: Character | undefined;
  if (SCHEMES[kind].target === 'char') target = s.characters[targetId];
  else if (SCHEMES[kind].target === 'clan') target = ch(s, s.clans[targetId]?.headId);
  else target = ch(s, s.clans[s.regions[targetId]?.owner]?.headId);
  const theirs = target ? effStats(s, target).int : 5;
  const diff = (me - theirs) * 0.03;
  const bonus = schemeBonus(s) - defenseOf(s, target) + councilStat(s, 'spymaster') * 0.01;
  let base = 0.4;
  switch (kind) {
    case 'assassinate':
      base = 0.25;
      break;
    case 'sabotage':
      base = 0.45;
      break;
    case 'blackmail':
      base = 0.35;
      break;
    case 'fabricate':
      base = 0.45;
      break;
    case 'sway':
      base = 0.55 + (effStats(s, ruler(s)).dip - 5) * 0.03;
      break;
    case 'seduce': {
      const r = ruler(s);
      const looks = (effStats(s, r).dip - 5) * 0.02;
      base = 0.35 + looks;
      break;
    }
  }
  return clamp(base + diff + bonus, 0.05, 0.95);
}

export function schemeBlocker(s: GameState, kind: SchemeKind, targetId: string): string | null {
  if (ageOf(s, ruler(s)) < 16) return 'A regency council will not scheme.';
  if (schemesLeft(s) <= 0) return 'No scheme actions left this cycle.';
  if (!canAfford(s, SCHEMES[kind].cost)) return 'Not enough credits.';
  const key = `scheme:${kind}:${targetId}`;
  if ((s.cooldowns[key] ?? 0) > s.year) return 'Already tried this cycle.';
  if (kind === 'assassinate') {
    const t = s.characters[targetId];
    if (!alive(t)) return 'Target is dead.';
    if (t.id === s.rulerId) return 'Not yourself!';
  }
  if (kind === 'seduce') {
    const t = s.characters[targetId];
    const r = ruler(s);
    if (!alive(t) || ageOf(s, t) < 16) return 'Not a valid target.';
    if (t.gender === r.gender) return 'Only opposite-sex affairs can produce heirs here; pick someone else.';
    if (t.id === r.spouseId) return 'That is your spouse.';
    if (r.loverId === t.id) return 'Already your lover.';
  }
  if (kind === 'fabricate') {
    const reg = s.regions[targetId];
    if (!reg || reg.owner === s.playerClanId) return 'Not a valid region.';
    if (s.claims.includes(targetId)) return 'You already have a claim.';
  }
  return null;
}

export function runScheme(s: GameState, kind: SchemeKind, targetId: string): boolean {
  if (schemeBlocker(s, kind, targetId)) return false;
  pay(s, SCHEMES[kind].cost);
  s.cooldowns[`schemes@${s.year}`] = (s.cooldowns[`schemes@${s.year}`] ?? 0) + 1;
  s.cooldowns[`scheme:${kind}:${targetId}`] = s.year + 1;
  s.stats.schemes += 1;
  const success = chance(s, schemeChance(s, kind, targetId));
  const caughtChance = success ? 0.2 : 0.55;
  const caught = chance(s, caughtChance - effStats(s, ruler(s)).int * 0.015 - councilStat(s, 'spymaster') * 0.01);
  const r = ruler(s);

  const victimClanId =
    SCHEMES[kind].target === 'char' ? s.characters[targetId]?.clanId : SCHEMES[kind].target === 'clan' ? targetId : s.regions[targetId]?.owner;
  const victimClan = victimClanId ? s.clans[victimClanId] : undefined;
  const caughtText = caught && victimClan && !victimClan.isPlayer ? ` Worse, House ${victimClan.name} found out it was you.` : '';

  let title = '';
  let text = '';
  switch (kind) {
    case 'assassinate': {
      const t = s.characters[targetId];
      const wasHead = s.clans[t.clanId]?.headId === t.id;
      // The closer to the lord, the deeper the wound: the lord, then his spouse, children and heir.
      const lord = ch(s, s.clans[t.clanId]?.headId);
      const nearLord = !!lord && (lord.spouseId === t.id || t.fatherId === lord.id || t.motherId === lord.id);
      if (success) {
        title = 'Target Eliminated';
        text = `The drone found ${fullName(s, t)}. They will not wake up.`;
        if (t.clanId === s.playerClanId) r.traits = addTrait(r.traits, 'kinslayer');
        recordDeed(s, r, 'assassinations');
        recordDeed(s, r, 'cruelty');
        if (isCloseKin(r, t)) recordDeed(s, r, 'kinslayings');
        killCharacter(s, t.id, 'assassinated');
        if (caught) {
          remember(s, t.clanId, `Murdered ${wasHead ? 'our lord ' : ''}${t.name}`, wasHead ? -80 : nearLord ? -70 : -55, undefined, true);
          murdered(s, t, r.id, true);
        } else if (chance(s, 0.3)) {
          remember(s, t.clanId, `Suspected of murdering ${t.name}`, -25, 0.03);
          murdered(s, t, r.id, false);
        }
      } else {
        title = 'Assassination Failed';
        text = `${t.name} survived your drone strike.`;
        if (caught) {
          remember(s, t.clanId, `Sent an assassin after ${t.name}`, -45, undefined, true);
          attempted(s, t, r.id);
        }
      }
      if (caught && victimClan && !victimClan.isPlayer) {
        victimClan.opinion = -100;
        s.prestige -= 40;
        for (const c of Object.values(s.clans)) if (!c.isPlayer) c.opinion -= 5;
        if (clanRank(s, victimClan.id) > 0 && victimClan.fleet > s.fleet * 0.7 && chance(s, 0.6)) {
          const target = Object.values(s.regions).find((x) => x.owner === s.playerClanId);
          if (target) aiDeclareWar(s, victimClan.id, 'feud', target.id);
        }
      }
      break;
    }
    case 'sabotage': {
      const clan = s.clans[targetId];
      if (success) {
        const lost = Math.round(clan.fleet * (0.2 + int(s, 0, 15) / 100));
        clan.fleet -= lost;
        title = 'Shipyards Ablaze';
        text = `Your agents destroyed ${lost} of House ${clan.name}'s ships in dock.`;
      } else {
        title = 'Sabotage Foiled';
        text = `House ${clan.name}'s dock security caught your saboteurs.`;
      }
      if (caught) {
        clan.opinion -= 40;
        remember(s, clan.id, 'Burned our shipyards', -25);
      }
      break;
    }
    case 'blackmail': {
      const clan = s.clans[targetId];
      if (success) {
        const amount = int(s, 80, 160) + clanRank(s, clan.id) * 50;
        s.credits += amount;
        remember(s, clan.id, 'Blackmailed us', -40, undefined, true);
        const head = ch(s, clan.headId);
        if (alive(head)) blackmailed(s, head, r.id);
        title = 'They Paid Up';
        text = `${fullName(s, ch(s, clan.headId)!)} pays ${amount} credits to keep their secrets buried.`;
      } else {
        title = 'Nothing to Find';
        text = `House ${clan.name} is cleaner than you thought.`;
      }
      if (caught) {
        remember(s, clan.id, 'Tried to blackmail us', -25);
        const head = ch(s, clan.headId);
        if (alive(head)) addFeeling(s, head.id, r.id, { why: 'Tried to blackmail me', value: -30, decay: 1 });
        s.prestige -= 20;
      }
      break;
    }
    case 'fabricate': {
      const reg = s.regions[targetId];
      if (success) {
        s.claims.push(targetId);
        title = 'Claim Forged';
        text = `Ancient records now prove ${reg.name} belongs to House ${playerClan(s).name}. You can press this claim in war.`;
      } else {
        title = 'Forgery Spotted';
        text = `The archivists laughed at your forged deeds to ${reg.name}.`;
      }
      if (caught && victimClan) remember(s, victimClan.id, `Forged claims on ${reg.name}`, -15);
      break;
    }
    case 'sway': {
      const clan = s.clans[targetId];
      if (success) {
        remember(s, clan.id, 'Charmed us', int(s, 12, 24), 0.15);
        title = 'Swayed';
        text = `House ${clan.name} warms to you.`;
      } else {
        title = 'Unmoved';
        text = `House ${clan.name} accepts your gifts and gives nothing back.`;
      }
      break;
    }
    case 'seduce': {
      const t = s.characters[targetId];
      if (success) {
        r.loverId = t.id;
        lovers(s, r, t);
        title = 'A New Lover';
        text = `${fullName(s, t)} has fallen for you. Discretion is advised.`;
        if (chance(s, 0.15)) r.traits = addTrait(r.traits, 'lustful');
      } else {
        title = 'Rejected';
        text = `${t.name} turns you down flat.`;
      }
      if (caught && victimClan && !victimClan.isPlayer) {
        remember(s, victimClan.id, `Seduced ${t.name}`, -30);
        cuckolded(s, t, r.id);
      }
      break;
    }
  }
  if (success) {
    recordDeed(s, r, 'schemes');
    if (kind === 'sabotage') recordDeed(s, r, 'sabotages');
    if (kind === 'blackmail') recordDeed(s, r, 'blackmails');
  }
  if (caught && kind !== 'sway') text += caughtText;
  notice(s, title, text, { icon: 'scheme', tone: success ? 'good' : 'bad', portraitId: SCHEMES[kind].target === 'char' ? targetId : undefined });
  log(s, `${SCHEMES[kind].name}: ${title}.${caught ? ' (Exposed!)' : ''}`, success ? 'good' : 'bad');
  return success;
}

// ── Diplomacy ─────────────────────────────────────────────────────────────

export const GIFT_COST = 100;

export function sendGift(s: GameState, clanId: string): boolean {
  const key = `gift:${clanId}`;
  if ((s.cooldowns[key] ?? 0) > s.year || s.credits < GIFT_COST) return false;
  s.credits -= GIFT_COST;
  s.cooldowns[key] = s.year + 1;
  const clan = s.clans[clanId];
  remember(s, clan.id, 'Sent us gifts', 10 + Math.round(effStats(s, ruler(s)).dip / 3), 0.15);
  clan.opinion = Math.min(100, clan.opinion + 5);
  log(s, `You sent a gift to House ${clan.name}.`, 'info');
  return true;
}

export function allianceChance(s: GameState, clanId: string): number {
  const clan = s.clans[clanId];
  const dip = effStats(s, ruler(s)).dip;
  return clamp((clan.opinion - 20) / 80 + dip * 0.03 + councilStat(s, 'envoy') * 0.01, 0, 0.95);
}

export function proposeAlliance(s: GameState, clanId: string): boolean {
  const key = `ally:${clanId}`;
  if ((s.cooldowns[key] ?? 0) > s.year) return false;
  s.cooldowns[key] = s.year + 1;
  const clan = s.clans[clanId];
  if (chance(s, allianceChance(s, clanId))) {
    clan.allied = true;
    remember(s, clan.id, 'Stood with us as allies', 15, 0.04);
    notice(s, 'Alliance Formed', `House ${clan.name} agrees to stand with you in war.`, { icon: 'peace', tone: 'good', portraitId: clan.headId });
    log(s, `Alliance formed with House ${clan.name}.`, 'good');
    return true;
  }
  notice(s, 'Alliance Refused', `House ${clan.name} politely declines.`, { icon: 'peace', tone: 'bad', portraitId: clan.headId });
  return false;
}

export function breakAlliance(s: GameState, clanId: string): void {
  const clan = s.clans[clanId];
  clan.allied = false;
  remember(s, clan.id, 'Broke our alliance', -30, 0.04);
  s.prestige -= 30;
  log(s, `You broke off the alliance with House ${clan.name}.`, 'bad');
}

export function insult(s: GameState, clanId: string): void {
  const clan = s.clans[clanId];
  remember(s, clanId, 'Publicly insulted our house', -35, 0.04);
  if (!s.feuds.includes(clanId)) s.feuds.push(clanId);
  s.prestige += 10;
  log(s, `You publicly insulted House ${clan.name}. A blood feud begins.`, 'war');
}

export function vassalizeChance(s: GameState, clanId: string): number {
  const clan = s.clans[clanId];
  const dip = effStats(s, ruler(s)).dip;
  const ratio = s.fleet / Math.max(1, clan.fleet);
  return clamp(0.1 + clan.opinion / 200 + dip * 0.02 + (ratio - 1) * 0.25, 0, 0.9);
}

export function vassalizeBlocker(s: GameState, clanId: string): string | null {
  const clan = s.clans[clanId];
  if (clanRank(s, s.playerClanId) < 2) return 'You must be at least a Viceroy to take vassals.';
  if (clanRank(s, clanId) >= clanRank(s, s.playerClanId)) return 'They are too powerful to bend the knee.';
  if (liegeOf(s, clanId) === s.playerClanId) return 'Already your vassal.';
  if (liegeOf(s, s.playerClanId) === clanId) return 'They are your liege!';
  if (s.prestige < 100) return 'Need 100 prestige.';
  if ((s.cooldowns[`vassal:${clanId}`] ?? 0) > s.year) return 'You asked recently.';
  if (!clan) return 'Unknown clan.';
  return null;
}

export function demandVassalage(s: GameState, clanId: string): boolean {
  if (vassalizeBlocker(s, clanId)) return false;
  s.cooldowns[`vassal:${clanId}`] = s.year + 3;
  const clan = s.clans[clanId];
  if (chance(s, vassalizeChance(s, clanId))) {
    s.prestige -= 100;
    clan.liege = s.playerClanId;
    clan.opinion = Math.max(clan.opinion - 10, -20);
    notice(s, 'They Bend the Knee', `House ${clan.name} swears fealty to you.`, { icon: 'crown', tone: 'good', portraitId: clan.headId });
    log(s, `House ${clan.name} is now your vassal.`, 'good');
    return true;
  }
  remember(s, clanId, 'Demanded we kneel', -12);
  notice(s, 'Refused', `House ${clan.name} refuses to kneel. You could always make them...`, { icon: 'war', tone: 'bad', portraitId: clan.headId });
  return false;
}

export function releaseVassal(s: GameState, clanId: string): void {
  const clan = s.clans[clanId];
  clan.liege = 'none';
  clan.opinion = Math.min(100, clan.opinion + 40);
  log(s, `House ${clan.name} has been released from your service.`, 'info');
}

// ── Prisoners ─────────────────────────────────────────────────────────────

export function arrestChance(s: GameState, clanId: string): number {
  const head = ch(s, s.clans[clanId].headId);
  const theirs = head ? effStats(s, head).int : 5;
  return clamp(0.5 + (myIntrigue(s) - theirs) * 0.04, 0.1, 0.9);
}

export function arrestVassal(s: GameState, clanId: string): boolean {
  const clan = s.clans[clanId];
  if (liegeOf(s, clanId) !== s.playerClanId) return false;
  const head = ch(s, clan.headId);
  if (!alive(head) || head.prisonerOf) return false;
  if (chance(s, arrestChance(s, clanId))) {
    head.prisonerOf = s.playerClanId;
    remember(s, clanId, `Imprisoned our lord ${head.name}`, -35, 0.03);
    for (const v of vassalsOf(s, s.playerClanId)) if (v.id !== clanId) v.opinion -= 8;
    notice(s, 'Arrested', `${fullName(s, head)} is dragged to your cells.`, { icon: 'scheme', tone: 'good', portraitId: head.id });
    log(s, `You imprisoned ${fullName(s, head)}.`, 'info');
    return true;
  }
  clan.opinion = -100;
  const target = Object.values(s.regions).find((x) => x.owner === s.playerClanId);
  aiDeclareWar(s, clanId, 'revolt', target?.id ?? '');
  return false;
}

export function prisoners(s: GameState): Character[] {
  return Object.values(s.characters).filter((c) => alive(c) && c.prisonerOf === s.playerClanId);
}

export function executePrisoner(s: GameState, id: string): void {
  const c = s.characters[id];
  if (!alive(c) || c.prisonerOf !== s.playerClanId) return;
  const r = ruler(s);
  const clan = s.clans[c.clanId];
  c.prisonerOf = undefined;
  recordDeed(s, r, 'executions');
  recordDeed(s, r, 'cruelty');
  if (isCloseKin(r, c)) recordDeed(s, r, 'kinslayings');
  killCharacter(s, id, 'executed');
  executed(s, c);
  remember(s, c.clanId, `Executed ${c.name}`, -75, 0.012);
  s.prestige -= 30;
  for (const k of Object.values(s.clans)) if (!k.isPlayer) k.opinion -= 6;
  if (clan) clan.opinion = -100;
  if (c.clanId === s.playerClanId) r.traits = addTrait(r.traits, 'kinslayer');
  s.cooldowns.executions = (s.cooldowns.executions ?? 0) + 1;
  if ((s.cooldowns.executions ?? 0) >= 3) r.traits = addTrait(r.traits, 'tyrant');
  log(s, `${fullName(s, c)} was executed.`, 'death');
}

export function ransomValue(s: GameState, id: string): number {
  const c = s.characters[id];
  return 120 + clanRank(s, c.clanId) * 80;
}

export function ransomPrisoner(s: GameState, id: string): void {
  const c = s.characters[id];
  if (!alive(c) || c.prisonerOf !== s.playerClanId) return;
  const v = ransomValue(s, id);
  // Their house pays, borrowing if it must.
  const payer = s.clans[c.clanId];
  if (payer) payer.credits -= v;
  s.credits += v;
  c.prisonerOf = undefined;
  remember(s, c.clanId, `Ransomed ${c.name}`, -8);
  log(s, `${fullName(s, c)} was ransomed for ${v} credits.`, 'info');
}

export function releasePrisoner(s: GameState, id: string): void {
  const c = s.characters[id];
  if (!alive(c) || c.prisonerOf !== s.playerClanId) return;
  c.prisonerOf = undefined;
  const clan = s.clans[c.clanId];
  if (clan) remember(s, clan.id, `Freed ${c.name}`, 25, 0.05);
  s.prestige += 10;
  recordDeed(s, ruler(s), 'pardons');
  log(s, `${fullName(s, c)} was released.`, 'info');
}
