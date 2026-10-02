// Once-a-cycle activities: galas, hunts, pilgrimages and the rest.

import { ageOf, alive, clanRank, effStats, fullName, hasTrait, log, newId, notice, playerClan, ruler, setCooldown, cooldownReady } from './core';
import { canAfford, pay, type Cost } from './genetics';
import { makeItem } from './items';
import { killCharacter } from './life';
import { chance, int, pick } from './rng';
import { addTrait } from './traits';
import type { GameState } from './types';

export type ActivityKind = 'gala' | 'hunt' | 'pilgrimage' | 'arena' | 'study' | 'retreat' | 'donate' | 'carouse';

export interface ActivityDef {
  name: string;
  desc: string;
  icon: string;
  cooldown: number;
  cost: (s: GameState) => Cost;
}

export const ACTIVITIES: Record<ActivityKind, ActivityDef> = {
  gala: {
    name: 'Host a Gala',
    desc: 'Throw a glittering orbital ball. Gains prestige and every clan on your world likes you more. Things can happen at parties.',
    icon: 'gala',
    cooldown: 1,
    cost: (s) => ({ credits: 100 + clanRank(s, s.playerClanId) * 50 }),
  },
  hunt: {
    name: 'Xeno-Beast Hunt',
    desc: 'Track a monster through the jungles of a terraformed moon. Prestige, trophies, and a real chance of getting mauled.',
    icon: 'hunt',
    cooldown: 1,
    cost: () => ({ credits: 50 }),
  },
  pilgrimage: {
    name: 'Pilgrimage',
    desc: 'Travel to a holy relic-world. A big boost to faith and maybe a blessing. Takes you away for a while.',
    icon: 'faith',
    cooldown: 3,
    cost: () => ({ credits: 120 }),
  },
  arena: {
    name: 'Arena Duel',
    desc: 'Fight in the Olympus Arena with plasma sabers. Command decides who walks away.',
    icon: 'duel',
    cooldown: 1,
    cost: () => ({ credits: 40 }),
  },
  study: {
    name: 'Study at the Grand Archive',
    desc: 'Lock yourself in the Saturnine archives. Improves a random skill.',
    icon: 'study',
    cooldown: 2,
    cost: () => ({ credits: 80 }),
  },
  retreat: {
    name: 'Cryo-Spa Retreat',
    desc: 'Rest in a luxury med-spa. Restores health and might cure bad habits.',
    icon: 'health',
    cooldown: 2,
    cost: () => ({ credits: 90 }),
  },
  donate: {
    name: 'Donate to the Temple',
    desc: 'Fund the priests of your faith. Converts credits into faith.',
    icon: 'faith',
    cooldown: 1,
    cost: () => ({ credits: 100 }),
  },
  carouse: {
    name: 'Carouse in the Undercity',
    desc: 'A night of stims and dancing in the station undercity. Might find a lover, might find trouble.',
    icon: 'carouse',
    cooldown: 1,
    cost: () => ({ credits: 30 }),
  },
};

const SHRINES = ['the Dead Star Shrine of Vulcanoid', 'the Olympus Basilica', 'the Europan Abyss', 'the Machine-Saint\'s Tomb on Titan', 'the Far Dark Obelisk of Charon', 'the First Landing Site on Luna'];

export function activityBlocker(s: GameState, kind: ActivityKind): string | null {
  if (ageOf(s, ruler(s)) < 16) return 'Regency: the council forbids it.';
  if (!cooldownReady(s, `act:${kind}`)) return `Available again in ${s.cooldowns[`act:${kind}`] - s.year} cycle(s).`;
  if (!canAfford(s, ACTIVITIES[kind].cost(s))) return 'Not enough credits.';
  return null;
}

export function doActivity(s: GameState, kind: ActivityKind): void {
  if (activityBlocker(s, kind)) return;
  const def = ACTIVITIES[kind];
  pay(s, def.cost(s));
  setCooldown(s, `act:${kind}`, def.cooldown);
  const r = ruler(s);
  const st = effStats(s, r);
  let title = def.name;
  let text = '';
  let tone: 'good' | 'bad' | 'neutral' = 'good';

  switch (kind) {
    case 'gala': {
      const pr = int(s, 15, 30) + st.dip;
      s.prestige += pr;
      const home = playerClan(s).planetId;
      for (const c of Object.values(s.clans)) if (c.planetId === home && !c.isPlayer) c.opinion = Math.min(100, c.opinion + 8);
      text = `The gala dazzles the court. +${pr} prestige, and every clan on your world warms to you.`;
      const roll = int(s, 0, 9);
      if (roll === 0) {
        r.health -= 15;
        text += ' Someone slipped toxin into your wine. You survive, but barely.';
        tone = 'bad';
      } else if (roll === 1 && !r.loverId) {
        const guests = Object.values(s.characters).filter((c) => alive(c) && c.gender !== r.gender && ageOf(s, c) >= 18 && ageOf(s, c) < 50 && c.clanId !== s.playerClanId && !c.spouseId);
        if (guests.length) {
          const g = pick(s, guests);
          r.loverId = g.id;
          text += ` You spent the night dancing with ${fullName(s, g)}. They are now your lover.`;
        }
      } else if (roll === 2) {
        s.prestige += 20;
        text += ' A famous holo-bard composed a song in your honour. +20 prestige.';
      }
      break;
    }
    case 'hunt': {
      const win = chance(s, 0.45 + st.cmd * 0.03);
      if (win) {
        const pr = int(s, 15, 30);
        s.prestige += pr;
        text = `You brought down a Ganymede thunder-wyrm. +${pr} prestige.`;
        if (!hasTrait(r, 'beast_slayer') && chance(s, 0.3)) {
          r.traits = addTrait(r.traits, 'beast_slayer');
          text += ' The court now calls you Beast-Slayer.';
        }
        if (chance(s, 0.08)) {
          const item = makeItem(s, newId(s, 'i'), { slot: 'relic', origin: 'Hunting trophy' });
          s.items.push(item);
          text += ` You keep a trophy: ${item.name}.`;
        }
      } else {
        text = 'The beast got away. Nobody mentions it at dinner.';
        tone = 'neutral';
      }
      if (chance(s, 0.12)) {
        if (chance(s, 0.06)) {
          killCharacter(s, r.id, 'mauled by a xeno-beast');
          text = 'The beast turned on the hunting party. Your ruler did not come back.';
          tone = 'bad';
          break;
        }
        if (chance(s, 0.2)) {
          r.traits = addTrait(r.traits, 'maimed');
          text += ' You lost an arm to its jaws.';
        } else {
          r.traits = addTrait(r.traits, 'wounded');
          text += ' You were badly gored.';
        }
        tone = 'bad';
      }
      break;
    }
    case 'pilgrimage': {
      const shrine = pick(s, SHRINES);
      const f = int(s, 60, 120);
      s.faith += f;
      text = `You walked the halls of ${shrine}. +${f} faith.`;
      if (!hasTrait(r, 'pilgrim') && chance(s, 0.4)) {
        r.traits = addTrait(r.traits, 'pilgrim');
        text += ' You return a true Pilgrim.';
      }
      if (chance(s, 0.07)) {
        r.traits = addTrait(r.traits, 'blessed');
        text += ' A vision struck you at the altar. You are Blessed.';
      }
      if (chance(s, 0.1)) {
        r.traits = addTrait(r.traits, 'ill');
        text += ' Sadly you caught a nasty bug on the transport.';
        tone = 'bad';
      }
      break;
    }
    case 'arena': {
      const oppPower = int(s, 3, 14);
      const win = st.cmd + int(s, 0, 8) >= oppPower + int(s, 0, 6);
      if (win) {
        s.prestige += 30;
        text = 'Your saber found the gap in their guard. The crowd roars. +30 prestige.';
        if (!hasTrait(r, 'duelist') && chance(s, 0.25)) {
          r.traits = addTrait(r.traits, 'duelist');
          text += ' You are now a famed Duelist.';
        }
      } else {
        s.prestige -= 10;
        text = 'You were disarmed in front of thousands. -10 prestige.';
        tone = 'bad';
        if (chance(s, 0.3)) {
          r.traits = addTrait(r.traits, chance(s, 0.5) ? 'scarred' : 'wounded');
          text += ' And it left a mark.';
        }
      }
      break;
    }
    case 'study': {
      const k = pick(s, ['dip', 'cmd', 'eco', 'int', 'sci'] as const);
      r.base[k] += 1;
      text = `Months among the archives sharpened your mind. +1 ${({ dip: 'Diplomacy', cmd: 'Command', eco: 'Economy', int: 'Intrigue', sci: 'Science' })[k]}.`;
      if (chance(s, 0.2)) {
        r.base.sci += 1;
        text += ' You also picked up some proper science. +1 Science.';
      }
      break;
    }
    case 'retreat': {
      r.health += 25;
      text = 'Nano-baths and zero-g massage. You feel decades younger. +25 health.';
      for (const bad of ['stim_addict', 'depressed']) {
        if (hasTrait(r, bad) && chance(s, 0.5)) {
          r.traits = r.traits.filter((t) => t !== bad);
          text += ' You kicked a bad habit while you were at it.';
        }
      }
      break;
    }
    case 'donate': {
      const f = int(s, 35, 55) + (hasTrait(r, 'zealous') ? 15 : 0);
      s.faith += f;
      text = `The priests sing your name. +${f} faith.`;
      break;
    }
    case 'carouse': {
      const roll = int(s, 0, 5);
      if (roll <= 1 && !r.loverId) {
        const pool = Object.values(s.characters).filter((c) => alive(c) && c.gender !== r.gender && ageOf(s, c) >= 18 && ageOf(s, c) < 45 && c.clanId !== s.playerClanId);
        if (pool.length) {
          const g = pick(s, pool);
          r.loverId = g.id;
          text = `You woke up next to ${fullName(s, g)}. Looks like you have a lover.`;
          break;
        }
      }
      if (roll === 2) {
        r.traits = addTrait(r.traits, 'stim_addict');
        text = 'One stim became twenty. You are hooked.';
        tone = 'bad';
      } else if (roll === 3) {
        s.prestige -= 15;
        text = 'Holo-footage of you dancing on a bar is everywhere. -15 prestige.';
        tone = 'bad';
      } else {
        s.prestige += 5;
        r.health += 5;
        text = 'A cracking night out. You feel great.';
      }
      break;
    }
  }
  log(s, `${def.name}: ${text}`, tone === 'bad' ? 'bad' : 'good');
  notice(s, title, text, { icon: def.icon, tone, portraitId: s.rulerId });
}
