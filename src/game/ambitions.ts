// One coronation vow per person. Progress records their own deeds after choosing.
import { ageOf, alive, ch, clanRegions, fullName, log, notice } from './core';
import { addTrait } from './traits';
import type { Character, GameState, AmbitionKind } from './types';

export const AMBITIONS: Record<AmbitionKind, { name: string; text: string; target: number; reward: number }> = {
  dynasty: { name: 'A flourishing family', text: 'Parent three more children.', target: 3, reward: 100 },
  builder: { name: 'Leave a better realm', text: 'Build eight development levels.', target: 8, reward: 100 },
  warhero: { name: 'Prove yourself in battle', text: 'Win three battles.', target: 3, reward: 120 },
  scholar: { name: 'Master the archives', text: 'Complete six archive studies.', target: 6, reward: 80 },
  geneticist: { name: 'Rewrite the bloodline', text: 'Research two genes.', target: 2, reward: 120 },
  patron: { name: 'Be remembered for kindness', text: 'Donate 300 credits to charity.', target: 300, reward: 100 },
  prosperous: { name: 'Build a lasting fortune', text: 'Earn 1,200 credits from governing.', target: 1200, reward: 80 },
  peacemaker: { name: 'Give your people peace', text: 'Rule for eight consecutive peaceful cycles.', target: 8, reward: 100 },
  conqueror: { name: 'Expand the inheritance', text: 'Conquer two more regions.', target: 2, reward: 120 },
};
function metric(c: Character, kind: AmbitionKind): number {
  if (kind === 'dynasty') return c.childrenIds.length;
  const deed = {
    builder: 'development',
    warhero: 'battlesWon',
    scholar: 'studies',
    geneticist: 'research',
    patron: 'charity',
    prosperous: 'income',
    conqueror: 'regionsTaken',
  } as const;
  return kind === 'peacemaker' ? 0 : (c.reputation?.deeds[deed[kind]] ?? 0);
}
/** Three stable choices; reading them never advances the seed or creates records. */
export function ambitionChoices(s: GameState, c = s.characters[s.rulerId]): AmbitionKind[] {
  if (!alive(c) || ageOf(s, c) < 16 || c.ambition || s.clans[c.clanId]?.headId !== c.id) return [];
  const weights: Record<AmbitionKind, number> = {
    dynasty: 6,
    builder: 5,
    warhero: 2,
    scholar: 2,
    geneticist: 1,
    patron: 1,
    prosperous: 4,
    peacemaker: 3,
    conqueror: 2,
  };
  const boost = (kind: AmbitionKind, traits: string[]) => {
    weights[kind] += traits.filter((t) => c.traits.includes(t)).length * 6;
  };
  boost('dynasty', ['lustful', 'gregarious']);
  boost('builder', ['diligent', 'patient']);
  boost('warhero', ['brave', 'wrathful']);
  boost('scholar', ['shy', 'humble']);
  boost('geneticist', ['ambitious']);
  boost('patron', ['generous', 'kind']);
  boost('prosperous', ['greedy']);
  boost('peacemaker', ['calm', 'content', 'craven']);
  boost('conqueror', ['ambitious', 'wrathful']);
  if (c.childrenIds.length >= 3) weights.dynasty -= 4;
  const forge = c.clanId === s.playerClanId ? s.forge : s.clans[c.clanId]?.genetics?.forge;
  if (forge?.level) weights.geneticist += 6;
  if (clanRegions(s, c.clanId).every((r) => r.dev >= 10)) weights.builder = -1;
  // AI heads choose goals their actual yearly actions can advance.
  if (c.clanId !== s.playerClanId) {
    weights.builder = -1;
    weights.scholar = -1;
    weights.patron = -1;
  }
  return (Object.keys(weights) as AmbitionKind[]).sort((a, b) => weights[b] - weights[a] || a.localeCompare(b)).slice(0, 3);
}
export function chooseAmbition(s: GameState, kind: AmbitionKind, id = s.rulerId): boolean {
  const c = ch(s, id);
  if (s.gameOver || !alive(c) || c.prisonerOf || !ambitionChoices(s, c).includes(kind)) return false;
  c.ambition = { kind, year: s.year, baseline: metric(c, kind), progress: 0, status: 'active', lastYear: s.year };
  log(s, `${fullName(s, c)} vows to ${AMBITIONS[kind].text.toLowerCase()}`, c.clanId === s.playerClanId ? 'info' : 'news');
  return true;
}
export function ambitionProgress(c: Character): number {
  const a = c.ambition;
  return !a ? 0 : a.status !== 'active' || a.kind === 'peacemaker' ? a.progress : Math.max(0, metric(c, a.kind) - a.baseline);
}
function atWar(s: GameState, clanId: string): boolean {
  return (
    s.wars.some((w) => clanId === s.playerClanId || w.enemy === clanId) ||
    s.aiWars.some((w) => w.attacker === clanId || w.defender === clanId) ||
    s.successionCrises.some((c) => c.clanId === clanId)
  );
}
export function observeAmbition(s: GameState, c: Character): void {
  const a = c.ambition;
  if (!a || a.status !== 'active') return;
  a.progress = ambitionProgress(c);
  const def = AMBITIONS[a.kind];
  if (a.progress < def.target) return;
  a.status = 'fulfilled';
  a.ended = s.year;
  c.traits = addTrait(c.traits, 'fulfilled');
  if (c.clanId === s.playerClanId) {
    s.prestige += def.reward;
    notice(s, 'A promise kept', `${c.name} fulfilled their ambition: ${def.name}. +${def.reward} prestige and the permanent Fulfilled trait (+1 Diplomacy).`, {
      icon: 'crown',
      tone: 'good',
      portraitId: c.id,
    });
  } else if (s.clans[c.clanId]) s.clans[c.clanId].prestige += def.reward;
  log(s, `${fullName(s, c)} fulfilled their coronation vow: ${def.name}.`, c.clanId === s.playerClanId ? 'good' : 'news');
}
/** Death, retirement and deposition close a vow; another ruler cannot finish it. */
export function finishAmbition(s: GameState, c: Character): void {
  observeAmbition(s, c);
  if (c.ambition?.status === 'active') {
    c.ambition.status = 'failed';
    c.ambition.ended = s.year;
  }
}
export function ambitionsTick(s: GameState): void {
  for (const clan of Object.values(s.clans)) {
    const c = ch(s, clan.headId);
    if (!alive(c)) continue;
    if (clan.id !== s.playerClanId && !c.ambition) {
      const choice = ambitionChoices(s, c)[0];
      if (choice) chooseAmbition(s, choice, c.id);
    }
    const a = c.ambition;
    if (a?.status === 'active' && a.kind === 'peacemaker' && a.lastYear < s.year) {
      // A chosen vow does not count peaceful years that came before it.
      a.progress = atWar(s, clan.id) ? 0 : a.progress + 1;
    }
    if (a) a.lastYear = s.year;
    observeAmbition(s, c);
  }
}
