// Contested adult inheritance. Every fleet contribution is physically debited.
import { commandFactor, commanderOf, onCommandedBattle } from './commanders';
import { battleWeariness, warStrengthFactor } from './peace';
import { ageOf, alive, ch, childrenOf, clanRank, clanRegions, effStats, fullName, log, newId, notice, siblingsOf, vassalsOf } from './core';
import { councilStat, ROLE_KEYS } from './council';
import { finishAmbition } from './ambitions';
import { recordDeed } from './epithets';
import { addFeeling, opinionOf, relationOf } from './relations';
import { consumeHook, hooksOf } from './secrets';
import { chance, clamp, int } from './rng';
import type { Character, GameState, SuccessionCrisis } from './types';

export type CrisisAction = 'settle' | 'hearing' | 'hook' | 'concede' | 'fight';
export interface Claimant {
  character: Character;
  risk: number;
  reasons: string[];
}
function eligible(s: GameState, c: Character, house: string): boolean {
  return (
    alive(c) &&
    ageOf(s, c) >= 16 &&
    c.clanId === house &&
    !c.marriedIn &&
    !c.bastard &&
    !c.prisonerOf &&
    !c.reputation?.houses.includes(house) &&
    !s.dynasty.rulers.some((r) => r.id === c.id && r.to !== undefined)
  );
}
/** Real children or siblings only; personalities and remembered wrongs explain the risk. */
export function successionClaimants(s: GameState, predecessorId: string, heirId: string): Claimant[] {
  const old = ch(s, predecessorId),
    heir = ch(s, heirId);
  if (!old || !alive(heir) || ageOf(s, heir) < 16 || heir.prisonerOf) return [];
  const seen = new Set<string>();
  const out: Claimant[] = [];
  for (const c of [...childrenOf(s, old), ...siblingsOf(s, old)]) {
    if (seen.has(c.id) || c.id === heirId || !eligible(s, c, old.clanId)) continue;
    seen.add(c.id);
    let score = 0;
    const reasons: string[] = [];
    if (c.traits.includes('ambitious')) {
      score += 25;
      reasons.push('Ambitious: wants the crown');
    }
    if (c.traits.includes('wrathful')) {
      score += 8;
      reasons.push('Wrathful: quick to take offence');
    }
    if (old.childrenIds.includes(c.id) && old.childrenIds.includes(heirId) && c.born < heir.born) {
      score += 20;
      reasons.push('Passed over for a younger child');
    }
    const grievance = relationOf(s, c.id, predecessorId)?.feelings.find((f) => f.key === 'neglect');
    if (grievance && grievance.value < 0) {
      score += Math.min(20, Math.round(-grievance.value / 2));
      reasons.push('Remembers being neglected by the previous ruler');
    }
    const opinion = opinionOf(s, c, heir);
    if (opinion < 0) {
      score += Math.min(25, Math.round(-opinion / 3));
      reasons.push(`Dislikes the heir (${opinion})`);
    }
    if (opinion > 30) {
      score -= 20;
      reasons.push('Close to the heir');
    }
    if (c.traits.includes('content') || c.traits.includes('humble')) {
      score -= 20;
      reasons.push('Little appetite for a throne');
    }
    const risk = clamp((score - 10) / 100, 0, 0.35);
    if (risk > 0) out.push({ character: c, risk, reasons });
  }
  return out.sort((a, b) => b.risk - a.risk || a.character.born - b.character.born);
}
export function successionCrisis(s: GameState, clanId = s.playerClanId): SuccessionCrisis | undefined {
  return s.successionCrises.find((c) => c.clanId === clanId);
}
function fleets(s: GameState, house: string): number {
  return house === s.playerClanId ? s.fleet : (s.clans[house]?.fleet ?? 0);
}
function setFleet(s: GameState, house: string, value: number): void {
  if (house === s.playerClanId) s.fleet = Math.max(0, Math.round(value));
  else if (s.clans[house]) s.clans[house].fleet = Math.max(0, Math.round(value));
}
function credits(s: GameState, house: string): number {
  return house === s.playerClanId ? s.credits : (s.clans[house]?.credits ?? 0);
}
export function settlementCost(s: GameState, c: SuccessionCrisis): number {
  return 120 + clanRank(s, c.clanId) * 60;
}
export function hearingChance(s: GameState, c: SuccessionCrisis): number {
  const inc = ch(s, c.incumbentId),
    claim = ch(s, c.claimantId);
  if (!inc || !claim) return 0;
  const votes = c.votes.filter((v) => alive(ch(s, v.id)));
  return clamp(
    0.5 + (effStats(s, inc).dip - effStats(s, claim).dip) * 0.025 + votes.reduce((n, v) => n + (v.side === 'incumbent' ? 0.08 : -0.08), 0),
    0.15,
    0.85,
  );
}
function valid(s: GameState, c: SuccessionCrisis): boolean {
  const clan = s.clans[c.clanId],
    inc = ch(s, c.incumbentId),
    claim = ch(s, c.claimantId);
  return (
    !!clan &&
    clan.headId === c.incumbentId &&
    alive(inc) &&
    alive(claim) &&
    !inc.prisonerOf &&
    !claim.prisonerOf &&
    claim.clanId === c.clanId &&
    inc.clanId === c.clanId &&
    clanRegions(s, c.clanId).length > 0
  );
}
function report(s: GameState, c: SuccessionCrisis, title: string, text: string, good = false): void {
  log(s, text, c.clanId === s.playerClanId ? (good ? 'good' : 'war') : 'news');
  if (c.clanId === s.playerClanId) notice(s, title, text, { icon: 'crown', tone: good ? 'good' : 'bad', portraitId: c.claimantId });
}
/** Surviving ships return to exactly the houses that contributed them. */
function close(s: GameState, c: SuccessionCrisis): void {
  if (!s.successionCrises.some((x) => x.id === c.id)) return;
  for (const p of c.contributions) if (s.clans[p.clanId]) setFleet(s, p.clanId, fleets(s, p.clanId) + p.ships);
  s.successionCrises = s.successionCrises.filter((x) => x.id !== c.id);
}
export function beginSuccessionCrisis(s: GameState, predecessorId: string, heirId: string): boolean {
  const old = ch(s, predecessorId),
    heir = ch(s, heirId);
  if (!old || !alive(heir) || alive(old) || s.gameOver || s.clans[old.clanId]?.headId !== heirId) return false;
  const existing = successionCrisis(s, old.clanId);
  if (existing) close(s, existing);
  if (!clanRegions(s, old.clanId).length) return false;
  const claim = successionClaimants(s, predecessorId, heirId)[0];
  if (!claim || !chance(s, claim.risk)) return false;
  const challenger = claim.character;
  const voters =
    old.clanId === s.playerClanId
      ? ROLE_KEYS.map((k) => ch(s, s.council[k])).filter((c): c is Character => alive(c))
      : childrenOf(s, old)
          .filter((c) => alive(c) && ageOf(s, c) >= 16 && !c.prisonerOf)
          .slice(0, 5);
  const votes = [...new Map(voters.filter((c) => c.id !== heirId && c.id !== challenger.id && !c.prisonerOf).map((c) => [c.id, c])).values()].map((c) => {
    const loyal = opinionOf(s, c, heir),
      rebel = opinionOf(s, c, challenger);
    return {
      id: c.id,
      side: loyal >= rebel ? ('incumbent' as const) : ('claimant' as const),
      reason: `Opinion of ${heir.name}: ${loyal}; of ${challenger.name}: ${rebel}`,
    };
  });
  const backers = vassalsOf(s, old.clanId)
    .filter((k) => {
      // The player's house never volunteers ships to a foreign claimant without a decision.
      if (k.id === s.playerClanId) return false;
      const h = ch(s, k.headId);
      return (
        alive(h) &&
        !h.prisonerOf &&
        fleets(s, k.id) > 0 &&
        (opinionOf(s, h, heir) < -5 ||
          (old.clanId === s.playerClanId && k.opinion < -20) ||
          (h.traits.includes('ambitious') && opinionOf(s, h, challenger) > opinionOf(s, h, heir) + 5))
      );
    })
    .sort((a, b) => fleets(s, b.id) - fleets(s, a.id))
    .slice(0, 3)
    .map((k) => k.id);
  const c: SuccessionCrisis = {
    id: newId(s, 'crisis'),
    clanId: old.clanId,
    predecessorId,
    incumbentId: heirId,
    claimantId: challenger.id,
    started: s.year,
    deadline: s.year + 2,
    stage: 'dispute',
    reasons: claim.reasons,
    votes,
    backerIds: backers,
    contributions: [],
    score: 0,
  };
  s.successionCrises.push(c);
  const vow = heir.ambition;
  if (vow?.status === 'active' && vow.kind === 'peacemaker') vow.progress = 0;
  addFeeling(s, challenger.id, heirId, { why: 'Contests my inheritance', value: -25, decay: 0.5, key: 'succession' });
  report(
    s,
    c,
    'A disputed inheritance',
    `${fullName(s, challenger)} contests ${heir.name}'s inheritance of House ${s.clans[c.clanId].name}. There are two cycles to settle the claim before civil war.`,
  );
  return true;
}
export function crisisBlocker(s: GameState, id: string, action: CrisisAction): string | null {
  const c = s.successionCrises.find((c) => c.id === id);
  if (!c || !valid(s, c) || s.gameOver) return 'This claim is no longer active.';
  if (c.clanId === s.playerClanId && s.pending.length) return 'Resolve the current events first.';
  if (action === 'fight') return c.stage !== 'civil-war' ? 'Civil war has not begun.' : c.lastBattle === s.year ? 'Already fought this cycle.' : null;
  if (c.stage !== 'dispute') return 'The dispute has become a civil war.';
  if (action === 'settle' && credits(s, c.clanId) < settlementCost(s, c)) return `Need ${settlementCost(s, c)} credits.`;
  if (action === 'hearing' && c.heard) return 'The council has already heard this claim.';
  if (action === 'hook' && !hooksOf(s, c.incumbentId).some((h) => h.targetId === c.claimantId)) return 'You need a usable personal hook on the claimant.';
  return null;
}
function concede(s: GameState, c: SuccessionCrisis): void {
  const inc = s.characters[c.incumbentId],
    claim = s.characters[c.claimantId],
    clan = s.clans[c.clanId];
  finishAmbition(s, inc);
  clan.headId = claim.id;
  if (clan.id === s.playerClanId) {
    const last = s.dynasty.rulers.at(-1);
    if (last?.id === inc.id) {
      last.to = s.year;
      last.end = 'deposed';
    }
    s.rulerId = claim.id;
    for (const role of ROLE_KEYS) if (s.council[role] === claim.id) delete s.council[role];
    if (s.dynasty.designatedHeir === claim.id) s.dynasty.designatedHeir = undefined;
    s.suitors = undefined;
    s.prestige = Math.round(s.prestige * 0.8);
    s.dynasty.rulers.push({ id: claim.id, name: claim.name, from: s.year, title: '' });
    s.pending.push({ kind: 'succession', uid: newId(s, 's'), deadId: inc.id, heirId: claim.id });
  }
  addFeeling(s, inc.id, claim.id, { why: 'Took my crown', value: -50, decay: 0.25, grave: true, key: 'deposed' });
  report(
    s,
    c,
    'The crown changes hands',
    `${fullName(s, claim)} takes the crown of House ${clan.name}. ${inc.name} survives; the dynasty continues under its new ruler.`,
  );
  close(s, c);
}
function uphold(s: GameState, c: SuccessionCrisis, text: string, imprisoned = false, coerced = false): void {
  if (imprisoned) s.characters[c.claimantId].prisonerOf = c.clanId;
  addFeeling(s, c.claimantId, c.incumbentId, {
    why: imprisoned ? 'Crushed my claim and imprisoned me' : coerced ? 'Forced me to renounce my claim' : 'Settled my claim',
    value: imprisoned ? -40 : coerced ? -25 : 10,
    decay: 0.5,
    key: 'succession',
  });
  report(s, c, 'The inheritance is secured', text, true);
  close(s, c);
}
function startWar(s: GameState, c: SuccessionCrisis): void {
  c.stage = 'civil-war';
  c.deadline = s.year + 6;
  const donors = [
    c.clanId,
    ...c.backerIds.filter(
      (id) => vassalsOf(s, c.clanId).some((k) => k.id === id) && alive(ch(s, s.clans[id]?.headId)) && !ch(s, s.clans[id]?.headId)?.prisonerOf,
    ),
  ];
  for (const id of donors) {
    const ships = Math.floor(fleets(s, id) * (id === c.clanId ? 0.3 : 0.35));
    if (!ships) continue;
    setFleet(s, id, fleets(s, id) - ships);
    c.contributions.push({ clanId: id, ships });
  }
  if (!rebelFleet(c)) {
    uphold(s, c, `${s.characters[c.claimantId].name}'s challenge collapses: no crews will fight for the claim.`);
    return;
  }
  recordDeed(s, s.characters[c.claimantId], 'rebellions');
  report(
    s,
    c,
    'Family at war',
    `${s.characters[c.claimantId].name} raises ${rebelFleet(c)} rebel ships against House ${s.clans[c.clanId].name}. Crews have defected from the house and its backers; they are no longer in those fleets.`,
  );
}
export function rebelFleet(c: SuccessionCrisis): number {
  return c.contributions.reduce((n, p) => n + p.ships, 0);
}
function rebelLosses(c: SuccessionCrisis, loss: number): void {
  const total = rebelFleet(c);
  let remaining = Math.min(total, loss);
  for (const p of c.contributions) {
    const n = Math.min(p.ships, Math.floor((loss * p.ships) / Math.max(1, total)));
    p.ships -= n;
    remaining -= n;
  }
  for (const p of c.contributions) {
    const n = Math.min(p.ships, remaining);
    p.ships -= n;
    remaining -= n;
  }
}
function battle(s: GameState, c: SuccessionCrisis): void {
  c.lastBattle = s.year;
  const loyal = fleets(s, c.clanId),
    rebel = rebelFleet(c);
  const inc = s.characters[c.incumbentId],
    claim = s.characters[c.claimantId];
  const general = commanderOf(s, c.clanId);
  const loyalLeader = general ?? inc;
  const cmd = Math.max(effStats(s, inc).cmd, c.clanId === s.playerClanId ? councilStat(s, 'admiral') : 0);
  const loyalCommand = general ? commandFactor(s, general) : 1 + cmd * 0.04;
  const contributions = c.contributions.map((p) => ({ ...p }));
  const rebelStrength = c.contributions.reduce((n, p) => n + p.ships * warStrengthFactor(s, p.clanId), 0);
  const win = loyal * warStrengthFactor(s, c.clanId) * loyalCommand * (0.8 + int(s, 0, 40) / 100) >= rebelStrength * commandFactor(s, claim);
  const loyalLoss = Math.min(loyal, Math.ceil((loyal * int(s, win ? 6 : 18, win ? 14 : 30)) / 100));
  const rebelLoss = Math.min(rebel, Math.ceil((rebel * int(s, win ? 18 : 6, win ? 30 : 14)) / 100));
  setFleet(s, c.clanId, loyal - loyalLoss);
  rebelLosses(c, rebelLoss);
  let ownShips = loyal,
    ownLosses = loyalLoss;
  for (const original of contributions) {
    const remaining = c.contributions.find((p) => p.clanId === original.clanId)?.ships ?? 0;
    if (original.clanId === c.clanId) {
      ownShips += original.ships;
      ownLosses += original.ships - remaining;
    } else battleWeariness(s, original.clanId, original.ships, original.ships - remaining);
  }
  battleWeariness(s, c.clanId, ownShips, ownLosses);
  c.score += win ? 35 : -35;
  recordDeed(s, inc, win ? 'battlesWon' : 'battlesLost');
  log(
    s,
    `Succession battle in House ${s.clans[c.clanId].name}: ${win ? inc.name : claim.name} wins. Loyalists lose ${loyalLoss} ships; rebels lose ${rebelLoss}. Crown support: ${c.score}.`,
    c.clanId === s.playerClanId ? 'war' : 'news',
  );
  const notes = onCommandedBattle(s, {
    id: c.id + '@' + s.year,
    attacker: c.clanId,
    defender: c.clanId,
    attackerCommanderId: loyalLeader.id,
    defenderCommanderId: claim.id,
    attackerWon: win,
    attackerShips: loyal,
    attackerLosses: loyalLoss,
    defenderShips: rebel,
    defenderLosses: rebelLoss,
  });
  for (const note of notes) log(s, note, c.clanId === s.playerClanId ? 'war' : 'news');
  // A death can run succession and already return the surviving detached ships.
  if (!s.successionCrises.includes(c)) return;
  if (!alive(inc) || inc.prisonerOf) {
    concede(s, c);
    return;
  }
  if (!alive(claim) || claim.prisonerOf) {
    uphold(s, c, claim.name + ' can no longer pursue the rival claim. Surviving ships return to their houses.');
    return;
  }
  if (!rebelFleet(c) || c.score >= 70)
    uphold(s, c, `${inc.name} defeats the rival claim. ${claim.name} is imprisoned; surviving rebel ships return to their houses.`, true);
  else if (!fleets(s, c.clanId) || c.score <= -70) concede(s, c);
}
export function resolveCrisis(s: GameState, id: string, action: CrisisAction): boolean {
  if (crisisBlocker(s, id, action)) return false;
  const c = s.successionCrises.find((c) => c.id === id)!;
  if (action === 'fight') battle(s, c);
  else if (action === 'concede') concede(s, c);
  else if (action === 'settle') {
    const cost = settlementCost(s, c);
    if (c.clanId === s.playerClanId) s.credits -= cost;
    else s.clans[c.clanId].credits -= cost;
    uphold(s, c, `${s.characters[c.claimantId].name} accepts a ${cost}-credit settlement from House ${s.clans[c.clanId].name} and renounces the claim.`);
  } else if (action === 'hook') {
    const hook = hooksOf(s, c.incumbentId).find((h) => h.targetId === c.claimantId)!;
    if (!consumeHook(s, hook.id, c.incumbentId)) return false;
    uphold(s, c, `${s.characters[c.claimantId].name} withdraws the claim under personal leverage. The hook is spent.`, false, true);
  } else {
    c.heard = true;
    if (chance(s, hearingChance(s, c)))
      uphold(s, c, `The council upholds ${s.characters[c.incumbentId].name}'s inheritance; ${s.characters[c.claimantId].name} accepts its judgement.`);
    else
      report(
        s,
        c,
        'A divided council',
        `The council cannot persuade ${s.characters[c.claimantId].name} to withdraw. A settlement or concession is still possible before year ${c.deadline}.`,
      );
  }
  return true;
}
/** Automatic choices still obey the public action gates and each house's budget. */
export function manageCrisis(s: GameState, clanId: string, preferBattle = false): void {
  const c = successionCrisis(s, clanId);
  if (!c) return;
  if (c.stage === 'civil-war') {
    resolveCrisis(s, c.id, 'fight');
    return;
  }
  if (!crisisBlocker(s, c.id, 'hook')) {
    resolveCrisis(s, c.id, 'hook');
    return;
  }
  if (!preferBattle && !crisisBlocker(s, c.id, 'settle')) {
    resolveCrisis(s, c.id, 'settle');
    return;
  }
  if (!c.heard) resolveCrisis(s, c.id, 'hearing');
}
export function successionTick(s: GameState): void {
  for (const c of [...s.successionCrises]) {
    if (!valid(s, c)) {
      report(
        s,
        c,
        'The challenge ends',
        `The succession challenge in House ${s.clans[c.clanId]?.name ?? 'Unknown'} ends because the claimants are no longer able to pursue it. Surviving ships return to their houses.`,
        true,
      );
      close(s, c);
      continue;
    }
    if (c.stage === 'dispute') {
      if (c.clanId !== s.playerClanId && s.year > c.started) manageCrisis(s, c.clanId, s.characters[c.incumbentId].traits.includes('wrathful'));
      if (!s.successionCrises.includes(c)) continue;
      if (s.year >= c.deadline) startWar(s, c);
    } else {
      if (s.year > (c.lastBattle ?? c.started)) battle(s, c);
      if (s.successionCrises.includes(c) && s.year >= c.deadline) {
        if (c.score >= 0 && fleets(s, c.clanId) >= rebelFleet(c))
          uphold(s, c, `${s.characters[c.incumbentId].name} outlasts the challenge. The claimant is imprisoned.`, true);
        else concede(s, c);
      }
    }
  }
}
