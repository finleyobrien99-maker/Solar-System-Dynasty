// A ruler's deeds belong to that person, never to their dynasty or successor.
// No dice, stat bonuses or fabricated AI actions: both sides use the same rules.
import { observeAmbition } from './ambitions';
import { ageOf, alive, ch, fullName, log, notice } from './core';
import { DEED_LABELS, EPITHETS, type Deed, type EpithetDef, type Reputation } from './epithetDefs';
import { marriageMood, relationsOf } from './relations';
import type { Character, GameState } from './types';

function reputation(s: GameState, c: Character): Reputation | undefined {
  // Most births and deaths concern ordinary kin: skip the ruler scan for them.
  if (!c.reputation && s.clans[c.clanId]?.headId !== c.id) return undefined;
  const houses = Object.values(s.clans)
    .filter((k) => k.headId === c.id)
    .map((k) => k.id);
  if (!c.reputation && !houses.length) return undefined;
  const r = (c.reputation ??= { deeds: {}, earned: [], since: s.year, lastYear: s.year, peaceStreak: 0, marriageStreak: 0, houses: [] });
  r.houses ??= [];
  for (const id of houses) if (!r.houses.includes(id)) r.houses.push(id);
  return r;
}
/** Membership of the same house, or immediate kin even after they join another house. */
export function isCloseKin(a: Character, b: Character): boolean {
  return (
    a.clanId === b.clanId ||
    a.spouseId === b.id ||
    a.fatherId === b.id ||
    a.motherId === b.id ||
    b.fatherId === a.id ||
    b.motherId === a.id ||
    (!!a.fatherId && a.fatherId === b.fatherId) ||
    (!!a.motherId && a.motherId === b.motherId)
  );
}
/** New games and migrations start observing current heads without inventing past actions. */
export function initialiseReputations(s: GameState): void {
  for (const clan of Object.values(s.clans)) {
    const c = ch(s, clan.headId);
    if (alive(c)) reputation(s, c);
  }
}
export function requirementMet(r: Reputation, def: EpithetDef): boolean {
  return def.needs.every((n) => {
    const value = r.deeds[n.deed] ?? 0;
    return (n.min === undefined || value >= n.min) && (n.max === undefined || value <= n.max);
  });
}
export function awardEpithets(s: GameState, c: Character): void {
  const r = reputation(s, c);
  if (!r) return;
  const fresh = EPITHETS.filter((def) => !r.earned.some((e) => e.id === def.id) && requirementMet(r, def));
  if (!fresh.length) return;
  for (const def of fresh)
    r.earned.push({
      id: def.id,
      year: s.year,
      why: def.needs.map((n) => DEED_LABELS[n.deed] + ': ' + (r.deeds[n.deed] ?? 0) + '.').join(' '),
    });
  const names = fresh.map((def) => def.name).join(', ');
  log(s, `${fullName(s, c)} earned ${names}.`, c.id === s.rulerId ? 'info' : 'news');
  if (c.id === s.rulerId && alive(c))
    notice(s, 'A name earned', `${c.name} is now remembered as ${names}. Open your profile to see the deeds behind it.`, {
      icon: 'crown',
      tone: 'neutral',
      portraitId: c.id,
    });
}
/** Called only after an action really happens. Failed or blocked actions never count. */
export function recordDeed(s: GameState, c: Character | string | undefined, deed: Deed, amount = 1, uniqueId?: string): void {
  const who = typeof c === 'string' ? ch(s, c) : c;
  if (!who || !Number.isFinite(amount) || amount <= 0 || (who.died !== undefined && who.died !== s.year)) return;
  const r = reputation(s, who);
  if (!r) return;
  if (uniqueId) {
    const seen = ((r.unique ??= {})[deed] ??= []);
    if (seen.includes(uniqueId)) return;
    seen.push(uniqueId);
  }
  r.deeds[deed] = (r.deeds[deed] ?? 0) + amount;
  if (deed === 'warsStarted') breakPeace(s, who.id);
  awardEpithets(s, who);
  observeAmbition(s, who);
}
/** A war interrupts peace even if it is settled before the next yearly tick. */
export function breakPeace(s: GameState, id: string): void {
  const c = ch(s, id);
  if (!alive(c)) return;
  const r = reputation(s, c);
  if (r) r.peaceStreak = 0;
  if (c.ambition?.status === 'active' && c.ambition.kind === 'peacemaker') c.ambition.progress = 0;
}
function peak(r: Reputation, deed: Deed, value: number): void {
  r.deeds[deed] = Math.max(r.deeds[deed] ?? 0, value);
}
/** Affairs and divorce interrupt the marriage, even between yearly ticks. */
export function breakFaithfulness(c: Character | undefined): void {
  if (c?.reputation) {
    c.reputation.marriageStreak = 0;
    c.reputation.spouseId = undefined;
  }
}
/** Known family and age facts can earn a name at a birth or death, without adding a fake ruling cycle. */
export function observeReputation(s: GameState, c: Character): void {
  const r = reputation(s, c);
  if (!r) return;
  peak(r, 'age', ageOf(s, c));
  peak(r, 'children', c.childrenIds.length);
  const grandchildren = new Set(c.childrenIds.flatMap((id) => ch(s, id)?.childrenIds ?? []));
  peak(r, 'grandchildren', grandchildren.size);
  peak(r, 'friends', relationsOf(s, c).filter((rel) => rel.kind === 'friend').length);

  awardEpithets(s, c);
  observeAmbition(s, c);
}
/** Observe one real cycle per living ruler, once only, before deaths or succession. */
export function epithetsTick(s: GameState): void {
  const unfaithful = new Set<string>();
  // Affairs may only store a loverId on the initiator; both partners are involved.
  for (const c of Object.values(s.characters)) {
    const lover = ch(s, c.loverId);
    if (alive(c) && alive(lover)) {
      unfaithful.add(c.id);
      unfaithful.add(lover.id);
    }
  }
  for (const clan of Object.values(s.clans)) {
    const c = ch(s, clan.headId);
    if (!alive(c)) continue;
    const r = reputation(s, c)!;
    if (r.lastYear >= s.year) continue;
    r.lastYear = s.year;
    r.deeds.rulingYears = (r.deeds.rulingYears ?? 0) + 1;
    const war = s.wars.some((w) => w.enemy === clan.id || clan.isPlayer) || s.aiWars.some((w) => w.attacker === clan.id || w.defender === clan.id);
    r.peaceStreak = war ? 0 : r.peaceStreak + 1;
    peak(r, 'peacefulYears', r.peaceStreak);
    const spouse = ch(s, c.spouseId);
    const faithful = alive(spouse) && !unfaithful.has(c.id) && !unfaithful.has(spouse.id) && marriageMood(s, c, spouse) >= 15;
    r.marriageStreak = faithful ? (r.spouseId === spouse.id ? r.marriageStreak + 1 : 1) : 0;
    r.spouseId = faithful ? spouse.id : undefined;
    peak(r, 'marriedYears', r.marriageStreak);
    if (c.childrenIds.some((id) => s.relations[id]?.[c.id]?.feelings.some((f) => f.key === 'neglect' && f.value < 0)))
      r.deeds.neglectYears = (r.deeds.neglectYears ?? 0) + 1;
    observeReputation(s, c);
  }
}
