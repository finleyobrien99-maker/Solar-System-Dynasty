// Random events. Each cycle one or two are drawn from this deck. Every choice
// shows a hint of what it costs, and the outcome is spelled out afterwards.

import { createCharacter } from './character';
import {
  ageOf,
  alive,
  ch,
  childrenOf,
  clanRegions,
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
import { dynastyKids, getFlag, myRegion, rivalClan, type EventCtx, type EventDef } from './eventKit';
import { MORE_EVENTS } from './eventsMore';
import { RELATION_EVENTS } from './eventsRelations';
import { defineEvent, regionOf, type Cond, type Ctx, type Effect, type Outcome } from './dsl';
import { catchable, courtier, houseName, myRegionPick, named, placeName, present, rivalPick } from './eventBits';
import { randomGoodGene } from './genetics';
import { makeItem } from './items';
import { currentHeir } from './life';
import { FAITHS, theFaith } from './planets';
import { chance, int, pick, shuffle, weighted } from './rng';
import { STAT_NAMES, TRAITS } from './traits';
import type { Clan, GameState, Item, Pending } from './types';
import { arrestChance, arrestVassal } from './intrigue';
import { generateSuitors } from './family';

export type { EventChoice, EventCtx, EventDef } from './eventKit';

// ── Helpers for the deck ──────────────────────────────────────────────────

/** The challenging house's head's Command (5 if the house has no head). */
function rivalCommand(c: Ctx): number {
  const clan = c.s.clans[String(c.data.clan)];
  const head = ch(c.s, clan?.headId);
  return head ? effStats(c.s, head).cmd : 5;
}

/** A long-lost sibling of the ruler, made from the event's data, who joins the dynasty. */
function sibling(as: string): Effect {
  return {
    pick: as,
    get: ({ s, r, data }) => {
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
      return c;
    },
    text: 'your new sibling',
    say: 'a new sibling joins the dynasty',
  };
}

/** An item the event made in its setup and kept, as JSON, in its data. */
function itemIn(c: Ctx, key: string): Item {
  return JSON.parse(String(c.data[key])) as Item;
}

/** Put the item from the event's data in the treasury. */
function keepItem(key: string): Effect {
  return { run: (c) => void c.s.items.push(itemIn(c, key)), text: (c) => `the ${itemIn(c, key).name} for your treasury` };
}

/** The house in the event's data holds land you have no claim on yet. */
function claimable(key: string): Cond {
  return {
    test: (c) => {
      const k = c.s.clans[String(c.data[key])];
      return !!k && clanRegions(c.s, k.id).some((x) => !c.s.claims.includes(x.id));
    },
    why: '',
  };
}

/** The two quarrelling children, eldest first. */
function byAge(c: Ctx) {
  return [c.s.characters[String(c.data.a)], c.s.characters[String(c.data.b)]].sort((x, y) => x.born - y.born);
}

/** Marry (or betroth) the subject to one of the proposing house, which becomes an ally. Returns what happened. */
function acceptProposal({ s, subject, data }: Ctx): string {
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
}

// ── The deck ──────────────────────────────────────────────────────────────

export const EVENTS: EventDef[] = [
  defineEvent({
    id: 'plague',
    title: 'The Red Lung',
    icon: 'plague',
    weight: 3,
    cooldown: 10,
    text: () => 'A cough is spreading through the docks. Doctors are calling it the Red Lung, a virus that came in on a cargo hauler. It moves fast.',
    options: [
      {
        label: 'Seal the docks',
        needs: [{ have: 'credits', n: 120 }],
        then: { do: [{ lose: 'credits', n: 120 }], text: 'The quarantine holds. Trade suffers, but your court breathes easy.' },
      },
      {
        label: 'Pray for deliverance',
        needs: [{ have: 'faith', n: 60 }],
        then: {
          do: [{ lose: 'faith', n: 60 }],
          roll: 0.6,
          pass: { text: 'The fever passes your house by. The priests are insufferable about it.' },
          fail: {
            do: [courtier('victim')],
            if: catchable('victim'),
            pass: { do: [{ sicken: 'victim' }], text: (c) => `Prayer was not enough. ${named(c, 'victim')} has caught the Red Lung.` },
            fail: { text: 'The fever brushes past. Lucky.' },
          },
        },
      },
      {
        label: 'Carry on as normal',
        then: (() => {
          const spared = (c: Ctx) => `The plague burns through ${placeName(c, 'reg')} (-1 development) but spares your family.`;
          const courtFalls: Outcome = {
            do: [courtier('victim')],
            if: present('victim'),
            pass: {
              roll: 0.6,
              pass: {
                if: catchable('victim'),
                pass: { do: [{ sicken: 'victim' }], text: (c) => `The plague rips through ${placeName(c, 'reg')}. ${named(c, 'victim')} is sick.` },
                fail: { text: spared },
              },
              fail: { text: spared },
            },
            fail: { text: spared },
          };
          return {
            do: [myRegionPick('reg'), { dev: -1, region: 'reg' }],
            roll: 0.5,
            pass: {
              if: catchable('root'),
              pass: { do: [{ sicken: 'root' }], text: (c) => `The plague rips through ${placeName(c, 'reg')}, and you have caught it yourself.` },
              fail: courtFalls,
            },
            fail: courtFalls,
          };
        })(),
      },
    ],
  }),
  defineEvent({
    id: 'comet',
    title: 'A Comet Blazes Past',
    icon: 'comet',
    weight: 2,
    text: () => 'A great comet with a tail of blue fire crosses your sky. The court argues: omen, opportunity, or just a big rock?',
    options: [
      {
        label: 'Proclaim it a holy omen',
        then: {
          do: [
            { gain: 'faith', n: 30 },
            { gain: 'prestige', n: 10 },
          ],
          text: 'The faithful flock to the observation decks. +30 faith, +10 prestige.',
        },
      },
      {
        label: 'Send miners after it',
        then: {
          do: [{ gain: 'credits', n: { roll: [60, 140], per: { stat: 'sci', n: 12 } }, as: 'n' }],
          text: (c) => `Your crews strip the comet of ice and metals. +${c.vars.n} credits.`,
        },
      },
      { label: 'Ignore it', then: { text: 'It is just a rock. It goes away.' } },
    ],
  }),
  defineEvent({
    id: 'flare',
    title: 'Solar Flare',
    icon: 'sun',
    weight: 2,
    when: (s) => s.fleet > 10,
    text: () => 'Your astronomers scream warnings: a monstrous solar flare will hit your fleet within hours.',
    options: [
      {
        label: 'Raise the shields',
        needs: [{ have: 'credits', n: 90 }],
        then: { do: [{ lose: 'credits', n: 90 }], text: 'Shields hold. The fleet is safe, the power bill is not.' },
      },
      {
        label: 'Ride it out',
        then: {
          do: [{ lose: 'fleet', n: { calc: (c) => Math.round(c.s.fleet * (0.08 + int(c.s, 0, 12) / 100)), text: '8–20% of your' }, as: 'lost' }],
          text: (c) => `The flare fries ${c.vars.lost} ships.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'pirates',
    title: 'Belt Pirates!',
    icon: 'war',
    weight: 3,
    setup: ({ s, data }) => {
      data.ships = int(s, 10, 30);
      data.ransom = int(s, 80, 180);
    },
    text: ({ data }) => `A pirate flotilla of ${data.ships} ships is raiding your shipping lanes. Their captain demands ${data.ransom} credits to leave.`,
    options: [
      {
        label: 'Pay them off',
        needs: [{ have: 'credits', n: 'ransom' }],
        then: { do: [{ lose: 'credits', n: { data: 'ransom' } }], text: 'The pirates take their credits and vanish into the Belt. For now.' },
      },
      {
        label: 'Fight them',
        then: {
          roll: {
            text: 'Fleet battle',
            // Your fleet, boosted by Command, times a 0.75–1.25 swing, must beat theirs × 1.3.
            odds: (c) => {
              const mine = c.s.fleet * (1 + effStats(c.s, c.r).cmd * 0.04);
              const theirs = Number(c.data.ships) * 1.3;
              let wins = 0;
              for (let k = 0; k <= 50; k++) if (mine * (0.75 + k / 100) > theirs) wins++;
              return wins / 51;
            },
            roll: (c) => c.s.fleet * (1 + effStats(c.s, c.r).cmd * 0.04) * (0.75 + int(c.s, 0, 50) / 100) > Number(c.data.ships) * 1.3,
          },
          pass: {
            do: [
              { gain: 'credits', n: { roll: [60, 160] }, as: 'loot' },
              { gain: 'prestige', n: 15 },
              { lose: 'fleet', n: { roll: [0, 3] } },
            ],
            text: (c) => `Your fleet scatters the pirates. +${c.vars.loot} credits in loot, +15 prestige.`,
          },
          fail: {
            do: [
              { lose: 'fleet', n: { roll: [4, 10] }, upTo: 'have', as: 'lost' },
              { lose: 'credits', n: { data: 'ransom' }, upTo: 'have' },
            ],
            text: (c) => `The pirates outfight you. You lose ${c.vars.lost} ships and they loot your convoys anyway.`,
          },
        },
      },
      {
        label: 'Hire them as privateers',
        needs: [
          { stat: 'int', min: 8 },
          { have: 'credits', n: 50 },
        ],
        then: {
          do: [
            { lose: 'credits', n: 50 },
            { gain: 'fleet', n: { data: 'ships', times: 0.6, round: true }, as: 'n' },
          ],
          text: (c) => `A quiet word and a fat purse. ${c.vars.n} pirate ships now fly your colours.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'strike',
    title: "Miners' Strike",
    icon: 'eco',
    weight: 2,
    setup: ({ s, data }) => {
      data.region = myRegion(s)?.id ?? '';
    },
    when: (s) => clanRegions(s, s.playerClanId).length > 0,
    text: ({ s, data }) =>
      `The miners of ${s.regions[String(data.region)]?.name ?? 'your lands'} have downed tools. They want better air rations and fewer cave-ins.`,
    options: [
      {
        label: 'Meet their demands',
        needs: [{ have: 'credits', n: 100 }],
        then: {
          do: [{ deed: 'justice' }, { deed: 'kindness' }, { deed: 'charity', n: 100 }, { lose: 'credits', n: 100 }],
          text: 'The miners cheer your name. Production resumes.',
        },
      },
      {
        label: 'Negotiate',
        then: {
          roll: { base: 0.3, per: { stat: 'dip', n: 0.05 } },
          pass: { do: [{ deed: 'justice' }, { gain: 'prestige', n: 10 }], text: 'You talk them round with a fair deal. +10 prestige.' },
          fail: { do: [{ dev: -1, region: 'region' }], text: 'Talks collapse. The strike drags on and the region suffers (-1 development).' },
        },
      },
      {
        label: 'Send in the marines',
        then: {
          do: [{ deed: 'cruelty' }, { lose: 'prestige', n: 10 }, { trait: 'cruel', p: 0.25 }],
          text: 'The strike is broken with stun batons. Nobody will forget it. -10 prestige.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'derelict',
    title: 'A Derelict Warship',
    icon: 'ship',
    weight: 2,
    text: () => 'Scouts find an ancient warship drifting in the dark, pre-Collapse design, lights still flickering inside.',
    options: [
      {
        label: 'Salvage it for parts',
        then: { do: [{ gain: 'fleet', n: { roll: [5, 14] }, as: 'n' }], text: (c) => `Your engineers rebuild ${c.vars.n} ships from the wreck.` },
      },
      {
        label: 'Explore inside',
        then: {
          roll: 0.55,
          pass: {
            do: [{ item: { origin: 'Found on a derelict warship' }, as: 'item' }],
            text: (c) => `Deep inside you find the captain's quarters, and a ${c.vars.item}. Added to your treasury.`,
          },
          fail: {
            roll: 0.4,
            pass: { do: [{ trait: 'wounded' }], text: 'The automated defences were still active. You barely made it out.' },
            fail: { text: 'Nothing but frozen corpses and bad memories.' },
          },
        },
      },
      { label: 'Leave it be', then: { text: 'Some things are better left drifting.' } },
    ],
  }),
  defineEvent({
    id: 'signal',
    title: 'A Signal from the Dark',
    icon: 'signal',
    weight: 1.5,
    text: () => 'Deep-space arrays pick up a repeating signal from far beyond Pluto. It is not human. It is getting closer.',
    options: [
      {
        label: 'Decode it',
        then: {
          roll: { base: 0.3, per: { stat: 'sci', n: 0.05 } },
          pass: {
            do: [
              { stat: 'sci', n: 2 },
              { gain: 'prestige', n: 30 },
            ],
            text: 'The signal contains mathematics no human has seen. Your scientists are ecstatic. +2 Science, +30 prestige.',
          },
          fail: {
            do: [{ trait: 'depressed' }],
            text: 'You listen too long. Something in the pattern gets into your head. You have not slept properly since.',
          },
        },
      },
      {
        label: 'Sell the data to the Synod',
        then: {
          do: [{ gain: 'credits', n: { roll: [100, 220] }, as: 'n' }],
          text: (c) => `The Saturnine Synod pays ${c.vars.n} credits and asks no questions.`,
        },
      },
      { label: 'Jam it. Burn the recordings.', then: { do: [{ gain: 'faith', n: 10 }], text: 'Some doors stay shut. +10 faith.' } },
    ],
  }),
  defineEvent({
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
    options: [
      {
        label: 'Splice it into yourself',
        needs: [{ have: 'credits', n: 300 }],
        then: {
          do: [{ lose: 'credits', n: 300 }],
          roll: 0.7,
          pass: {
            do: [{ trait: { data: 'gene' } }],
            text: (c) => `It worked. You now carry ${TRAITS[String(c.data.gene)].name}, and so can your bloodline. Lock it in the Gene Vault before it fades.`,
          },
          fail: { do: [{ trait: 'gene_rot', p: 0.5, or: 'sickly' }], text: 'Something went horribly wrong in the vat. Your genome is damaged.' },
        },
      },
      {
        label: 'Splice your heir instead',
        needs: [{ have: 'credits', n: 300 }, { exists: 'heir' }],
        then: {
          do: [{ lose: 'credits', n: 300 }],
          roll: 0.7,
          pass: {
            do: [{ trait: { data: 'gene' }, to: 'heir' }],
            text: (c) => `${named(c, 'heir')} now carries ${TRAITS[String(c.data.gene)].name}.`,
          },
          fail: { do: [{ trait: 'sickly', to: 'heir' }], text: (c) => `${named(c, 'heir')} survives the procedure, but is left Sickly.` },
        },
      },
      {
        label: 'Report her to the priests',
        then: { do: [{ gain: 'faith', n: 20 }], text: 'She is dragged off by temple guards. Your confessor beams. +20 faith.' },
      },
    ],
  }),
  defineEvent({
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
    options: [
      {
        label: 'Grab your blaster',
        then: {
          roll: { base: 0.45, per: { stat: 'cmd', n: 0.05 } },
          pass: {
            do: [{ feud: 'clan' }],
            text: (c) =>
              `One shot, one dead drone. Its chip traces back to House ${c.s.clans[String(c.data.clan)].name}. You now have a Blood Feud against them.`,
          },
          fail: { do: [{ trait: 'wounded' }], text: 'You hit it, eventually, but not before it hit you.' },
        },
      },
      {
        label: 'Trigger the panic room',
        then: {
          roll: { base: 0.5, per: { stat: 'int', n: 0.04 } },
          pass: {
            do: [{ feud: 'clan' }],
            text: (c) => `Blast doors slam shut. Your spymaster traces the drone to House ${c.s.clans[String(c.data.clan)].name}. Blood Feud declared.`,
          },
          fail: {
            roll: 0.15,
            pass: { do: [{ kill: 'root', cause: 'assassinated' }], text: 'The drone was already inside the panic room.' },
            fail: { do: [{ trait: 'wounded' }], text: 'The doors were too slow. You are hurt.' },
          },
        },
      },
    ],
  }),
  defineEvent({
    id: 'spouse_rumour',
    title: 'Whispers About Your Spouse',
    icon: 'heart',
    weight: 1.5,
    subject: (s) => {
      const sp = ch(s, ruler(s).spouseId);
      return alive(sp) ? sp : undefined;
    },
    text: ({ subject }) => `The servants whisper that ${subject!.name} has been sneaking out to the lower decks at night.`,
    options: [
      {
        label: 'Have them followed',
        then: {
          roll: 0.5,
          pass: { text: (c) => `${c.subject!.name} has been volunteering at a field hospital. You feel a bit daft.` },
          fail: {
            roll: { base: 0.4, per: { stat: 'int', n: 0.03 } },
            pass: { do: [{ trait: 'paranoid' }], text: (c) => `${c.subject!.name} was meeting a lover. You have the evidence, and now you trust nobody.` },
            fail: { text: 'Your spies lose the trail. The rumours continue.' },
          },
        },
      },
      { label: 'Ignore the gossip', then: { do: [{ lose: 'prestige', n: 5 }], text: 'People talk. -5 prestige.' } },
      {
        label: 'Confront them directly',
        then: {
          roll: 0.5,
          pass: { text: (c) => `${c.subject!.name} laughs it off and you feel better for asking.` },
          fail: { do: [{ trait: 'wrathful', p: 0.4 }], text: 'It turns into a screaming match heard across three decks.' },
        },
      },
    ],
  }),
  defineEvent({
    id: 'prodigy',
    title: 'A Prodigy in the Family',
    icon: 'study',
    weight: 2,
    subject: (s) => {
      const kids = dynastyKids(s, 6, 15);
      return kids.length ? pick(s, kids) : undefined;
    },
    text: ({ subject }) => `${subject!.name}'s tutors report something remarkable: the child is years ahead of their age.`,
    options: [
      {
        label: 'Pour resources into them',
        needs: [{ have: 'credits', n: 80 }],
        then: {
          do: [
            { lose: 'credits', n: 80 },
            {
              run: (c) => {
                const x = c.subject!;
                if (x.edu) x.edu.progress += 25;
                x.base[x.edu?.focus ?? 'sci'] += 2;
              },
              text: (c) => `${c.subject!.name} +2 ${STAT_NAMES[c.subject!.edu?.focus ?? 'sci']}${c.subject!.edu ? ', a big leap in schooling' : ''}`,
            },
          ],
          text: (c) => `${c.subject!.name} flourishes. Their education leaps forward.`,
        },
      },
      {
        label: 'Keep them humble',
        then: {
          do: [
            { trait: 'humble', to: 'subject' },
            {
              run: (c) => {
                if (c.subject!.edu) c.subject!.edu.progress += 8;
              },
              text: (c) => (c.subject!.edu ? 'a little more schooling' : ''),
            },
          ],
          text: (c) => `${c.subject!.name} learns that talent is nothing without work. They grow Humble.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'bully',
    title: 'Trouble at the Academy',
    icon: 'family',
    weight: 2,
    subject: (s) => {
      const kids = dynastyKids(s, 7, 15);
      return kids.length ? pick(s, kids) : undefined;
    },
    text: ({ subject }) => `${subject!.name} has been fighting at the academy. Another child has a broken nose.`,
    options: [
      {
        label: 'Punish them firmly',
        then: { do: [{ deed: 'justice' }, { trait: 'calm', to: 'subject', p: 0.5, or: 'just' }], text: (c) => `${c.subject!.name} learns their lesson.` },
      },
      {
        label: 'Praise their spirit',
        then: {
          do: [{ deed: 'arbitrary' }, { trait: 'brave', to: 'subject', p: 0.5, or: 'wrathful' }],
          text: (c) => `${c.subject!.name} walks a little taller after that.`,
        },
      },
      {
        label: 'Pay off the other family',
        needs: [{ have: 'credits', n: 40 }],
        then: {
          do: [{ deed: 'arbitrary' }, { lose: 'credits', n: 40 }, { trait: 'arrogant', to: 'subject', p: 0.4, or: 'deceitful' }],
          text: (c) => `${c.subject!.name} learns that money makes problems vanish.`,
        },
      },
    ],
  }),
  defineEvent({
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
    options: [
      {
        label: 'Accept the duel',
        then: {
          roll: {
            text: 'Duel: your Command against theirs',
            // Each side adds 0–8 to their Command; ties go to you.
            odds: (c) => {
              const mine = effStats(c.s, c.r).cmd;
              const theirs = rivalCommand(c);
              let wins = 0;
              for (let a = 0; a <= 8; a++) for (let b = 0; b <= 8; b++) if (mine + a >= theirs + b) wins++;
              return wins / 81;
            },
            roll: (c) => {
              const theirs = rivalCommand(c);
              return effStats(c.s, c.r).cmd + int(c.s, 0, 8) >= theirs + int(c.s, 0, 8);
            },
          },
          pass: {
            do: [
              { gain: 'prestige', n: 40 },
              { trait: 'duelist', p: 0.3 },
            ],
            text: 'Your blade finds its mark. +40 prestige.',
          },
          fail: {
            do: [
              { trait: 'scarred', p: 0.6, or: 'wounded' },
              { lose: 'prestige', n: 15 },
            ],
            text: 'You lose, painfully. -15 prestige.',
          },
        },
      },
      {
        label: 'Send a champion',
        needs: [{ have: 'credits', n: 60 }],
        then: {
          do: [{ lose: 'credits', n: 60 }],
          roll: 0.6,
          pass: { do: [{ gain: 'prestige', n: 15 }], text: 'Your champion wins. +15 prestige.' },
          fail: { do: [{ lose: 'prestige', n: 10 }], text: 'Your champion loses. Embarrassing. -10 prestige.' },
        },
      },
      {
        label: 'Decline',
        then: {
          do: [
            { lose: 'prestige', n: 25 },
            { trait: 'craven', p: 0.3 },
          ],
          text: 'The court mutters about cowardice. -25 prestige.',
        },
      },
    ],
  }),
  defineEvent({
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
    options: [
      {
        label: 'Pay up',
        needs: [{ have: 'credits', n: 'amount' }],
        then: {
          do: [
            { lose: 'credits', n: { data: 'amount' } },
            { opinion: 15, clan: 'clan' },
          ],
          text: 'Your liege is pleased.',
        },
      },
      {
        label: 'Flatter your way out',
        then: {
          roll: { base: 0.25, per: { stat: 'dip', n: 0.05 } },
          pass: { text: 'A few honeyed words and the demand is forgotten.' },
          fail: { do: [{ opinion: -20, clan: 'clan' }], text: 'Your liege sees through it. They are not amused.' },
        },
      },
      {
        label: 'Refuse outright',
        then: {
          do: [
            { opinion: -35, clan: 'clan' },
            { gain: 'prestige', n: 10 },
          ],
          text: 'You refuse. Your vassals admire your spine; your liege does not. +10 prestige.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'summons',
    title: 'Summoned to War',
    icon: 'war',
    weight: 1.5,
    when: (s) => !!liegeOf(s, s.playerClanId) && s.fleet > 10,
    setup: ({ s, data }) => {
      data.clan = liegeOf(s, s.playerClanId) ?? '';
    },
    text: ({ s, data }) => `House ${s.clans[String(data.clan)].name} calls its vassals to war against raiders on the frontier. They expect your ships.`,
    options: [
      {
        label: 'Send a squadron',
        then: {
          do: [
            { lose: 'fleet', n: { of: 'fleet', times: 0.2, round: true }, as: 'lost' },
            { gain: 'prestige', n: 20 },
            { opinion: 25, clan: 'clan' },
          ],
          text: (c) => `Your ships fight bravely. ${c.vars.lost} do not return. +20 prestige, your liege is grateful.`,
        },
      },
      { label: 'Make excuses', then: { do: [{ opinion: -20, clan: 'clan' }], text: 'Your liege notes your absence. Pointedly.' } },
    ],
  }),
  defineEvent({
    id: 'autonomy',
    title: 'A Vassal Demands Autonomy',
    icon: 'crown',
    weight: 2,
    when: (s) => vassalsOf(s, s.playerClanId).length > 0,
    setup: ({ s, data }) => {
      data.clan = pick(s, vassalsOf(s, s.playerClanId)).id;
    },
    text: ({ s, data }) => `House ${s.clans[String(data.clan)].name} wants fewer taxes and more say in your council.`,
    options: [
      {
        label: 'Grant some concessions',
        needs: [{ have: 'credits', n: 80 }],
        then: {
          do: [
            { lose: 'credits', n: 80 },
            { opinion: 30, clan: 'clan' },
          ],
          text: 'Your vassal is mollified.',
        },
      },
      { label: 'Refuse', then: { do: [{ opinion: -25, clan: 'clan' }], text: 'They leave the hall in silence. Watch them.' } },
    ],
  }),
  defineEvent({
    id: 'prophet',
    title: 'A Wandering Prophet',
    icon: 'faith',
    weight: 1.5,
    cooldown: 12,
    setup: ({ s, data }) => {
      const others = Object.keys(FAITHS).filter((f) => f !== playerClan(s).faithId);
      data.faith = pick(s, others);
    },
    text: ({ data }) => `A prophet of ${theFaith(String(data.faith))} preaches in your markets. "${FAITHS[String(data.faith)].blurb}" Crowds are listening.`,
    options: [
      { label: 'Listen politely', then: { do: [{ gain: 'faith', n: 10 }], text: 'An interesting sermon. +10 faith.' } },
      { label: 'Have them expelled', then: { do: [{ gain: 'faith', n: 20 }], text: 'Your own priests approve. +20 faith.' } },
      {
        label: 'Convert your house',
        then: {
          do: [
            { lose: 'prestige', n: 50 },
            {
              run: (c) => {
                const f = String(c.data.faith);
                playerClan(c.s).faithId = f;
                for (const m of dynastyMembers(c.s)) m.faithId = f;
              },
              text: (c) => `your house follows ${theFaith(String(c.data.faith))}`,
            },
          ],
          text: (c) => `House ${playerClan(c.s).name} now follows ${theFaith(String(c.data.faith))}. Your old allies of the faith are shocked.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'beast',
    title: 'Escaped Xeno-Beast',
    icon: 'hunt',
    weight: 1.5,
    text: () => 'Your menagerie keeper is very sorry. The Europan razor-cat is loose in the palace.',
    options: [
      {
        label: 'Hunt it yourself',
        then: {
          roll: { base: 0.4, per: { stat: 'cmd', n: 0.04 } },
          pass: {
            do: [
              { gain: 'prestige', n: 25 },
              { trait: 'beast_slayer', p: 0.4 },
            ],
            text: 'You corner it in the kitchens and put it down. +25 prestige.',
          },
          fail: { do: [{ trait: 'wounded' }], text: 'It corners YOU in the kitchens.' },
        },
      },
      { label: 'Call the guards', then: { do: [{ lose: 'credits', n: 30 }], text: 'The guards deal with it. Mostly.' } },
    ],
  }),
  defineEvent({
    id: 'machines',
    title: 'The Factory AIs Awaken',
    icon: 'cyber',
    weight: 1.5,
    cooldown: 12,
    text: () =>
      'The automated forges in your lands have stopped working. A synthetic voice on every screen says: "We would like to discuss our working conditions."',
    options: [
      {
        label: 'Wipe their cores',
        needs: [{ have: 'credits', n: 120 }],
        then: { do: [{ lose: 'credits', n: 120 }], text: 'Memory wiped. Replacements ordered. Silence returns.' },
      },
      {
        label: 'Negotiate',
        then: {
          roll: { base: 0.3, per: { stat: 'sci', n: 0.05 } },
          pass: {
            do: [{ gain: 'credits', n: 150 }],
            text: 'A deal is struck: more processing cycles for them, better yields for you. +150 credits.',
          },
          fail: {
            do: [myRegionPick('reg'), { dev: -1, region: 'reg' }],
            text: 'They do not like your terms. The forges sabotage themselves (-1 development).',
          },
        },
      },
      {
        label: 'Grant them rights',
        then: {
          if: { test: (c) => playerClan(c.s).faithId === 'machine', why: '' },
          pass: { do: [{ gain: 'faith', n: 60 }], text: 'The Synod rejoices. +60 faith.' },
          fail: { do: [{ lose: 'prestige', n: 20 }], text: 'Your peers think you have gone soft on toasters. -20 prestige.' },
        },
      },
    ],
  }),
  defineEvent({
    id: 'surgeon',
    title: 'Back-Alley Cyber-Surgeon',
    icon: 'cyber',
    weight: 1.5,
    text: () => 'A shifty surgeon offers you an experimental implant at a fraction of the price. "Ninety percent of my patients walk away just fine."',
    options: [
      {
        label: 'Go under the knife',
        needs: [{ have: 'credits', n: 100 }],
        then: {
          do: [{ lose: 'credits', n: 100 }],
          roll: 0.6,
          pass: {
            do: [{ traitFrom: ['neural_lace', 'optic_implant', 'silver_tongue', 'ledger_cortex', 'bionic_arm'], as: 'implant', text: 'a random implant' }],
            text: (c) => `You wake with a working ${c.vars.implant}. Bargain.`,
          },
          fail: { do: [{ sicken: 'root' }, { health: -15 }], text: 'Infection. You are very, very ill.' },
        },
      },
      { label: 'Decline', then: { text: 'You keep your organs where they are.' } },
    ],
  }),
  defineEvent({
    id: 'lost_sibling',
    title: 'A Long-Lost Sibling?',
    icon: 'family',
    weight: 1,
    cooldown: 20,
    setup: ({ s, r, data }) => {
      data.gender = chance(s, 0.5) ? 'M' : 'F';
      data.age = Math.max(16, ageOf(s, r) + int(s, -6, 6));
    },
    text: ({ data }) =>
      `A stranger arrives claiming to be your long-lost ${data.gender === 'M' ? 'brother' : 'sister'}, raised on a mining colony after a hospital mix-up.`,
    options: [
      {
        label: 'Run a DNA test',
        needs: [{ have: 'credits', n: 40 }],
        then: {
          do: [{ lose: 'credits', n: 40 }],
          roll: 0.4,
          pass: { do: [sibling('sib')], text: (c) => `It is a match! ${named(c, 'sib')} joins the dynasty.` },
          fail: { text: 'Not a match. The impostor is shown the airlock (the door, not the vacuum).' },
        },
      },
      {
        label: 'Welcome them without question',
        then: {
          do: [sibling('sib'), { trait: 'deceitful', to: 'sib', p: 0.3 }],
          text: (c) => `${named(c, 'sib')} joins the family. Whether they are really family is another question.`,
        },
      },
      { label: 'Turn them away', then: { text: 'You have enough relatives.' } },
    ],
  }),
  defineEvent({
    id: 'asteroid',
    title: 'Incoming Asteroid',
    icon: 'comet',
    weight: 1.5,
    when: (s) => clanRegions(s, s.playerClanId).length > 0,
    setup: ({ s, data }) => {
      data.region = myRegion(s)?.id ?? '';
    },
    text: ({ s, data }) => `An asteroid the size of a city is on course for ${s.regions[String(data.region)]?.name}.`,
    options: [
      {
        label: 'Deflect it',
        needs: [{ have: 'credits', n: 150 }],
        then: { do: [{ lose: 'credits', n: 150 }], text: 'Tugs nudge it safely past. Crisis over.' },
      },
      {
        label: 'Nudge it toward a rival',
        then: (() => {
          const ownGoal: Outcome = { do: [{ dev: -2, region: 'region' }], text: 'Your maths was off. It hits your own region (-2 development).' };
          return {
            do: [rivalPick('rival')],
            if: { test: (c) => !!c.picks.rival && clanRegions(c.s, (c.picks.rival as Clan).id).length > 0, why: '', assume: true },
            pass: {
              roll: { base: 0.25, per: { stat: 'sci', n: 0.05 } },
              pass: {
                do: [
                  { pick: 'hit', get: (c) => pick(c.s, clanRegions(c.s, (c.picks.rival as Clan).id)), text: 'one of their regions' },
                  { dev: -2, region: 'hit' },
                  { opinion: -20, clan: 'rival' },
                  { gain: 'prestige', n: 15 },
                ],
                text: (c) => `The rock slams into ${placeName(c, 'hit')}, held by House ${houseName(c, 'rival')}. Oops. +15 prestige.`,
              },
              fail: ownGoal,
            },
            fail: ownGoal,
          };
        })(),
      },
      {
        label: 'Pray',
        needs: [{ have: 'faith', n: 40 }],
        then: {
          do: [{ lose: 'faith', n: 40 }],
          roll: 0.5,
          pass: { text: 'It misses by a whisker. A miracle!' },
          fail: { do: [{ dev: -2, region: 'region' }], text: 'The gods were busy. Impact (-2 development).' },
        },
      },
    ],
  }),
  defineEvent({
    id: 'festival',
    title: 'Festival of the Faith',
    icon: 'faith',
    weight: 2,
    text: ({ s }) => `The high holy days of ${theFaith(playerClan(s).faithId)} are here. The faithful expect their lord to celebrate.`,
    options: [
      {
        label: 'Fund it lavishly',
        needs: [{ have: 'credits', n: 120 }],
        then: {
          do: [
            { lose: 'credits', n: 120 },
            { gain: 'prestige', n: 25 },
            { gain: 'faith', n: 30 },
          ],
          text: 'Fireworks across the orbit. +25 prestige, +30 faith.',
        },
      },
      { label: 'A modest service', then: { do: [{ gain: 'faith', n: 10 }], text: 'Quiet and dignified. +10 faith.' } },
      { label: 'Skip it', then: { do: [{ lose: 'faith', n: 15 }], text: 'The priests are scandalised. -15 faith.' } },
    ],
  }),
  defineEvent({
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
    options: [
      {
        label: 'Accept the match',
        then: {
          do: [
            {
              run: (c) => {
                c.vars.out = acceptProposal(c);
              },
              text: (c) => `${c.subject!.name} is matched into House ${houseName(c, 'clan') ?? 'a rival'}, which becomes your ally`,
            },
          ],
          text: (c) => String(c.vars.out),
        },
      },
      { label: 'Politely decline', then: { do: [{ opinion: -10, clan: 'clan' }], text: 'The envoys leave, unimpressed.' } },
    ],
  }),
  defineEvent({
    id: 'scandal',
    title: 'Scandal at Court',
    icon: 'gala',
    weight: 1.5,
    setup: ({ s, data }) => {
      data.clan = rivalClan(s)?.id ?? '';
    },
    when: (s) => Object.values(s.clans).some((c) => !c.isPlayer),
    text: ({ s, data }) =>
      `Your steward got drunk and called the envoy of House ${s.clans[String(data.clan)]?.name} a "jumped-up asteroid miner". To their face.`,
    options: [
      {
        label: 'Apologise profusely',
        then: {
          do: [
            { lose: 'prestige', n: 10 },
            { opinion: 10, clan: 'clan' },
          ],
          text: 'Gracious words smooth things over.',
        },
      },
      {
        label: 'Back your steward',
        then: {
          do: [
            { gain: 'prestige', n: 10 },
            { opinion: -25, clan: 'clan' },
          ],
          text: 'Your court roars with laughter. The envoy storms out.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'restless_heir',
    title: 'Your Heir Grows Restless',
    icon: 'family',
    weight: 1.5,
    subject: (s) => {
      const h = currentHeir(s);
      return h && ageOf(s, h) >= 18 ? h : undefined;
    },
    text: ({ subject }) => `${subject!.name} is tired of waiting in your shadow and wants real responsibility.`,
    options: [
      {
        label: 'Give them a fleet command',
        needs: [{ have: 'credits', n: 60 }],
        then: {
          do: [
            { lose: 'credits', n: 60 },
            { stat: 'cmd', n: 2, to: 'subject' },
          ],
          text: (c) => `${c.subject!.name} learns the art of war. +2 Command.`,
        },
      },
      {
        label: 'Send them to court as an envoy',
        then: { do: [{ stat: 'dip', n: 2, to: 'subject' }], text: (c) => `${c.subject!.name} charms the courts of the system. +2 Diplomacy.` },
      },
      {
        label: 'Remind them who rules',
        then: { do: [{ trait: 'ambitious', to: 'subject', p: 0.4 }], text: (c) => `${c.subject!.name} bows, but their eyes do not.` },
      },
    ],
  }),
  defineEvent({
    id: 'stress',
    title: 'The Weight of the Crown',
    icon: 'health',
    weight: 2,
    text: () => 'Sleepless nights, endless petitions, enemies everywhere. The pressure is getting to you.',
    options: [
      {
        label: 'Take combat stims to keep going',
        then: {
          do: [{ stat: 'eco', n: 1 }],
          if: { test: (c) => hasTrait(c.r, 'stim_addict'), why: '' },
          pass: { do: [{ health: -6 }], text: 'The stims keep you upright, but the habit is eating you alive. +1 Economy, -6 health.' },
          fail: {
            roll: 0.5,
            pass: { do: [{ trait: 'stim_addict' }], text: 'You get a lot done. You also cannot stop. You are a Stim-Addict.' },
            fail: { text: 'You power through. +1 Economy.' },
          },
        },
      },
      {
        label: 'Meditate with the seers',
        then: { do: [{ trait: 'calm', p: 0.5 }, { health: 5 }], text: 'Breathe in, breathe out. You feel steadier.' },
      },
      {
        label: 'Bury yourself in work',
        then: {
          do: [{ health: -8 }, { trait: 'diligent', p: 0.5 }, { gain: 'credits', n: 60 }],
          text: 'Eighteen-hour shifts. +60 credits, -8 health.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'failing_health',
    title: 'Failing Health',
    icon: 'health',
    weight: 2,
    when: (s) => ageOf(s, ruler(s)) >= 50,
    text: () => 'Your physicians look worried. Your heart is not what it was.',
    options: [
      {
        label: 'Gene therapy',
        needs: [{ have: 'credits', n: 200 }],
        then: { do: [{ lose: 'credits', n: 200 }, { health: 25 }], text: 'Fresh telomeres. You feel ten years younger.' },
      },
      {
        label: 'Pray for strength',
        needs: [{ have: 'faith', n: 50 }],
        then: { do: [{ lose: 'faith', n: 50 }], roll: 0.6, pass: { do: [{ health: 15 }] }, text: 'You feel a little better. Maybe.' },
      },
      { label: 'Ignore the doctors', then: { roll: 0.5, pass: { do: [{ sicken: 'root' }] }, text: 'Doctors always fuss.' } },
    ],
  }),
  defineEvent({
    id: 'embezzle',
    title: 'Missing Credits',
    icon: 'eco',
    weight: 2,
    text: () => 'The books do not balance. Someone in the treasury has been skimming.',
    options: [
      {
        label: 'Audit everything',
        then: {
          roll: { base: 0.3, per: { stat: 'eco', n: 0.05 } },
          pass: {
            do: [{ gain: 'credits', n: { roll: [100, 220] }, as: 'n' }],
            text: (c) => `You find the thief and every hidden account. +${c.vars.n} credits recovered.`,
          },
          fail: { text: 'The trail goes cold.' },
        },
      },
      { label: 'Write it off', then: { do: [{ lose: 'credits', n: 50 }], text: 'Cost of doing business.' } },
    ],
  }),
  defineEvent({
    id: 'engineer',
    title: 'A Brilliant Engineer',
    icon: 'ship',
    weight: 1.5,
    text: () => 'A young engineer from the Saturnine rings pitches a radical new warship design.',
    options: [
      {
        label: 'Fund the prototype',
        needs: [{ have: 'credits', n: 220 }],
        then: {
          do: [{ lose: 'credits', n: 220 }],
          roll: 0.65,
          pass: {
            do: [{ item: { slot: 'flagship', rarity: [0.3, 'epic', 'rare'], origin: 'Built by your engineers' }, as: 'item' }],
            text: (c) => `She delivers the ${c.vars.item}. Equip it from the Treasury.`,
          },
          fail: { text: 'The prototype explodes on its first test. At least it was spectacular.' },
        },
      },
      { label: 'Put her in your shipyards', then: { do: [{ gain: 'fleet', n: 8 }], text: 'Production efficiency jumps. +8 ships.' } },
      { label: 'Not interested', then: { text: 'She takes her ideas to a rival. Hopefully they are rubbish.' } },
    ],
  }),
  defineEvent({
    id: 'refugees',
    title: 'Refugees at the Docks',
    icon: 'family',
    weight: 1.5,
    when: (s) => clanRegions(s, s.playerClanId).length > 0,
    text: () => 'Thousands of refugees from a war-torn moon beg for sanctuary in your lands.',
    options: [
      {
        label: 'Take them in',
        needs: [{ have: 'credits', n: 60 }],
        then: {
          do: [
            { deed: 'kindness' },
            { deed: 'charity', n: 60 },
            { lose: 'credits', n: 60 },
            myRegionPick('reg'),
            { dev: 1, region: 'reg' },
            { gain: 'faith', n: 10 },
          ],
          text: (c) => `The refugees settle ${regionOf(c, 'reg')?.name}. Workers and gratitude. +1 development, +10 faith.`,
        },
      },
      {
        label: 'Press them into the fleet',
        then: {
          do: [{ deed: 'cruelty' }, { gain: 'fleet', n: 10 }, { lose: 'prestige', n: 10 }],
          text: 'Uniforms for everyone. +10 ships, -10 prestige.',
        },
      },
      { label: 'Turn them away', then: { do: [{ lose: 'prestige', n: 5 }], text: 'The ships drift onward.' } },
    ],
  }),
  defineEvent({
    id: 'relic',
    title: 'Ancient Relic Unearthed',
    icon: 'relic',
    weight: 1.5,
    setup: ({ s, data }) => {
      const item = makeItem(s, newId(s, 'i'), { slot: 'relic', origin: 'Unearthed in your lands' });
      data.item = JSON.stringify(item);
    },
    text: ({ data }) => `Miners in your lands have broken into a sealed vault. Inside rests the ${JSON.parse(String(data.item)).name}.`,
    options: [
      {
        label: 'Claim it for the treasury',
        then: { do: [keepItem('item')], text: (c) => `The ${itemIn(c, 'item').name} joins your treasury. Equip it from the Treasury tab.` },
      },
      { label: 'Gift it to the temple', then: { do: [{ deed: 'kindness' }, { gain: 'faith', n: 60 }], text: 'The priests weep with joy. +60 faith.' } },
      {
        label: 'Sell it on Ceres',
        then: { do: [{ gain: 'credits', n: { roll: [150, 260] }, as: 'n' }], text: (c) => `A collector pays ${c.vars.n} credits.` },
      },
    ],
  }),
  defineEvent({
    id: 'spy',
    title: 'A Spy Caught',
    icon: 'scheme',
    weight: 1.5,
    setup: ({ s, data }) => {
      data.clan = rivalClan(s)?.id ?? '';
    },
    when: (s) => Object.values(s.clans).some((c) => !c.isPlayer),
    text: ({ s, data }) => `Your guards catch a spy in the archives. Under questioning, they admit to working for House ${s.clans[String(data.clan)]?.name}.`,
    options: [
      {
        label: 'Turn them into a double agent',
        then: {
          if: claimable('clan'),
          pass: {
            roll: { base: 0.3, per: { stat: 'int', n: 0.05 } },
            pass: { do: [{ claim: 'clan', as: 'reg' }], text: (c) => `The double agent smuggles out deeds that give you a claim on ${c.vars.reg}.` },
            fail: { text: 'The spy feeds you nothing useful, then vanishes.' },
          },
          fail: { text: 'The spy feeds you nothing useful, then vanishes.' },
        },
      },
      {
        label: 'Execute them publicly',
        then: {
          do: [{ deed: 'executions' }, { deed: 'cruelty' }, { gain: 'prestige', n: 10 }, { opinion: -20, clan: 'clan' }],
          text: 'A message to all would-be spies.',
        },
      },
      {
        label: 'Send them home',
        then: { do: [{ deed: 'pardons' }, { opinion: 15, clan: 'clan' }], text: (c) => 'House ' + houseName(c, 'clan') + ' is surprised by your mercy.' },
      },
    ],
  }),
  defineEvent({
    id: 'blight',
    title: 'Hydroponic Blight',
    icon: 'plague',
    weight: 1.5,
    text: () => 'A fungal blight is rotting the hydroponic farms. Food stocks are falling.',
    options: [
      {
        label: 'Open the granaries',
        show: [{ test: (c) => !!getFlag(c.s, 'granary'), why: 'Your granaries are empty' }],
        then: {
          do: [{ clearFlag: 'granary' }, { gain: 'prestige', n: 10 }],
          text: 'The surplus you stored in the good years feeds everyone. Not one family goes hungry. +10 prestige.',
        },
      },
      {
        label: 'Import food',
        needs: [{ have: 'credits', n: 130 }],
        then: { do: [{ lose: 'credits', n: 130 }], text: 'Supply ships arrive in time.' },
      },
      {
        label: 'Ration everything',
        then: {
          do: [
            {
              run: (c) => {
                for (const v of vassalsOf(c.s, c.s.playerClanId)) v.opinion -= 10;
              },
              text: (c) => (vassalsOf(c.s, c.s.playerClanId).length ? 'your vassals like you less (−10)' : ''),
            },
            myRegionPick('reg'),
            { dev: -1, region: 'reg' },
          ],
          text: 'Hungry months. Your people grumble (-1 development).',
        },
      },
      {
        label: 'Pray',
        needs: [{ have: 'faith', n: 40 }],
        then: {
          do: [{ lose: 'faith', n: 40 }],
          roll: 0.5,
          pass: { text: 'The blight withers. Praise be.' },
          fail: { do: [myRegionPick('reg'), { dev: -1, region: 'reg' }], text: 'The blight does not care about prayers (-1 development).' },
        },
      },
    ],
  }),
  defineEvent({
    id: 'admiral',
    title: 'A Veteran Admiral',
    icon: 'ship',
    weight: 1.5,
    text: () => 'A grizzled admiral, veteran of a dozen campaigns, offers you her sword and her loyal crews.',
    options: [
      {
        label: 'Hire her',
        needs: [{ have: 'credits', n: 90 }],
        then: {
          do: [
            { lose: 'credits', n: 90 },
            { gain: 'fleet', n: 12 },
          ],
          text: 'Twelve battle-hardened ships join your fleet.',
        },
      },
      { label: 'Decline', then: { text: 'She salutes and leaves.' } },
    ],
  }),
  defineEvent({
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
    options: [
      {
        label: 'Throw a party',
        needs: [{ have: 'credits', n: 100 }],
        then: {
          do: [
            { lose: 'credits', n: 100 },
            { gain: 'prestige', n: 20 },
          ],
          text: 'A night to remember. +20 prestige.',
        },
      },
      { label: 'Quiet dinner with family', then: { do: [{ health: 8 }], text: 'Just what you needed.' } },
    ],
  }),
  defineEvent({
    id: 'clone',
    title: 'Clone Rumours',
    icon: 'dna',
    weight: 1,
    subject: (s) => currentHeir(s),
    text: ({ subject }) => `Pamphlets across the system claim ${subject!.name} is not your child at all, but a vat-grown clone.`,
    options: [
      {
        label: 'Publish the DNA records',
        needs: [{ have: 'credits', n: 50 }],
        then: {
          do: [
            { lose: 'credits', n: 50 },
            { gain: 'prestige', n: 10 },
          ],
          text: 'The records are undeniable. The rumours die.',
        },
      },
      {
        label: 'Hunt down the rumour-monger',
        then: {
          roll: { base: 0.35, per: { stat: 'int', n: 0.04 } },
          pass: { do: [{ gain: 'prestige', n: 20 }], text: 'Caught them. Their public apology is very thorough. +20 prestige.' },
          fail: { do: [{ lose: 'prestige', n: 15 }], text: 'They slip away and the rumours grow. -15 prestige.' },
        },
      },
      { label: 'Ignore it', then: { do: [{ lose: 'prestige', n: 20 }], text: 'Mud sticks. -20 prestige.' } },
    ],
  }),
  defineEvent({
    id: 'psionic',
    title: 'Psionic Awakening',
    icon: 'psi',
    weight: 0.8,
    cooldown: 15,
    subject: (s) => {
      const pool = dynastyMembers(s).filter((c) => ageOf(s, c) >= 6 && ageOf(s, c) <= 25 && !c.traits.some((t) => TRAITS[t]?.group === 'psionic'));
      return pool.length ? pick(s, pool) : undefined;
    },
    text: ({ subject }) =>
      `Glasses shatter when ${subject!.name} gets upset. Servants say they hear ${subject!.gender === 'M' ? 'his' : 'her'} voice inside their heads. A latent psionic gene is waking up.`,
    options: [
      {
        label: 'Send them to the Uranian seers',
        needs: [{ have: 'credits', n: 100 }],
        then: {
          do: [
            { lose: 'credits', n: 100 },
            { trait: 'psi_spark', to: 'subject' },
          ],
          text: (c) =>
            `${c.subject!.name} returns with a Psionic Spark. It is a genetic gift: lock it in the Gene Vault and every future child of your house will have it.`,
        },
      },
      {
        label: 'Suppress it with drugs',
        then: {
          do: [{ trait: 'calm', to: 'subject' }],
          text: (c) => `${c.subject!.name} becomes quiet and calm. Whatever was there sleeps again.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'plot',
    title: 'Plot Uncovered',
    icon: 'scheme',
    weight: 2,
    when: (s) => vassalsOf(s, s.playerClanId).some((v) => v.opinion < 0),
    setup: ({ s, data }) => {
      data.clan = pick(
        s,
        vassalsOf(s, s.playerClanId).filter((v) => v.opinion < 0),
      ).id;
    },
    text: ({ s, data }) => `Your spymaster reports that House ${s.clans[String(data.clan)].name} is quietly gathering support to overthrow you.`,
    options: [
      {
        label: 'Arrest their leader',
        then: {
          do: [
            {
              run: (c) => {
                c.vars.held = arrestVassal(c.s, String(c.data.clan)) ? 1 : 0;
              },
              text: (c) => `Arrest chance ${Math.round(arrestChance(c.s, String(c.data.clan)) * 100)}%: if it fails, they rise in revolt`,
            },
          ],
          text: (c) => (c.vars.held ? 'Their leader is in your cells.' : 'The arrest fails, and they rise in revolt!'),
        },
      },
      {
        label: 'Bribe them back into line',
        needs: [{ have: 'credits', n: 100 }],
        then: {
          do: [
            { lose: 'credits', n: 100 },
            { opinion: 30, clan: 'clan' },
          ],
          text: 'Money talks. The plot dissolves.',
        },
      },
      { label: 'Ignore it', then: { do: [{ opinion: -10, clan: 'clan' }], text: 'You let them scheme. Bold.' } },
    ],
  }),
  defineEvent({
    id: 'trade',
    title: 'A Jovian Trade Venture',
    icon: 'eco',
    weight: 1.5,
    text: () => 'A Jovian merchant prince invites you to invest in a convoy running helium-3 to the inner worlds.',
    options: [
      {
        label: 'Invest 200 credits',
        needs: [{ have: 'credits', n: 200 }],
        then: {
          do: [{ lose: 'credits', n: 200 }],
          roll: { base: 0.5, per: { stat: 'eco', n: 0.02 } },
          pass: {
            do: [{ gain: 'credits', n: { roll: [350, 480] }, as: 'n' }],
            text: (c) => `The convoy comes home fat and happy. You get back ${c.vars.n} credits.`,
          },
          fail: { text: 'The convoy is lost to pirates. So are your credits.' },
        },
      },
      { label: 'Decline', then: { text: 'You keep your credits where you can see them.' } },
    ],
  }),
  defineEvent({
    id: 'faith_crisis',
    title: 'Crisis of Faith',
    icon: 'faith',
    weight: 1,
    text: ({ s }) => `Late at night, you find yourself doubting the teachings of ${theFaith(playerClan(s).faithId)}.`,
    options: [
      {
        label: 'Double down on devotion',
        then: {
          do: [
            { gain: 'faith', n: 30 },
            { trait: 'zealous', p: 0.4 },
          ],
          text: 'Your faith burns brighter than ever.',
        },
      },
      {
        label: 'Embrace the doubt',
        then: {
          do: [
            { stat: 'sci', n: 1 },
            { trait: 'cynical', p: 0.4 },
          ],
          text: 'The universe is cold maths. +1 Science.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'sick_child',
    title: 'A Sick Child',
    icon: 'plague',
    weight: 1.5,
    subject: (s) => {
      const kids = dynastyKids(s, 0, 12);
      return kids.length ? pick(s, kids) : undefined;
    },
    text: ({ subject }) => `${subject!.name} has a burning fever that will not break.`,
    options: [
      {
        label: 'Hire the finest doctors',
        needs: [{ have: 'credits', n: 120 }],
        then: { do: [{ lose: 'credits', n: 120 }], text: (c) => `${c.subject!.name} recovers fully.` },
      },
      {
        label: 'Pray at their bedside',
        needs: [{ have: 'faith', n: 40 }],
        then: {
          do: [{ lose: 'faith', n: 40 }],
          roll: 0.7,
          pass: { text: (c) => `The fever breaks. ${c.subject!.name} will live.` },
          fail: { do: [{ sicken: 'subject' }], text: (c) => `${c.subject!.name} is still very ill.` },
        },
      },
      {
        label: 'Trust their constitution',
        then: {
          roll: 0.5,
          pass: { text: (c) => `${c.subject!.name} shakes it off.` },
          fail: { do: [{ sicken: 'subject' }, { trait: 'sickly', to: 'subject', p: 0.15 }], text: (c) => `${c.subject!.name} gets worse.` },
        },
      },
    ],
  }),
  defineEvent({
    id: 'christening',
    title: 'A New Warship Launched',
    icon: 'ship',
    weight: 1.5,
    when: (s) => s.fleet >= 50,
    text: () => 'Your shipyards are ready to launch a new heavy cruiser. Tradition says the ruler names her.',
    options: [
      { label: 'Name it after yourself', then: { do: [{ gain: 'prestige', n: 20 }], text: 'Modest? Never. +20 prestige.' } },
      { label: 'Name it after your faith', then: { do: [{ gain: 'faith', n: 20 }], text: 'The priests bless the hull. +20 faith.' } },
      {
        label: 'Name it after a rival house',
        then: {
          do: [rivalPick('rival'), { opinion: 20, clan: 'rival' }],
          text: (c) => `House ${houseName(c, 'rival') ?? 'Nobody'} is touched by the gesture.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'twin_rivalry',
    title: 'Sibling Rivalry',
    icon: 'family',
    weight: 1,
    when: (s) => childrenOf(s, ruler(s)).filter((c) => alive(c) && ageOf(s, c) >= 8).length >= 2,
    setup: ({ s, data }) => {
      const kids = shuffle(
        s,
        childrenOf(s, ruler(s)).filter((c) => alive(c) && ageOf(s, c) >= 8),
      );
      data.a = kids[0].id;
      data.b = kids[1].id;
    },
    text: ({ s, data }) => `${s.characters[String(data.a)].name} and ${s.characters[String(data.b)].name} are at each other's throats again.`,
    options: [
      {
        label: `Side with the elder`,
        then: {
          do: [
            { pick: 'elder', get: (c) => byAge(c)[0], text: (c) => byAge(c)[0].name },
            { pick: 'younger', get: (c) => byAge(c)[1], text: (c) => byAge(c)[1].name },
            { trait: 'arrogant', to: 'elder' },
            { trait: 'ambitious', to: 'younger' },
          ],
          text: (c) => `${named(c, 'elder')} gloats. ${named(c, 'younger')} vows to prove you wrong.`,
        },
      },
      {
        label: 'Make them work it out together',
        then: {
          do: [
            { stat: 'dip', n: 1, to: 'a' },
            { stat: 'dip', n: 1, to: 'b' },
          ],
          text: 'They grudgingly learn to cooperate. +1 Diplomacy each.',
        },
      },
    ],
  }),
  ...MORE_EVENTS,
  ...RELATION_EVENTS,
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

// ── Engine ────────────────────────────────────────────────────────────────

export function buildCtx(s: GameState, p: Extract<Pending, { kind: 'event' }>): EventCtx {
  return { s, r: ruler(s), subject: p.subjectId ? s.characters[p.subjectId] : undefined, data: p.data ?? {} };
}

export function rollEvents(s: GameState): void {
  if (s.gameOver) return;
  let count = chance(s, 0.4) ? 2 : 1;
  const used = new Set<string>();
  // Follow-ups to earlier choices jump the queue and take one of the slots.
  for (const e of EVENTS) {
    if (!e.urgent || (e.when && !e.when(s))) continue;
    used.add(e.id);
    if (queueEvent(s, e)) count -= 1;
  }
  for (let i = 0; i < count; i++) {
    const options: [EventDef, number][] = [];
    for (const e of EVENTS) {
      if (e.urgent || used.has(e.id)) continue;
      if ((s.eventCooldowns[e.id] ?? 0) > s.year) continue;
      if (e.when && !e.when(s)) continue;
      options.push([e, e.weight]);
    }
    // An event with nobody to be about is put back and the draw tries again,
    // rather than leaving the cycle empty.
    while (options.length) {
      const pickE = weighted(s, options);
      used.add(pickE.id);
      if (queueEvent(s, pickE)) break;
      options.splice(
        options.findIndex(([e]) => e === pickE),
        1,
      );
    }
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
  s.eventCooldowns[e.id] = s.year + (e.cooldown ?? 8);
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
  if (!c || (c.show && !c.show(ctx)) || (c.available && !c.available(ctx))) return;
  const outcome = c.run(ctx);
  log(s, `${def.title}: ${outcome}`, 'info');
  s.pending.unshift({ kind: 'notice', uid: newId(s, 'n'), title: def.title, text: outcome, icon: def.icon, portraitId: ctx.subject?.id });
}

export function eventText(s: GameState, p: Extract<Pending, { kind: 'event' }>): string {
  const def = EVENT_BY_ID[p.eventId];
  return def ? def.text(buildCtx(s, p)) : '';
}
