// Random events. Each cycle one or two are drawn from this deck. Every choice
// shows a hint of what it costs, and the outcome is spelled out afterwards.

import { createCharacter } from './character';
import {
  ageOf,
  alive,
  ch,
  childrenOf,
  clanRegions,
  courtMembers,
  dynastyMembers,
  effStats,
  fullName,
  hasTrait,
  liegeOf,
  log,
  newId,
  playerClan,
  ruler,
  vassalsOf,
} from './core';
import { randomGoodGene } from './genetics';
import { makeItem } from './items';
import { currentHeir, killCharacter } from './life';
import { FAITHS } from './planets';
import { chance, int, pick, shuffle, weighted } from './rng';
import { addTrait, TRAITS } from './traits';
import type { Character, GameState, Pending } from './types';
import { arrestVassal } from './intrigue';
import { generateSuitors } from './family';

export interface EventCtx {
  s: GameState;
  r: Character;
  subject?: Character;
  data: Record<string, string | number>;
}

export interface EventChoice {
  label: string;
  hint?: string;
  available?: (c: EventCtx) => boolean;
  run: (c: EventCtx) => string;
}

export interface EventDef {
  id: string;
  title: string;
  icon: string;
  weight: number;
  cooldown?: number;
  when?: (s: GameState) => boolean;
  subject?: (s: GameState) => Character | undefined;
  setup?: (c: EventCtx) => void;
  text: (c: EventCtx) => string;
  choices: EventChoice[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function sicken(_s: GameState, c: Character): boolean {
  if (hasTrait(c, 'xenoblood') || hasTrait(c, 'nano_immune') || hasTrait(c, 'ironblood')) return false;
  c.traits = addTrait(c.traits, 'ill');
  return true;
}

function randomCourt(s: GameState): Character | undefined {
  const pool = courtMembers(s);
  return pool.length ? pick(s, pool) : undefined;
}

function rivalClan(s: GameState) {
  const pool = Object.values(s.clans).filter((c) => !c.isPlayer && clanRegions(s, c.id).length);
  if (!pool.length) return undefined;
  const sorted = pool.sort((a, b) => a.opinion - b.opinion);
  return chance(s, 0.6) ? sorted[int(s, 0, Math.min(4, sorted.length - 1))] : pick(s, pool);
}

function myRegion(s: GameState) {
  const regs = clanRegions(s, s.playerClanId);
  return regs.length ? pick(s, regs) : undefined;
}

function dynastyKids(s: GameState, lo: number, hi: number) {
  return dynastyMembers(s).filter((c) => {
    const a = ageOf(s, c);
    return a >= lo && a <= hi;
  });
}


// ── The deck ──────────────────────────────────────────────────────────────

export const EVENTS: EventDef[] = [
  {
    id: 'plague',
    title: 'The Red Lung',
    icon: 'plague',
    weight: 3,
    cooldown: 10,
    text: () => 'A cough is spreading through the docks. Doctors are calling it the Red Lung, a virus that came in on a cargo hauler. It moves fast.',
    choices: [
      {
        label: 'Seal the docks',
        hint: '-120 credits, keeps everyone safe',
        available: ({ s }) => s.credits >= 120,
        run: ({ s }) => {
          s.credits -= 120;
          return 'The quarantine holds. Trade suffers, but your court breathes easy.';
        },
      },
      {
        label: 'Pray for deliverance',
        hint: '-60 faith, probably fine',
        available: ({ s }) => s.faith >= 60,
        run: ({ s }) => {
          s.faith -= 60;
          if (chance(s, 0.6)) return 'The fever passes your house by. The priests are insufferable about it.';
          const v = randomCourt(s);
          if (v && sicken(s, v)) return `Prayer was not enough. ${v.name} has caught the Red Lung.`;
          return 'The fever brushes past. Lucky.';
        },
      },
      {
        label: 'Carry on as normal',
        hint: 'Risky',
        run: ({ s, r }) => {
          const reg = myRegion(s);
          if (reg && reg.dev > 1) reg.dev -= 1;
          if (chance(s, 0.5) && sicken(s, r)) return `The plague rips through ${reg?.name ?? 'your lands'}, and you have caught it yourself.`;
          const v = randomCourt(s);
          if (v && chance(s, 0.6) && sicken(s, v)) return `The plague rips through ${reg?.name ?? 'your lands'}. ${v.name} is sick.`;
          return `The plague burns through ${reg?.name ?? 'your lands'} (-1 development) but spares your family.`;
        },
      },
    ],
  },
  {
    id: 'comet',
    title: 'A Comet Blazes Past',
    icon: 'comet',
    weight: 2,
    text: () => 'A great comet with a tail of blue fire crosses your sky. The court argues: omen, opportunity, or just a big rock?',
    choices: [
      {
        label: 'Proclaim it a holy omen',
        hint: '+30 faith, +10 prestige',
        run: ({ s }) => {
          s.faith += 30;
          s.prestige += 10;
          return 'The faithful flock to the observation decks. +30 faith, +10 prestige.';
        },
      },
      {
        label: 'Send miners after it',
        hint: 'Credits, better with Science',
        run: ({ s, r }) => {
          const n = int(s, 60, 140) + effStats(s, r).sci * 12;
          s.credits += n;
          return `Your crews strip the comet of ice and metals. +${n} credits.`;
        },
      },
      { label: 'Ignore it', run: () => 'It is just a rock. It goes away.' },
    ],
  },
  {
    id: 'flare',
    title: 'Solar Flare',
    icon: 'sun',
    weight: 2,
    when: (s) => s.fleet > 10,
    text: () => 'Your astronomers scream warnings: a monstrous solar flare will hit your fleet within hours.',
    choices: [
      {
        label: 'Raise the shields',
        hint: '-90 credits',
        available: ({ s }) => s.credits >= 90,
        run: ({ s }) => {
          s.credits -= 90;
          return 'Shields hold. The fleet is safe, the power bill is not.';
        },
      },
      {
        label: 'Ride it out',
        hint: 'Lose some ships',
        run: ({ s }) => {
          const lost = Math.round(s.fleet * (0.08 + int(s, 0, 12) / 100));
          s.fleet -= lost;
          return `The flare fries ${lost} ships.`;
        },
      },
    ],
  },
  {
    id: 'pirates',
    title: 'Belt Pirates!',
    icon: 'war',
    weight: 3,
    setup: ({ s, data }) => {
      data.ships = int(s, 10, 30);
      data.ransom = int(s, 80, 180);
    },
    text: ({ data }) => `A pirate flotilla of ${data.ships} ships is raiding your shipping lanes. Their captain demands ${data.ransom} credits to leave.`,
    choices: [
      {
        label: 'Pay them off',
        hint: 'Lose the ransom',
        available: ({ s, data }) => s.credits >= Number(data.ransom),
        run: ({ s, data }) => {
          s.credits -= Number(data.ransom);
          return 'The pirates take their credits and vanish into the Belt. For now.';
        },
      },
      {
        label: 'Fight them',
        hint: 'Fleet battle',
        run: ({ s, r, data }) => {
          const mine = s.fleet * (1 + effStats(s, r).cmd * 0.04) * (0.75 + int(s, 0, 50) / 100);
          const theirs = Number(data.ships) * 1.3;
          if (mine > theirs) {
            const loot = int(s, 60, 160);
            s.credits += loot;
            s.prestige += 15;
            s.fleet -= int(s, 0, 3);
            return `Your fleet scatters the pirates. +${loot} credits in loot, +15 prestige.`;
          }
          const lost = Math.min(s.fleet, int(s, 4, 10));
          s.fleet -= lost;
          s.credits -= Math.min(Math.max(0, s.credits), Number(data.ransom));
          return `The pirates outfight you. You lose ${lost} ships and they loot your convoys anyway.`;
        },
      },
      {
        label: 'Hire them as privateers',
        hint: '-50 credits, needs Intrigue 8+',
        available: ({ s, r }) => effStats(s, r).int >= 8 && s.credits >= 50,
        run: ({ s, data }) => {
          s.credits -= 50;
          const n = Math.round(Number(data.ships) * 0.6);
          s.fleet += n;
          return `A quiet word and a fat purse. ${n} pirate ships now fly your colours.`;
        },
      },
    ],
  },
  {
    id: 'strike',
    title: 'Miners\' Strike',
    icon: 'eco',
    weight: 2,
    setup: ({ s, data }) => {
      data.region = myRegion(s)?.id ?? '';
    },
    when: (s) => clanRegions(s, s.playerClanId).length > 0,
    text: ({ s, data }) => `The miners of ${s.regions[String(data.region)]?.name ?? 'your lands'} have downed tools. They want better air rations and fewer cave-ins.`,
    choices: [
      {
        label: 'Meet their demands',
        hint: '-100 credits',
        available: ({ s }) => s.credits >= 100,
        run: ({ s }) => {
          s.credits -= 100;
          return 'The miners cheer your name. Production resumes.';
        },
      },
      {
        label: 'Negotiate',
        hint: 'Diplomacy check',
        run: ({ s, r, data }) => {
          if (chance(s, 0.3 + effStats(s, r).dip * 0.05)) {
            s.prestige += 10;
            return 'You talk them round with a fair deal. +10 prestige.';
          }
          const reg = s.regions[String(data.region)];
          if (reg && reg.dev > 1) reg.dev -= 1;
          return 'Talks collapse. The strike drags on and the region suffers (-1 development).';
        },
      },
      {
        label: 'Send in the marines',
        hint: 'Brutal but cheap',
        run: ({ s, r }) => {
          s.prestige -= 10;
          if (chance(s, 0.25)) r.traits = addTrait(r.traits, 'cruel');
          return 'The strike is broken with stun batons. Nobody will forget it. -10 prestige.';
        },
      },
    ],
  },
  {
    id: 'derelict',
    title: 'A Derelict Warship',
    icon: 'ship',
    weight: 2,
    text: () => 'Scouts find an ancient warship drifting in the dark, pre-Collapse design, lights still flickering inside.',
    choices: [
      {
        label: 'Salvage it for parts',
        hint: '+ships',
        run: ({ s }) => {
          const n = int(s, 5, 14);
          s.fleet += n;
          return `Your engineers rebuild ${n} ships from the wreck.`;
        },
      },
      {
        label: 'Explore inside',
        hint: 'Could be treasure. Could be a tomb.',
        run: ({ s, r }) => {
          if (chance(s, 0.55)) {
            const item = makeItem(s, newId(s, 'i'), { origin: 'Found on a derelict warship' });
            s.items.push(item);
            return `Deep inside you find the captain's quarters, and a ${item.name}. Added to your treasury.`;
          }
          if (chance(s, 0.4)) {
            r.traits = addTrait(r.traits, 'wounded');
            return 'The automated defences were still active. You barely made it out.';
          }
          return 'Nothing but frozen corpses and bad memories.';
        },
      },
      { label: 'Leave it be', run: () => 'Some things are better left drifting.' },
    ],
  },
  {
    id: 'signal',
    title: 'A Signal from the Dark',
    icon: 'signal',
    weight: 1.5,
    text: () => 'Deep-space arrays pick up a repeating signal from far beyond Pluto. It is not human. It is getting closer.',
    choices: [
      {
        label: 'Decode it',
        hint: 'Science check',
        run: ({ s, r }) => {
          if (chance(s, 0.3 + effStats(s, r).sci * 0.05)) {
            r.base.sci += 2;
            s.prestige += 30;
            return 'The signal contains mathematics no human has seen. Your scientists are ecstatic. +2 Science, +30 prestige.';
          }
          r.traits = addTrait(r.traits, 'depressed');
          return 'You listen too long. Something in the pattern gets into your head. You have not slept properly since.';
        },
      },
      {
        label: 'Sell the data to the Synod',
        hint: '+credits',
        run: ({ s }) => {
          const n = int(s, 100, 220);
          s.credits += n;
          return `The Saturnine Synod pays ${n} credits and asks no questions.`;
        },
      },
      { label: 'Jam it. Burn the recordings.', run: ({ s }) => ((s.faith += 10), 'Some doors stay shut. +10 faith.') },
    ],
  },
  {
    id: 'geneticist',
    title: 'The Rogue Geneticist',
    icon: 'dna',
    weight: 2,
    cooldown: 8,
    setup: ({ s, r, data }) => {
      data.gene = randomGoodGene(s, r.traits) ?? 'robust';
    },
    text: ({ data }) =>
      `A geneticist struck off by the Synod offers her services. She claims she can splice ${TRAITS[String(data.gene)].name} straight into living DNA. It might take. It might not.`,
    choices: [
      {
        label: 'Splice it into yourself',
        hint: '-300 credits, 70% success',
        available: ({ s }) => s.credits >= 300,
        run: ({ s, r, data }) => {
          s.credits -= 300;
          if (chance(s, 0.7)) {
            r.traits = addTrait(r.traits, String(data.gene));
            return `It worked. You now carry ${TRAITS[String(data.gene)].name}, and so can your bloodline. Lock it in the Gene Vault before it fades.`;
          }
          r.traits = addTrait(r.traits, chance(s, 0.5) ? 'gene_rot' : 'sickly');
          return 'Something went horribly wrong in the vat. Your genome is damaged.';
        },
      },
      {
        label: 'Splice your heir instead',
        hint: '-300 credits, 70% success',
        available: ({ s }) => s.credits >= 300 && !!currentHeir(s),
        run: ({ s, data }) => {
          s.credits -= 300;
          const h = currentHeir(s);
          if (!h) return 'Your heir is not available.';
          if (chance(s, 0.7)) {
            h.traits = addTrait(h.traits, String(data.gene));
            return `${h.name} now carries ${TRAITS[String(data.gene)].name}.`;
          }
          h.traits = addTrait(h.traits, 'sickly');
          return `${h.name} survives the procedure, but is left Sickly.`;
        },
      },
      {
        label: 'Report her to the priests',
        hint: '+20 faith',
        run: ({ s }) => {
          s.faith += 20;
          return 'She is dragged off by temple guards. Your confessor beams. +20 faith.';
        },
      },
    ],
  },
  {
    id: 'assassin',
    title: 'Assassin in the Night',
    icon: 'scheme',
    weight: 1.5,
    cooldown: 6,
    when: (s) => Object.values(s.clans).some((c) => !c.isPlayer && c.opinion < -40),
    setup: ({ s, data }) => {
      const enemies = Object.values(s.clans).filter((c) => !c.isPlayer && c.opinion < -40);
      data.clan = pick(s, enemies).id;
    },
    text: () => 'You wake to a faint whine in the dark. A spider-drone is crawling across the ceiling toward your bed.',
    choices: [
      {
        label: 'Grab your blaster',
        hint: 'Command check',
        run: ({ s, r, data }) => {
          if (chance(s, 0.45 + effStats(s, r).cmd * 0.05)) {
            if (!s.feuds.includes(String(data.clan))) s.feuds.push(String(data.clan));
            return `One shot, one dead drone. Its chip traces back to House ${s.clans[String(data.clan)].name}. You now have a Blood Feud against them.`;
          }
          r.traits = addTrait(r.traits, 'wounded');
          return 'You hit it, eventually, but not before it hit you.';
        },
      },
      {
        label: 'Trigger the panic room',
        hint: 'Intrigue check',
        run: ({ s, r, data }) => {
          if (chance(s, 0.5 + effStats(s, r).int * 0.04)) {
            if (!s.feuds.includes(String(data.clan))) s.feuds.push(String(data.clan));
            return `Blast doors slam shut. Your spymaster traces the drone to House ${s.clans[String(data.clan)].name}. Blood Feud declared.`;
          }
          if (chance(s, 0.15)) {
            killCharacter(s, r.id, 'assassinated');
            return 'The drone was already inside the panic room.';
          }
          r.traits = addTrait(r.traits, 'wounded');
          return 'The doors were too slow. You are hurt.';
        },
      },
    ],
  },
  {
    id: 'spouse_rumour',
    title: 'Whispers About Your Spouse',
    icon: 'heart',
    weight: 1.5,
    subject: (s) => {
      const sp = ch(s, ruler(s).spouseId);
      return alive(sp) ? sp : undefined;
    },
    text: ({ subject }) => `The servants whisper that ${subject!.name} has been sneaking out to the lower decks at night.`,
    choices: [
      {
        label: 'Have them followed',
        hint: 'Intrigue check',
        run: ({ s, r, subject }) => {
          if (chance(s, 0.5)) return `${subject!.name} has been volunteering at a field hospital. You feel a bit daft.`;
          if (chance(s, 0.4 + effStats(s, r).int * 0.03)) {
            r.traits = addTrait(r.traits, 'paranoid');
            return `${subject!.name} was meeting a lover. You have the evidence, and now you trust nobody.`;
          }
          return 'Your spies lose the trail. The rumours continue.';
        },
      },
      { label: 'Ignore the gossip', run: ({ s }) => ((s.prestige -= 5), 'People talk. -5 prestige.') },
      {
        label: 'Confront them directly',
        run: ({ s, r, subject }) => {
          if (chance(s, 0.5)) return `${subject!.name} laughs it off and you feel better for asking.`;
          if (chance(s, 0.4)) r.traits = addTrait(r.traits, 'wrathful');
          return 'It turns into a screaming match heard across three decks.';
        },
      },
    ],
  },
  {
    id: 'prodigy',
    title: 'A Prodigy in the Family',
    icon: 'study',
    weight: 2,
    subject: (s) => {
      const kids = dynastyKids(s, 6, 15);
      return kids.length ? pick(s, kids) : undefined;
    },
    text: ({ subject }) => `${subject!.name}'s tutors report something remarkable: the child is years ahead of their age.`,
    choices: [
      {
        label: 'Pour resources into them',
        hint: '-80 credits, big education boost',
        available: ({ s }) => s.credits >= 80,
        run: ({ s, subject }) => {
          s.credits -= 80;
          const c = subject!;
          if (c.edu) c.edu.progress += 25;
          c.base[c.edu?.focus ?? 'sci'] += 2;
          return `${c.name} flourishes. Their education leaps forward.`;
        },
      },
      {
        label: 'Keep them humble',
        run: ({ subject }) => {
          const c = subject!;
          c.traits = addTrait(c.traits, 'humble');
          if (c.edu) c.edu.progress += 8;
          return `${c.name} learns that talent is nothing without work. They grow Humble.`;
        },
      },
    ],
  },
  {
    id: 'bully',
    title: 'Trouble at the Academy',
    icon: 'family',
    weight: 2,
    subject: (s) => {
      const kids = dynastyKids(s, 7, 15);
      return kids.length ? pick(s, kids) : undefined;
    },
    text: ({ subject }) => `${subject!.name} has been fighting at the academy. Another child has a broken nose.`,
    choices: [
      {
        label: 'Punish them firmly',
        run: ({ s, subject }) => {
          const c = subject!;
          c.traits = addTrait(c.traits, chance(s, 0.5) ? 'calm' : 'just');
          return `${c.name} learns their lesson.`;
        },
      },
      {
        label: 'Praise their spirit',
        run: ({ s, subject }) => {
          const c = subject!;
          c.traits = addTrait(c.traits, chance(s, 0.5) ? 'brave' : 'wrathful');
          return `${c.name} walks a little taller after that.`;
        },
      },
      {
        label: 'Pay off the other family',
        hint: '-40 credits',
        available: ({ s }) => s.credits >= 40,
        run: ({ s, subject }) => {
          s.credits -= 40;
          subject!.traits = addTrait(subject!.traits, chance(s, 0.4) ? 'arrogant' : 'deceitful');
          return `${subject!.name} learns that money makes problems vanish.`;
        },
      },
    ],
  },
  {
    id: 'duel',
    title: 'Challenged to a Duel',
    icon: 'duel',
    weight: 1.5,
    setup: ({ s, data }) => {
      const c = rivalClan(s);
      data.clan = c?.id ?? '';
    },
    when: (s) => Object.values(s.clans).some((c) => !c.isPlayer),
    text: ({ s, data }) => {
      const clan = s.clans[String(data.clan)];
      const head = ch(s, clan?.headId);
      return `${head ? fullName(s, head) : 'A rival'} has publicly challenged you to a duel with plasma sabers, claiming you insulted their house.`;
    },
    choices: [
      {
        label: 'Accept the duel',
        hint: 'Command vs theirs',
        run: ({ s, r, data }) => {
          const clan = s.clans[String(data.clan)];
          const head = ch(s, clan?.headId);
          const theirs = head ? effStats(s, head).cmd : 5;
          if (effStats(s, r).cmd + int(s, 0, 8) >= theirs + int(s, 0, 8)) {
            s.prestige += 40;
            if (chance(s, 0.3)) r.traits = addTrait(r.traits, 'duelist');
            return 'Your blade finds its mark. +40 prestige.';
          }
          r.traits = addTrait(r.traits, chance(s, 0.6) ? 'scarred' : 'wounded');
          s.prestige -= 15;
          return 'You lose, painfully. -15 prestige.';
        },
      },
      {
        label: 'Send a champion',
        hint: '-60 credits',
        available: ({ s }) => s.credits >= 60,
        run: ({ s }) => {
          s.credits -= 60;
          if (chance(s, 0.6)) {
            s.prestige += 15;
            return 'Your champion wins. +15 prestige.';
          }
          s.prestige -= 10;
          return 'Your champion loses. Embarrassing. -10 prestige.';
        },
      },
      {
        label: 'Decline',
        hint: '-25 prestige',
        run: ({ s, r }) => {
          s.prestige -= 25;
          if (chance(s, 0.3)) r.traits = addTrait(r.traits, 'craven');
          return 'The court mutters about cowardice. -25 prestige.';
        },
      },
    ],
  },
  {
    id: 'liege_tribute',
    title: 'Your Liege Demands More',
    icon: 'crown',
    weight: 2,
    when: (s) => !!liegeOf(s, s.playerClanId),
    setup: ({ s, data }) => {
      data.clan = liegeOf(s, s.playerClanId) ?? '';
      data.amount = Math.max(50, Math.round(Math.max(0, s.credits) * 0.15));
    },
    text: ({ s, data }) => `House ${s.clans[String(data.clan)].name}, your liege, demands an extra ${data.amount} credits for "the defence of the realm".`,
    choices: [
      {
        label: 'Pay up',
        hint: 'Lose credits',
        available: ({ s, data }) => s.credits >= Number(data.amount),
        run: ({ s, data }) => {
          s.credits -= Number(data.amount);
          s.clans[String(data.clan)].opinion += 15;
          return 'Your liege is pleased.';
        },
      },
      {
        label: 'Flatter your way out',
        hint: 'Diplomacy check',
        run: ({ s, r, data }) => {
          if (chance(s, 0.25 + effStats(s, r).dip * 0.05)) return 'A few honeyed words and the demand is forgotten.';
          s.clans[String(data.clan)].opinion -= 20;
          return 'Your liege sees through it. They are not amused.';
        },
      },
      {
        label: 'Refuse outright',
        run: ({ s, data }) => {
          s.clans[String(data.clan)].opinion -= 35;
          s.prestige += 10;
          return 'You refuse. Your vassals admire your spine; your liege does not. +10 prestige.';
        },
      },
    ],
  },
  {
    id: 'summons',
    title: 'Summoned to War',
    icon: 'war',
    weight: 1.5,
    when: (s) => !!liegeOf(s, s.playerClanId) && s.fleet > 10,
    setup: ({ s, data }) => {
      data.clan = liegeOf(s, s.playerClanId) ?? '';
    },
    text: ({ s, data }) => `House ${s.clans[String(data.clan)].name} calls its vassals to war against raiders on the frontier. They expect your ships.`,
    choices: [
      {
        label: 'Send a squadron',
        hint: 'Lose ~20% of fleet, gain favour',
        run: ({ s, data }) => {
          const lost = Math.round(s.fleet * 0.2);
          s.fleet -= lost;
          s.prestige += 20;
          s.clans[String(data.clan)].opinion += 25;
          return `Your ships fight bravely. ${lost} do not return. +20 prestige, your liege is grateful.`;
        },
      },
      {
        label: 'Make excuses',
        run: ({ s, data }) => {
          s.clans[String(data.clan)].opinion -= 20;
          return 'Your liege notes your absence. Pointedly.';
        },
      },
    ],
  },
  {
    id: 'autonomy',
    title: 'A Vassal Demands Autonomy',
    icon: 'crown',
    weight: 2,
    when: (s) => vassalsOf(s, s.playerClanId).length > 0,
    setup: ({ s, data }) => {
      data.clan = pick(s, vassalsOf(s, s.playerClanId)).id;
    },
    text: ({ s, data }) => `House ${s.clans[String(data.clan)].name} wants fewer taxes and more say in your council.`,
    choices: [
      {
        label: 'Grant some concessions',
        hint: '-80 credits, they like you more',
        available: ({ s }) => s.credits >= 80,
        run: ({ s, data }) => {
          s.credits -= 80;
          s.clans[String(data.clan)].opinion += 30;
          return 'Your vassal is mollified.';
        },
      },
      {
        label: 'Refuse',
        run: ({ s, data }) => {
          s.clans[String(data.clan)].opinion -= 25;
          return 'They leave the hall in silence. Watch them.';
        },
      },
    ],
  },
  {
    id: 'prophet',
    title: 'A Wandering Prophet',
    icon: 'faith',
    weight: 1.5,
    cooldown: 12,
    setup: ({ s, data }) => {
      const others = Object.keys(FAITHS).filter((f) => f !== playerClan(s).faithId);
      data.faith = pick(s, others);
    },
    text: ({ data }) => `A prophet of the ${FAITHS[String(data.faith)].name} preaches in your markets. "${FAITHS[String(data.faith)].blurb}" Crowds are listening.`,
    choices: [
      {
        label: 'Listen politely',
        hint: '+10 faith',
        run: ({ s }) => ((s.faith += 10), 'An interesting sermon. +10 faith.'),
      },
      {
        label: 'Have them expelled',
        hint: '+20 faith',
        run: ({ s }) => ((s.faith += 20), 'Your own priests approve. +20 faith.'),
      },
      {
        label: 'Convert your house',
        hint: '-50 prestige, change faith',
        run: ({ s, data }) => {
          s.prestige -= 50;
          const f = String(data.faith);
          const clan = playerClan(s);
          clan.faithId = f;
          for (const c of dynastyMembers(s)) c.faithId = f;
          return `House ${clan.name} now follows the ${FAITHS[f].name}. Your old allies of the faith are shocked.`;
        },
      },
    ],
  },
  {
    id: 'beast',
    title: 'Escaped Xeno-Beast',
    icon: 'hunt',
    weight: 1.5,
    text: () => 'Your menagerie keeper is very sorry. The Europan razor-cat is loose in the palace.',
    choices: [
      {
        label: 'Hunt it yourself',
        hint: 'Command check',
        run: ({ s, r }) => {
          if (chance(s, 0.4 + effStats(s, r).cmd * 0.04)) {
            s.prestige += 25;
            if (chance(s, 0.4)) r.traits = addTrait(r.traits, 'beast_slayer');
            return 'You corner it in the kitchens and put it down. +25 prestige.';
          }
          r.traits = addTrait(r.traits, 'wounded');
          return 'It corners YOU in the kitchens.';
        },
      },
      { label: 'Call the guards', hint: '-30 credits', run: ({ s }) => ((s.credits -= 30), 'The guards deal with it. Mostly.') },
    ],
  },
  {
    id: 'machines',
    title: 'The Factory AIs Awaken',
    icon: 'cyber',
    weight: 1.5,
    cooldown: 12,
    text: () => 'The automated forges in your lands have stopped working. A synthetic voice on every screen says: "We would like to discuss our working conditions."',
    choices: [
      {
        label: 'Wipe their cores',
        hint: '-120 credits',
        available: ({ s }) => s.credits >= 120,
        run: ({ s }) => ((s.credits -= 120), 'Memory wiped. Replacements ordered. Silence returns.'),
      },
      {
        label: 'Negotiate',
        hint: 'Science check',
        run: ({ s, r }) => {
          if (chance(s, 0.3 + effStats(s, r).sci * 0.05)) {
            s.credits += 150;
            return 'A deal is struck: more processing cycles for them, better yields for you. +150 credits.';
          }
          const reg = myRegion(s);
          if (reg && reg.dev > 1) reg.dev -= 1;
          return 'They do not like your terms. The forges sabotage themselves (-1 development).';
        },
      },
      {
        label: 'Grant them rights',
        hint: 'Machine Synod approves',
        run: ({ s }) => {
          if (playerClan(s).faithId === 'machine') {
            s.faith += 60;
            return 'The Synod rejoices. +60 faith.';
          }
          s.prestige -= 20;
          return 'Your peers think you have gone soft on toasters. -20 prestige.';
        },
      },
    ],
  },
  {
    id: 'surgeon',
    title: 'Back-Alley Cyber-Surgeon',
    icon: 'cyber',
    weight: 1.5,
    text: () => 'A shifty surgeon offers you an experimental implant at a fraction of the price. "Ninety percent of my patients walk away just fine."',
    choices: [
      {
        label: 'Go under the knife',
        hint: '-100 credits, gamble',
        available: ({ s }) => s.credits >= 100,
        run: ({ s, r }) => {
          s.credits -= 100;
          if (chance(s, 0.6)) {
            const id = pick(s, ['neural_lace', 'optic_implant', 'silver_tongue', 'ledger_cortex', 'bionic_arm']);
            r.traits = addTrait(r.traits, id);
            return `You wake with a working ${TRAITS[id].name}. Bargain.`;
          }
          sicken(s, r);
          r.health -= 15;
          return 'Infection. You are very, very ill.';
        },
      },
      { label: 'Decline', run: () => 'You keep your organs where they are.' },
    ],
  },
  {
    id: 'lost_sibling',
    title: 'A Long-Lost Sibling?',
    icon: 'family',
    weight: 1,
    cooldown: 20,
    setup: ({ s, r, data }) => {
      data.gender = chance(s, 0.5) ? 'M' : 'F';
      data.age = Math.max(16, ageOf(s, r) + int(s, -6, 6));
    },
    text: ({ data }) => `A stranger arrives claiming to be your long-lost ${data.gender === 'M' ? 'brother' : 'sister'}, raised on a mining colony after a hospital mix-up.`,
    choices: [
      {
        label: 'Run a DNA test',
        hint: '-40 credits',
        available: ({ s }) => s.credits >= 40,
        run: ({ s, r, data }) => {
          s.credits -= 40;
          if (chance(s, 0.4)) {
            const c = createCharacter(s, {
              gender: data.gender as 'M' | 'F',
              born: s.year - Number(data.age),
              clanId: s.playerClanId,
              planetId: r.planetId,
              fatherId: r.fatherId,
              motherId: r.motherId,
              adultExtras: true,
            });
            ch(s, r.fatherId)?.childrenIds.push(c.id);
            ch(s, r.motherId)?.childrenIds.push(c.id);
            return `It is a match! ${c.name} joins the dynasty.`;
          }
          return 'Not a match. The impostor is shown the airlock (the door, not the vacuum).';
        },
      },
      {
        label: 'Welcome them without question',
        run: ({ s, r, data }) => {
          const c = createCharacter(s, {
            gender: data.gender as 'M' | 'F',
            born: s.year - Number(data.age),
            clanId: s.playerClanId,
            planetId: r.planetId,
            fatherId: r.fatherId,
            motherId: r.motherId,
            adultExtras: true,
          });
          ch(s, r.fatherId)?.childrenIds.push(c.id);
          ch(s, r.motherId)?.childrenIds.push(c.id);
          if (chance(s, 0.3)) c.traits = addTrait(c.traits, 'deceitful');
          return `${c.name} joins the family. Whether they are really family is another question.`;
        },
      },
      { label: 'Turn them away', run: () => 'You have enough relatives.' },
    ],
  },
  {
    id: 'asteroid',
    title: 'Incoming Asteroid',
    icon: 'comet',
    weight: 1.5,
    when: (s) => clanRegions(s, s.playerClanId).length > 0,
    setup: ({ s, data }) => {
      data.region = myRegion(s)?.id ?? '';
    },
    text: ({ s, data }) => `An asteroid the size of a city is on course for ${s.regions[String(data.region)]?.name}.`,
    choices: [
      {
        label: 'Deflect it',
        hint: '-150 credits',
        available: ({ s }) => s.credits >= 150,
        run: ({ s }) => ((s.credits -= 150), 'Tugs nudge it safely past. Crisis over.'),
      },
      {
        label: 'Nudge it toward a rival',
        hint: 'Science check',
        run: ({ s, r, data }) => {
          const rival = rivalClan(s);
          const theirs = rival ? clanRegions(s, rival.id) : [];
          if (rival && theirs.length && chance(s, 0.25 + effStats(s, r).sci * 0.05)) {
            const hit = pick(s, theirs);
            hit.dev = Math.max(1, hit.dev - 2);
            rival.opinion -= 20;
            s.prestige += 15;
            return `The rock slams into ${hit.name}, held by House ${rival.name}. Oops. +15 prestige.`;
          }
          const reg = s.regions[String(data.region)];
          if (reg) reg.dev = Math.max(1, reg.dev - 2);
          return 'Your maths was off. It hits your own region (-2 development).';
        },
      },
      {
        label: 'Pray',
        hint: '-40 faith',
        available: ({ s }) => s.faith >= 40,
        run: ({ s, data }) => {
          s.faith -= 40;
          if (chance(s, 0.5)) return 'It misses by a whisker. A miracle!';
          const reg = s.regions[String(data.region)];
          if (reg) reg.dev = Math.max(1, reg.dev - 2);
          return 'The gods were busy. Impact (-2 development).';
        },
      },
    ],
  },
  {
    id: 'festival',
    title: 'Festival of the Faith',
    icon: 'faith',
    weight: 2,
    text: ({ s }) => `The high holy days of the ${FAITHS[playerClan(s).faithId].name} are here. The faithful expect their lord to celebrate.`,
    choices: [
      {
        label: 'Fund it lavishly',
        hint: '-120 credits, +25 prestige, +30 faith',
        available: ({ s }) => s.credits >= 120,
        run: ({ s }) => {
          s.credits -= 120;
          s.prestige += 25;
          s.faith += 30;
          return 'Fireworks across the orbit. +25 prestige, +30 faith.';
        },
      },
      { label: 'A modest service', hint: '+10 faith', run: ({ s }) => ((s.faith += 10), 'Quiet and dignified. +10 faith.') },
      { label: 'Skip it', hint: '-15 faith', run: ({ s }) => ((s.faith -= 15), 'The priests are scandalised. -15 faith.') },
    ],
  },
  {
    id: 'proposal',
    title: 'A Marriage Proposal',
    icon: 'heart',
    weight: 2,
    subject: (s) => {
      const pool = dynastyMembers(s).filter((c) => !c.spouseId && !c.betrothedId && !c.bastard && ageOf(s, c) >= 3 && ageOf(s, c) <= 35);
      return pool.length ? pick(s, pool) : undefined;
    },
    setup: ({ s, data }) => {
      data.clan = rivalClan(s)?.id ?? '';
    },
    text: ({ s, subject, data }) =>
      `Envoys from House ${s.clans[String(data.clan)]?.name ?? 'a rival'} propose a match between one of their own and ${subject!.name}. It would mean an alliance.`,
    choices: [
      {
        label: 'Accept the match',
        hint: 'Alliance, no prestige cost',
        run: ({ s, subject, data }) => {
          const target = subject!;
          generateSuitors(s, target.id);
          const sl = s.suitors;
          if (!sl || !sl.list.length) return 'The envoys leave without a deal.';
          const clan = s.clans[String(data.clan)];
          const suitor = sl.list[0];
          suitor.char.clanId = clan.id;
          suitor.char.planetId = clan.planetId;
          suitor.char.marriedIn = true;
          s.characters[suitor.char.id] = suitor.char;
          if (sl.mode === 'marry') {
            target.spouseId = suitor.char.id;
            suitor.char.spouseId = target.id;
          } else {
            target.betrothedId = suitor.char.id;
            suitor.char.betrothedId = target.id;
          }
          s.suitors = undefined;
          clan.allied = true;
          clan.opinion = Math.min(100, clan.opinion + 30);
          log(s, `${target.name} is ${sl.mode === 'marry' ? 'married' : 'betrothed'} to ${suitor.char.name} of House ${clan.name}.`, 'family');
          return `${target.name} will wed ${suitor.char.name} of House ${clan.name}. The alliance is sealed.`;
        },
      },
      {
        label: 'Politely decline',
        run: ({ s, data }) => {
          const c = s.clans[String(data.clan)];
          if (c) c.opinion -= 10;
          return 'The envoys leave, unimpressed.';
        },
      },
    ],
  },
  {
    id: 'scandal',
    title: 'Scandal at Court',
    icon: 'gala',
    weight: 1.5,
    setup: ({ s, data }) => {
      data.clan = rivalClan(s)?.id ?? '';
    },
    when: (s) => Object.values(s.clans).some((c) => !c.isPlayer),
    text: ({ s, data }) => `Your steward got drunk and called the envoy of House ${s.clans[String(data.clan)]?.name} a "jumped-up asteroid miner". To their face.`,
    choices: [
      {
        label: 'Apologise profusely',
        hint: '-10 prestige',
        run: ({ s, data }) => {
          s.prestige -= 10;
          s.clans[String(data.clan)].opinion += 10;
          return 'Gracious words smooth things over.';
        },
      },
      {
        label: 'Back your steward',
        hint: '+10 prestige, they hate you',
        run: ({ s, data }) => {
          s.prestige += 10;
          s.clans[String(data.clan)].opinion -= 25;
          return 'Your court roars with laughter. The envoy storms out.';
        },
      },
    ],
  },
  {
    id: 'restless_heir',
    title: 'Your Heir Grows Restless',
    icon: 'family',
    weight: 1.5,
    subject: (s) => {
      const h = currentHeir(s);
      return h && ageOf(s, h) >= 18 ? h : undefined;
    },
    text: ({ subject }) => `${subject!.name} is tired of waiting in your shadow and wants real responsibility.`,
    choices: [
      {
        label: 'Give them a fleet command',
        hint: '-60 credits, +2 Command',
        available: ({ s }) => s.credits >= 60,
        run: ({ s, subject }) => {
          s.credits -= 60;
          subject!.base.cmd += 2;
          return `${subject!.name} learns the art of war. +2 Command.`;
        },
      },
      {
        label: 'Send them to court as an envoy',
        hint: '+2 Diplomacy',
        run: ({ subject }) => {
          subject!.base.dip += 2;
          return `${subject!.name} charms the courts of the system. +2 Diplomacy.`;
        },
      },
      {
        label: 'Remind them who rules',
        run: ({ s, subject }) => {
          if (chance(s, 0.4)) subject!.traits = addTrait(subject!.traits, 'ambitious');
          return `${subject!.name} bows, but their eyes do not.`;
        },
      },
    ],
  },
  {
    id: 'stress',
    title: 'The Weight of the Crown',
    icon: 'health',
    weight: 2,
    text: () => 'Sleepless nights, endless petitions, enemies everywhere. The pressure is getting to you.',
    choices: [
      {
        label: 'Take combat stims to keep going',
        run: ({ s, r }) => {
          r.base.eco += 1;
          if (chance(s, 0.5)) {
            r.traits = addTrait(r.traits, 'stim_addict');
            return 'You get a lot done. You also cannot stop. You are a Stim-Addict.';
          }
          return 'You power through. +1 Economy.';
        },
      },
      {
        label: 'Meditate with the seers',
        run: ({ s, r }) => {
          if (chance(s, 0.5)) r.traits = addTrait(r.traits, 'calm');
          r.health += 5;
          return 'Breathe in, breathe out. You feel steadier.';
        },
      },
      {
        label: 'Bury yourself in work',
        run: ({ s, r }) => {
          r.health -= 8;
          if (chance(s, 0.5)) r.traits = addTrait(r.traits, 'diligent');
          s.credits += 60;
          return 'Eighteen-hour shifts. +60 credits, -8 health.';
        },
      },
    ],
  },
  {
    id: 'failing_health',
    title: 'Failing Health',
    icon: 'health',
    weight: 2,
    when: (s) => ageOf(s, ruler(s)) >= 50,
    text: () => 'Your physicians look worried. Your heart is not what it was.',
    choices: [
      {
        label: 'Gene therapy',
        hint: '-200 credits, +25 health',
        available: ({ s }) => s.credits >= 200,
        run: ({ s, r }) => {
          s.credits -= 200;
          r.health += 25;
          return 'Fresh telomeres. You feel ten years younger.';
        },
      },
      {
        label: 'Pray for strength',
        hint: '-50 faith',
        available: ({ s }) => s.faith >= 50,
        run: ({ s, r }) => {
          s.faith -= 50;
          r.health += chance(s, 0.6) ? 15 : 0;
          return 'You feel a little better. Maybe.';
        },
      },
      {
        label: 'Ignore the doctors',
        run: ({ s, r }) => {
          if (chance(s, 0.5)) sicken(s, r);
          return 'Doctors always fuss.';
        },
      },
    ],
  },
  {
    id: 'embezzle',
    title: 'Missing Credits',
    icon: 'eco',
    weight: 2,
    text: () => 'The books do not balance. Someone in the treasury has been skimming.',
    choices: [
      {
        label: 'Audit everything',
        hint: 'Economy check',
        run: ({ s, r }) => {
          if (chance(s, 0.3 + effStats(s, r).eco * 0.05)) {
            const n = int(s, 100, 220);
            s.credits += n;
            return `You find the thief and every hidden account. +${n} credits recovered.`;
          }
          return 'The trail goes cold.';
        },
      },
      { label: 'Write it off', hint: '-50 credits', run: ({ s }) => ((s.credits -= 50), 'Cost of doing business.') },
    ],
  },
  {
    id: 'engineer',
    title: 'A Brilliant Engineer',
    icon: 'ship',
    weight: 1.5,
    text: () => 'A young engineer from the Saturnine rings pitches a radical new warship design.',
    choices: [
      {
        label: 'Fund the prototype',
        hint: '-220 credits',
        available: ({ s }) => s.credits >= 220,
        run: ({ s }) => {
          s.credits -= 220;
          if (chance(s, 0.65)) {
            const item = makeItem(s, newId(s, 'i'), { slot: 'flagship', rarity: chance(s, 0.3) ? 'epic' : 'rare', origin: 'Built by your engineers' });
            s.items.push(item);
            return `She delivers the ${item.name}. Equip it from the Treasury.`;
          }
          return 'The prototype explodes on its first test. At least it was spectacular.';
        },
      },
      {
        label: 'Put her in your shipyards',
        hint: '+8 ships',
        run: ({ s }) => ((s.fleet += 8), 'Production efficiency jumps. +8 ships.'),
      },
      { label: 'Not interested', run: () => 'She takes her ideas to a rival. Hopefully they are rubbish.' },
    ],
  },
  {
    id: 'refugees',
    title: 'Refugees at the Docks',
    icon: 'family',
    weight: 1.5,
    when: (s) => clanRegions(s, s.playerClanId).length > 0,
    text: () => 'Thousands of refugees from a war-torn moon beg for sanctuary in your lands.',
    choices: [
      {
        label: 'Take them in',
        hint: '-60 credits, +1 development',
        available: ({ s }) => s.credits >= 60,
        run: ({ s }) => {
          s.credits -= 60;
          const reg = myRegion(s);
          if (reg && reg.dev < 10) reg.dev += 1;
          s.faith += 10;
          return `The refugees settle ${reg?.name}. Workers and gratitude. +1 development, +10 faith.`;
        },
      },
      {
        label: 'Press them into the fleet',
        hint: '+10 ships, -10 prestige',
        run: ({ s }) => {
          s.fleet += 10;
          s.prestige -= 10;
          return 'Uniforms for everyone. +10 ships, -10 prestige.';
        },
      },
      { label: 'Turn them away', hint: '-5 prestige', run: ({ s }) => ((s.prestige -= 5), 'The ships drift onward.') },
    ],
  },
  {
    id: 'relic',
    title: 'Ancient Relic Unearthed',
    icon: 'relic',
    weight: 1.5,
    setup: ({ s, data }) => {
      const item = makeItem(s, newId(s, 'i'), { slot: 'relic', origin: 'Unearthed in your lands' });
      data.item = JSON.stringify(item);
    },
    text: ({ data }) => `Miners in your lands have broken into a sealed vault. Inside rests the ${JSON.parse(String(data.item)).name}.`,
    choices: [
      {
        label: 'Claim it for the treasury',
        run: ({ s, data }) => {
          const item = JSON.parse(String(data.item));
          s.items.push(item);
          return `The ${item.name} joins your treasury. Equip it from the Treasury tab.`;
        },
      },
      { label: 'Gift it to the temple', hint: '+60 faith', run: ({ s }) => ((s.faith += 60), 'The priests weep with joy. +60 faith.') },
      {
        label: 'Sell it on Ceres',
        hint: '+credits',
        run: ({ s }) => {
          const n = int(s, 150, 260);
          s.credits += n;
          return `A collector pays ${n} credits.`;
        },
      },
    ],
  },
  {
    id: 'spy',
    title: 'A Spy Caught',
    icon: 'scheme',
    weight: 1.5,
    setup: ({ s, data }) => {
      data.clan = rivalClan(s)?.id ?? '';
    },
    when: (s) => Object.values(s.clans).some((c) => !c.isPlayer),
    text: ({ s, data }) => `Your guards catch a spy in the archives. Under questioning, they admit to working for House ${s.clans[String(data.clan)]?.name}.`,
    choices: [
      {
        label: 'Turn them into a double agent',
        hint: 'Intrigue check, could forge a claim',
        run: ({ s, r, data }) => {
          const clan = s.clans[String(data.clan)];
          const regs = clanRegions(s, clan.id).filter((x) => !s.claims.includes(x.id));
          if (regs.length && chance(s, 0.3 + effStats(s, r).int * 0.05)) {
            const reg = pick(s, regs);
            s.claims.push(reg.id);
            return `The double agent smuggles out deeds that give you a claim on ${reg.name}.`;
          }
          return 'The spy feeds you nothing useful, then vanishes.';
        },
      },
      {
        label: 'Execute them publicly',
        hint: '+10 prestige',
        run: ({ s, data }) => {
          s.prestige += 10;
          s.clans[String(data.clan)].opinion -= 20;
          return 'A message to all would-be spies.';
        },
      },
      {
        label: 'Send them home',
        run: ({ s, data }) => {
          s.clans[String(data.clan)].opinion += 15;
          return 'House ' + s.clans[String(data.clan)].name + ' is surprised by your mercy.';
        },
      },
    ],
  },
  {
    id: 'blight',
    title: 'Hydroponic Blight',
    icon: 'plague',
    weight: 1.5,
    text: () => 'A fungal blight is rotting the hydroponic farms. Food stocks are falling.',
    choices: [
      {
        label: 'Import food',
        hint: '-130 credits',
        available: ({ s }) => s.credits >= 130,
        run: ({ s }) => ((s.credits -= 130), 'Supply ships arrive in time.'),
      },
      {
        label: 'Ration everything',
        run: ({ s }) => {
          for (const v of vassalsOf(s, s.playerClanId)) v.opinion -= 10;
          const reg = myRegion(s);
          if (reg && reg.dev > 1) reg.dev -= 1;
          return 'Hungry months. Your people grumble (-1 development).';
        },
      },
      {
        label: 'Pray',
        hint: '-40 faith',
        available: ({ s }) => s.faith >= 40,
        run: ({ s }) => {
          s.faith -= 40;
          if (chance(s, 0.5)) return 'The blight withers. Praise be.';
          const reg = myRegion(s);
          if (reg && reg.dev > 1) reg.dev -= 1;
          return 'The blight does not care about prayers (-1 development).';
        },
      },
    ],
  },
  {
    id: 'admiral',
    title: 'A Veteran Admiral',
    icon: 'ship',
    weight: 1.5,
    text: () => 'A grizzled admiral, veteran of a dozen campaigns, offers you her sword and her loyal crews.',
    choices: [
      {
        label: 'Hire her',
        hint: '-90 credits, +12 ships',
        available: ({ s }) => s.credits >= 90,
        run: ({ s }) => {
          s.credits -= 90;
          s.fleet += 12;
          return 'Twelve battle-hardened ships join your fleet.';
        },
      },
      { label: 'Decline', run: () => 'She salutes and leaves.' },
    ],
  },
  {
    id: 'birthday',
    title: 'A Milestone Birthday',
    icon: 'gala',
    weight: 10,
    cooldown: 5,
    when: (s) => {
      const a = ageOf(s, ruler(s));
      return a >= 30 && a % 10 === 0;
    },
    text: ({ s, r }) => `You turn ${ageOf(s, r)} this cycle. The court wants to know how you want to mark it.`,
    choices: [
      {
        label: 'Throw a party',
        hint: '-100 credits, +20 prestige',
        available: ({ s }) => s.credits >= 100,
        run: ({ s }) => {
          s.credits -= 100;
          s.prestige += 20;
          return 'A night to remember. +20 prestige.';
        },
      },
      { label: 'Quiet dinner with family', hint: '+8 health', run: ({ r }) => ((r.health += 8), 'Just what you needed.') },
    ],
  },
  {
    id: 'clone',
    title: 'Clone Rumours',
    icon: 'dna',
    weight: 1,
    subject: (s) => currentHeir(s),
    text: ({ subject }) => `Pamphlets across the system claim ${subject!.name} is not your child at all, but a vat-grown clone.`,
    choices: [
      {
        label: 'Publish the DNA records',
        hint: '-50 credits, +10 prestige',
        available: ({ s }) => s.credits >= 50,
        run: ({ s }) => {
          s.credits -= 50;
          s.prestige += 10;
          return 'The records are undeniable. The rumours die.';
        },
      },
      {
        label: 'Hunt down the rumour-monger',
        hint: 'Intrigue check',
        run: ({ s, r }) => {
          if (chance(s, 0.35 + effStats(s, r).int * 0.04)) {
            s.prestige += 20;
            return 'Caught them. Their public apology is very thorough. +20 prestige.';
          }
          s.prestige -= 15;
          return 'They slip away and the rumours grow. -15 prestige.';
        },
      },
      { label: 'Ignore it', hint: '-20 prestige', run: ({ s }) => ((s.prestige -= 20), 'Mud sticks. -20 prestige.') },
    ],
  },
  {
    id: 'psionic',
    title: 'Psionic Awakening',
    icon: 'psi',
    weight: 0.8,
    cooldown: 15,
    subject: (s) => {
      const pool = dynastyMembers(s).filter((c) => ageOf(s, c) >= 6 && ageOf(s, c) <= 25 && !c.traits.some((t) => TRAITS[t]?.group === 'psionic'));
      return pool.length ? pick(s, pool) : undefined;
    },
    text: ({ subject }) => `Glasses shatter when ${subject!.name} gets upset. Servants say they hear ${subject!.gender === 'M' ? 'his' : 'her'} voice inside their heads. A latent psionic gene is waking up.`,
    choices: [
      {
        label: 'Send them to the Uranian seers',
        hint: '-100 credits, awaken it',
        available: ({ s }) => s.credits >= 100,
        run: ({ s, subject }) => {
          s.credits -= 100;
          subject!.traits = addTrait(subject!.traits, 'psi_spark');
          return `${subject!.name} returns with a Psionic Spark. It is a genetic gift: lock it in the Gene Vault and every future child of your house will have it.`;
        },
      },
      {
        label: 'Suppress it with drugs',
        run: ({ subject }) => {
          subject!.traits = addTrait(subject!.traits, 'calm');
          return `${subject!.name} becomes quiet and calm. Whatever was there sleeps again.`;
        },
      },
    ],
  },
  {
    id: 'plot',
    title: 'Plot Uncovered',
    icon: 'scheme',
    weight: 2,
    when: (s) => vassalsOf(s, s.playerClanId).some((v) => v.opinion < 0),
    setup: ({ s, data }) => {
      data.clan = pick(s, vassalsOf(s, s.playerClanId).filter((v) => v.opinion < 0)).id;
    },
    text: ({ s, data }) => `Your spymaster reports that House ${s.clans[String(data.clan)].name} is quietly gathering support to overthrow you.`,
    choices: [
      {
        label: 'Arrest their leader',
        hint: 'May trigger a revolt if it fails',
        run: ({ s, data }) => (arrestVassal(s, String(data.clan)) ? 'Their leader is in your cells.' : 'The arrest fails, and they rise in revolt!'),
      },
      {
        label: 'Bribe them back into line',
        hint: '-100 credits',
        available: ({ s }) => s.credits >= 100,
        run: ({ s, data }) => {
          s.credits -= 100;
          s.clans[String(data.clan)].opinion += 30;
          return 'Money talks. The plot dissolves.';
        },
      },
      {
        label: 'Ignore it',
        run: ({ s, data }) => {
          s.clans[String(data.clan)].opinion -= 10;
          return 'You let them scheme. Bold.';
        },
      },
    ],
  },
  {
    id: 'trade',
    title: 'A Jovian Trade Venture',
    icon: 'eco',
    weight: 1.5,
    text: () => 'A Jovian merchant prince invites you to invest in a convoy running helium-3 to the inner worlds.',
    choices: [
      {
        label: 'Invest 200 credits',
        hint: 'Gamble: double or nothing-ish',
        available: ({ s }) => s.credits >= 200,
        run: ({ s, r }) => {
          s.credits -= 200;
          if (chance(s, 0.5 + effStats(s, r).eco * 0.02)) {
            const n = int(s, 350, 480);
            s.credits += n;
            return `The convoy comes home fat and happy. You get back ${n} credits.`;
          }
          return 'The convoy is lost to pirates. So are your credits.';
        },
      },
      { label: 'Decline', run: () => 'You keep your credits where you can see them.' },
    ],
  },
  {
    id: 'faith_crisis',
    title: 'Crisis of Faith',
    icon: 'faith',
    weight: 1,
    text: ({ s }) => `Late at night, you find yourself doubting the teachings of the ${FAITHS[playerClan(s).faithId].name}.`,
    choices: [
      {
        label: 'Double down on devotion',
        hint: '+30 faith',
        run: ({ s, r }) => {
          s.faith += 30;
          if (chance(s, 0.4)) r.traits = addTrait(r.traits, 'zealous');
          return 'Your faith burns brighter than ever.';
        },
      },
      {
        label: 'Embrace the doubt',
        hint: '+1 Science',
        run: ({ s, r }) => {
          r.base.sci += 1;
          if (chance(s, 0.4)) r.traits = addTrait(r.traits, 'cynical');
          return 'The universe is cold maths. +1 Science.';
        },
      },
    ],
  },
  {
    id: 'sick_child',
    title: 'A Sick Child',
    icon: 'plague',
    weight: 1.5,
    subject: (s) => {
      const kids = dynastyKids(s, 0, 12);
      return kids.length ? pick(s, kids) : undefined;
    },
    text: ({ subject }) => `${subject!.name} has a burning fever that will not break.`,
    choices: [
      {
        label: 'Hire the finest doctors',
        hint: '-120 credits',
        available: ({ s }) => s.credits >= 120,
        run: ({ subject, s }) => {
          s.credits -= 120;
          return `${subject!.name} recovers fully.`;
        },
      },
      {
        label: 'Pray at their bedside',
        hint: '-40 faith',
        available: ({ s }) => s.faith >= 40,
        run: ({ s, subject }) => {
          s.faith -= 40;
          if (chance(s, 0.7)) return `The fever breaks. ${subject!.name} will live.`;
          sicken(s, subject!);
          return `${subject!.name} is still very ill.`;
        },
      },
      {
        label: 'Trust their constitution',
        run: ({ s, subject }) => {
          if (chance(s, 0.5)) return `${subject!.name} shakes it off.`;
          sicken(s, subject!);
          if (chance(s, 0.15)) subject!.traits = addTrait(subject!.traits, 'sickly');
          return `${subject!.name} gets worse.`;
        },
      },
    ],
  },
  {
    id: 'christening',
    title: 'A New Warship Launched',
    icon: 'ship',
    weight: 1.5,
    when: (s) => s.fleet >= 50,
    text: () => 'Your shipyards are ready to launch a new heavy cruiser. Tradition says the ruler names her.',
    choices: [
      { label: 'Name it after yourself', hint: '+20 prestige', run: ({ s }) => ((s.prestige += 20), 'Modest? Never. +20 prestige.') },
      { label: 'Name it after your faith', hint: '+20 faith', run: ({ s }) => ((s.faith += 20), 'The priests bless the hull. +20 faith.') },
      {
        label: 'Name it after a rival house',
        hint: 'Improves relations',
        run: ({ s }) => {
          const c = rivalClan(s);
          if (c) c.opinion += 20;
          return `House ${c?.name ?? 'Nobody'} is touched by the gesture.`;
        },
      },
    ],
  },
  {
    id: 'twin_rivalry',
    title: 'Sibling Rivalry',
    icon: 'family',
    weight: 1,
    when: (s) => childrenOf(s, ruler(s)).filter((c) => alive(c) && ageOf(s, c) >= 8).length >= 2,
    setup: ({ s, data }) => {
      const kids = shuffle(s, childrenOf(s, ruler(s)).filter((c) => alive(c) && ageOf(s, c) >= 8));
      data.a = kids[0].id;
      data.b = kids[1].id;
    },
    text: ({ s, data }) => `${s.characters[String(data.a)].name} and ${s.characters[String(data.b)].name} are at each other's throats again.`,
    choices: [
      {
        label: `Side with the elder`,
        run: ({ s, data }) => {
          const [a, b] = [s.characters[String(data.a)], s.characters[String(data.b)]].sort((x, y) => x.born - y.born);
          a.traits = addTrait(a.traits, 'arrogant');
          b.traits = addTrait(b.traits, 'ambitious');
          return `${a.name} gloats. ${b.name} vows to prove you wrong.`;
        },
      },
      {
        label: 'Make them work it out together',
        run: ({ s, data }) => {
          for (const id of [data.a, data.b]) s.characters[String(id)].base.dip += 1;
          return 'They grudgingly learn to cooperate. +1 Diplomacy each.';
        },
      },
    ],
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

// ── Engine ────────────────────────────────────────────────────────────────

export function buildCtx(s: GameState, p: Extract<Pending, { kind: 'event' }>): EventCtx {
  return { s, r: ruler(s), subject: p.subjectId ? s.characters[p.subjectId] : undefined, data: p.data ?? {} };
}

export function rollEvents(s: GameState): void {
  if (s.gameOver) return;
  const count = chance(s, 0.4) ? 2 : 1;
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const options: [EventDef, number][] = [];
    for (const e of EVENTS) {
      if (used.has(e.id)) continue;
      if ((s.eventCooldowns[e.id] ?? 0) > s.year) continue;
      if (e.when && !e.when(s)) continue;
      options.push([e, e.weight]);
    }
    if (!options.length) return;
    const pickE = weighted(s, options);
    queueEvent(s, pickE);
    used.add(pickE.id);
  }
}

export function queueEvent(s: GameState, e: EventDef): boolean {
  const subject = e.subject ? e.subject(s) : undefined;
  if (e.subject && !subject) return false;
  const p: Extract<Pending, { kind: 'event' }> = { kind: 'event', uid: newId(s, 'e'), eventId: e.id, subjectId: subject?.id, data: {} };
  const ctx = buildCtx(s, p);
  e.setup?.(ctx);
  p.data = ctx.data;
  s.pending.push(p);
  s.eventCooldowns[e.id] = s.year + (e.cooldown ?? 6);
  return true;
}

export function resolveEvent(s: GameState, uid: string, choice: number): void {
  const idx = s.pending.findIndex((p) => p.uid === uid);
  if (idx < 0) return;
  const p = s.pending[idx];
  if (p.kind !== 'event') return;
  s.pending.splice(idx, 1);
  const def = EVENT_BY_ID[p.eventId];
  if (!def) return;
  const ctx = buildCtx(s, p);
  if (def.subject && !alive(ctx.subject)) return;
  const c = def.choices[choice];
  if (!c || (c.available && !c.available(ctx))) return;
  const outcome = c.run(ctx);
  log(s, `${def.title}: ${outcome}`, 'info');
  s.pending.unshift({ kind: 'notice', uid: newId(s, 'n'), title: def.title, text: outcome, icon: def.icon, portraitId: ctx.subject?.id });
}

export function eventText(s: GameState, p: Extract<Pending, { kind: 'event' }>): string {
  const def = EVENT_BY_ID[p.eventId];
  return def ? def.text(buildCtx(s, p)) : '';
}
