// The court deck: life at court, family drama and stories that pay off years
// later. Shuffled into the main deck in events.ts.

import { createCharacter } from './character';
import { ageOf, alive, canAct, ch, clanRegions, courtMembers, effStats, fullName, hasTrait, newId, playerClan, ruler } from './core';
import { clearFlag, dynastyKids, flagDue, getFlag, myRegion, pr, rivalClan, setFlag, sicken, type EventCtx, type EventDef } from './eventKit';
import { makeItem } from './items';
import { currentHeir, killCharacter } from './life';
import { remember } from './memory';
import { makeName, theFaith } from './planets';
import { chance, int, pick, rand } from './rng';
import { addTrait, TRAITS } from './traits';
import type { Character, GameState, Item } from './types';

// ── Helpers ───────────────────────────────────────────────────────────────

function hasRival(s: GameState): boolean {
  return Object.values(s.clans).some((c) => !c.isPlayer && clanRegions(s, c.id).length > 0);
}

/** Give a trait and say so: "Vula grows up Humble." */
function shape(c: Character, id: string, verb = 'grows up'): string {
  c.traits = addTrait(c.traits, id);
  return `${c.name} ${verb} ${TRAITS[id].name}.`;
}

function claimOn(s: GameState, clanId: string): string | undefined {
  const regs = clanRegions(s, clanId).filter((x) => !s.claims.includes(x.id));
  if (!regs.length) return undefined;
  const reg = pick(s, regs);
  s.claims.push(reg.id);
  return reg.name;
}

function cure(c: Character): void {
  c.traits = c.traits.filter((t) => t !== 'ill');
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

// ── The deck ──────────────────────────────────────────────────────────────

export const MORE_EVENTS: EventDef[] = [
  {
    id: 'joust',
    title: 'The Grand Grav-Joust',
    icon: 'duel',
    weight: 1.5,
    cooldown: 10,
    when: (s) => canAct(s),
    text: () =>
      'Heralds announce a grav-joust: armoured riders on screaming grav-skiffs, plasma lances, one pass at a time. Every great house sends a champion, and the crowd is chanting for you to ride.',
    choices: [
      {
        label: 'Ride in the lists yourself',
        hint: 'Command check: glory or injury',
        run: ({ s, r }) => {
          if (chance(s, 0.25 + effStats(s, r).cmd * 0.035)) {
            const purse = int(s, 60, 120);
            s.prestige += 45;
            s.credits += purse;
            const extra = !hasTrait(r, 'duelist') && chance(s, 0.35) ? ' You are now a Duelist.' : '';
            if (extra) r.traits = addTrait(r.traits, 'duelist');
            return `You unseat three champions and take the crown of the lists. +45 prestige, +${purse} credits in prize money.${extra}`;
          }
          if (chance(s, 0.5)) {
            r.traits = addTrait(r.traits, 'wounded');
            s.prestige += 5;
            return 'A lance takes you square in the chest plate and you go spinning into the dust. Brave, at least. +5 prestige, but you are Wounded.';
          }
          s.prestige += 10;
          return 'You hold your own and fall in the semi-final. The crowd loves your nerve. +10 prestige.';
        },
      },
      {
        label: 'Sponsor a champion',
        hint: '-80 credits',
        available: ({ s }) => s.credits >= 80,
        run: ({ s }) => {
          s.credits -= 80;
          if (chance(s, 0.45)) {
            s.prestige += 30;
            return 'Your champion wins in your colours! +30 prestige.';
          }
          s.prestige += 5;
          return 'Your champion rides well and loses gracefully. +5 prestige.';
        },
      },
      { label: 'Watch from the royal box', hint: '+3 health', run: ({ r }) => ((r.health += 3), 'A pleasant afternoon of watching other people get hurt.') },
    ],
  },
  {
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
    choices: [
      {
        label: 'Hunt down the poisoner',
        hint: 'Intrigue check, could win a claim',
        run: (c) => {
          const { s, r } = c;
          const k = clan(c);
          if (k && chance(s, 0.3 + effStats(s, r).int * 0.05)) {
            s.prestige += 20;
            remember(s, k.id, 'Exposed as poisoners', -20);
            const reg = claimOn(s, k.id);
            return `The trail leads to a cook paid by House ${k.name}. You parade the evidence before the court. +20 prestige${reg ? `, and their shame hands you a claim on ${reg}` : ''}.`;
          }
          return 'The poisoner slips away in the confusion. Every meal tastes of suspicion now.';
        },
      },
      {
        label: 'Purge the kitchens',
        hint: 'Safer, but you trust no one',
        run: ({ r }) => `Every cook, server and scullion is replaced overnight. ${shape(r, 'paranoid', 'becomes')}`,
      },
      {
        label: 'Finish your plate',
        hint: 'Show no fear',
        run: ({ s, r }) => {
          if (chance(s, 0.3)) {
            r.health -= 20;
            return 'The next course was poisoned too. You spend a week heaving. -20 health.';
          }
          s.prestige += 15;
          const brave = chance(s, 0.3) ? ` ${shape(r, 'brave', 'is now')}` : '';
          return `You clean your plate without blinking. The court is in awe. +15 prestige.${brave}`;
        },
      },
    ],
  },
  {
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
        const k = pick(s, Object.values(s.clans).filter((c) => !c.isPlayer));
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
    choices: [
      {
        label: 'Take them as your lover',
        hint: 'Affairs can produce heirs',
        run: (c) => {
          c.r.loverId = other(c).id;
          return `${other(c).name} is now your lover. Discretion is advised.`;
        },
      },
      {
        label: 'Let them down gently',
        hint: 'Their house appreciates it',
        run: (c) => {
          remember(c.s, String(c.data.clan), 'Spared our pride', 12, 0.15);
          return `${other(c).name} takes it well, and House ${clan(c)?.name} notes your tact.`;
        },
      },
      {
        label: 'Read the poems aloud at court',
        hint: '+15 prestige, makes an enemy',
        run: (c) => {
          c.s.prestige += 15;
          remember(c.s, String(c.data.clan), 'Mocked one of ours', -20);
          const cruel = chance(c.s, 0.3) ? ` ${shape(c.r, 'cruel', 'is now')}` : '';
          return `The court howls with laughter. ${other(c).name} flees in tears. +15 prestige.${cruel}`;
        },
      },
    ],
  },
  {
    id: 'heretic',
    title: 'A Heretic in the Square',
    icon: 'faith',
    weight: 1.5,
    when: (s) => canAct(s),
    text: ({ s }) =>
      `A ragged preacher stands on a cargo crate in your market square, denouncing ${theFaith(playerClan(s).faithId)} as a lie told by the rich to keep the poor quiet. The crowd is growing.`,
    choices: [
      {
        label: 'Debate them in public',
        hint: 'Diplomacy check',
        run: ({ s, r }) => {
          if (chance(s, 0.3 + effStats(s, r).dip * 0.045)) {
            s.faith += 35;
            s.prestige += 15;
            return 'You take their arguments apart one by one and the crowd cheers you. The preacher slinks away. +35 faith, +15 prestige.';
          }
          s.faith -= 25;
          s.prestige -= 10;
          return 'They run rings round you. The crowd laughs, and not with you. -25 faith, -10 prestige.';
        },
      },
      {
        label: 'Exile them beyond the dome',
        hint: '+20 faith',
        run: ({ s, r }) => {
          s.faith += 20;
          const z = chance(s, 0.35) ? ` ${shape(r, 'zealous', 'becomes')}` : '';
          return `The preacher is put on the next ore-hauler to nowhere. The priests approve. +20 faith.${z}`;
        },
      },
      {
        label: 'Let them speak',
        hint: '-15 faith, +1 Science',
        run: ({ s, r }) => {
          s.faith -= 15;
          r.base.sci += 1;
          const cy = chance(s, 0.35) ? ` ${shape(r, 'cynical', 'becomes')}` : '';
          return `Ideas are not crimes. The priests are furious; the scholars quietly approve. -15 faith, +1 Science.${cy}`;
        },
      },
    ],
  },
  {
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
    choices: [
      {
        label: 'Hear their grievances',
        hint: 'Diplomacy check',
        run: ({ s, r, data }) => {
          const reg = s.regions[String(data.region)];
          if (chance(s, 0.35 + effStats(s, r).dip * 0.04)) {
            if (reg) reg.dev = Math.min(10, reg.dev + 1);
            s.prestige += 10;
            const j = chance(s, 0.3) ? ` ${shape(r, 'just', 'is now known as')}` : '';
            return `You sit with the strike leaders until dawn and find a fair deal. Work resumes with a will. +1 development, +10 prestige.${j}`;
          }
          s.credits -= 60;
          return 'You promise far too much to end it quickly. -60 credits.';
        },
      },
      {
        label: 'Cut their taxes',
        hint: '-100 credits, +1 development',
        available: ({ s }) => s.credits >= 100,
        run: ({ s, data }) => {
          s.credits -= 100;
          const reg = s.regions[String(data.region)];
          if (reg) reg.dev = Math.min(10, reg.dev + 1);
          return 'Grateful workers put in double shifts. +1 development.';
        },
      },
      {
        label: 'Send in the marines',
        hint: 'Lose a few ships',
        run: ({ s, r }) => {
          const lost = Math.max(1, Math.round(s.fleet * 0.05));
          s.fleet -= lost;
          const cr = chance(s, 0.35) ? ` ${shape(r, 'cruel', 'is now')}` : '';
          return `The barricades fall and order is restored, at the cost of ${lost} ships' worth of crews.${cr}`;
        },
      },
    ],
  },
  {
    id: 'jester',
    title: 'The Holo-Jester',
    icon: 'gala',
    weight: 1.2,
    cooldown: 12,
    when: (s) => canAct(s),
    text: ({ r }) => `At dinner the court's holo-jester unveils a new routine: a flickering caricature of you, ${caricature(r)}. The whole court is trying very hard not to laugh.`,
    choices: [
      {
        label: 'Laugh louder than anyone',
        hint: '+10 prestige',
        run: ({ s, r }) => {
          s.prestige += 10;
          const h = chance(s, 0.3) ? ` ${shape(r, 'humble', 'becomes')}` : '';
          return `The court roars with relief. A ruler who can take a joke. +10 prestige.${h}`;
        },
      },
      {
        label: 'Throw the jester in the cells',
        hint: '-10 prestige',
        run: ({ s, r }) => {
          s.prestige -= 10;
          const a = chance(s, 0.4) ? ` ${shape(r, 'arrogant', 'becomes')}` : '';
          return `Nobody laughs at dinner again. Nobody says much at all. -10 prestige.${a}`;
        },
      },
      {
        label: 'Make the jester your eyes and ears',
        hint: '+1 Intrigue',
        run: ({ r }) => {
          r.base.int += 1;
          return 'Jesters go everywhere and hear everything. Yours now reports to you. +1 Intrigue.';
        },
      },
    ],
  },
  {
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
    choices: [
      {
        label: 'A grand investiture',
        hint: '-150 credits, +30 prestige',
        available: ({ s }) => s.credits >= 150,
        run: ({ s, subject }) => {
          s.credits -= 150;
          s.prestige += 30;
          subject!.base.dip += 1;
          return `Banners, fireworks and a thousand guests. +30 prestige, and ${subject!.name} gains +1 Diplomacy from all the hands ${pr(subject).he} shook.`;
        },
      },
      {
        label: 'Send them to serve with the fleet',
        hint: '+2 Command, but dangerous',
        run: ({ s, subject }) => {
          const h = subject!;
          h.base.cmd += 2;
          if (chance(s, 0.2)) {
            h.traits = addTrait(h.traits, 'scarred');
            return `${h.name} comes back from a pirate hunt with +2 Command and a scar across the cheek.`;
          }
          const b = chance(s, 0.4) ? ` ${shape(h, 'brave', 'comes home')}` : '';
          return `A year on the gun decks makes ${pr(h).him} a real officer. +2 Command.${b}`;
        },
      },
      {
        label: 'Send them on pilgrimage',
        hint: '+20 faith, Pilgrim',
        run: ({ s, subject }) => {
          s.faith += 20;
          subject!.traits = addTrait(subject!.traits, 'pilgrim');
          return `${subject!.name} walks the dead-star shrines and returns a Pilgrim. +20 faith.`;
        },
      },
      { label: 'A quiet family blessing', run: ({ subject }) => `You hold ${subject!.name} close and tell ${pr(subject).him} you are proud. That is enough.` },
    ],
  },
  {
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
    choices: [
      {
        label: 'Let her try',
        hint: 'A gamble',
        run: ({ s, subject }) => {
          const c = subject!;
          if (chance(s, 0.6)) {
            cure(c);
            c.health += 10;
            return `The brew smells like a reactor leak, but by morning the fever has broken. ${c.name} will recover.`;
          }
          c.health -= 15;
          return `The brew only makes things worse. ${c.name} is weaker than ever.`;
        },
      },
      {
        label: 'Fly in a Saturnine specialist',
        hint: '-150 credits, likely cure',
        available: ({ s }) => s.credits >= 150,
        run: ({ s, subject }) => {
          s.credits -= 150;
          if (chance(s, 0.85)) {
            cure(subject!);
            return `The specialist's nanite course works. ${subject!.name} is on the mend.`;
          }
          return 'Even the specialist can do nothing. It is in the hands of fate now.';
        },
      },
      { label: 'Trust the court physicians', run: () => 'They scan, they frown, they prescribe rest.' },
    ],
  },
  {
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
    choices: [
      {
        label: 'Welcome them home',
        hint: '-60 credits, +ships',
        available: ({ s }) => s.credits >= 60,
        run: ({ s, data }) => {
          const n = Number(data.n);
          s.credits -= 60;
          s.fleet += n;
          const victim = chance(s, 0.25) ? pick(s, courtMembers(s)) : undefined;
          if (victim && sicken(s, victim)) return `${n} ships rejoin the fleet after a refit. But they brought something back with them: ${victim.name} has fallen ill.`;
          return `${n} ships rejoin the fleet after a refit. The crews never speak of where they have been.`;
        },
      },
      {
        label: 'Quarantine and study them',
        hint: 'Science check',
        run: ({ s, r, data }) => {
          const n = Math.round(Number(data.n) / 2);
          s.fleet += n;
          if (chance(s, 0.3 + effStats(s, r).sci * 0.05)) {
            r.base.sci += 1;
            if (!hasTrait(r, 'xenoblood') && chance(s, 0.25)) {
              r.traits = addTrait(r.traits, 'xenoblood');
              return `Your scientists distil a serum from the crews' blood and you are the first to take it. You now have Xenoblood. +1 Science, and ${n} ships salvaged.`;
            }
            return `Their logs describe a fold in space-time past the Kuiper Belt. +1 Science, and ${n} ships salvaged.`;
          }
          return `The crews die one by one in quarantine, ageing decades in days. You salvage ${n} ships.`;
        },
      },
      {
        label: 'Scuttle them',
        hint: '+credits',
        run: ({ s, data }) => {
          const n = Number(data.n) * 12;
          s.credits += n;
          s.faith += 10;
          return `Some things should stay lost. The scrap fetches ${n} credits, and the priests call it wise. +10 faith.`;
        },
      },
    ],
  },
  {
    id: 'masquerade',
    title: 'The Masquerade',
    icon: 'gala',
    weight: 1.2,
    cooldown: 12,
    when: (s) => canAct(s) && hasRival(s),
    setup: ({ s, data }) => {
      data.clan = rivalClan(s)?.id ?? '';
    },
    text: () => 'The Venusian cloud-courts are hosting a masquerade: one night when every face is hidden and every secret is for sale. An invitation in silver ink has arrived for you.',
    choices: [
      {
        label: 'Go masked and listen',
        hint: 'Intrigue check, could win a claim',
        run: (c) => {
          const k = clan(c);
          if (k && chance(c.s, 0.3 + effStats(c.s, c.r).int * 0.05)) {
            const reg = claimOn(c.s, k.id);
            if (reg) return `Behind a peacock mask, a drunk envoy of House ${k.name} lets slip a forged deed. You now have a claim on ${reg}.`;
          }
          return 'You overhear a great deal about the price of methane and nothing else.';
        },
      },
      {
        label: 'Go and dazzle',
        hint: '-80 credits, every house warms to you',
        available: ({ s }) => s.credits >= 80,
        run: ({ s }) => {
          s.credits -= 80;
          s.prestige += 15;
          for (const k of Object.values(s.clans)) if (!k.isPlayer) k.opinion = Math.min(100, k.opinion + 4);
          return 'Your mask is the talk of the system. +15 prestige, and every house thinks a little better of you.';
        },
      },
      { label: 'Decline', run: () => 'You have enough secrets of your own.' },
    ],
  },
  {
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
    choices: [
      {
        label: 'Let them raise it',
        hint: 'Who knows what will hatch?',
        run: ({ s, subject, data }) => {
          setFlag(s, 'hatchling', s.year + int(s, 2, 4), { keeper: subject!.id, pet: String(data.pet) });
          const k = chance(s, 0.4) ? ` ${shape(subject!, 'kind')}` : '';
          return `${subject!.name} names it ${data.pet} and feeds it everything in the larder. It hatches the next morning: all teeth and eyes.${k}`;
        },
      },
      {
        label: 'Sell it to a xeno-collector',
        hint: '+credits',
        run: ({ s, subject }) => {
          const n = int(s, 80, 160);
          s.credits += n;
          return `A collector pays ${n} credits. ${subject!.name} cries for a week.`;
        },
      },
      {
        label: 'Hand it to the scientists',
        hint: '+1 Science',
        run: ({ r }) => {
          r.base.sci += 1;
          return 'The egg is dissected in the name of knowledge. You learn a lot. +1 Science.';
        },
      },
    ],
  },
  {
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
    choices: [
      {
        label: 'Make it the house companion',
        hint: 'A relic for your treasury',
        run: ({ s, data }) => {
          const item = companion(s, String(data.pet));
          s.items.push(item);
          return `${data.pet} now sleeps at the foot of the throne. Equip ${item.name} as a relic in the Treasury tab.`;
        },
      },
      {
        label: 'Enter it in the beast-pits',
        hint: '+credits, +prestige',
        run: ({ s, data }) => {
          const n = int(s, 120, 220);
          s.credits += n;
          s.prestige += 15;
          return `${data.pet} is undefeated in the pits. +${n} credits in winnings, +15 prestige.`;
        },
      },
      {
        label: 'Release it into the wild',
        hint: '+10 faith',
        run: ({ s, data }) => {
          s.faith += 10;
          return `${data.pet} bounds off into the badlands. On quiet nights you still hear it howl. +10 faith.`;
        },
      },
    ],
  },
  {
    id: 'leviathan',
    title: 'A Void Leviathan',
    icon: 'hunt',
    weight: 1,
    cooldown: 20,
    text: () => 'Something vast has drifted into orbit: a void leviathan, a living creature the size of a moon-hauler, its hide glittering with ice. Your people crowd the observation decks.',
    choices: [
      {
        label: 'Hunt it with the fleet',
        hint: 'Lose ships, win glory',
        available: ({ s }) => s.fleet >= 20,
        run: ({ s, r }) => {
          const lost = Math.round(s.fleet * (0.05 + rand(s) * 0.1));
          s.fleet -= lost;
          if (chance(s, 0.5 + effStats(s, r).cmd * 0.02)) {
            s.prestige += 50;
            r.traits = addTrait(r.traits, 'beast_slayer');
            const item = makeItem(s, newId(s, 'i'), { slot: 'relic', rarity: chance(s, 0.3) ? 'legendary' : 'epic', origin: 'Cut from a void leviathan' });
            s.items.push(item);
            return `After a three-day chase you land the killing shot yourself. -${lost} ships, +50 prestige, Beast-Slayer, and the ${item.name} for your treasury.`;
          }
          return `It shrugs off your broadsides and swims back into the dark. -${lost} ships.`;
        },
      },
      {
        label: 'Study it',
        hint: 'Science check',
        run: ({ s, r }) => {
          if (chance(s, 0.35 + effStats(s, r).sci * 0.05)) {
            r.base.sci += 2;
            return 'You learn more about the void in a month than your scholars did in a century. +2 Science.';
          }
          r.base.sci += 1;
          return 'It leaves before you learn much. +1 Science.';
        },
      },
      { label: 'Hail it as a holy sign', hint: '+40 faith', run: ({ s }) => ((s.faith += 40), 'The priests declare it a messenger of the divine. +40 faith.') },
    ],
  },
  {
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
    choices: [
      { label: 'Hold a vigil for their soul', hint: '+25 faith', run: ({ s, data }) => ((s.faith += 25), `Candles burn all night. ${data.ghost} is seen no more. +25 faith.`) },
      {
        label: 'Send in the engineers',
        hint: 'Science check',
        run: ({ s, r }) => {
          if (chance(s, 0.35 + effStats(s, r).sci * 0.05)) {
            const n = int(s, 120, 240);
            s.credits += n;
            return `It is an old holo-recording stuck on a loop. Behind the projector is a hidden vault. +${n} credits.`;
          }
          return 'The engineers find nothing, and two of them quit on the spot.';
        },
      },
      {
        label: 'Brick it up',
        run: ({ s, r }) => {
          const p = chance(s, 0.25) ? ` ${shape(r, 'paranoid', 'becomes')}` : '';
          return `The east wing is sealed. The servants sleep easier; you do not.${p}`;
        },
      },
    ],
  },
  {
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
    choices: [
      {
        label: 'Lend the money',
        hint: '-150 credits, a gamble on friendship',
        run: ({ s, r, data }) => {
          s.credits -= 150;
          const ok = chance(s, 0.5 + effStats(s, r).eco * 0.02) ? 1 : 0;
          setFlag(s, 'loan', s.year + int(s, 3, 6), { name: String(data.name), gender: String(data.gender), ok });
          return `${data.name} weeps, embraces you, and swears to pay you back twice over.`;
        },
      },
      { label: 'Give a smaller gift', hint: '-40 credits', run: ({ s }) => ((s.credits -= 40), 'It is not what they hoped for, but it is something.') },
      { label: 'Turn them away', run: () => 'Friendship is friendship and business is business. They leave without a word.' },
    ],
  },
  {
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
    choices: [
      { label: 'Take the money', hint: '+400 credits', run: ({ s }) => ((s.credits += 400), 'Four hundred credits, counted out on the throne-room floor. +400 credits.') },
      {
        label: 'Tell them to keep it',
        hint: '+30 prestige, a loyal friend',
        run: ({ s, r, data }) => {
          s.prestige += 30;
          r.base.eco += 1;
          return `${data.name} never forgets it, and tells everyone. +30 prestige, and their business advice gives you +1 Economy.`;
        },
      },
    ],
  },
  {
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
    choices: [
      {
        label: 'Send bounty hunters',
        hint: '-50 credits, might recover it',
        available: ({ s }) => s.credits >= 50,
        run: ({ s, data }) => {
          s.credits -= 50;
          if (chance(s, 0.5)) {
            s.credits += 150;
            s.prestige += 10;
            return `The hunters drag ${data.name} back from a Neptunian ice-mine. You get your 150 credits back. +10 prestige.`;
          }
          return `The trail goes cold somewhere past Uranus. ${data.name} is gone.`;
        },
      },
      {
        label: 'Let it go',
        run: ({ s, r }) => {
          const k = chance(s, 0.4) ? ` ${shape(r, 'kind', 'is now')}` : '';
          return `Some lessons cost 150 credits.${k}`;
        },
      },
    ],
  },
  {
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
    choices: [
      {
        label: 'Punish them harshly',
        run: ({ s, subject }) => {
          const c = subject!;
          if (chance(s, 0.5)) return `Bread and water for a week. ${shape(c, 'humble')}`;
          if (chance(s, 0.5)) return `Bread and water for a week. The lesson ${c.name} learns is the wrong one: ${shape(c, 'cruel', 'grows up')}`;
          return `Bread and water for a week. ${c.name} sulks, then forgets.`;
        },
      },
      {
        label: 'Make them confess to the court',
        hint: '-5 prestige',
        run: ({ s, subject }) => {
          s.prestige -= 5;
          if (chance(s, 0.6)) return `A tearful confession before the whole court. ${shape(subject!, 'honest')}`;
          return `A mumbled confession before the whole court. ${subject!.name} goes red to the ears.`;
        },
      },
      {
        label: 'Laugh it off',
        run: ({ s, subject }) => {
          if (chance(s, 0.5)) return `"It was an ugly bust anyway." ${shape(subject!, 'arrogant')}`;
          return `"It was an ugly bust anyway." ${shape(subject!, 'gregarious')}`;
        },
      },
    ],
  },
  {
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
    choices: [
      {
        label: 'Proclaim a miracle',
        hint: '+40 faith, +10 prestige, Blessed',
        run: ({ s, subject }) => {
          s.faith += 40;
          s.prestige += 10;
          subject!.traits = addTrait(subject!.traits, 'blessed');
          return `The temples ring their bells for ${subject!.name}, now known as Blessed. +40 faith, +10 prestige.`;
        },
      },
      {
        label: 'Have the physicians examine them',
        hint: 'Science',
        run: ({ s, subject }) => {
          const c = subject!;
          if (!c.traits.some((t) => TRAITS[t]?.group === 'psionic') && chance(s, 0.3)) {
            c.traits = addTrait(c.traits, 'psi_spark');
            return `The scans light up: ${c.name} has a latent Psionic Spark, a genetic gift you could lock into the bloodline.`;
          }
          return 'The physicians find a perfectly ordinary child and a very lucky servant.';
        },
      },
      { label: 'Hush it up', run: ({ subject }) => `The pilgrims are sent home. ${subject!.name} is very confused by all the fuss.` },
    ],
  },
  {
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
    choices: [
      {
        label: 'Grant sanctuary',
        hint: 'Angers their house, may win a claim',
        run: (c) => {
          const k = clan(c);
          remember(c.s, k?.id, 'Sheltered our runaway', -25);
          c.s.prestige += 10;
          const reg = k && chance(c.s, 0.5) ? claimOn(c.s, k.id) : undefined;
          return `${other(c).name} is safe under your roof. +10 prestige.${reg ? ` In gratitude, ${pr(other(c)).he} signs over a claim on ${reg}.` : ''}`;
        },
      },
      {
        label: 'Hand them back',
        hint: '+60 credits bounty, their house is grateful',
        run: (c) => {
          c.s.credits += 60;
          remember(c.s, String(c.data.clan), 'Returned our runaway', 20, 0.1);
          if (chance(c.s, 0.5)) {
            killCharacter(c.s, other(c).id, 'executed by their own house');
            return `House ${clan(c)?.name} pays the bounty. You hear later that the trial was very short. +60 credits.`;
          }
          return `House ${clan(c)?.name} pays the bounty and thanks you warmly. +60 credits.`;
        },
      },
      {
        label: 'Hold them for ransom',
        hint: '+credits, -10 prestige',
        run: (c) => {
          const n = int(c.s, 120, 200);
          c.s.credits += n;
          c.s.prestige -= 10;
          remember(c.s, String(c.data.clan), 'Ransomed one of ours', -15);
          return `House ${clan(c)?.name} pays ${n} credits to get ${other(c).name} back, and will not forget it. -10 prestige.`;
        },
      },
    ],
  },
  {
    id: 'void_dice',
    title: 'A Game of Void-Dice',
    icon: 'credits',
    weight: 1.2,
    cooldown: 10,
    when: (s) => canAct(s) && s.credits >= 100,
    text: () => 'A Cererian merchant-captain with a gold tooth challenges you to void-dice in front of the whole court. "Unless a lord of your standing is afraid of a little wager?"',
    choices: [
      {
        label: 'Bet 100 credits',
        hint: 'Pure luck',
        run: ({ s }) => {
          if (chance(s, 0.48)) {
            s.credits += 100;
            return 'Double sixes! The captain pays up with a pained smile. +100 credits.';
          }
          s.credits -= 100;
          return 'Snake eyes. The captain pockets your credits and tips an imaginary hat. -100 credits.';
        },
      },
      {
        label: 'Bet 100 and cheat',
        hint: 'Intrigue check',
        run: ({ s, r }) => {
          if (chance(s, 0.3 + effStats(s, r).int * 0.05)) {
            s.credits += 100;
            const d = chance(s, 0.25) ? ` ${shape(r, 'deceitful', 'becomes')}` : '';
            return `Your loaded dice never miss. +100 credits.${d}`;
          }
          s.credits -= 100;
          s.prestige -= 25;
          return 'The captain catches your loaded dice and holds them up for the whole court to see. -100 credits, -25 prestige.';
        },
      },
      { label: 'Decline', hint: '-5 prestige', run: ({ s }) => ((s.prestige -= 5), 'The captain smirks. A few courtiers do too. -5 prestige.') },
    ],
  },
  {
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
      const item = JSON.parse(String(c.data.item)) as Item;
      return `An envoy of House ${clan(c)?.name} presents you with the ${item.name}, "in the spirit of friendship". House ${clan(c)?.name} has never been your friend.`;
    },
    choices: [
      {
        label: 'Accept it graciously',
        run: (c) => {
          const item = JSON.parse(String(c.data.item)) as Item;
          c.s.items.push(item);
          if (clan(c)) clan(c).opinion = Math.min(100, clan(c).opinion + 10);
          if (c.data.bugged) {
            const n = Math.min(Math.max(0, c.s.credits), int(c.s, 60, 120));
            c.s.credits -= n;
            const cost = n > 0 ? ` Trade secrets leaked: -${n} credits.` : ' Who knows what they heard.';
            return `The ${item.name} joins your treasury. Months later your engineers find a listening device inside it.${cost}`;
          }
          return `The ${item.name} joins your treasury. It is, against all odds, just a very fine gift.`;
        },
      },
      {
        label: 'Have it scanned first',
        hint: '-30 credits',
        available: ({ s }) => s.credits >= 30,
        run: (c) => {
          c.s.credits -= 30;
          const item = JSON.parse(String(c.data.item)) as Item;
          if (c.data.bugged) {
            c.s.prestige += 20;
            remember(c.s, String(c.data.clan), 'Exposed our spying', -15);
            return `The scanners find a listening device inside. You hand it back in front of the whole court. +20 prestige.`;
          }
          c.s.items.push(item);
          return `It is clean. The ${item.name} joins your treasury.`;
        },
      },
      {
        label: 'Refuse it',
        run: (c) => {
          remember(c.s, String(c.data.clan), 'Refused our gift', -10);
          return `The envoy leaves stiffly with the ${(JSON.parse(String(c.data.item)) as Item).name} under one arm.`;
        },
      },
    ],
  },
  {
    id: 'harvest',
    title: 'A Bumper Harvest',
    icon: 'eco',
    weight: 1.5,
    cooldown: 10,
    when: (s) => clanRegions(s, s.playerClanId).length > 0,
    text: () => 'The hydroponic domes have produced the best harvest in a generation. The vats are overflowing and the farmers are singing.',
    choices: [
      {
        label: 'Sell the surplus',
        hint: '+credits',
        run: ({ s }) => {
          const n = int(s, 80, 120) + clanRegions(s, s.playerClanId).length * 15;
          s.credits += n;
          return `Grain barges head for the inner worlds. +${n} credits.`;
        },
      },
      {
        label: 'Throw a harvest feast',
        hint: '+15 prestige, +15 faith',
        run: ({ s }) => {
          s.prestige += 15;
          s.faith += 15;
          return 'Everyone eats until they cannot move. +15 prestige, +15 faith.';
        },
      },
      {
        label: 'Fill the granaries',
        hint: 'Saves you from the next blight',
        show: ({ s }) => !getFlag(s, 'granary'),
        run: ({ s }) => {
          setFlag(s, 'granary', s.year);
          return 'The surplus is sealed in cryo-silos. When the next blight comes, your people will not go hungry.';
        },
      },
    ],
  },
];
