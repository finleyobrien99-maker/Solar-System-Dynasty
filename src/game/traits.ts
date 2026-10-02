// The trait system. Genetic traits live in groups with tiers (Slow < Quick <
// Brilliant < Genius) so breeding can push a bloodline up the ladder.
// Genetic and personality traits are heritable and can be locked in (always
// passed on) or purged (never passed on) via the Gene Vault.

import type { StatKey } from './types';

export type TraitCat = 'genetic' | 'personality' | 'education' | 'acquired' | 'cyber';

export interface TraitDef {
  id: string;
  name: string;
  cat: TraitCat;
  desc: string;
  good: boolean | null;
  group?: string;
  level?: number;
  opposite?: string;
  stats?: Partial<Record<StatKey, number>>;
  all?: number;
  health?: number;
  fertility?: number;
  life?: number;
  fleetPct?: number;
  prestigeYr?: number;
  faithYr?: number;
  creditsPct?: number;
  scheme?: number;
  defense?: number;
  mutation?: number; // weight for random mutations at birth
  temp?: boolean;
}

const T: TraitDef[] = [
  // ── Genetic: intellect ladder
  { id: 'dim', name: 'Dim', cat: 'genetic', group: 'intellect', level: -2, all: -4, good: false, mutation: 2, desc: 'Struggles to follow a conversation, let alone a war.' },
  { id: 'slow', name: 'Slow', cat: 'genetic', group: 'intellect', level: -1, all: -2, good: false, mutation: 4, desc: 'Gets there in the end. Usually.' },
  { id: 'quick', name: 'Quick', cat: 'genetic', group: 'intellect', level: 1, all: 1, good: true, mutation: 5, desc: 'Sharp mind, learns fast.' },
  { id: 'brilliant', name: 'Brilliant', cat: 'genetic', group: 'intellect', level: 2, all: 3, good: true, mutation: 2, desc: 'A gifted intellect that shines in every field.' },
  { id: 'genius', name: 'Genius', cat: 'genetic', group: 'intellect', level: 3, all: 5, good: true, mutation: 0.5, desc: 'Once-in-a-generation mind. Breed it, lock it, keep it.' },
  // ── Genetic: physique
  { id: 'feeble', name: 'Feeble', cat: 'genetic', group: 'physique', level: -1, stats: { cmd: -2 }, health: -10, good: false, mutation: 3, desc: 'Weak of body. Loses arm-wrestles to children.' },
  { id: 'strong', name: 'Strong', cat: 'genetic', group: 'physique', level: 1, stats: { cmd: 2 }, health: 5, good: true, mutation: 4, desc: 'Built like a cargo loader.' },
  { id: 'herculean', name: 'Herculean', cat: 'genetic', group: 'physique', level: 2, stats: { cmd: 4 }, health: 10, fleetPct: 0.05, good: true, mutation: 1, desc: 'Monstrous strength. Crews follow them into anything.' },
  // ── Genetic: beauty
  { id: 'hideous', name: 'Hideous', cat: 'genetic', group: 'beauty', level: -2, stats: { dip: -4 }, fertility: -0.2, good: false, mutation: 2, desc: 'Mirrors have been known to crack.' },
  { id: 'homely', name: 'Homely', cat: 'genetic', group: 'beauty', level: -1, stats: { dip: -2 }, good: false, mutation: 4, desc: 'A face only a mother could love.' },
  { id: 'comely', name: 'Comely', cat: 'genetic', group: 'beauty', level: 1, stats: { dip: 1 }, good: true, mutation: 5, desc: 'Easy on the eyes.' },
  { id: 'beautiful', name: 'Beautiful', cat: 'genetic', group: 'beauty', level: 2, stats: { dip: 3 }, fertility: 0.1, good: true, mutation: 2, desc: 'Heads turn across the whole ballroom.' },
  { id: 'radiant', name: 'Radiant', cat: 'genetic', group: 'beauty', level: 3, stats: { dip: 5 }, fertility: 0.2, prestigeYr: 2, good: true, mutation: 0.5, desc: 'Breathtaking. Poets on three planets write about them.' },
  // ── Genetic: stature
  { id: 'dwarfish', name: 'Dwarfish', cat: 'genetic', group: 'stature', level: -2, stats: { cmd: -2 }, health: -5, good: false, mutation: 2, desc: 'Very short of stature.' },
  { id: 'short', name: 'Short', cat: 'genetic', group: 'stature', level: -1, stats: { cmd: -1 }, good: false, mutation: 4, desc: 'Needs a box to look over the command console.' },
  { id: 'tall', name: 'Tall', cat: 'genetic', group: 'stature', level: 1, stats: { cmd: 1, dip: 1 }, good: true, mutation: 4, desc: 'Towers over the court.' },
  { id: 'giant', name: 'Giant', cat: 'genetic', group: 'stature', level: 2, stats: { cmd: 3 }, health: -5, life: -5, good: true, mutation: 1, desc: 'A literal giant. Hits hard, ages fast.' },
  // ── Genetic: constitution
  { id: 'sickly', name: 'Sickly', cat: 'genetic', group: 'constitution', level: -1, health: -20, life: -8, good: false, mutation: 3, desc: 'Catches every bug going.' },
  { id: 'robust', name: 'Robust', cat: 'genetic', group: 'constitution', level: 1, health: 15, life: 5, good: true, mutation: 4, desc: 'Hardy and rarely ill.' },
  { id: 'ironblood', name: 'Ironblood', cat: 'genetic', group: 'constitution', level: 2, health: 25, life: 10, good: true, mutation: 1, desc: 'Practically indestructible. Plagues bounce off.' },
  // ── Genetic: longevity
  { id: 'shortlived', name: 'Short-lived', cat: 'genetic', group: 'longevity', level: -1, life: -12, good: false, mutation: 3, desc: 'Their family rarely sees sixty.' },
  { id: 'longlived', name: 'Long-lived', cat: 'genetic', group: 'longevity', level: 1, life: 10, good: true, mutation: 3, desc: 'Ages slowly. Outlives rivals out of spite.' },
  { id: 'ageless', name: 'Ageless', cat: 'genetic', group: 'longevity', level: 2, life: 25, good: true, mutation: 0.4, desc: 'Telomeres that just will not quit.' },
  // ── Genetic: fertility
  { id: 'barren', name: 'Barren', cat: 'genetic', group: 'fertility', level: -1, fertility: -1, good: false, mutation: 2, desc: 'Cannot have children. A nightmare for a dynasty.' },
  { id: 'fecund', name: 'Fecund', cat: 'genetic', group: 'fertility', level: 1, fertility: 0.5, good: true, mutation: 3, desc: 'Children arrive often and healthy.' },
  // ── Genetic: psionics
  { id: 'psi_spark', name: 'Psionic Spark', cat: 'genetic', group: 'psionic', level: 1, stats: { int: 2, sci: 2 }, good: true, mutation: 1.5, desc: 'Faint telepathy. Knows when they are being lied to.' },
  { id: 'psi_adept', name: 'Psionic Adept', cat: 'genetic', group: 'psionic', level: 2, stats: { int: 4, sci: 4, dip: 2 }, scheme: 0.1, good: true, mutation: 0.4, desc: 'True mind-reading. Courts fear their gaze.' },
  { id: 'psi_ascendant', name: 'Psionic Ascendant', cat: 'genetic', group: 'psionic', level: 3, all: 3, stats: { int: 4 }, scheme: 0.2, defense: 0.2, good: true, mutation: 0.1, desc: 'A living legend of the mind. The rarest gene in the system.' },
  // ── Genetic: singletons
  { id: 'void_adapted', name: 'Void-Adapted', cat: 'genetic', group: 'void', level: 1, stats: { cmd: 2 }, fleetPct: 0.1, health: 5, good: true, mutation: 2, desc: 'Born for zero-g. Commands fleets like breathing.' },
  { id: 'keen_senses', name: 'Keen Senses', cat: 'genetic', group: 'senses', level: 1, stats: { int: 2, cmd: 1 }, defense: 0.1, good: true, mutation: 3, desc: 'Sees in the dark, hears a whisper across the hall.' },
  { id: 'bioluminescent', name: 'Bioluminescent', cat: 'genetic', group: 'glow', level: 1, stats: { dip: 2 }, prestigeYr: 1, good: true, mutation: 1.5, desc: 'Skin glows with soft light. Unforgettable at a gala.' },
  { id: 'xenoblood', name: 'Xenoblood', cat: 'genetic', group: 'xeno', level: 1, health: 10, good: true, mutation: 1, desc: 'Strange alien-touched blood. Immune to plagues.' },
  { id: 'gene_rot', name: 'Gene-Rot', cat: 'genetic', group: 'generot', level: -1, health: -25, life: -15, good: false, mutation: 2, desc: 'Degenerating genome. Purge it from your bloodline.' },
  { id: 'brittle_bones', name: 'Brittle Bones', cat: 'genetic', group: 'bones', level: -1, health: -10, stats: { cmd: -2 }, good: false, mutation: 3, desc: 'Bones snap like glass.' },
  { id: 'lunatic', name: 'Lunatic', cat: 'genetic', group: 'mind', level: -1, stats: { dip: -3, int: 1 }, good: false, mutation: 1.5, desc: 'Talks to the stars. Sometimes the stars answer.' },
  { id: 'twisted_limb', name: 'Twisted Limb', cat: 'genetic', group: 'limb', level: -1, stats: { cmd: -3, dip: -1 }, good: false, mutation: 2, desc: 'A malformed limb from birth.' },

  // ── Personality pairs
  { id: 'brave', name: 'Brave', cat: 'personality', opposite: 'craven', stats: { cmd: 2 }, fleetPct: 0.05, good: true, desc: 'First onto the boarding ramp.' },
  { id: 'craven', name: 'Craven', cat: 'personality', opposite: 'brave', stats: { cmd: -2, int: 1 }, defense: 0.05, good: false, desc: 'Hides behind the blast doors.' },
  { id: 'calm', name: 'Calm', cat: 'personality', opposite: 'wrathful', stats: { dip: 1, int: 1 }, good: true, desc: 'Unflappable under fire.' },
  { id: 'wrathful', name: 'Wrathful', cat: 'personality', opposite: 'calm', stats: { cmd: 3, dip: -1, int: -1 }, good: null, desc: 'Explosive temper. Useful in a war, awful at dinner.' },
  { id: 'chaste', name: 'Chaste', cat: 'personality', opposite: 'lustful', stats: { sci: 1 }, fertility: -0.25, good: null, desc: 'Above the pleasures of the flesh.' },
  { id: 'lustful', name: 'Lustful', cat: 'personality', opposite: 'chaste', stats: { int: 1 }, fertility: 0.25, good: null, desc: 'Ruled by desire. Lots of children, some of them official.' },
  { id: 'content', name: 'Content', cat: 'personality', opposite: 'ambitious', stats: { eco: 1 }, faithYr: 1, good: null, desc: 'Happy with their lot.' },
  { id: 'ambitious', name: 'Ambitious', cat: 'personality', opposite: 'content', all: 1, prestigeYr: 2, good: true, desc: 'Wants the whole solar system. Might get it.' },
  { id: 'diligent', name: 'Diligent', cat: 'personality', opposite: 'lazy', stats: { eco: 2, sci: 1 }, creditsPct: 0.05, good: true, desc: 'Works the late shift, every shift.' },
  { id: 'lazy', name: 'Lazy', cat: 'personality', opposite: 'diligent', all: -1, good: false, desc: 'Delegates even breathing.' },
  { id: 'generous', name: 'Generous', cat: 'personality', opposite: 'greedy', stats: { dip: 3 }, creditsPct: -0.05, good: true, desc: 'Gives freely. Loved for it.' },
  { id: 'greedy', name: 'Greedy', cat: 'personality', opposite: 'generous', stats: { eco: 1, dip: -2 }, creditsPct: 0.1, good: null, desc: 'Counts every credit twice.' },
  { id: 'gregarious', name: 'Gregarious', cat: 'personality', opposite: 'shy', stats: { dip: 2 }, good: true, desc: 'Life of every gala.' },
  { id: 'shy', name: 'Shy', cat: 'personality', opposite: 'gregarious', stats: { dip: -2, sci: 1 }, good: false, desc: 'Prefers the observatory to the ballroom.' },
  { id: 'honest', name: 'Honest', cat: 'personality', opposite: 'deceitful', stats: { dip: 2, int: -2 }, good: null, desc: 'Cannot tell a lie. Terrible at poker.' },
  { id: 'deceitful', name: 'Deceitful', cat: 'personality', opposite: 'honest', stats: { int: 3, dip: -1 }, scheme: 0.1, good: null, desc: 'Lies as easily as breathing.' },
  { id: 'humble', name: 'Humble', cat: 'personality', opposite: 'arrogant', faithYr: 2, stats: { dip: 1 }, good: true, desc: 'Never forgets where they came from.' },
  { id: 'arrogant', name: 'Arrogant', cat: 'personality', opposite: 'humble', prestigeYr: 3, stats: { dip: -1 }, good: null, desc: 'Knows they are the best. Tells everyone.' },
  { id: 'just', name: 'Just', cat: 'personality', opposite: 'arbitrary', stats: { eco: 2, dip: 1 }, good: true, desc: 'Fair in judgement. Vassals respect it.' },
  { id: 'arbitrary', name: 'Arbitrary', cat: 'personality', opposite: 'just', stats: { int: 2, eco: -1 }, good: false, desc: 'Rules on a whim.' },
  { id: 'kind', name: 'Kind', cat: 'personality', opposite: 'cruel', stats: { dip: 2, int: -1 }, good: true, desc: 'Warm-hearted, sometimes to a fault.' },
  { id: 'cruel', name: 'Cruel', cat: 'personality', opposite: 'kind', stats: { int: 2, cmd: 1, dip: -2 }, good: null, desc: 'Enjoys the suffering of others. Feared.' },
  { id: 'patient', name: 'Patient', cat: 'personality', opposite: 'impatient', stats: { sci: 2 }, good: true, desc: 'Plays the long game.' },
  { id: 'impatient', name: 'Impatient', cat: 'personality', opposite: 'patient', stats: { cmd: 1, sci: -1 }, good: false, desc: 'Wants it done yesterday.' },
  { id: 'trusting', name: 'Trusting', cat: 'personality', opposite: 'paranoid', stats: { dip: 2 }, defense: -0.1, good: null, desc: 'Sees the best in people. Easy to stab in the back.' },
  { id: 'paranoid', name: 'Paranoid', cat: 'personality', opposite: 'trusting', stats: { int: 2, dip: -1 }, defense: 0.2, good: null, desc: 'Sleeps with a blaster under the pillow.' },
  { id: 'zealous', name: 'Zealous', cat: 'personality', opposite: 'cynical', faithYr: 4, stats: { sci: -1 }, good: null, desc: 'Burns with faith.' },
  { id: 'cynical', name: 'Cynical', cat: 'personality', opposite: 'zealous', stats: { int: 2, sci: 1 }, faithYr: -2, good: null, desc: 'Believes in nothing but credits.' },

  // ── Acquired (life happens)
  { id: 'scarred', name: 'Scarred', cat: 'acquired', stats: { cmd: 1, dip: -1 }, good: null, desc: 'A battle scar across the face. Tells a story.' },
  { id: 'wounded', name: 'Wounded', cat: 'acquired', health: -20, temp: true, good: false, desc: 'Badly hurt. Will heal with time, or not.' },
  { id: 'ill', name: 'Ill', cat: 'acquired', health: -25, temp: true, good: false, desc: 'Sick with some space bug. Could pass, could kill.' },
  { id: 'maimed', name: 'Maimed', cat: 'acquired', stats: { cmd: -3 }, health: -10, good: false, desc: 'Lost a limb. A bionic arm would fix that.' },
  { id: 'stim_addict', name: 'Stim-Addict', cat: 'acquired', stats: { int: 1, dip: -1 }, health: -10, good: false, desc: 'Hooked on combat stims.' },
  { id: 'depressed', name: 'Melancholic', cat: 'acquired', all: -1, health: -5, good: false, desc: 'A heavy cloud hangs over them.' },
  { id: 'beast_slayer', name: 'Beast-Slayer', cat: 'acquired', stats: { cmd: 2 }, prestigeYr: 2, good: true, desc: 'Killed a xeno-beast with their own hands.' },
  { id: 'pilgrim', name: 'Pilgrim', cat: 'acquired', faithYr: 3, stats: { dip: 1 }, good: true, desc: 'Walked the dead-star shrines.' },
  { id: 'war_hero', name: 'War Hero', cat: 'acquired', stats: { cmd: 2 }, prestigeYr: 3, good: true, desc: 'Won glory leading the fleet in person.' },
  { id: 'tyrant', name: 'Tyrant', cat: 'acquired', stats: { int: 2, dip: -3 }, good: false, desc: 'Executions have made them feared and hated.' },
  { id: 'kinslayer', name: 'Kinslayer', cat: 'acquired', stats: { dip: -3 }, faithYr: -3, good: false, desc: 'Spilled family blood. Nobody forgets.' },
  { id: 'blessed', name: 'Blessed', cat: 'acquired', faithYr: 3, health: 5, good: true, desc: 'Touched by the divine, or so the priests say.' },
  { id: 'vatborn', name: 'Vat-Born', cat: 'acquired', stats: { sci: 1, dip: -1 }, good: null, desc: 'Grown in a Gene-Forge vat, not born. Some find it unsettling.' },
  { id: 'clone', name: 'Clone', cat: 'acquired', stats: { dip: -2 }, good: null, desc: 'A genetic copy of someone else. People stare.' },
  { id: 'duelist', name: 'Duelist', cat: 'acquired', stats: { cmd: 2 }, prestigeYr: 1, good: true, desc: 'Undefeated with a plasma saber.' },

  // ── Cybernetics (bought, never inherited)
  { id: 'neural_lace', name: 'Neural Lace', cat: 'cyber', stats: { sci: 3, int: 1 }, good: true, desc: 'A mesh of nanowire woven through the brain.' },
  { id: 'optic_implant', name: 'Optic Implant', cat: 'cyber', stats: { int: 2, cmd: 1 }, good: true, desc: 'A glowing cyber-eye with targeting overlay.' },
  { id: 'bionic_arm', name: 'Bionic Arm', cat: 'cyber', stats: { cmd: 2 }, good: true, desc: 'Servo-powered arm. Cancels out Maimed.' },
  { id: 'silver_tongue', name: 'Vox Modulator', cat: 'cyber', stats: { dip: 3 }, good: true, desc: 'Throat implant that makes every word sound reasonable.' },
  { id: 'ledger_cortex', name: 'Ledger Cortex', cat: 'cyber', stats: { eco: 3 }, good: true, desc: 'Co-processor that does the accounts while they sleep.' },
  { id: 'nano_immune', name: 'Nano-Immune', cat: 'cyber', health: 15, good: true, desc: 'Blood full of medical nanites. Cures illness.' },
  { id: 'cardio_core', name: 'Cardio-Core', cat: 'cyber', life: 8, health: 5, good: true, desc: 'A fusion-powered heart. Adds years.' },
  { id: 'full_conversion', name: 'Full Conversion', cat: 'cyber', all: 2, life: 15, fertility: -0.6, stats: { dip: -2 }, good: null, desc: 'More machine than person now. Long life, few heirs.' },
];

export const EDU_NAMES: Record<StatKey, string[]> = {
  dip: ['Junior Envoy', 'Consul', 'Ambassador', 'Grand Orator'],
  cmd: ['Ensign', 'Captain', 'Commodore', 'Grand Admiral'],
  eco: ['Clerk', 'Quartermaster', 'Magnate', 'Grand Treasurer'],
  int: ['Informant', 'Operative', 'Spymaster', 'Shadow-Master'],
  sci: ['Student', 'Researcher', 'Professor', 'Polymath'],
};

for (const focus of Object.keys(EDU_NAMES) as StatKey[]) {
  EDU_NAMES[focus].forEach((name, i) => {
    T.push({
      id: `edu_${focus}_${i + 1}`,
      name,
      cat: 'education',
      group: 'education',
      level: i + 1,
      stats: { [focus]: 2 + i * 2 },
      all: i === 3 ? 1 : 0,
      good: i > 0 ? true : null,
      desc: `Education tier ${i + 1} of 4.`,
    });
  });
}

export const TRAITS: Record<string, TraitDef> = Object.fromEntries(T.map((t) => [t.id, t]));
export const TRAIT_LIST = T;

export function trait(id: string): TraitDef | undefined {
  return TRAITS[id];
}

export function isHeritable(id: string): boolean {
  const t = TRAITS[id];
  return !!t && (t.cat === 'genetic' || t.cat === 'personality');
}

export const PERSONALITY = T.filter((t) => t.cat === 'personality');
export const GENETIC = T.filter((t) => t.cat === 'genetic');

export const STAT_NAMES: Record<StatKey, string> = {
  dip: 'Diplomacy',
  cmd: 'Command',
  eco: 'Economy',
  int: 'Intrigue',
  sci: 'Science',
};

export const STAT_HELP: Record<StatKey, string> = {
  dip: 'Diplomacy: makes clans like you, helps marriages, alliances and peace deals, and keeps vassals loyal.',
  cmd: 'Command: each point adds 4% to your fleet strength in battle.',
  eco: 'Economy: each point adds 3% to your credit income from regions.',
  int: 'Intrigue: boosts your scheme success and protects you from enemy plots.',
  sci: 'Science: helps heirs learn faster, augments go smoother, and you resist plagues.',
};

/** Short one-line effect summary, used in tooltips. */
export function traitEffectText(t: TraitDef): string {
  const parts: string[] = [];
  if (t.all) parts.push(`${t.all > 0 ? '+' : ''}${t.all} all stats`);
  if (t.stats) {
    for (const [k, v] of Object.entries(t.stats)) {
      if (v) parts.push(`${v > 0 ? '+' : ''}${v} ${STAT_NAMES[k as StatKey]}`);
    }
  }
  if (t.health) parts.push(`${t.health > 0 ? '+' : ''}${t.health} health`);
  if (t.life) parts.push(`${t.life > 0 ? '+' : ''}${t.life} yrs lifespan`);
  if (t.fertility) parts.push(t.fertility <= -1 ? 'infertile' : `${t.fertility > 0 ? '+' : ''}${Math.round(t.fertility * 100)}% fertility`);
  if (t.fleetPct) parts.push(`+${Math.round(t.fleetPct * 100)}% fleet strength`);
  if (t.prestigeYr) parts.push(`${t.prestigeYr > 0 ? '+' : ''}${t.prestigeYr} prestige/cycle`);
  if (t.faithYr) parts.push(`${t.faithYr > 0 ? '+' : ''}${t.faithYr} faith/cycle`);
  if (t.creditsPct) parts.push(`${t.creditsPct > 0 ? '+' : ''}${Math.round(t.creditsPct * 100)}% income`);
  if (t.scheme) parts.push(`+${Math.round(t.scheme * 100)}% scheme success`);
  if (t.defense) parts.push(`${t.defense > 0 ? '+' : ''}${Math.round(t.defense * 100)}% plot defence`);
  return parts.join(', ') || 'No direct stat effect';
}

/** Traits in the same group (or opposite pairs) can't coexist. */
export function conflicts(a: string, b: string): boolean {
  if (a === b) return true;
  const ta = TRAITS[a];
  const tb = TRAITS[b];
  if (!ta || !tb) return false;
  if (ta.opposite === b || tb.opposite === a) return true;
  if (ta.group && ta.group === tb.group) return true;
  return false;
}

/** Add a trait, replacing anything it conflicts with. */
export function addTrait(traits: string[], id: string): string[] {
  return [...traits.filter((t) => !conflicts(t, id)), id];
}
