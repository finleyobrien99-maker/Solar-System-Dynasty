// Rival houses use the standard vault/Forge actions, paid from their own treasury.
// One decision per eight cycles, staggered by house. Ongoing research pays every year.
import { ageOf, alive, ch, clanRegions, isBloodlineClan, log } from './core';
import { faithLines, sum } from './economy';
import {
  buildForge,
  buildVats,
  cloneCharacter,
  forgeTick,
  FORGE_STANCE,
  growVatHeir,
  RESEARCH_UPKEEP,
  splice,
  spliceBlocker,
  startResearch,
  vatHeirBlocker,
} from './forge';
import { buySlot, lockBlocker, lockTrait, MAX_SLOTS, purgeBlocker, purgeTrait } from './genetics';
import { newHouseGenetics } from './houseGenetics';
import { createViceroy, viceroyBlocker } from './realm';
import { addFeeling } from './relations';
import { hashString } from './rng';
import { conflicts, GENETIC, TRAITS } from './traits';
import type { Character, Clan, GameState } from './types';

export const AI_DYNASTY_INTERVAL = 8;

/**
 * A bounded actor view for the existing player actions. Only this house's kin
 * and the ruling heads are visible. No player VIP, relics, council, vault, money
 * or pop-ups can leak in. The write-back list below is deliberately explicit.
 */
export function runHouseGenetics(s: GameState, k: Clan, members: Character[], run: (view: GameState) => void): void {
  if (isBloodlineClan(s, k.id) || k.isPlayer || !alive(ch(s, k.headId))) return;
  const g = (k.genetics ??= newHouseGenetics());
  const characters: GameState['characters'] = {};
  for (const c of members) if (c.clanId === k.id) characters[c.id] = c;
  const clans: GameState['clans'] = {};
  for (const other of Object.values(s.clans)) {
    clans[other.id] = { ...other, isPlayer: other.id === k.id, titles: { ...other.titles }, memories: [] };
    const h = ch(s, other.headId);
    if (h) characters[h.id] = h;
  }
  const view: GameState = {
    ...s,
    playerClanId: k.id,
    rulerId: k.headId,
    characters,
    clans,
    credits: k.credits,
    prestige: k.prestige,
    fleet: k.fleet,
    faith: g.faith,
    dynasty: {
      locked: [...g.locked],
      purged: [...g.purged],
      slots: g.slots,
      law: 'primogeniture',
      genderLaw: 'equal',
      founderId: k.headId,
      rulers: [],
      growth: 'capped',
      autoMatch: false,
      gestationVats: g.forge.level === 2,
    },
    forge: { ...g.forge, researched: [...g.forge.researched], project: g.forge.project ? { ...g.forge.project } : undefined },
    vip: undefined,
    items: [],
    equipped: {},
    council: {},
    pending: [],
    log: [],
    stats: { ...s.stats },
    flags: { ...s.flags },
    cooldowns: { ...s.cooldowns },
  };
  run(view);
  s.seed = view.seed;
  s.nextId = view.nextId;
  k.credits = view.credits;
  k.prestige = view.prestige;
  k.titles = view.clans[k.id].titles;
  g.locked = view.dynasty.locked;
  g.purged = view.dynasty.purged;
  g.slots = view.dynasty.slots;
  g.faith = view.faith;
  g.forge = view.forge;
  for (const c of Object.values(view.characters)) if (c.clanId === k.id) s.characters[c.id] = c;
  // House memories describe feelings towards the PLAYER. A rival's heresy must
  // instead anger the actual condemning ruler towards that rival, including us.
  for (const other of Object.values(view.clans)) {
    const h = ch(s, other.headId);
    if (!alive(h) || other.id === k.id) continue;
    for (const m of other.memories ?? []) addFeeling(s, h.id, k.headId, { why: m.text, value: m.value, decay: 1, key: 'forge:' + k.id + ':' + m.text });
  }
  for (const entry of view.log) log(s, 'House ' + k.name + ': ' + entry.t, 'news');
}

function betterLock(view: GameState, id: string): boolean {
  return !view.dynasty.locked.some((x) => conflicts(x, id) && (TRAITS[x]?.level ?? 0) >= (TRAITS[id]?.level ?? 0));
}

function geneValue(id: string, head: Character, heirless: boolean): number {
  const t = TRAITS[id];
  return (
    (t?.level ?? 1) * 3 +
    (t?.group === 'intellect' ? 6 : 0) +
    (t?.group === 'constitution' || t?.group === 'longevity' ? 4 : 0) +
    (t?.group === 'physique' && head.base.cmd > head.base.sci ? 5 : 0) +
    (t?.group === 'fertility' && heirless ? 10 : 0)
  );
}

/** One real action, respecting the same blockers and prices as the player. */
export function aiDynastyDecision(view: GameState, members: Character[]): void {
  const head = view.characters[view.rulerId];
  if (!alive(head) || head.prisonerOf || ageOf(view, head) < 16) return;
  if (!viceroyBlocker(view)) {
    createViceroy(view);
    return;
  }
  const kin = members.filter((c) => c.clanId === view.playerClanId && alive(c));
  const children = head.childrenIds.map((id) => view.characters[id]).filter((c) => alive(c) && c.clanId === head.clanId && !c.marriedIn && !c.bastard);
  const heirless = !children.length;
  const needHeir = heirless && ageOf(view, head) >= 40;
  const stance = FORGE_STANCE[view.clans[view.playerClanId].faithId] ?? 'tolerate';
  const willing = stance !== 'condemn' || !head.traits.includes('zealous') || needHeir;
  const researched = view.forge.researched.slice().sort((a, b) => geneValue(b, head, heirless) - geneValue(a, head, heirless));
  if (needHeir && view.forge.level === 2) {
    const original = members.filter((c) => c.clanId === head.clanId && !c.cloneOf && c.id !== head.id).sort((a, b) => geneticValue(b) - geneticValue(a))[0];
    // Cloning is only worth the premium for an exceptional original, never a copy.
    if (original && geneticValue(original) >= 6 && cloneCharacter(view, original.id)) return;
    const genes: string[] = [];
    for (const id of researched) if (genes.length < 3 && !genes.some((x) => conflicts(x, id)) && !view.dynasty.purged.includes(id)) genes.push(id);
    if (!vatHeirBlocker(view, head.id, genes)) {
      growVatHeir(view, head.id, genes);
      return;
    }
  }
  const present = [...new Set(kin.flatMap((c) => c.traits))];
  const harmful = present.filter((id) => TRAITS[id]?.cat === 'genetic' && TRAITS[id].good === false && !view.dynasty.purged.includes(id));
  for (const id of harmful)
    if (!purgeBlocker(view, id)) {
      purgeTrait(view, id);
      return;
    }
  const desirable = [...new Set([...present, ...researched])]
    .filter((id) => TRAITS[id]?.cat === 'genetic' && TRAITS[id].good && betterLock(view, id))
    .sort((a, b) => geneValue(b, head, heirless) - geneValue(a, head, heirless));
  for (const id of desirable)
    if (!lockBlocker(view, id)) {
      lockTrait(view, id);
      return;
    }
  const full = view.dynasty.locked.length + view.dynasty.purged.length >= view.dynasty.slots;
  if (full && (harmful.length || desirable.length) && view.dynasty.slots < MAX_SLOTS && buySlot(view)) {
    log(view, 'Expanded the Gene Vault to ' + view.dynasty.slots + ' slots.');
    return;
  }
  if (!willing) return;
  if (needHeir && view.forge.level === 1 && buildVats(view)) return;
  if (!view.forge.level) {
    if ((head.base.sci >= 8 || head.traits.includes('ambitious') || stance === 'embrace' || needHeir) && buildForge(view)) return;
    return;
  }
  // Prefer the next generation; do not keep rewriting a declining old ruler.
  const targets = [...children, head].filter((c) => !c.prisonerOf && ageOf(view, c) < 55);
  for (const id of researched)
    for (const c of targets) {
      if (spliceBlocker(view, c, id)) continue;
      if (!splice(view, c.id, id)) log(view, c.name + ' rejected the ' + TRAITS[id].name + ' splice.');
      return;
    }
  if (!view.forge.project && view.credits >= RESEARCH_UPKEEP * 3) {
    const gene = GENETIC.filter((t) => t.good && !view.forge.researched.includes(t.id) && !view.dynasty.purged.includes(t.id) && betterLock(view, t.id)).sort(
      (a, b) => geneValue(b.id, head, heirless) - geneValue(a.id, head, heirless),
    )[0];
    if (gene && startResearch(view, gene.id)) log(view, 'Began sequencing ' + gene.name + ' (40 credits per cycle).');
  }
}

function geneticValue(c: Character): number {
  return c.traits.reduce((n, id) => n + (TRAITS[id]?.cat === 'genetic' ? (TRAITS[id].level ?? 0) : 0), 0);
}

export function aiDynastyTick(s: GameState): void {
  const active = Object.values(s.clans).filter((k) => !isBloodlineClan(s, k.id) && !k.isPlayer && alive(ch(s, k.headId)) && clanRegions(s, k.id).length);
  const due: Clan[] = [];
  for (const k of active) {
    const g = (k.genetics ??= newHouseGenetics());
    g.faith = Math.max(0, g.faith + sum(faithLines(s, k.id)));
    if (g.forge.project || (s.year - s.startYear + hashString(k.id)) % AI_DYNASTY_INTERVAL === 0) due.push(k);
  }
  if (!due.length) return;
  // One scan for every active programme, never a whole-dynasty scan per clan.
  const wanted = new Set(due.map((k) => k.id));
  const members = new Map<string, Character[]>();
  for (const id in s.characters) {
    const c = s.characters[id];
    if (wanted.has(c.clanId)) (members.get(c.clanId) ?? members.set(c.clanId, []).get(c.clanId)!).push(c);
  }
  for (const k of due)
    runHouseGenetics(s, k, members.get(k.id) ?? [], (view) => {
      if (view.forge.project) {
        if (view.credits >= RESEARCH_UPKEEP) {
          view.credits -= RESEARCH_UPKEEP;
          forgeTick(view);
        } else {
          view.forge.project = undefined;
          log(view, 'Research stopped: the treasury cannot cover 40 credits this cycle.');
        }
      }
      if ((s.year - s.startYear + hashString(k.id)) % AI_DYNASTY_INTERVAL === 0) aiDynastyDecision(view, members.get(k.id) ?? []);
    });
}
