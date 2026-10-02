// Family management: marriages, betrothals, tutors, cybernetics, laws.

import { createCharacter, randomPersonality } from './character';
import {
  ageOf,
  alive,
  ch,
  clanRank,
  cooldownReady,
  effStats,
  fullName,
  log,
  notice,
  playerClan,
  ruler,
  setCooldown,
} from './core';
import { canAfford, costText, pay, type Cost } from './genetics';
import { chance, int, pick } from './rng';
import { addTrait, TRAITS } from './traits';
import type { Character, GameState, GenderLaw, StatKey, SuccessionLaw, Suitor, TutorKey } from './types';
import { atWarWith } from './war';
import { remember } from './memory';
import { councilStat } from './council';

// ── Marriage market ───────────────────────────────────────────────────────

export function canSeekSpouse(s: GameState, c: Character): string | null {
  if (!alive(c)) return 'They are dead.';
  if (c.clanId !== s.playerClanId) return 'Only members of your dynasty.';
  if (c.spouseId && alive(ch(s, c.spouseId))) return 'Already married.';
  if (c.betrothedId) return 'Already betrothed.';
  return null;
}

export function suitorMode(s: GameState, c: Character): 'marry' | 'betroth' {
  return ageOf(s, c) >= 16 ? 'marry' : 'betroth';
}

export function generateSuitors(s: GameState, forId: string): void {
  const target = s.characters[forId];
  if (!target) return;
  const mode = suitorMode(s, target);
  const age = ageOf(s, target);
  const gender = target.gender === 'M' ? 'F' : 'M';
  const clans = Object.values(s.clans).filter((c) => !c.isPlayer && !atWarWith(s, c.id));
  const list: Suitor[] = [];
  for (let i = 0; i < 6 && clans.length; i++) {
    const samePlanet = clans.filter((c) => c.planetId === target.planetId);
    const clan = samePlanet.length && chance(s, 0.4) ? pick(s, samePlanet) : pick(s, clans);
    const lo = mode === 'marry' ? Math.max(16, age - 8) : Math.max(0, age - 3);
    const hi = mode === 'marry' ? Math.max(lo, Math.min(age + 6, 60)) : Math.min(15, age + 3);
    const theirAge = int(s, lo, Math.max(lo, hi));
    const highborn = chance(s, 0.35);
    const c = createCharacter(s, {
      gender,
      born: s.year - theirAge,
      clanId: clan.id,
      planetId: clan.planetId,
      faithId: clan.faithId,
      adultExtras: true,
      geneticCount: chance(s, 0.45) ? 1 : chance(s, 0.45) ? 2 : chance(s, 0.3) ? 3 : 0,
    });
    if (theirAge < 16) c.traits = randomPersonality(s, 1, c.traits);
    // Keep candidates out of the world until one is chosen.
    delete s.characters[c.id];
    const rank = clanRank(s, clan.id);
    list.push({ char: c, highborn, prestigeCost: highborn ? 40 + rank * 30 : 0 });
  }
  s.suitors = { forId, year: s.year, mode, list };
  setCooldown(s, `suitors:${forId}`);
}

export function suitorRefreshCost(s: GameState, forId: string): number {
  return cooldownReady(s, `suitors:${forId}`) ? 0 : 25;
}

export function refreshSuitors(s: GameState, forId: string): boolean {
  const cost = suitorRefreshCost(s, forId);
  if (s.credits < cost) return false;
  s.credits -= cost;
  generateSuitors(s, forId);
  return true;
}

export function acceptSuitor(s: GameState, index: number): boolean {
  const sl = s.suitors;
  if (!sl) return false;
  const suitor = sl.list[index];
  const target = s.characters[sl.forId];
  if (!suitor || !target || canSeekSpouse(s, target)) return false;
  if (s.prestige < suitor.prestigeCost) return false;
  s.prestige -= suitor.prestigeCost;
  const c = suitor.char;
  c.marriedIn = true;
  target.marriedIn = false;
  s.characters[c.id] = c;
  const clan = s.clans[c.clanId];
  if (suitor.highborn && clan) {
    const head = s.characters[clan.headId];
    if (head && ageOf(s, head) - ageOf(s, c) >= 16) {
      if (head.gender === 'M') c.fatherId = head.id;
      else c.motherId = head.id;
      head.childrenIds.push(c.id);
    }
    clan.allied = true;
    remember(s, clan.id, `Married ${c.name} into their house`, 30, 0.02);
  } else if (clan) remember(s, clan.id, `Married ${c.name} into their house`, 12, 0.03);
  if (sl.mode === 'marry') {
    target.spouseId = c.id;
    c.spouseId = target.id;
    log(s, `${target.name} married ${fullName(s, c)}.${suitor.highborn ? ` An alliance with House ${clan?.name} is sealed.` : ''}`, 'family');
  } else {
    target.betrothedId = c.id;
    c.betrothedId = target.id;
    log(s, `${target.name} is betrothed to ${fullName(s, c)}.`, 'family');
  }
  s.suitors = undefined;
  return true;
}

export function divorceCost(): Cost {
  return { faith: 100, prestige: 50 };
}

export function divorce(s: GameState, id: string): boolean {
  const a = s.characters[id];
  const b = ch(s, a?.spouseId);
  if (!a || !alive(b) || !canAfford(s, divorceCost())) return false;
  pay(s, divorceCost());
  a.spouseId = undefined;
  b.spouseId = undefined;
  const clan = s.clans[b.clanId];
  if (clan && !clan.isPlayer) {
    remember(s, clan.id, `Cast aside ${b.name}`, -35, 0.03);
    clan.allied = false;
  }
  log(s, `${a.name} has divorced ${b.name}.`, 'family');
  return true;
}

export function breakBetrothal(s: GameState, id: string): void {
  const a = s.characters[id];
  const b = ch(s, a?.betrothedId);
  if (!a) return;
  a.betrothedId = undefined;
  if (b) {
    b.betrothedId = undefined;
    const clan = s.clans[b.clanId];
    if (clan && !clan.isPlayer) clan.opinion -= 15;
  }
}

// ── Education ─────────────────────────────────────────────────────────────

export const TUTORS: Record<TutorKey, { name: string; desc: string; cost: number }> = {
  household: { name: 'Household Tutor', desc: 'Free. Slow but steady.', cost: 0 },
  academy: { name: 'Orbital Academy', desc: '25 credits/cycle. Proper schooling.', cost: 25 },
  ai: { name: 'AI Tutor', desc: '60 credits/cycle. A synthetic mind teaching around the clock.', cost: 60 },
};

export function setEducation(s: GameState, id: string, focus: StatKey, tutor: TutorKey): void {
  const c = s.characters[id];
  if (!c?.edu) return;
  if (c.edu.focus !== focus && ageOf(s, c) >= 10) c.edu.progress *= 0.7;
  c.edu.focus = focus;
  c.edu.tutor = tutor;
}

// ── Cybernetics ───────────────────────────────────────────────────────────

export const AUGMENTS: { id: string; cost: number }[] = [
  { id: 'neural_lace', cost: 320 },
  { id: 'optic_implant', cost: 260 },
  { id: 'bionic_arm', cost: 260 },
  { id: 'silver_tongue', cost: 260 },
  { id: 'ledger_cortex', cost: 260 },
  { id: 'nano_immune', cost: 350 },
  { id: 'cardio_core', cost: 450 },
  { id: 'full_conversion', cost: 900 },
];

export function augmentCost(s: GameState, id: string): number {
  const base = AUGMENTS.find((a) => a.id === id)?.cost ?? 0;
  return Math.round(base * (playerClan(s).faithId === 'machine' ? 0.7 : 1));
}

export function augmentRisk(s: GameState, c: Character): number {
  return Math.max(0.02, 0.12 - effStats(s, ruler(s)).sci * 0.006 - effStats(s, c).sci * 0.002 - councilStat(s, 'scientist') * 0.004);
}

export function augmentBlocker(s: GameState, c: Character, id: string): string | null {
  if (!alive(c)) return 'Dead.';
  if (c.traits.includes(id)) return 'Already installed.';
  if (id !== 'nano_immune' && ageOf(s, c) < 16) return 'Too young for this implant.';
  if (s.credits < augmentCost(s, id)) return `Need ${augmentCost(s, id)} credits.`;
  return null;
}

export function augment(s: GameState, charId: string, id: string): void {
  const c = s.characters[charId];
  if (!c || augmentBlocker(s, c, id)) return;
  s.credits -= augmentCost(s, id);
  const name = TRAITS[id].name;
  if (chance(s, augmentRisk(s, c))) {
    c.traits = addTrait(c.traits, 'ill');
    c.health -= 20;
    notice(s, 'Surgery Complication', `${c.name}'s body rejected the ${name}. They are gravely ill.`, { icon: 'cyber', tone: 'bad', portraitId: c.id });
    log(s, `${c.name}'s ${name} surgery went wrong.`, 'bad');
    return;
  }
  c.traits = addTrait(c.traits, id);
  if (id === 'nano_immune') c.traits = c.traits.filter((t) => t !== 'ill');
  log(s, `${c.name} has been fitted with a ${name}.`, 'good');
  notice(s, 'Augmentation Complete', `${c.name} wakes up with a shiny new ${name}.`, { icon: 'cyber', tone: 'good', portraitId: c.id });
}

// ── Laws & heirs ──────────────────────────────────────────────────────────

export const LAWS: Record<SuccessionLaw, { name: string; desc: string }> = {
  primogeniture: { name: 'Primogeniture', desc: 'The eldest child inherits everything.' },
  ultimogeniture: { name: 'Ultimogeniture', desc: 'The youngest child inherits everything.' },
  merit: { name: 'Meritocracy', desc: 'The most capable heir (highest total stats) inherits. Perfect for gene-forged dynasties.' },
  designated: { name: 'Designated Heir', desc: 'You choose your heir personally.' },
};

export const GENDER_LAWS: Record<GenderLaw, { name: string; desc: string }> = {
  equal: { name: 'Equal', desc: 'Sons and daughters inherit equally.' },
  male: { name: 'Male Preference', desc: 'Sons come before daughters.' },
  female: { name: 'Female Preference', desc: 'Daughters come before sons.' },
};

export const LAW_COST = { prestige: 200 };
export const GENDER_LAW_COST = { prestige: 150 };

export function changeLaw(s: GameState, law: SuccessionLaw): boolean {
  if (!cooldownReady(s, 'law') || !canAfford(s, LAW_COST) || s.dynasty.law === law) return false;
  pay(s, LAW_COST);
  s.dynasty.law = law;
  setCooldown(s, 'law', 5);
  log(s, `Succession law changed to ${LAWS[law].name}.`, 'info');
  return true;
}

export function changeGenderLaw(s: GameState, law: GenderLaw): boolean {
  if (!cooldownReady(s, 'genderlaw') || !canAfford(s, GENDER_LAW_COST) || s.dynasty.genderLaw === law) return false;
  pay(s, GENDER_LAW_COST);
  s.dynasty.genderLaw = law;
  setCooldown(s, 'genderlaw', 5);
  log(s, `Gender law changed to ${GENDER_LAWS[law].name}.`, 'info');
  return true;
}

export function designateHeir(s: GameState, id: string): void {
  const c = s.characters[id];
  if (!alive(c) || c.clanId !== s.playerClanId || c.bastard || id === s.rulerId) return;
  s.dynasty.designatedHeir = id;
}

export const LEGITIMIZE_COST = { prestige: 150 };

export function legitimize(s: GameState, id: string): boolean {
  const c = s.characters[id];
  if (!c?.bastard || !canAfford(s, LEGITIMIZE_COST)) return false;
  pay(s, LEGITIMIZE_COST);
  c.bastard = undefined;
  log(s, `${c.name} has been legitimised.`, 'family');
  return true;
}

export const VATS_COST = { credits: 800 };

export function buyVats(s: GameState): boolean {
  if (s.dynasty.gestationVats || !canAfford(s, VATS_COST)) return false;
  pay(s, VATS_COST);
  s.dynasty.gestationVats = true;
  log(s, 'Gestation vats installed. Dynasty mothers can now have children into their late fifties.', 'good');
  return true;
}

export function endAffair(s: GameState): void {
  const r = ruler(s);
  r.loverId = undefined;
}

export { costText };
