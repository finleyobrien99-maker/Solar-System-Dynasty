// The court deck: life at court, family drama and stories that pay off years
// later. Shuffled into the main deck in events.ts.

import { createCharacter } from './character';
import { ageOf, alive, canAct, ch, clanRegions, courtMembers, fullName, hasTrait, newId, playerClan, ruler } from './core';
import { defineEvent, type Cond, type Ctx, type Outcome } from './dsl';
import { catchable, named } from './eventBits';
import { clearFlag, dynastyKids, flagDue, getFlag, myRegion, pr, rivalClan, type EventCtx, type EventDef } from './eventKit';
import { makeItem } from './items';
import { currentHeir } from './life';
import { makeName, theFaith } from './planets';
import { lovers } from './relations';
import { chance, int, pick, rand } from './rng';
import { TRAITS } from './traits';
import type { Character, GameState, Item } from './types';

// ── Helpers ───────────────────────────────────────────────────────────────

function hasRival(s: GameState): boolean {
  return Object.values(s.clans).some((c) => !c.isPlayer && clanRegions(s, c.id).length > 0);
}

function clan(c: EventCtx) {
  return c.s.clans[String(c.data.clan)];
}

function other(c: EventCtx): Character {
  return c.s.characters[String(c.data.who)];
}

/** A short, unflattering caricature built from the ruler's own traits. */
function caricature(r: Character): string {
  const jokes: [string, string][] = [
    ['hideous', 'frightening small children with a face like a cratered moon'],
    ['homely', 'hiding behind a very large hat'],
    ['dwarfish', 'standing on three cargo crates to see over the throne'],
    ['short', 'standing on a cargo crate to see over the throne'],
    ['giant', 'banging your head on every doorframe in the palace'],
    ['greedy', 'counting credits in your sleep'],
    ['lazy', 'snoring through a declaration of war'],
    ['craven', 'hiding under the war-table at the first loud noise'],
    ['wrathful', 'throwing a goblet at a malfunctioning door'],
    ['arrogant', 'admiring yourself in every polished hull plate'],
    ['paranoid', 'having your own reflection arrested'],
    ['lustful', 'winking at every portrait in the long gallery'],
    ['zealous', 'blessing the toaster'],
    ['stim_addict', 'vibrating gently on the throne'],
    ['shy', 'hiding behind a curtain at your own feast'],
  ];
  for (const [t, joke] of jokes) if (hasTrait(r, t)) return joke;
  return 'tripping over your own cape during a coronation';
}

function companion(s: GameState, name: string): Item {
  return {
    id: newId(s, 'i'),
    name: `${name}, the Void-Hound`,
    slot: 'relic',
    rarity: 'epic',
    fx: { stats: { cmd: 1, int: 1 }, prestigeYr: 2 },
    price: 320,
    seed: int(s, 1, 1e9),
    origin: 'Hatched in your cargo yards',
  };
}

const PET_NAMES = ['Comet', 'Nova', 'Gnasher', 'Biscuit', 'Havoc', 'Pip', 'Cinder', 'Moonpie'];

/** The house in the event's data still exists. */
function houseExists(key: string): Cond {
  return { test: (c) => !!c.s.clans[String(c.data[key])], why: '' };
}

/** The rival's gift hides a listening device. Tooltips never let on. */
const bugged: Cond = { test: (c) => !!c.data.bugged, why: '', assume: false };

function gift(c: EventCtx): Item {
  return JSON.parse(String(c.data.item)) as Item;
}

// ── The deck ──────────────────────────────────────────────────────────────

export const MORE_EVENTS: EventDef[] = [
  defineEvent({
    id: 'joust',
    title: 'The Grand Grav-Joust',
    icon: 'duel',
    weight: 1.5,
    cooldown: 10,
    when: (s) => canAct(s),
    text: () =>
      'Heralds announce a grav-joust: armoured riders on screaming grav-skiffs, plasma lances, one pass at a time. Every great house sends a champion, and the crowd is chanting for you to ride.',
    options: [
      {
        label: 'Ride in the lists yourself',
        then: {
          roll: { base: 0.25, per: { stat: 'cmd', n: 0.035 } },
          pass: {
            do: [
              { gain: 'credits', n: { roll: [60, 120] }, as: 'purse' },
              { gain: 'prestige', n: 45 },
              { trait: 'duelist', p: 0.35, fresh: true, say: 'is now a' },
            ],
            text: (c) => `You unseat three champions and take the crown of the lists. +45 prestige, +${c.vars.purse} credits in prize money.`,
          },
          fail: {
            roll: 0.5,
            pass: {
              do: [{ trait: 'wounded' }, { gain: 'prestige', n: 5 }],
              text: 'A lance takes you square in the chest plate and you go spinning into the dust. Brave, at least. +5 prestige, but you are Wounded.',
            },
            fail: { do: [{ gain: 'prestige', n: 10 }], text: 'You hold your own and fall in the semi-final. The crowd loves your nerve. +10 prestige.' },
          },
        },
      },
      {
        label: 'Sponsor a champion',
        needs: [{ have: 'credits', n: 80 }],
        then: {
          do: [{ lose: 'credits', n: 80 }],
          roll: 0.45,
          pass: { do: [{ gain: 'prestige', n: 30 }], text: 'Your champion wins in your colours! +30 prestige.' },
          fail: { do: [{ gain: 'prestige', n: 5 }], text: 'Your champion rides well and loses gracefully. +5 prestige.' },
        },
      },
      { label: 'Watch from the royal box', then: { do: [{ health: 3 }], text: 'A pleasant afternoon of watching other people get hurt.' } },
    ],
  }),
  defineEvent({
    id: 'poison_feast',
    title: 'Poison at the Feast',
    icon: 'death',
    weight: 1.5,
    cooldown: 12,
    when: (s) => canAct(s) && hasRival(s),
    setup: ({ s, data }) => {
      data.clan = rivalClan(s)?.id ?? '';
    },
    text: () => 'Halfway through the harvest feast your food-taster turns grey, clutches the table and slides beneath it. Somebody just tried to poison you.',
    options: [
      {
        label: 'Hunt down the poisoner',
        then: (() => {
          const cold: Outcome = { text: 'The poisoner slips away in the confusion. Every meal tastes of suspicion now.' };
          return {
            if: houseExists('clan'),
            pass: {
              roll: { base: 0.3, per: { stat: 'int', n: 0.05 } },
              pass: {
                do: [
                  { gain: 'prestige', n: 20 },
                  { remember: 'Exposed as poisoners', clan: 'clan', value: -20 },
                  { claim: 'clan', as: 'reg' },
                ],
                text: (c) =>
                  `The trail leads to a cook paid by House ${clan(c).name}. You parade the evidence before the court. +20 prestige${c.vars.reg ? `, and their shame hands you a claim on ${c.vars.reg}` : ''}.`,
              },
              fail: cold,
            },
            fail: cold,
          };
        })(),
      },
      {
        label: 'Purge the kitchens',
        then: { do: [{ trait: 'paranoid', say: 'becomes' }], text: 'Every cook, server and scullion is replaced overnight.' },
      },
      {
        label: 'Finish your plate',
        then: {
          roll: 0.3,
          pass: { do: [{ health: -20 }], text: 'The next course was poisoned too. You spend a week heaving. -20 health.' },
          fail: {
            do: [
              { gain: 'prestige', n: 15 },
              { trait: 'brave', p: 0.3, say: 'is now' },
            ],
            text: 'You clean your plate without blinking. The court is in awe. +15 prestige.',
          },
        },
      },
    ],
  }),
  defineEvent({
    id: 'admirer',
    title: 'A Secret Admirer',
    icon: 'heart',
    weight: 1.2,
    cooldown: 15,
    when: (s) => {
      const r = ruler(s);
      const a = ageOf(s, r);
      return canAct(s) && a >= 18 && a <= 55 && !alive(ch(s, r.loverId)) && Object.values(s.clans).some((c) => !c.isPlayer);
    },
    setup: ({ s, r, data }) => {
      const pool = Object.values(s.characters).filter(
        (c) => alive(c) && c.gender !== r.gender && !c.spouseId && !c.betrothedId && c.clanId !== s.playerClanId && ageOf(s, c) >= 18 && ageOf(s, c) <= 50,
      );
      let who = pool.length ? pick(s, pool) : undefined;
      if (!who) {
        const k = pick(
          s,
          Object.values(s.clans).filter((c) => !c.isPlayer),
        );
        who = createCharacter(s, {
          gender: r.gender === 'M' ? 'F' : 'M',
          born: s.year - Math.min(50, Math.max(18, ageOf(s, r) + int(s, -8, 4))),
          clanId: k.id,
          planetId: k.planetId,
          faithId: k.faithId,
          adultExtras: true,
        });
      }
      data.who = who.id;
      data.clan = who.clanId;
    },
    text: (c) => {
      const a = other(c);
      return `Unsigned love poems keep appearing on your pillow, each more daring than the last. Your chamberlain finally catches the author: ${fullName(c.s, a)} of House ${clan(c)?.name}, age ${ageOf(c.s, a)}.`;
    },
    options: [
      {
        label: 'Take them as your lover',
        then: {
          do: [
            {
              run: (c) => {
                c.r.loverId = other(c).id;
                lovers(c.s, c.r, other(c));
              },
              text: (c) => `${other(c).name} becomes your lover, and affairs can produce heirs`,
            },
          ],
          text: (c) => `${other(c).name} is now your lover. Discretion is advised.`,
        },
      },
      {
        label: 'Let them down gently',
        then: {
          do: [{ remember: 'Spared our pride', clan: 'clan', value: 12, decay: 0.15 }],
          text: (c) => `${other(c).name} takes it well, and House ${clan(c)?.name} notes your tact.`,
        },
      },
      {
        label: 'Read the poems aloud at court',
        then: {
          do: [
            { gain: 'prestige', n: 15 },
            { remember: 'Mocked one of ours', clan: 'clan', value: -20 },
            { trait: 'cruel', p: 0.3, say: 'is now' },
          ],
          text: (c) => `The court howls with laughter. ${other(c).name} flees in tears. +15 prestige.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'heretic',
    title: 'A Heretic in the Square',
    icon: 'faith',
    weight: 1.5,
    when: (s) => canAct(s),
    text: ({ s }) =>
      `A ragged preacher stands on a cargo crate in your market square, denouncing ${theFaith(playerClan(s).faithId)} as a lie told by the rich to keep the poor quiet. The crowd is growing.`,
    options: [
      {
        label: 'Debate them in public',
        then: {
          roll: { base: 0.3, per: { stat: 'dip', n: 0.045 } },
          pass: {
            do: [
              { gain: 'faith', n: 35 },
              { gain: 'prestige', n: 15 },
            ],
            text: 'You take their arguments apart one by one and the crowd cheers you. The preacher slinks away. +35 faith, +15 prestige.',
          },
          fail: {
            do: [
              { lose: 'faith', n: 25 },
              { lose: 'prestige', n: 10 },
            ],
            text: 'They run rings round you. The crowd laughs, and not with you. -25 faith, -10 prestige.',
          },
        },
      },
      {
        label: 'Exile them beyond the dome',
        then: {
          do: [
            { gain: 'faith', n: 20 },
            { trait: 'zealous', p: 0.35, say: 'becomes' },
          ],
          text: 'The preacher is put on the next ore-hauler to nowhere. The priests approve. +20 faith.',
        },
      },
      {
        label: 'Let them speak',
        then: {
          do: [
            { lose: 'faith', n: 15 },
            { stat: 'sci', n: 1 },
            { trait: 'cynical', p: 0.35, say: 'becomes' },
          ],
          text: 'Ideas are not crimes. The priests are furious; the scholars quietly approve. -15 faith, +1 Science.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'tax_revolt',
    title: "The Dome-Workers' Revolt",
    icon: 'realm',
    weight: 1.5,
    cooldown: 10,
    when: (s) => canAct(s) && clanRegions(s, s.playerClanId).length > 0,
    setup: ({ s, data }) => {
      data.region = myRegion(s)?.id ?? '';
    },
    text: ({ s, data }) =>
      `The dome-workers of ${s.regions[String(data.region)]?.name ?? 'your lands'} have downed tools and barricaded the air plants. Not another credit of tax, they say, until their grievances are heard.`,
    options: [
      {
        label: 'Hear their grievances',
        then: {
          roll: { base: 0.35, per: { stat: 'dip', n: 0.04 } },
          pass: {
            do: [
              { dev: 1, region: 'region' },
              { gain: 'prestige', n: 10 },
              { trait: 'just', p: 0.3, say: 'is now known as' },
            ],
            text: 'You sit with the strike leaders until dawn and find a fair deal. Work resumes with a will. +1 development, +10 prestige.',
          },
          fail: { do: [{ lose: 'credits', n: 60 }], text: 'You promise far too much to end it quickly. -60 credits.' },
        },
      },
      {
        label: 'Cut their taxes',
        needs: [{ have: 'credits', n: 100 }],
        then: {
          do: [
            { lose: 'credits', n: 100 },
            { dev: 1, region: 'region' },
          ],
          text: 'Grateful workers put in double shifts. +1 development.',
        },
      },
      {
        label: 'Send in the marines',
        then: {
          do: [
            { lose: 'fleet', n: { of: 'fleet', times: 0.05, round: true, min: 1 }, as: 'lost' },
            { trait: 'cruel', p: 0.35, say: 'is now' },
          ],
          text: (c) => `The barricades fall and order is restored, at the cost of ${c.vars.lost} ships' worth of crews.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'jester',
    title: 'The Holo-Jester',
    icon: 'gala',
    weight: 1.2,
    cooldown: 12,
    when: (s) => canAct(s),
    text: ({ r }) =>
      `At dinner the court's holo-jester unveils a new routine: a flickering caricature of you, ${caricature(r)}. The whole court is trying very hard not to laugh.`,
    options: [
      {
        label: 'Laugh louder than anyone',
        then: {
          do: [
            { gain: 'prestige', n: 10 },
            { trait: 'humble', p: 0.3, say: 'becomes' },
          ],
          text: 'The court roars with relief. A ruler who can take a joke. +10 prestige.',
        },
      },
      {
        label: 'Throw the jester in the cells',
        then: {
          do: [
            { lose: 'prestige', n: 10 },
            { trait: 'arrogant', p: 0.4, say: 'becomes' },
          ],
          text: 'Nobody laughs at dinner again. Nobody says much at all. -10 prestige.',
        },
      },
      {
        label: 'Make the jester your eyes and ears',
        then: { do: [{ stat: 'int', n: 1 }], text: 'Jesters go everywhere and hear everything. Yours now reports to you. +1 Intrigue.' },
      },
    ],
  }),
  defineEvent({
    id: 'heir_of_age',
    title: 'The Heir Comes of Age',
    icon: 'crown',
    weight: 12,
    cooldown: 3,
    when: (s) => {
      const h = currentHeir(s);
      return !!h && ageOf(s, h) === 16;
    },
    subject: (s) => currentHeir(s),
    text: ({ subject }) =>
      `${subject!.name} turns sixteen and is now an adult in the eyes of the court. Tradition says the ruler decides how ${pr(subject).his} coming of age is marked.`,
    options: [
      {
        label: 'A grand investiture',
        needs: [{ have: 'credits', n: 150 }],
        then: {
          do: [
            { lose: 'credits', n: 150 },
            { gain: 'prestige', n: 30 },
            { stat: 'dip', n: 1, to: 'subject' },
          ],
          text: (c) =>
            `Banners, fireworks and a thousand guests. +30 prestige, and ${c.subject!.name} gains +1 Diplomacy from all the hands ${pr(c.subject).he} shook.`,
        },
      },
      {
        label: 'Send them to serve with the fleet',
        then: {
          do: [{ stat: 'cmd', n: 2, to: 'subject' }],
          roll: 0.2,
          pass: {
            do: [{ trait: 'scarred', to: 'subject' }],
            text: (c) => `${c.subject!.name} comes back from a pirate hunt with +2 Command and a scar across the cheek.`,
          },
          fail: {
            do: [{ trait: 'brave', to: 'subject', p: 0.4, say: 'comes home' }],
            text: (c) => `A year on the gun decks makes ${pr(c.subject).him} a real officer. +2 Command.`,
          },
        },
      },
      {
        label: 'Send them on pilgrimage',
        then: {
          do: [
            { gain: 'faith', n: 20 },
            { trait: 'pilgrim', to: 'subject' },
          ],
          text: (c) => `${c.subject!.name} walks the dead-star shrines and returns a Pilgrim. +20 faith.`,
        },
      },
      {
        label: 'A quiet family blessing',
        then: { text: (c) => `You hold ${c.subject!.name} close and tell ${pr(c.subject).him} you are proud. That is enough.` },
      },
    ],
  }),
  defineEvent({
    id: 'hedge_doctor',
    title: 'The Hedge-Doctor',
    icon: 'health',
    weight: 3,
    cooldown: 6,
    when: (s) => courtMembers(s).some((c) => hasTrait(c, 'ill')),
    subject: (s) => {
      const sick = courtMembers(s).filter((c) => hasTrait(c, 'ill'));
      return sick.length ? pick(s, sick) : undefined;
    },
    text: ({ subject }) =>
      `${subject!.name} is burning with fever and the court physicians are out of ideas. An old hedge-doctor from the undercity, smelling of solder and herbs, swears she can cure ${pr(subject).him} with a brew of her own.`,
    options: [
      {
        label: 'Let her try',
        then: {
          roll: 0.6,
          pass: {
            do: [{ cure: 'subject' }, { health: 10, to: 'subject' }],
            text: (c) => `The brew smells like a reactor leak, but by morning the fever has broken. ${c.subject!.name} will recover.`,
          },
          fail: { do: [{ health: -15, to: 'subject' }], text: (c) => `The brew only makes things worse. ${c.subject!.name} is weaker than ever.` },
        },
      },
      {
        label: 'Fly in a Saturnine specialist',
        needs: [{ have: 'credits', n: 150 }],
        then: {
          do: [{ lose: 'credits', n: 150 }],
          roll: 0.85,
          pass: { do: [{ cure: 'subject' }], text: (c) => `The specialist's nanite course works. ${c.subject!.name} is on the mend.` },
          fail: { text: 'Even the specialist can do nothing. It is in the hands of fate now.' },
        },
      },
      { label: 'Trust the court physicians', then: { text: 'They scan, they frown, they prescribe rest.' } },
    ],
  }),
  defineEvent({
    id: 'lost_squadron',
    title: 'The Lost Squadron',
    icon: 'ship',
    weight: 1,
    cooldown: 25,
    setup: ({ s, data }) => {
      data.n = int(s, 8, 18);
      data.years = int(s, 12, 40);
    },
    text: ({ data }) =>
      `A squadron of ${data.n} warships drifts into your space, hulls black with carbon scoring. Their transponders say they are your own house's ships, lost in battle ${data.years} years ago. The crews have not aged a day.`,
    options: [
      {
        label: 'Welcome them home',
        needs: [{ have: 'credits', n: 60 }],
        then: (() => {
          const quiet = (c: Ctx) => `${c.data.n} ships rejoin the fleet after a refit. The crews never speak of where they have been.`;
          return {
            do: [
              { lose: 'credits', n: 60 },
              { gain: 'fleet', n: { data: 'n' } },
            ],
            roll: 0.25,
            pass: {
              do: [{ pick: 'victim', get: (c) => pick(c.s, courtMembers(c.s)), text: 'a courtier' }],
              if: catchable('victim'),
              pass: {
                do: [{ sicken: 'victim' }],
                text: (c) =>
                  `${c.data.n} ships rejoin the fleet after a refit. But they brought something back with them: ${named(c, 'victim')} has fallen ill.`,
              },
              fail: { text: quiet },
            },
            fail: { text: quiet },
          };
        })(),
      },
      {
        label: 'Quarantine and study them',
        then: {
          do: [{ gain: 'fleet', n: { data: 'n', times: 0.5, round: true }, as: 'n' }],
          roll: { base: 0.3, per: { stat: 'sci', n: 0.05 } },
          pass: (() => {
            const logs = (c: Ctx) => `Their logs describe a fold in space-time past the Kuiper Belt. +1 Science, and ${c.vars.n} ships salvaged.`;
            return {
              do: [{ stat: 'sci', n: 1 }],
              if: { test: (c) => !hasTrait(c.r, 'xenoblood'), why: '' },
              pass: {
                roll: 0.25,
                pass: {
                  do: [{ trait: 'xenoblood' }],
                  text: (c) =>
                    `Your scientists distil a serum from the crews' blood and you are the first to take it. You now have Xenoblood. +1 Science, and ${c.vars.n} ships salvaged.`,
                },
                fail: { text: logs },
              },
              fail: { text: logs },
            };
          })(),
          fail: { text: (c) => `The crews die one by one in quarantine, ageing decades in days. You salvage ${c.vars.n} ships.` },
        },
      },
      {
        label: 'Scuttle them',
        then: {
          do: [
            { gain: 'credits', n: { data: 'n', times: 12 }, as: 'n' },
            { gain: 'faith', n: 10 },
          ],
          text: (c) => `Some things should stay lost. The scrap fetches ${c.vars.n} credits, and the priests call it wise. +10 faith.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'masquerade',
    title: 'The Masquerade',
    icon: 'gala',
    weight: 1.2,
    cooldown: 12,
    when: (s) => canAct(s) && hasRival(s),
    setup: ({ s, data }) => {
      data.clan = rivalClan(s)?.id ?? '';
    },
    text: () =>
      'The Venusian cloud-courts are hosting a masquerade: one night when every face is hidden and every secret is for sale. An invitation in silver ink has arrived for you.',
    options: [
      {
        label: 'Go masked and listen',
        then: (() => {
          const nothing = 'You overhear a great deal about the price of methane and nothing else.';
          return {
            if: houseExists('clan'),
            pass: {
              roll: { base: 0.3, per: { stat: 'int', n: 0.05 } },
              pass: {
                do: [{ claim: 'clan', as: 'reg' }],
                text: (c) =>
                  c.vars.reg
                    ? `Behind a peacock mask, a drunk envoy of House ${clan(c).name} lets slip a forged deed. You now have a claim on ${c.vars.reg}.`
                    : nothing,
              },
              fail: { text: nothing },
            },
            fail: { text: nothing },
          };
        })(),
      },
      {
        label: 'Go and dazzle',
        needs: [{ have: 'credits', n: 80 }],
        then: {
          do: [
            { lose: 'credits', n: 80 },
            { gain: 'prestige', n: 15 },
            {
              run: (c) => {
                for (const k of Object.values(c.s.clans)) if (!k.isPlayer) k.opinion = Math.min(100, k.opinion + 4);
              },
              text: 'every house likes you more (+4)',
            },
          ],
          text: 'Your mask is the talk of the system. +15 prestige, and every house thinks a little better of you.',
        },
      },
      { label: 'Decline', then: { text: 'You have enough secrets of your own.' } },
    ],
  }),
  defineEvent({
    id: 'hatchling',
    title: 'A Strange Egg',
    icon: 'hunt',
    weight: 1,
    cooldown: 30,
    when: (s) => !getFlag(s, 'hatchling'),
    subject: (s) => {
      const kids = dynastyKids(s, 5, 14);
      return kids.length ? pick(s, kids) : undefined;
    },
    setup: ({ s, data }) => {
      data.pet = pick(s, PET_NAMES);
    },
    text: ({ subject }) =>
      `${subject!.name} comes home from the cargo yards cradling a warm, leathery egg the size of a helmet. Something inside is tapping. ${pr(subject).He} desperately wants to keep it.`,
    options: [
      {
        label: 'Let them raise it',
        then: {
          do: [
            { flag: 'hatchling', in: { roll: [2, 4] }, data: (c) => ({ keeper: c.subject!.id, pet: String(c.data.pet) }) },
            { trait: 'kind', to: 'subject', p: 0.4, say: 'grows up' },
          ],
          text: (c) => `${c.subject!.name} names it ${c.data.pet} and feeds it everything in the larder. It hatches the next morning: all teeth and eyes.`,
        },
      },
      {
        label: 'Sell it to a xeno-collector',
        then: {
          do: [{ gain: 'credits', n: { roll: [80, 160] }, as: 'n' }],
          text: (c) => `A collector pays ${c.vars.n} credits. ${c.subject!.name} cries for a week.`,
        },
      },
      {
        label: 'Hand it to the scientists',
        then: { do: [{ stat: 'sci', n: 1 }], text: 'The egg is dissected in the name of knowledge. You learn a lot. +1 Science.' },
      },
    ],
  }),
  defineEvent({
    id: 'hatchling_grown',
    title: 'All Grown Up',
    icon: 'hunt',
    weight: 1,
    urgent: true,
    when: (s) => flagDue(s, 'hatchling'),
    setup: ({ s, data }) => {
      const f = getFlag(s, 'hatchling')!;
      clearFlag(s, 'hatchling');
      const keeper = ch(s, String(f.data.keeper));
      data.pet = String(f.data.pet);
      data.keeper = alive(keeper) ? keeper.name : 'your family';
    },
    text: ({ data }) =>
      `The little horror from the cargo yards is not little any more. ${data.pet} is a sleek, armoured void-hound the size of a grav-bike, utterly devoted to ${data.keeper} and terrifying to everyone else.`,
    options: [
      {
        label: 'Make it the house companion',
        then: {
          do: [
            {
              run: (c) => {
                const item = companion(c.s, String(c.data.pet));
                c.s.items.push(item);
                c.vars.item = item.name;
              },
              text: (c) => `${c.data.pet} as a relic (+1 Command, +1 Intrigue, +2 prestige a year)`,
            },
          ],
          text: (c) => `${c.data.pet} now sleeps at the foot of the throne. Equip ${c.vars.item} as a relic in the Treasury tab.`,
        },
      },
      {
        label: 'Enter it in the beast-pits',
        then: {
          do: [
            { gain: 'credits', n: { roll: [120, 220] }, as: 'n' },
            { gain: 'prestige', n: 15 },
          ],
          text: (c) => `${c.data.pet} is undefeated in the pits. +${c.vars.n} credits in winnings, +15 prestige.`,
        },
      },
      {
        label: 'Release it into the wild',
        then: { do: [{ gain: 'faith', n: 10 }], text: (c) => `${c.data.pet} bounds off into the badlands. On quiet nights you still hear it howl. +10 faith.` },
      },
    ],
  }),
  defineEvent({
    id: 'leviathan',
    title: 'A Void Leviathan',
    icon: 'hunt',
    weight: 1,
    cooldown: 20,
    text: () =>
      'Something vast has drifted into orbit: a void leviathan, a living creature the size of a moon-hauler, its hide glittering with ice. Your people crowd the observation decks.',
    options: [
      {
        label: 'Hunt it with the fleet',
        needs: [{ have: 'fleet', n: 20 }],
        then: {
          do: [{ lose: 'fleet', n: { calc: (c) => Math.round(c.s.fleet * (0.05 + rand(c.s) * 0.1)), text: '5–15% of your' }, as: 'lost' }],
          roll: { base: 0.5, per: { stat: 'cmd', n: 0.02 } },
          pass: {
            do: [
              { gain: 'prestige', n: 50 },
              { trait: 'beast_slayer' },
              { item: { slot: 'relic', rarity: [0.3, 'legendary', 'epic'], origin: 'Cut from a void leviathan' }, as: 'item' },
            ],
            text: (c) =>
              `After a three-day chase you land the killing shot yourself. -${c.vars.lost} ships, +50 prestige, Beast-Slayer, and the ${c.vars.item} for your treasury.`,
          },
          fail: { text: (c) => `It shrugs off your broadsides and swims back into the dark. -${c.vars.lost} ships.` },
        },
      },
      {
        label: 'Study it',
        then: {
          roll: { base: 0.35, per: { stat: 'sci', n: 0.05 } },
          pass: { do: [{ stat: 'sci', n: 2 }], text: 'You learn more about the void in a month than your scholars did in a century. +2 Science.' },
          fail: { do: [{ stat: 'sci', n: 1 }], text: 'It leaves before you learn much. +1 Science.' },
        },
      },
      { label: 'Hail it as a holy sign', then: { do: [{ gain: 'faith', n: 40 }], text: 'The priests declare it a messenger of the divine. +40 faith.' } },
    ],
  }),
  defineEvent({
    id: 'haunted',
    title: 'The Haunted Wing',
    icon: 'death',
    weight: 1.2,
    cooldown: 20,
    when: (s) => s.dynasty.rulers.some((x) => x.id !== s.rulerId && x.to !== undefined),
    setup: ({ s, data }) => {
      const g = pick(
        s,
        s.dynasty.rulers.filter((x) => x.id !== s.rulerId && x.to !== undefined),
      );
      data.ghost = g.name;
      data.title = g.title;
    },
    text: ({ data }) =>
      `Servants refuse to enter the old east wing. They swear ${data.ghost}, the late ${data.title}, walks its halls at night, flickering blue and muttering about the family accounts.`,
    options: [
      {
        label: 'Hold a vigil for their soul',
        then: { do: [{ gain: 'faith', n: 25 }], text: (c) => `Candles burn all night. ${c.data.ghost} is seen no more. +25 faith.` },
      },
      {
        label: 'Send in the engineers',
        then: {
          roll: { base: 0.35, per: { stat: 'sci', n: 0.05 } },
          pass: {
            do: [{ gain: 'credits', n: { roll: [120, 240] }, as: 'n' }],
            text: (c) => `It is an old holo-recording stuck on a loop. Behind the projector is a hidden vault. +${c.vars.n} credits.`,
          },
          fail: { text: 'The engineers find nothing, and two of them quit on the spot.' },
        },
      },
      {
        label: 'Brick it up',
        then: { do: [{ trait: 'paranoid', p: 0.25, say: 'becomes' }], text: 'The east wing is sealed. The servants sleep easier; you do not.' },
      },
    ],
  }),
  defineEvent({
    id: 'old_friend',
    title: 'An Old Friend',
    icon: 'eco',
    weight: 1.2,
    cooldown: 25,
    when: (s) => canAct(s) && s.credits >= 150 && !getFlag(s, 'loan'),
    setup: ({ s, r, data }) => {
      data.gender = chance(s, 0.5) ? 'M' : 'F';
      data.name = makeName(r.planetId, data.gender as 'M' | 'F', () => rand(s));
    },
    text: ({ data }) => {
      const p = data.gender === 'M' ? 'He' : 'She';
      return `${data.name}, your closest friend from the academy, turns up at court in a threadbare coat. ${p} has a plan for a deep-ice mining venture out past Saturn and needs 150 credits to start it. "For old times' sake?"`;
    },
    options: [
      {
        label: 'Lend the money',
        then: {
          do: [
            { lose: 'credits', n: 150 },
            // Whether the venture pays off is decided now, in secret, and arrives years later.
            { set: 'ok', roll: { base: 0.5, per: { stat: 'eco', n: 0.02 } } },
            { flag: 'loan', in: { roll: [3, 6] }, data: (c) => ({ name: String(c.data.name), gender: String(c.data.gender), ok: c.vars.ok }) },
          ],
          text: (c) => `${c.data.name} weeps, embraces you, and swears to pay you back twice over.`,
        },
      },
      { label: 'Give a smaller gift', then: { do: [{ lose: 'credits', n: 40 }], text: 'It is not what they hoped for, but it is something.' } },
      { label: 'Turn them away', then: { text: 'Friendship is friendship and business is business. They leave without a word.' } },
    ],
  }),
  defineEvent({
    id: 'loan_repaid',
    title: 'A Debt Repaid',
    icon: 'eco',
    weight: 1,
    urgent: true,
    when: (s) => flagDue(s, 'loan') && !!getFlag(s, 'loan')!.data.ok,
    setup: ({ s, data }) => {
      Object.assign(data, getFlag(s, 'loan')!.data);
      clearFlag(s, 'loan');
    },
    text: ({ data }) =>
      `${data.name} sweeps into court in furs and rings. The ice venture struck a frozen sea of helium-3, and ${data.gender === 'M' ? 'he' : 'she'} has come to repay the loan, with interest.`,
    options: [
      {
        label: 'Take the money',
        then: { do: [{ gain: 'credits', n: 400 }], text: 'Four hundred credits, counted out on the throne-room floor. +400 credits.' },
      },
      {
        label: 'Tell them to keep it',
        then: {
          do: [
            { gain: 'prestige', n: 30 },
            { stat: 'eco', n: 1 },
          ],
          text: (c) => `${c.data.name} never forgets it, and tells everyone. +30 prestige, and their business advice gives you +1 Economy.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'loan_lost',
    title: 'A Friend Vanishes',
    icon: 'eco',
    weight: 1,
    urgent: true,
    when: (s) => flagDue(s, 'loan') && !getFlag(s, 'loan')!.data.ok,
    setup: ({ s, data }) => {
      Object.assign(data, getFlag(s, 'loan')!.data);
      clearFlag(s, 'loan');
    },
    text: ({ data }) => `News arrives from the outer belt: ${data.name}'s ice venture collapsed, and ${data.name} has vanished, along with your 150 credits.`,
    options: [
      {
        label: 'Send bounty hunters',
        needs: [{ have: 'credits', n: 50 }],
        then: {
          do: [{ lose: 'credits', n: 50 }],
          roll: 0.5,
          pass: {
            do: [
              { gain: 'credits', n: 150 },
              { gain: 'prestige', n: 10 },
            ],
            text: (c) => `The hunters drag ${c.data.name} back from a Neptunian ice-mine. You get your 150 credits back. +10 prestige.`,
          },
          fail: { text: (c) => `The trail goes cold somewhere past Uranus. ${c.data.name} is gone.` },
        },
      },
      { label: 'Let it go', then: { do: [{ trait: 'kind', p: 0.4, say: 'is now' }], text: 'Some lessons cost 150 credits.' } },
    ],
  }),
  defineEvent({
    id: 'heirloom',
    title: 'The Broken Heirloom',
    icon: 'family',
    weight: 1.5,
    subject: (s) => {
      const kids = dynastyKids(s, 5, 13);
      return kids.length ? pick(s, kids) : undefined;
    },
    text: ({ subject }) =>
      `${subject!.name} was playing starships in the great hall and has smashed the crystal bust of the house's founder into a thousand pieces. ${pr(subject).He} is standing in the wreckage, waiting to see what you will do.`,
    options: [
      {
        label: 'Punish them harshly',
        then: {
          roll: 0.5,
          pass: { do: [{ trait: 'humble', to: 'subject', say: 'grows up' }], text: 'Bread and water for a week.' },
          fail: {
            roll: 0.5,
            pass: {
              do: [{ trait: 'cruel', to: 'subject', say: 'grows up' }],
              text: (c) => `Bread and water for a week. The lesson ${c.subject!.name} learns is the wrong one:`,
            },
            fail: { text: (c) => `Bread and water for a week. ${c.subject!.name} sulks, then forgets.` },
          },
        },
      },
      {
        label: 'Make them confess to the court',
        then: {
          do: [{ lose: 'prestige', n: 5 }],
          roll: 0.6,
          pass: { do: [{ trait: 'honest', to: 'subject', say: 'grows up' }], text: 'A tearful confession before the whole court.' },
          fail: { text: (c) => `A mumbled confession before the whole court. ${c.subject!.name} goes red to the ears.` },
        },
      },
      {
        label: 'Laugh it off',
        then: {
          roll: 0.5,
          pass: { do: [{ trait: 'arrogant', to: 'subject', say: 'grows up' }] },
          fail: { do: [{ trait: 'gregarious', to: 'subject', say: 'grows up' }] },
          text: '"It was an ugly bust anyway."',
        },
      },
    ],
  }),
  defineEvent({
    id: 'miracle',
    title: 'A Miracle?',
    icon: 'faith',
    weight: 1,
    cooldown: 20,
    subject: (s) => {
      const kids = dynastyKids(s, 4, 14).filter((c) => !hasTrait(c, 'blessed'));
      return kids.length ? pick(s, kids) : undefined;
    },
    text: ({ subject }) =>
      `A dying servant recovered overnight after ${subject!.name} held her hand and prayed. The servants are calling ${pr(subject).him} a living saint, and pilgrims are already queuing at the gates.`,
    options: [
      {
        label: 'Proclaim a miracle',
        then: {
          do: [
            { gain: 'faith', n: 40 },
            { gain: 'prestige', n: 10 },
            { trait: 'blessed', to: 'subject' },
          ],
          text: (c) => `The temples ring their bells for ${c.subject!.name}, now known as Blessed. +40 faith, +10 prestige.`,
        },
      },
      {
        label: 'Have the physicians examine them',
        then: (() => {
          const ordinary = 'The physicians find a perfectly ordinary child and a very lucky servant.';
          return {
            if: { test: (c) => !c.subject!.traits.some((t) => TRAITS[t]?.group === 'psionic'), why: '' },
            pass: {
              roll: 0.3,
              pass: {
                do: [{ trait: 'psi_spark', to: 'subject' }],
                text: (c) => `The scans light up: ${c.subject!.name} has a latent Psionic Spark, a genetic gift you could lock into the bloodline.`,
              },
              fail: { text: ordinary },
            },
            fail: { text: ordinary },
          };
        })(),
      },
      { label: 'Hush it up', then: { text: (c) => `The pilgrims are sent home. ${c.subject!.name} is very confused by all the fuss.` } },
    ],
  }),
  defineEvent({
    id: 'asylum',
    title: 'A Plea for Sanctuary',
    icon: 'scheme',
    weight: 1.2,
    cooldown: 15,
    when: (s) => canAct(s) && hasRival(s),
    setup: ({ s, data }) => {
      const k = rivalClan(s)!;
      const who = createCharacter(s, { born: s.year - int(s, 17, 30), clanId: k.id, planetId: k.planetId, faithId: k.faithId, adultExtras: true });
      data.clan = k.id;
      data.who = who.id;
    },
    text: (c) => {
      const w = other(c);
      return `${fullName(c.s, w)} arrives at your gates in a stolen shuttle, begging for sanctuary. ${pr(w).He} says ${pr(w).his} own family, House ${clan(c)?.name}, means to kill ${pr(w).him} over a disputed inheritance.`;
    },
    options: [
      {
        label: 'Grant sanctuary',
        then: {
          do: [
            { remember: 'Sheltered our runaway', clan: 'clan', value: -25 },
            { gain: 'prestige', n: 10 },
          ],
          if: houseExists('clan'),
          pass: { roll: 0.5, pass: { do: [{ claim: 'clan', as: 'reg' }] } },
          text: (c) =>
            `${other(c).name} is safe under your roof. +10 prestige.${c.vars.reg ? ` In gratitude, ${pr(other(c)).he} signs over a claim on ${c.vars.reg}.` : ''}`,
        },
      },
      {
        label: 'Hand them back',
        then: {
          do: [
            { gain: 'credits', n: 60 },
            { remember: 'Returned our runaway', clan: 'clan', value: 20, decay: 0.1 },
          ],
          roll: 0.5,
          pass: {
            do: [{ kill: 'who', cause: 'executed by their own house' }],
            text: (c) => `House ${clan(c)?.name} pays the bounty. You hear later that the trial was very short. +60 credits.`,
          },
          fail: { text: (c) => `House ${clan(c)?.name} pays the bounty and thanks you warmly. +60 credits.` },
        },
      },
      {
        label: 'Hold them for ransom',
        then: {
          do: [
            { gain: 'credits', n: { roll: [120, 200] }, as: 'n' },
            { lose: 'prestige', n: 10 },
            { remember: 'Ransomed one of ours', clan: 'clan', value: -15 },
          ],
          text: (c) => `House ${clan(c)?.name} pays ${c.vars.n} credits to get ${other(c).name} back, and will not forget it. -10 prestige.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'void_dice',
    title: 'A Game of Void-Dice',
    icon: 'credits',
    weight: 1.2,
    cooldown: 10,
    when: (s) => canAct(s) && s.credits >= 100,
    text: () =>
      'A Cererian merchant-captain with a gold tooth challenges you to void-dice in front of the whole court. "Unless a lord of your standing is afraid of a little wager?"',
    options: [
      {
        label: 'Bet 100 credits',
        then: {
          roll: 0.48,
          pass: { do: [{ gain: 'credits', n: 100 }], text: 'Double sixes! The captain pays up with a pained smile. +100 credits.' },
          fail: { do: [{ lose: 'credits', n: 100 }], text: 'Snake eyes. The captain pockets your credits and tips an imaginary hat. -100 credits.' },
        },
      },
      {
        label: 'Bet 100 and cheat',
        then: {
          roll: { base: 0.3, per: { stat: 'int', n: 0.05 } },
          pass: {
            do: [
              { gain: 'credits', n: 100 },
              { trait: 'deceitful', p: 0.25, say: 'becomes' },
            ],
            text: 'Your loaded dice never miss. +100 credits.',
          },
          fail: {
            do: [
              { lose: 'credits', n: 100 },
              { lose: 'prestige', n: 25 },
            ],
            text: 'The captain catches your loaded dice and holds them up for the whole court to see. -100 credits, -25 prestige.',
          },
        },
      },
      { label: 'Decline', then: { do: [{ lose: 'prestige', n: 5 }], text: 'The captain smirks. A few courtiers do too. -5 prestige.' } },
    ],
  }),
  defineEvent({
    id: 'rival_gift',
    title: 'A Gift from a Rival',
    icon: 'gift',
    weight: 1.2,
    cooldown: 15,
    when: (s) => hasRival(s),
    setup: ({ s, data }) => {
      const k = rivalClan(s)!;
      data.clan = k.id;
      data.item = JSON.stringify(makeItem(s, newId(s, 'i'), { origin: `A gift from House ${k.name}` }));
      data.bugged = chance(s, 0.45) ? 1 : 0;
    },
    text: (c) => {
      const item = gift(c);
      return `An envoy of House ${clan(c)?.name} presents you with the ${item.name}, "in the spirit of friendship". House ${clan(c)?.name} has never been your friend.`;
    },
    options: [
      {
        label: 'Accept it graciously',
        then: {
          do: [
            { run: (c) => void c.s.items.push(gift(c)), text: (c) => `the ${gift(c).name} for your treasury` },
            { opinion: 10, clan: 'clan', max: 100 },
          ],
          if: bugged,
          pass: {
            do: [{ lose: 'credits', n: { roll: [60, 120] }, upTo: 'have', as: 'n' }],
            text: (c) =>
              `The ${gift(c).name} joins your treasury. Months later your engineers find a listening device inside it.${Number(c.vars.n) > 0 ? ` Trade secrets leaked: -${c.vars.n} credits.` : ' Who knows what they heard.'}`,
          },
          fail: { text: (c) => `The ${gift(c).name} joins your treasury. It is, against all odds, just a very fine gift.` },
        },
      },
      {
        label: 'Have it scanned first',
        needs: [{ have: 'credits', n: 30 }],
        then: {
          do: [{ lose: 'credits', n: 30 }],
          if: bugged,
          pass: {
            do: [
              { gain: 'prestige', n: 20 },
              { remember: 'Exposed our spying', clan: 'clan', value: -15 },
            ],
            text: 'The scanners find a listening device inside. You hand it back in front of the whole court. +20 prestige.',
          },
          fail: {
            do: [{ run: (c) => void c.s.items.push(gift(c)), text: (c) => `if it is clean, the ${gift(c).name} for your treasury` }],
            text: (c) => `It is clean. The ${gift(c).name} joins your treasury.`,
          },
        },
      },
      {
        label: 'Refuse it',
        then: {
          do: [{ remember: 'Refused our gift', clan: 'clan', value: -10 }],
          text: (c) => `The envoy leaves stiffly with the ${gift(c).name} under one arm.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'harvest',
    title: 'A Bumper Harvest',
    icon: 'eco',
    weight: 1.5,
    cooldown: 10,
    when: (s) => clanRegions(s, s.playerClanId).length > 0,
    text: () => 'The hydroponic domes have produced the best harvest in a generation. The vats are overflowing and the farmers are singing.',
    options: [
      {
        label: 'Sell the surplus',
        then: {
          do: [
            {
              gain: 'credits',
              n: {
                calc: (c) => int(c.s, 80, 120) + clanRegions(c.s, c.s.playerClanId).length * 15,
                text: (c) => {
                  const r = clanRegions(c.s, c.s.playerClanId).length * 15;
                  return `${80 + r}–${120 + r}`;
                },
              },
              as: 'n',
            },
          ],
          text: (c) => `Grain barges head for the inner worlds. +${c.vars.n} credits.`,
        },
      },
      {
        label: 'Throw a harvest feast',
        then: {
          do: [
            { gain: 'prestige', n: 15 },
            { gain: 'faith', n: 15 },
          ],
          text: 'Everyone eats until they cannot move. +15 prestige, +15 faith.',
        },
      },
      {
        label: 'Fill the granaries',
        show: [{ test: (c) => !getFlag(c.s, 'granary'), why: 'Your granaries are already full' }],
        then: {
          do: [{ flag: 'granary', in: 0 }],
          text: 'The surplus is sealed in cryo-silos. When the next blight comes, your people will not go hungry.',
        },
      },
    ],
  }),
];
