// The Gene-Forge: research genes nobody in your family carries, splice them
// into living kin, and (with the Vat Complex) grow designer heirs or clone
// your ancestors. Some faiths call this progress. Most call it heresy.

import { createCharacter, randomPersonality } from './character';
import { ageOf, alive, bloodlineMembers, effStats, isBloodlineClan, isVip, log, notice, playerClan, ruler } from './core';
import { councilStat } from './council';
import { canAfford, inheritGenetics, pay, type Cost } from './genetics';
import { remember } from './memory';
import { FAITHS } from './planets';
import { chance, clamp } from './rng';
import { addTrait, conflicts, GENETIC, TRAITS } from './traits';
import type { Character, GameState } from './types';

export type Stance = 'embrace' | 'tolerate' | 'condemn';

export const FORGE_STANCE: Record<string, Stance> = {
  machine: 'embrace',
  veiled: 'tolerate',
  fardark: 'tolerate',
  red: 'tolerate',
  solar: 'condemn',
  abyssal: 'condemn',
};

export const STANCE_TEXT: Record<Stance, string> = {
  embrace: 'embraces gene-forging: procedures cost 25% less and earn faith',
  tolerate: 'tolerates gene-forging',
  condemn: 'condemns gene-forging as heresy: every procedure costs faith',
};

export const FORGE_COST: Cost = { credits: 600, prestige: 150 };
export const VAT_COST: Cost = { credits: 1200, prestige: 300 };
export const RESEARCH_UPKEEP = 40;
export const MAX_VAT_GENES = 3;

export function stance(s: GameState): Stance {
  return FORGE_STANCE[playerClan(s).faithId] ?? 'tolerate';
}

// VIP mode gives the player (never the AI) an unlimited forge: fully built,
// every good gene already sequenced, every procedure free and certain.
export function forgeLevel(s: GameState): 0 | 1 | 2 {
  return isVip(s) ? 2 : s.forge.level;
}

export function researchedGenes(s: GameState): string[] {
  return isVip(s) ? GENETIC.filter((t) => t.good).map((t) => t.id) : s.forge.researched;
}

export function isResearched(s: GameState, id: string): boolean {
  return researchedGenes(s).includes(id);
}

export function maxVatGenes(s: GameState): number {
  return isVip(s) ? Infinity : MAX_VAT_GENES;
}

function discount(s: GameState, c: Cost): Cost {
  if (isVip(s)) return {};
  if (stance(s) !== 'embrace') return c;
  return { credits: c.credits ? Math.round(c.credits * 0.75) : undefined, prestige: c.prestige, faith: c.faith };
}

/** Every gene-forging act shocks the houses whose faith condemns it. */
function heresy(s: GameState, weight: number, what: string): void {
  if (isVip(s)) return;
  const st = stance(s);
  if (st === 'condemn') s.faith = Math.max(0, s.faith - weight * 2);
  if (st === 'embrace') s.faith += Math.round(weight / 2);
  for (const clan of Object.values(s.clans)) {
    if (clan.isPlayer || FORGE_STANCE[clan.faithId] !== 'condemn') continue;
    remember(s, clan.id, what, -Math.round(weight / 2), 0.08);
  }
}

// ── Building ──────────────────────────────────────────────────────────────

export function buildBlocker(s: GameState): string | null {
  if (forgeLevel(s) >= 1) return 'Already built.';
  if (!canAfford(s, FORGE_COST)) return 'Need 600 credits and 150 prestige.';
  return null;
}

export function buildForge(s: GameState): boolean {
  if (buildBlocker(s)) return false;
  pay(s, FORGE_COST);
  s.forge.level = 1;
  heresy(s, 10, 'Built a Gene-Forge');
  log(s, 'The Gene-Forge is complete. Its first sequencers hum to life.', 'good');
  return true;
}

export function vatBlocker(s: GameState): string | null {
  if (forgeLevel(s) < 1) return 'Build the Gene-Forge first.';
  if (forgeLevel(s) >= 2) return 'Already built.';
  if (!canAfford(s, VAT_COST)) return 'Need 1,200 credits and 300 prestige.';
  return null;
}

export function buildVats(s: GameState): boolean {
  if (vatBlocker(s)) return false;
  pay(s, VAT_COST);
  s.forge.level = 2;
  s.dynasty.gestationVats = true;
  heresy(s, 20, 'Built a vat complex for growing children');
  log(s, 'The Vat Complex opens. Heirs can now be grown, not born.', 'good');
  return true;
}

// ── Research ──────────────────────────────────────────────────────────────

export function researchNeeded(id: string): number {
  return 10 + 12 * Math.max(1, TRAITS[id]?.level ?? 1);
}

export function researchRate(s: GameState): number {
  return Math.round((3 + effStats(s, ruler(s)).sci * 0.6 + councilStat(s, 'scientist') * 0.8) * 10) / 10;
}

export function researchable(s: GameState): string[] {
  return GENETIC.filter((t) => t.good && !isResearched(s, t.id)).map((t) => t.id);
}

export function startResearch(s: GameState, id: string): boolean {
  if (forgeLevel(s) < 1 || !researchable(s).includes(id)) return false;
  s.forge.project = { trait: id, progress: 0, needed: researchNeeded(id) };
  return true;
}

export function cancelResearch(s: GameState): void {
  s.forge.project = undefined;
}

export function forgeTick(s: GameState): void {
  if (isVip(s)) s.forge.project = undefined;
  const p = s.forge.project;
  if (!p || forgeLevel(s) < 1) return;
  p.progress += researchRate(s);
  if (p.progress >= p.needed) {
    s.forge.researched.push(p.trait);
    s.forge.project = undefined;
    const name = TRAITS[p.trait].name;
    heresy(s, 8, `Synthesised the ${name} gene`);
    notice(s, 'Gene Sequenced', `Your geneticists have synthesised ${name}. You can now lock it into the Gene Vault without a carrier, and splice it into living kin.`, {
      icon: 'dna',
      tone: 'good',
    });
    log(s, `The Gene-Forge synthesised ${name}.`, 'good');
  }
}

// ── Gene therapy ──────────────────────────────────────────────────────────

export function spliceCost(s: GameState, id: string): Cost {
  return discount(s, { credits: 200 + 150 * Math.max(1, TRAITS[id]?.level ?? 1) });
}

export function spliceChance(s: GameState, c: Character): number {
  if (isVip(s)) return 1;
  const age = ageOf(s, c);
  const base = age < 6 ? 0.8 : age < 16 ? 0.65 : 0.45;
  return clamp(base + councilStat(s, 'scientist') * 0.01, 0.1, 0.95);
}

export function spliceBlocker(s: GameState, c: Character, id: string): string | null {
  if (forgeLevel(s) < 1) return 'Build the Gene-Forge first.';
  if (!isResearched(s, id)) return 'Research this gene first.';
  if (!alive(c) || !isBloodlineClan(s, c.clanId)) return 'Only living members of your bloodline.';
  if (c.traits.includes(id)) return 'They already carry it.';
  const t = TRAITS[id];
  const better = c.traits.find((x) => conflicts(x, id) && (TRAITS[x].level ?? 0) > (t.level ?? 0));
  if (better) return `They already carry the stronger ${TRAITS[better].name}.`;
  if (!canAfford(s, spliceCost(s, id))) return 'Not enough credits.';
  return null;
}

export function splice(s: GameState, charId: string, id: string): boolean {
  const c = s.characters[charId];
  if (!c || spliceBlocker(s, c, id)) return false;
  pay(s, spliceCost(s, id));
  heresy(s, 10, `Rewrote ${c.name}'s genome`);
  const name = TRAITS[id].name;
  if (chance(s, spliceChance(s, c))) {
    c.traits = addTrait(c.traits, id);
    notice(s, 'Splice Successful', `${c.name} now carries ${name}. Their children can inherit it.`, { icon: 'dna', tone: 'good', portraitId: c.id });
    log(s, `${c.name} was spliced with ${name}.`, 'good');
    return true;
  }
  const harm = chance(s, 0.4) ? (chance(s, 0.3) ? 'gene_rot' : 'sickly') : undefined;
  if (harm && !s.dynasty.purged.includes(harm)) c.traits = addTrait(c.traits, harm);
  c.health -= 15;
  notice(s, 'Splice Rejected', `${c.name}'s body rejected the ${name} sequence.${harm ? ` The damage left them ${TRAITS[harm].name}.` : ' They will recover.'}`, {
    icon: 'dna',
    tone: 'bad',
    portraitId: c.id,
  });
  return false;
}

// ── Vat heirs and clones ──────────────────────────────────────────────────

export function vatHeirCost(s: GameState, genes: number): Cost {
  return discount(s, { credits: 400 + 120 * genes, prestige: 50 });
}

export function vatHeirBlocker(s: GameState, parentId: string, genes: string[]): string | null {
  const p = s.characters[parentId];
  if (forgeLevel(s) < 2) return 'Build the Vat Complex first.';
  if (!alive(p) || !isBloodlineClan(s, p.clanId) || ageOf(s, p) < 16) return 'Pick a living adult of your bloodline.';
  if (genes.length > maxVatGenes(s)) return `At most ${MAX_VAT_GENES} designer genes.`;
  if (genes.some((g) => !isResearched(s, g))) return 'Only researched genes can be designed in.';
  for (let i = 0; i < genes.length; i++) for (let j = i + 1; j < genes.length; j++) if (conflicts(genes[i], genes[j])) return 'Two of those genes are on the same ladder.';
  if (!canAfford(s, vatHeirCost(s, genes.length))) return 'Not enough credits or prestige.';
  return null;
}

/** A designer child grown from one parent's genome plus chosen genes. */
export function growVatHeir(s: GameState, parentId: string, genes: string[]): Character | undefined {
  if (vatHeirBlocker(s, parentId, genes)) return undefined;
  pay(s, vatHeirCost(s, genes.length));
  const parent = s.characters[parentId];
  let traits = inheritGenetics(s, parent, undefined, { locked: s.dynasty.locked, purged: s.dynasty.purged });
  for (const g of genes) traits = addTrait(traits, g);
  for (const l of s.dynasty.locked) traits = addTrait(traits, l);
  traits = addTrait(traits, 'vatborn');
  const child = createCharacter(s, {
    born: s.year,
    clanId: parent.clanId,
    planetId: parent.planetId,
    faithId: parent.faithId,
    fatherId: parent.gender === 'M' ? parent.id : undefined,
    motherId: parent.gender === 'F' ? parent.id : undefined,
    looks: { ...parent.looks, hairStyle: (parent.looks.hairStyle + 3) % 8 },
    traits,
  });
  child.base = { ...parent.base };
  parent.childrenIds.push(child.id);
  heresy(s, 20, 'Grew a child in a vat');
  notice(s, 'A Child From the Vats', `${child.name} emerges from the Vat Complex, grown from ${parent.name}'s genome.`, { icon: 'dna', tone: 'good', portraitId: child.id });
  log(s, `${child.name} was grown in the vats from ${parent.name}'s genome.`, 'birth');
  return child;
}

export function cloneCost(s: GameState): Cost {
  return discount(s, { credits: 900, prestige: 200 });
}

export function cloneBlocker(s: GameState, sourceId: string): string | null {
  const src = s.characters[sourceId];
  if (forgeLevel(s) < 2) return 'Build the Vat Complex first.';
  if (!src || !isBloodlineClan(s, src.clanId)) return 'Only members of your bloodline (living or dead) can be cloned.';
  if (src.cloneOf) return 'Copies of copies degrade. Clone the original.';
  if (!canAfford(s, cloneCost(s))) return 'Need 900 credits and 200 prestige.';
  return null;
}

/** An exact genetic copy, raised as the ruler's own child. Dead ancestors work too. */
export function cloneCharacter(s: GameState, sourceId: string): Character | undefined {
  if (cloneBlocker(s, sourceId)) return undefined;
  pay(s, cloneCost(s));
  const src = s.characters[sourceId];
  const r = ruler(s);
  let traits = src.traits.filter((t) => TRAITS[t]?.cat === 'genetic' && !s.dynasty.purged.includes(t));
  for (const l of s.dynasty.locked) if (TRAITS[l]?.cat === 'genetic') traits = addTrait(traits, l);
  traits = randomPersonality(s, 1, traits, undefined, s.dynasty.purged);
  traits = addTrait(traits, 'clone');
  const child = createCharacter(s, {
    gender: src.gender,
    born: s.year,
    clanId: s.playerClanId,
    planetId: src.planetId,
    faithId: playerClan(s).faithId,
    fatherId: r.gender === 'M' ? r.id : undefined,
    motherId: r.gender === 'F' ? r.id : undefined,
    looks: { ...src.looks },
    traits,
    name: `${src.name} the Second`,
  });
  child.base = { ...src.base };
  child.cloneOf = src.id;
  r.childrenIds.push(child.id);
  heresy(s, 35, `Cloned ${src.name}`);
  notice(
    s,
    'A Clone is Decanted',
    `${child.name} opens their eyes for the first time, a perfect genetic copy of ${src.name}${alive(src) ? '' : `, dead since ${src.died}`}. They will be raised as your child.`,
    { icon: 'dna', tone: 'good', portraitId: child.id },
  );
  log(s, `${src.name} was cloned. ${child.name} joins the family.`, 'birth');
  return child;
}

export function cloneSources(s: GameState): Character[] {
  return bloodlineMembers(s, true)
    .filter((c) => !c.cloneOf)
    .sort((a, b) => Number(s.dynasty.rulers.some((r) => r.id === b.id)) - Number(s.dynasty.rulers.some((r) => r.id === a.id)) || a.born - b.born);
}

export function faithName(s: GameState): string {
  return FAITHS[playerClan(s).faithId]?.name ?? '';
}
