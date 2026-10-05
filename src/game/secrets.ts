// Evidence belongs to people. Rumours never mint a hook.
import { ageOf, alive, ch, clanRegions, effStats, fullName, log, newId, notice } from './core';
import { currentHeir } from './life';
import { councilStat } from './council';
import { remember } from './memory';
import { neighbourPlanets } from './planets';
import { addFeeling, blackmailed, closeKin, murdered } from './relations';
import { recordDeed } from './epithets';
import { chance, clamp, pick } from './rng';
import type { Character, GameState, Hook, Secret } from './types';

export const INVESTIGATION_COST = 40;
export const INVESTIGATIONS_PER_CYCLE = 1;

function freeAdult(s: GameState, c: Character | undefined): c is Character {
  return alive(c) && !c.prisonerOf && ageOf(s, c) >= 18;
}

function head(s: GameState, id: string): boolean {
  const c = ch(s, id);
  return !!c && s.clans[c.clanId]?.headId === id;
}

function treasury(s: GameState, c: Character): number {
  return c.clanId === s.playerClanId ? s.credits : (s.clans[c.clanId]?.credits ?? 0);
}

function debit(s: GameState, c: Character, n: number): void {
  if (c.clanId === s.playerClanId) s.credits -= n;
  else s.clans[c.clanId].credits -= n;
}

/** Only actual participants know a fresh secret. No historical deeds are guessed. */
function record(s: GameState, kind: Secret['kind'], subject: Character, other: Character, witnesses: string[], publicFact: boolean): Secret {
  let secret = s.secrets.find((x) => x.kind === kind && x.subjectId === subject.id && x.otherId === other.id);
  if (!secret) {
    secret = {
      id: newId(s, 'secret'),
      kind,
      subjectId: subject.id,
      otherId: other.id,
      subjectName: fullName(s, subject),
      otherName: fullName(s, other),
      betrayedId: kind === 'affair' ? subject.spouseId : undefined,
      year: s.year,
      knownTo: [subject.id],
    };
    s.secrets.push(secret);
  }
  if (publicFact) secret.exposedYear ??= s.year;
  for (const id of witnesses) learnSecret(s, secret.id, id);
  return secret;
}

export function recordMurder(s: GameState, killer: Character, victim: Character, caught = false): Secret {
  return record(s, 'murder', killer, victim, caught ? closeKin(s, victim).map((c) => c.id) : [], caught);
}

/** Each unfaithful participant has their own secret; unmarried lovers are not adulterers. */
export function recordAffair(s: GameState, a: Character, b: Character, witnesses: string[] = [], publicFact = false): Secret[] {
  if (!alive(a) || !alive(b) || a.id === b.id || a.spouseId === b.id || ageOf(s, a) < 18 || ageOf(s, b) < 18) return [];
  return [
    [a, b],
    [b, a],
  ].flatMap(([x, y]) => (alive(ch(s, x.spouseId)) ? [record(s, 'affair', x, y, [a.id, b.id, ...witnesses], publicFact)] : []));
}

/** Upgrade living lover links only. A kinslayer trait is not proof of a particular murder. */
export function initialiseSecrets(s: GameState): void {
  s.secrets ??= [];
  s.hooks ??= [];
  for (const c of Object.values(s.characters)) {
    const lover = ch(s, c.loverId);
    if (alive(c) && alive(lover)) recordAffair(s, c, lover);
  }
}

export function secretsKnownTo(s: GameState, viewerId = s.rulerId): Secret[] {
  return s.secrets.filter((x) => x.exposedYear !== undefined || x.knownTo.includes(viewerId));
}

export function secretLabel(s: GameState, secret: Secret, viewerId = s.rulerId): string {
  if (secret.exposedYear === undefined && !secret.knownTo.includes(viewerId)) return 'Undiscovered secret';
  return secret.kind === 'affair'
    ? `${secret.subjectName}'s affair with ${secret.otherName}`
    : `${secret.subjectName} ordered the murder of ${secret.otherName}`;
}

/** Called only by real evidence/discovery paths, never from a rumour. */
export function learnSecret(s: GameState, secretId: string, learnerId: string): boolean {
  const secret = s.secrets.find((x) => x.id === secretId);
  const learner = ch(s, learnerId);
  if (!secret || !alive(learner) || secret.knownTo.includes(learnerId)) return false;
  secret.knownTo.push(learnerId);
  if (secret.exposedYear === undefined && learnerId !== secret.subjectId && !s.hooks.some((x) => x.secretId === secretId && x.holderId === learnerId)) {
    s.hooks.push({ id: newId(s, 'hook'), secretId, holderId: learnerId, targetId: secret.subjectId, year: s.year });
  }
  return true;
}

export function hookBlocker(s: GameState, hookId: string, holderId = s.rulerId): string | null {
  if (s.gameOver) return 'The dynasty has ended.';
  const hook = s.hooks.find((x) => x.id === hookId);
  if (!hook || hook.holderId !== holderId) return 'This is not your hook.';
  if (hook.usedYear !== undefined) return 'This hook has already been spent.';
  if (!freeAdult(s, ch(s, holderId))) return 'Only a free adult can use leverage.';
  if (!freeAdult(s, ch(s, hook.targetId))) return 'The target is dead, underage or captive.';
  const secret = s.secrets.find((x) => x.id === hook.secretId);
  if (!secret || !secret.knownTo.includes(holderId)) return 'You have no evidence.';
  if (secret.exposedYear !== undefined) return 'The secret is already public.';
  return null;
}

export function hooksOf(s: GameState, holderId = s.rulerId): Hook[] {
  return s.hooks.filter((x) => x.holderId === holderId && !hookBlocker(s, x.id, holderId));
}

export function investigateBlocker(s: GameState, targetId: string, investigatorId = s.rulerId): string | null {
  const investigator = ch(s, investigatorId);
  const target = ch(s, targetId);
  if (s.gameOver) return 'The dynasty has ended.';
  if (!freeAdult(s, investigator) || !head(s, investigatorId)) return 'Only a free adult house head can investigate.';
  if (!freeAdult(s, target) || investigatorId === targetId) return 'Choose another free adult.';
  if ((s.cooldowns[`investigate:${investigatorId}`] ?? 0) > s.year) return 'Already investigated this cycle.';
  if (treasury(s, investigator) < INVESTIGATION_COST) return `Need ${INVESTIGATION_COST} credits.`;
  return null;
}

export function investigateChance(s: GameState, targetId: string, investigatorId = s.rulerId): number {
  const investigator = ch(s, investigatorId),
    target = ch(s, targetId);
  if (!investigator || !target) return 0;
  const spy = investigatorId === s.rulerId ? councilStat(s, 'spymaster') : 0;
  return clamp(0.35 + (effStats(s, investigator).int - effStats(s, target).int) * 0.035 + spy * 0.01, 0.1, 0.85);
}

export function investigate(s: GameState, targetId: string, investigatorId = s.rulerId): boolean {
  if (investigateBlocker(s, targetId, investigatorId)) return false;
  const investigator = s.characters[investigatorId];
  debit(s, investigator, INVESTIGATION_COST);
  s.cooldowns[`investigate:${investigatorId}`] = s.year + 1;
  const success = chance(s, investigateChance(s, targetId, investigatorId));
  const pool = s.secrets.filter((x) => x.subjectId === targetId && x.exposedYear === undefined && !x.knownTo.includes(investigatorId));
  const found = success && pool.length ? pick(s, pool) : undefined;
  if (found) learnSecret(s, found.id, investigatorId);
  if (investigatorId === s.rulerId) {
    notice(
      s,
      found ? 'Evidence Uncovered' : 'No Proof Found',
      found ? `Your agents prove ${secretLabel(s, found)}. You now hold a single-use hook.` : 'Your agents found no new proof. A rumour is not evidence.',
      { icon: 'scheme', tone: found ? 'good' : 'neutral', portraitId: targetId },
    );
  }
  return !!found;
}

/** Exposure applies consequences once, even if the lovers have since parted. */
export function exposeSecret(s: GameState, secretId: string, viewerId = s.rulerId): boolean {
  const secret = s.secrets.find((x) => x.id === secretId);
  if (s.gameOver || !freeAdult(s, ch(s, viewerId)) || !secret || secret.exposedYear !== undefined || !secret.knownTo.includes(viewerId)) return false;
  secret.exposedYear = s.year;
  secret.exposedBy = viewerId;
  const subject = ch(s, secret.subjectId),
    other = ch(s, secret.otherId);
  if (subject) {
    const clan = s.clans[subject.clanId];
    if (clan) {
      const penalty = secret.kind === 'murder' ? 30 : 15;
      if (clan.isPlayer) s.prestige -= penalty;
      else clan.prestige -= penalty;
    }
    if (secret.kind === 'murder' && other) {
      murdered(s, other, subject.id, true);
      if (subject.clanId === s.playerClanId) remember(s, other.clanId, `Proven murder of ${other.name}`, -70, undefined, true);
    } else if (secret.kind === 'affair') {
      const spouse = ch(s, secret.betrayedId);
      if (alive(spouse)) {
        addFeeling(s, spouse.id, subject.id, { why: 'Betrayed me', value: -40, decay: 1, key: 'betrayed' });
        if (alive(other)) addFeeling(s, spouse.id, other.id, { why: `Seduced ${subject.name}`, value: -50, decay: 0.5, key: `seduced:${subject.id}` });
      }
    }
  }
  log(s, `Evidence published: ${secretLabel(s, secret, viewerId)}.`, 'news');
  return true;
}

/** Same spending gate for cash and marriage. The evidence cannot be reused. */
export function consumeHook(s: GameState, hookId: string, holderId = s.rulerId): boolean {
  if (hookBlocker(s, hookId, holderId)) return false;
  const hook = s.hooks.find((x) => x.id === hookId)!;
  hook.usedYear = s.year;
  blackmailed(s, s.characters[hook.targetId], holderId);
  return true;
}

function unmatched(s: GameState, c: Character | undefined): c is Character {
  return freeAdult(s, c) && !c.marriedIn && !c.betrothedId && !alive(ch(s, c.spouseId));
}

function eldestLivingChild(s: GameState, c: Character): string | undefined {
  return c.childrenIds
    .map((id) => ch(s, id))
    .filter((x): x is Character => alive(x) && x.clanId === c.clanId && !x.marriedIn)
    .sort((a, b) => a.born - b.born)[0]?.id;
}

/** Real parent/sibling/grandparent ancestry, not shared traits or house membership. */
function related(s: GameState, a: Character, b: Character): boolean {
  const ancestors = (c: Character) =>
    new Set(
      [
        c.id,
        c.fatherId,
        c.motherId,
        ...[c.fatherId, c.motherId].flatMap((id) => {
          const p = ch(s, id);
          return [p?.fatherId, p?.motherId];
        }),
      ].filter((x): x is string => !!x),
    );
  const mine = ancestors(a);
  return [...ancestors(b)].some((id) => mine.has(id));
}

export function marriageHookBlocker(s: GameState, hookId: string, ownId: string, partnerId: string, holderId = s.rulerId): string | null {
  const blocked = hookBlocker(s, hookId, holderId);
  if (blocked) return blocked;
  if (!head(s, holderId)) return 'Only a house head can arrange this favour.';
  const hook = s.hooks.find((x) => x.id === hookId)!;
  const target = s.characters[hook.targetId],
    holder = s.characters[holderId];
  if (!head(s, target.id) || target.clanId === holder.clanId) return 'The hook must be on another house head.';
  const own = ch(s, ownId),
    partner = ch(s, partnerId);
  if (!unmatched(s, own) || !unmatched(s, partner)) return 'Both must be free, unmarried adults without a betrothal.';
  if (own.clanId !== holder.clanId) return 'Choose someone from your own house.';
  if (partner.clanId !== target.clanId || !target.childrenIds.includes(partner.id) || (partner.fatherId !== target.id && partner.motherId !== target.id))
    return 'Choose a child of the hooked ruler.';
  if (head(s, partner.id) || eldestLivingChild(s, target) === partner.id || (target.clanId === s.playerClanId && currentHeir(s)?.id === partner.id))
    return 'A house head or eldest living child cannot be taken away.';
  if (own.id === partner.id || own.gender === partner.gender) return 'This marriage needs two different people of opposite sex.';
  if (related(s, own, partner)) return 'They share close family ancestry.';
  return null;
}

export function spendMarriageHook(s: GameState, hookId: string, ownId: string, partnerId: string, holderId = s.rulerId): boolean {
  if (marriageHookBlocker(s, hookId, ownId, partnerId, holderId)) return false;
  const own = s.characters[ownId],
    partner = s.characters[partnerId];
  consumeHook(s, hookId, holderId);
  own.marriedIn = false;
  partner.marriedIn = true;
  own.spouseId = partner.id;
  partner.spouseId = own.id;
  addFeeling(s, partner.id, holderId, { why: 'Forced my marriage with blackmail', value: -35, decay: 0.3, key: `forced-marriage:${holderId}` });
  recordDeed(s, s.characters[holderId], 'blackmails');
  log(s, `${fullName(s, own)} weds ${fullName(s, partner)}. Evidence bought this marriage, not affection.`, 'news');
  if (own.clanId === s.playerClanId || partner.clanId === s.playerClanId)
    notice(s, 'A Marriage Bought with Silence', `${fullName(s, own)} and ${fullName(s, partner)} are married. The hook is spent; the resentment remains.`, {
      icon: 'scheme',
      tone: holderId === s.rulerId ? 'good' : 'bad',
      portraitId: partner.id,
    });
  return true;
}

/** After AI action, before events: new knowledge can cause a real blackmail letter. */
export function secretsTick(s: GameState): void {
  // Dead strangers may be pruned; name snapshots keep the remaining evidence legible.
  s.secrets = s.secrets.filter((x) => {
    const c = ch(s, x.subjectId);
    return !!c && (alive(c) || (c.died ?? 0) >= s.year - 15);
  });
  const ids = new Set(s.secrets.map((x) => x.id));
  s.hooks = s.hooks.filter((x) => ids.has(x.secretId) && alive(ch(s, x.holderId)));
  for (const secret of s.secrets) secret.knownTo = secret.knownTo.filter((id) => alive(ch(s, id)) || id === secret.subjectId);
  if (!s.secrets.some((x) => x.exposedYear === undefined)) return;
  const heads = Object.values(s.clans)
    .filter((k) => clanRegions(s, k.id).length)
    .map((k) => ch(s, k.headId))
    .filter((c): c is Character => freeAdult(s, c));
  const spy = councilStat(s, 'spymaster');
  if (spy && freeAdult(s, ch(s, s.rulerId))) {
    const pool = s.secrets.filter((x) => x.exposedYear === undefined && !x.knownTo.includes(s.rulerId) && freeAdult(s, ch(s, x.subjectId)));
    if (pool.length && chance(s, clamp(0.04 + spy * 0.006, 0.04, 0.2))) {
      const found = pick(s, pool);
      learnSecret(s, found.id, s.rulerId);
      notice(s, 'Your Spymaster Has Proof', `${secretLabel(s, found)}. Keep it for a favour, demand payment or publish it.`, {
        icon: 'scheme',
        portraitId: found.subjectId,
      });
    }
  }
  for (const h of heads) {
    if (h.clanId === s.playerClanId) continue;
    const near = new Set([h.planetId, ...neighbourPlanets(h.planetId)]);
    const targets = heads.filter((t) => t.id !== h.id && near.has(t.planetId) && !investigateBlocker(s, t.id, h.id));
    if (targets.length && chance(s, 0.12)) investigate(s, pick(s, targets).id, h.id);
    const hook = hooksOf(s, h.id).find((x) => head(s, x.targetId));
    if (!hook || !chance(s, 0.12)) continue;
    const target = s.characters[hook.targetId];
    const own = [h, ...h.childrenIds.map((id) => ch(s, id))].filter((c): c is Character => unmatched(s, c));
    const partners = target.childrenIds.map((id) => ch(s, id)).filter((c): c is Character => unmatched(s, c));
    let used = false;
    for (const a of own) {
      for (const b of partners) {
        if (!marriageHookBlocker(s, hook.id, a.id, b.id, h.id)) {
          spendMarriageHook(s, hook.id, a.id, b.id, h.id);
          used = true;
          break;
        }
      }
      if (used) break;
    }
  }
}
