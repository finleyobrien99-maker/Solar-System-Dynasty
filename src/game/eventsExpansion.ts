// Thirty events that make the dynasty feel lived in (ROADMAP ticket 15, 3.6):
// ten about children and youth, ten about court and family, and one for each
// world. They are people having messy lives, so most consequences land on the
// person involved (a feeling, a trait, a stat) rather than on the ruler's
// purse. Childhood choices shape personality. Every option is written with the
// DSL, so tooltips can't disagree with what happens and describing never rolls
// dice. House goodwill goes through `opinion` and `remember`, which respect the
// grudge ceiling (memory.ts). Shuffled into the main deck in events.ts.

import { ROLES, councillor, roleOf, ROLE_KEYS } from './council';
import { ageOf, alive, canAct, ch, childrenOf, clanRegions, ruler } from './core';
import { defineEvent } from './dsl';
import { named } from './eventBits';
import { pr, type EventCtx, type EventDef } from './eventKit';
import { int, pick } from './rng';
import { isAway } from './wards';
import type { Character, Clan, GameState, Region } from './types';

// ── Who the events are about (cheap: close family only, never a full scan) ──

/** Your own children, alive, free and of the right age. */
function kids(s: GameState, lo: number, hi: number): Character[] {
  return childrenOf(s, ruler(s)).filter(
    (c) => alive(c) && !c.prisonerOf && !isAway(s, c) && c.clanId === s.playerClanId && ageOf(s, c) >= lo && ageOf(s, c) <= hi,
  );
}

/** The ruler's brothers and sisters, alive and free. */
function siblings(s: GameState): Character[] {
  const r = ruler(s);
  const ids = new Set<string>();
  for (const p of [ch(s, r.fatherId), ch(s, r.motherId)]) for (const id of p?.childrenIds ?? []) if (id !== r.id) ids.add(id);
  return [...ids].map((id) => s.characters[id]).filter((c): c is Character => alive(c) && !c.prisonerOf);
}

/** Nieces and nephews of the ruler living in the house. */
function cousins(s: GameState, lo: number, hi: number): Character[] {
  const out: Character[] = [];
  for (const sib of siblings(s))
    for (const id of sib.childrenIds) {
      const c = s.characters[id];
      if (alive(c) && !c.prisonerOf && c.clanId === s.playerClanId && ageOf(s, c) >= lo && ageOf(s, c) <= hi) out.push(c);
    }
  return out;
}

/** Parents of the ruler who have reached a forgetful age. */
function elders(s: GameState): Character[] {
  const r = ruler(s);
  return [ch(s, r.fatherId), ch(s, r.motherId)].filter((c): c is Character => alive(c) && !c.prisonerOf && ageOf(s, c) >= 60);
}

/** Councillors currently in post. */
function councillors(s: GameState): Character[] {
  return ROLE_KEYS.map((role) => councillor(s, role)).filter((c): c is Character => !!c);
}

/** Grown family who might quarrel: adult children and brothers and sisters. */
function feudPool(s: GameState): Character[] {
  return [...kids(s, 16, 70), ...siblings(s).filter((c) => ageOf(s, c) >= 18)];
}

/** The ruler's spouse, if they come from another landed house. */
function marriedOut(s: GameState): Character | undefined {
  const sp = ch(s, ruler(s).spouseId);
  if (!alive(sp) || sp.prisonerOf || sp.clanId === s.playerClanId) return undefined;
  return clanRegions(s, sp.clanId).length > 0 ? sp : undefined;
}

function landedAi(s: GameState): Clan[] {
  return Object.values(s.clans).filter((k) => !k.isPlayer && clanRegions(s, k.id).length > 0);
}

/** Your regions on a world. */
function regionsOn(s: GameState, planet: string): Region[] {
  return clanRegions(s, s.playerClanId).filter((r) => r.planetId === planet);
}

const oneOf = (s: GameState, pool: Character[]): Character | undefined => (pool.length ? pick(s, pool) : undefined);

/** Setup for a planet event: pick one of your regions on that world. */
const onWorld =
  (planet: string) =>
  ({ s, data }: EventCtx): void => {
    data.reg = pick(s, regionsOn(s, planet)).id;
  };

const regionName = (s: GameState, id: string | number | undefined): string => s.regions[String(id)]?.name ?? 'your lands';

// ── The deck ──────────────────────────────────────────────────────────────

export const EXPANSION_EVENTS: EventDef[] = [
  // ── Childhood and youth ────────────────────────────────────────────────
  defineEvent({
    id: 'first_flight',
    title: 'First Flight',
    icon: 'ship',
    weight: 1.2,
    cooldown: 10,
    when: (s) => canAct(s) && kids(s, 8, 15).length > 0,
    subject: (s) => oneOf(s, kids(s, 8, 15)),
    text: ({ subject }) =>
      `${subject!.name} has stolen a patrol skiff and is looping it round the docking ring with the lights off. The flight deck is shouting. ${pr(subject).He} is, by every report, quite good.`,
    options: [
      {
        label: 'Let them finish the loop',
        then: {
          roll: { base: 0.55, per: { stat: 'cmd', n: 0.05, of: 'subject' } },
          pass: {
            do: [
              { stat: 'cmd', n: 1, to: 'subject' },
              { trait: 'brave', to: 'subject', p: 0.5 },
            ],
            text: (c) =>
              `${c.subject!.name} lands it perfectly, then is sick behind a crate. The pilots start calling ${pr(c.subject).him} "Captain", and it sticks.`,
          },
          fail: {
            do: [
              { health: -15, to: 'subject' },
              { trait: 'wounded', to: 'subject' },
              { lose: 'credits', n: 60 },
            ],
            text: (c) => `${c.subject!.name} clips the ring and walks away from the wreck with a broken arm and a very expensive apology to make.`,
          },
        },
      },
      {
        label: 'Enrol them in flight school',
        needs: [{ have: 'credits', n: 80 }],
        then: {
          do: [
            { lose: 'credits', n: 80 },
            { stat: 'cmd', n: 1, to: 'subject' },
            { feel: 10, from: 'subject', why: 'Gave me proper lessons', key: 'flight' },
          ],
          text: (c) => `${c.subject!.name} gets a licence, a logbook and a stern instructor. ${pr(c.subject).He} has never been happier.`,
        },
      },
      {
        label: 'Ground them for a year',
        then: {
          do: [
            { feel: -15, from: 'subject', why: 'Grounded me for flying', key: 'flight' },
            { trait: 'impatient', to: 'subject', p: 0.35 },
          ],
          text: (c) => `${c.subject!.name} sulks in the schoolroom, drawing ships in the margins of every book.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'cousin_rivalry',
    title: "A Cousin's Rivalry",
    icon: 'family',
    weight: 1.2,
    cooldown: 10,
    when: (s) => canAct(s) && kids(s, 8, 16).length > 0 && cousins(s, 8, 17).length > 0,
    subject: (s) => oneOf(s, kids(s, 8, 16)),
    setup: ({ s, data }) => {
      data.cousin = pick(s, cousins(s, 8, 17)).id;
    },
    text: ({ s, subject, data }) =>
      `${subject!.name} and ${s.characters[String(data.cousin)].name} have not spoken since a quarrel over a model ship, a tutor's favour and who is better at everything. The east corridor has taken sides.`,
    options: [
      {
        label: 'Make them share lessons',
        then: {
          roll: { base: 0.4, per: { stat: 'dip', n: 0.04 } },
          pass: {
            do: [
              { feel: 15, from: 'subject', to: 'cousin', why: 'Studied together', key: 'cousin' },
              { feel: 15, from: 'cousin', to: 'subject', why: 'Studied together', key: 'cousin' },
            ],
            text: 'Three weeks of shared sums, and they are plotting against the tutor together. Progress.',
          },
          fail: {
            do: [
              { feel: -15, from: 'subject', to: 'cousin', why: 'Humiliated me in class', key: 'cousin' },
              { feel: -15, from: 'cousin', to: 'subject', why: 'Humiliated me in class', key: 'cousin' },
            ],
            text: 'The lessons end in an ink fight. The tutor resigns, with dignity and a stain on his collar.',
          },
        },
      },
      {
        label: 'Back your own child',
        then: {
          do: [
            { feel: 15, from: 'subject', why: 'Took my side', key: 'cousin' },
            { feel: -20, from: 'cousin', to: 'subject', why: 'The favourite', key: 'cousin' },
            { feel: -10, from: 'cousin', why: 'Took the other side', key: 'cousin' },
            { trait: 'arrogant', to: 'subject', p: 0.4 },
          ],
          text: (c) => `${c.subject!.name} gets the last word. ${named(c, 'cousin')} gets a long memory.`,
        },
      },
      {
        label: 'Set them a contest',
        needs: [{ have: 'credits', n: 30 }],
        then: {
          do: [{ lose: 'credits', n: 30 }],
          roll: 0.5,
          pass: {
            do: [
              { stat: 'int', n: 1, to: 'subject' },
              { feel: -10, from: 'cousin', to: 'subject', why: 'Beat me fairly', key: 'cousin' },
            ],
            text: (c) => `${c.subject!.name} wins by a point. ${named(c, 'cousin')} demands a rematch.`,
          },
          fail: {
            do: [
              { stat: 'int', n: 1, to: 'cousin' },
              { feel: -10, from: 'subject', to: 'cousin', why: 'Beat me fairly', key: 'cousin' },
            ],
            text: (c) => `${named(c, 'cousin')} wins by a point. ${c.subject!.name} demands a rematch.`,
          },
        },
      },
    ],
  }),
  defineEvent({
    id: 'imaginary_friend',
    title: 'An Imaginary Friend',
    icon: 'study',
    weight: 1,
    cooldown: 12,
    when: (s) => canAct(s) && kids(s, 4, 9).length > 0,
    subject: (s) => oneOf(s, kids(s, 4, 9)),
    text: ({ subject }) =>
      `${subject!.name} insists ${pr(subject).he} has a friend called Mister Lamp, who lives in the walls and knows when it is going to rain. The housekeeping AI has stopped denying it.`,
    options: [
      {
        label: 'Let them keep Mister Lamp',
        then: {
          roll: 0.6,
          pass: {
            do: [{ stat: 'sci', n: 1, to: 'subject' }],
            text: 'Mister Lamp turns out to be a maintenance daemon with firm views on orbital mechanics. A child could do worse for a tutor.',
          },
          fail: {
            do: [{ trait: 'deceitful', to: 'subject', p: 0.5, or: 'paranoid' }],
            text: (c) => `Mister Lamp teaches ${c.subject!.name} to open every door in the house, and to say nothing about it.`,
          },
        },
      },
      {
        label: 'Have the daemon wiped',
        then: {
          do: [
            { feel: -20, from: 'subject', why: 'Wiped my friend', key: 'lamp', decay: 0.5 },
            { trait: 'shy', to: 'subject', p: 0.5 },
          ],
          text: (c) => `${c.subject!.name} watches the engineers go into the wall and does not speak for two days.`,
        },
      },
      {
        label: 'Investigate it yourself',
        needs: [{ stat: 'sci', min: 6 }],
        then: {
          do: [
            { stat: 'sci', n: 1, to: 'subject' },
            { feel: 15, from: 'subject', why: 'Took Mister Lamp seriously', key: 'lamp' },
          ],
          text: (c) => `You sit on the corridor floor with ${c.subject!.name} and interview a wall. It is the best afternoon you have had all year.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'stowaway',
    title: 'Stowaway on the Flagship',
    icon: 'ship',
    weight: 1,
    cooldown: 12,
    when: (s) => canAct(s) && s.fleet >= 10 && kids(s, 9, 15).length > 0,
    subject: (s) => oneOf(s, kids(s, 9, 15)),
    text: ({ subject }) =>
      `${subject!.name} was found three days out in a torpedo locker, asleep, with a stolen ration pack and a hand-drawn star chart. The admiral wants to know whether to turn the fleet round.`,
    options: [
      {
        label: 'Let them serve out the voyage',
        then: {
          roll: { base: 0.6, per: { stat: 'cmd', n: 0.04, of: 'subject' } },
          pass: {
            do: [
              { stat: 'cmd', n: 1, to: 'subject' },
              { trait: 'brave', to: 'subject', p: 0.5 },
              { gain: 'prestige', n: 5 },
            ],
            text: (c) =>
              `${c.subject!.name} scrubs decks, learns the bells and comes home with a sailor's walk. The crew would follow ${pr(c.subject).him} anywhere.`,
          },
          fail: {
            do: [
              { health: -20, to: 'subject' },
              { trait: 'craven', to: 'subject', p: 0.4 },
            ],
            text: (c) => `Void-sickness lays ${c.subject!.name} flat for a week. ${pr(c.subject).He} does not ask to go again.`,
          },
        },
      },
      {
        label: 'Turn back at once',
        then: {
          do: [
            { lose: 'credits', n: 50 },
            { feel: -10, from: 'subject', why: 'Sent home in disgrace', key: 'stowaway' },
            { trait: 'patient', to: 'subject', p: 0.3 },
          ],
          text: (c) => `The fleet loses a week and ${c.subject!.name} loses an argument. The fuel bill is something else.`,
        },
      },
      {
        label: 'Put them to work scrubbing decks',
        then: {
          do: [
            { feel: -15, from: 'subject', why: 'Made me scrub the decks', key: 'stowaway' },
            { trait: 'diligent', to: 'subject', p: 0.5, or: 'cynical' },
          ],
          text: (c) => `${c.subject!.name} scrubs every deck on the ship and has very little to say to you afterwards.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'tutor_opinions',
    title: 'A Tutor with Opinions',
    icon: 'study',
    weight: 1.2,
    cooldown: 10,
    when: (s) => canAct(s) && kids(s, 7, 15).length > 0,
    subject: (s) => oneOf(s, kids(s, 7, 15)),
    text: ({ subject }) =>
      `${subject!.name}'s tutor has been teaching more than the syllabus. Last week it was "the Senate was right to be afraid of Mars". This week it is "every faith is a story told by the winners".`,
    options: [
      {
        label: 'Let the lessons stand',
        then: {
          do: [
            { stat: 'int', n: 1, to: 'subject' },
            { traitFrom: ['cynical', 'ambitious', 'honest'], to: 'subject', as: 'conviction', text: 'a conviction of their own' },
          ],
          text: (c) =>
            `${c.subject!.name} comes away sharper, and ${String(c.vars.conviction).toLowerCase()} with it. You are not sure that was on the syllabus.`,
        },
      },
      {
        label: 'Replace the tutor',
        needs: [{ have: 'credits', n: 60 }],
        then: {
          do: [
            { lose: 'credits', n: 60 },
            { trait: 'diligent', to: 'subject', p: 0.4, or: 'lazy' },
          ],
          text: (c) => `A safe, grey tutor arrives with a safe, grey syllabus. ${c.subject!.name} is bored stiff.`,
        },
      },
      {
        label: 'Sit in and argue back',
        then: {
          roll: { base: 0.4, per: { stat: 'dip', n: 0.04 } },
          pass: {
            do: [
              { feel: 20, from: 'subject', why: 'Argued with me like an equal', key: 'tutor' },
              { trait: 'honest', to: 'subject', p: 0.5 },
            ],
            text: (c) => `You lose the argument, and ${c.subject!.name} watches you lose it gracefully. It is worth more than winning.`,
          },
          fail: {
            do: [
              { feel: -10, from: 'subject', why: 'Spoiled my lesson', key: 'tutor' },
              { lose: 'prestige', n: 5 },
            ],
            text: 'The tutor runs rings round you, in front of the class, and the class tells the whole court.',
          },
        },
      },
    ],
  }),
  defineEvent({
    id: 'runs_away',
    title: 'A Child Runs Away',
    icon: 'family',
    weight: 1,
    cooldown: 14,
    when: (s) => canAct(s) && kids(s, 10, 15).length > 0,
    subject: (s) => oneOf(s, kids(s, 10, 15)),
    text: ({ subject }) =>
      `${subject!.name} is not in bed, not in the schoolroom and not on the station. A freight clerk remembers a child in a hood buying a one-way ticket to the dock district.`,
    options: [
      {
        label: 'Go and fetch them yourself',
        then: {
          roll: { base: 0.5, per: { stat: 'dip', n: 0.03 } },
          pass: {
            do: [{ feel: 25, from: 'subject', why: 'Came for me myself', key: 'runaway' }],
            text: (c) =>
              `You find ${c.subject!.name} on a cargo crate, eating noodles. You sit down beside ${pr(c.subject).him} and say nothing for an hour. Then you go home together.`,
          },
          fail: {
            do: [
              { feel: -20, from: 'subject', why: 'Dragged me home', key: 'runaway' },
              { trait: 'wrathful', to: 'subject', p: 0.4 },
            ],
            text: (c) => `You find ${c.subject!.name}, and say all the wrong things. ${pr(c.subject).He} does not speak to you for a month.`,
          },
        },
      },
      {
        label: 'Send the guards',
        then: {
          do: [
            { feel: -25, from: 'subject', why: 'Had me hauled home by guards', key: 'runaway' },
            { trait: 'cynical', to: 'subject', p: 0.3 },
          ],
          text: (c) => `${c.subject!.name} is back by lunch, furious and silent. The guards are very pleased with themselves.`,
        },
      },
      {
        label: 'Let them stay a season with the salvagers',
        then: {
          do: [
            { lose: 'prestige', n: 10 },
            { stat: 'eco', n: 1, to: 'subject' },
            { trait: 'diligent', to: 'subject', p: 0.5, or: 'gregarious' },
            { feel: 10, from: 'subject', why: 'Let me go my own way', key: 'runaway' },
          ],
          text: (c) => `${c.subject!.name} comes home brown as a hull plate, knowing what a kilo of copper costs. The court is scandalised.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'rite_of_passage',
    title: 'A Rite of Passage',
    icon: 'hunt',
    weight: 1,
    cooldown: 14,
    when: (s) => canAct(s) && kids(s, 14, 17).length > 0,
    subject: (s) => oneOf(s, kids(s, 14, 17)),
    text: ({ subject }) =>
      `${subject!.name} wants to do the old house rite: a week alone in an unheated hull with one air bottle and a sealed letter from an ancestor. ${pr(subject).He} has been practising on the sly.`,
    options: [
      {
        label: 'Allow it',
        then: {
          roll: { base: 0.65, per: { stat: 'cmd', n: 0.03, of: 'subject' } },
          pass: {
            do: [
              { trait: 'brave', to: 'subject' },
              { stat: 'cmd', n: 1, to: 'subject' },
              { gain: 'prestige', n: 8 },
            ],
            text: (c) => `${c.subject!.name} comes out thin, grinning and holding the letter. ${pr(c.subject).He} will not say what is in it.`,
          },
          fail: {
            do: [
              { health: -25, to: 'subject' },
              { trait: 'wounded', to: 'subject' },
            ],
            text: (c) => `The air bottle was not quite full. They drag ${c.subject!.name} out on day five, blue about the lips, and very quiet.`,
          },
        },
      },
      {
        label: 'Forbid it',
        then: {
          do: [
            { feel: -15, from: 'subject', why: 'Forbade my rite', key: 'rite' },
            { trait: 'craven', to: 'subject', p: 0.3 },
          ],
          text: (c) => `${c.subject!.name} says nothing and goes to practise somewhere else.`,
        },
      },
      {
        label: 'Go with them',
        then: {
          do: [
            { lose: 'credits', n: 30 },
            { feel: 20, from: 'subject', why: 'Did the rite with me', key: 'rite' },
          ],
          roll: 0.85,
          pass: { do: [{ stat: 'cmd', n: 1, to: 'subject' }], text: 'Two of you in one cold hull for a week. You talk more than you have all year.' },
          fail: { text: 'The heating fails on day two. You are both miserable, and you will tell the story for the rest of your lives.' },
        },
      },
    ],
  }),
  defineEvent({
    id: 'hangar_prank',
    title: 'The Great Hangar Prank',
    icon: 'gala',
    weight: 1.2,
    cooldown: 10,
    when: (s) => canAct(s) && kids(s, 8, 14).length > 0,
    subject: (s) => oneOf(s, kids(s, 8, 14)),
    text: ({ subject }) =>
      `Somebody filled the admiral's quarters with six hundred litres of cleaning foam and left a note signed "The Void Weasels". Somebody is ${subject!.name}, and ${pr(subject).he} has already confessed, with enormous pride.`,
    options: [
      {
        label: 'Laugh, then punish lightly',
        then: {
          do: [
            { feel: 10, from: 'subject', why: 'Laughed with me', key: 'prank' },
            { trait: 'gregarious', to: 'subject', p: 0.5, or: 'arrogant' },
          ],
          text: (c) => `You manage to keep a straight face for nearly a minute. ${c.subject!.name} has a very light punishment and a very heavy reputation.`,
        },
      },
      {
        label: 'Make them apologise in person',
        then: {
          do: [
            { stat: 'dip', n: 1, to: 'subject' },
            { trait: 'humble', to: 'subject', p: 0.4 },
            { feel: -5, from: 'subject', why: 'Made me apologise', key: 'prank' },
          ],
          text: (c) => `${c.subject!.name} delivers a speech to the admiral. The admiral, wearing foam, accepts it with great gravity.`,
        },
      },
      {
        label: 'Pay for the damage and say nothing',
        needs: [{ have: 'credits', n: 50 }],
        then: {
          do: [{ lose: 'credits', n: 50 }, { deed: 'arbitrary' }, { trait: 'arrogant', to: 'subject', p: 0.5 }],
          text: (c) => `The bill is paid, the foam is gone and ${c.subject!.name} learns that nothing in this house is ever really your fault.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'bad_company',
    title: 'Bad Company',
    icon: 'scheme',
    weight: 1,
    cooldown: 12,
    when: (s) => canAct(s) && kids(s, 13, 17).length > 0,
    subject: (s) => oneOf(s, kids(s, 13, 17)),
    text: ({ subject }) =>
      `${subject!.name} has been seen in the lower docks with a crowd of smugglers' children, wearing a jacket nobody gave ${pr(subject).him}. They are, by all accounts, charming. They are also running a dice game.`,
    options: [
      {
        label: 'Let them find their feet',
        then: {
          do: [
            { stat: 'int', n: 1, to: 'subject' },
            { trait: 'deceitful', to: 'subject', p: 0.4, or: 'gregarious' },
            { lose: 'credits', n: { base: 20, roll: [0, 50] }, as: 'lost', upTo: 'have' },
          ],
          text: (c) =>
            `${c.subject!.name} learns to count cards and to lose gracefully. It costs ${c.vars.lost} credits in "gambling debts" before the lessons sink in.`,
        },
      },
      {
        label: 'Forbid it and set a guard',
        then: {
          do: [
            { feel: -15, from: 'subject', why: 'Had me followed', key: 'company' },
            { trait: 'paranoid', to: 'subject', p: 0.3 },
          ],
          text: (c) => `${c.subject!.name} finds the guard in four minutes and loses him in ten.`,
        },
      },
      {
        label: 'Find them a better friend',
        needs: [{ have: 'credits', n: 30 }],
        then: {
          do: [{ lose: 'credits', n: 30 }],
          roll: { base: 0.45, per: { stat: 'dip', n: 0.04 } },
          pass: {
            do: [
              { feel: 10, from: 'subject', why: 'Introduced me to someone good', key: 'company' },
              { trait: 'diligent', to: 'subject', p: 0.5 },
            ],
            text: (c) => `A sensible pilot's daughter takes ${c.subject!.name} under her wing. The smugglers are left to their dice.`,
          },
          fail: { text: 'The "better friend" turns out to be a better liar, and a better dice player.' },
        },
      },
    ],
  }),
  defineEvent({
    id: 'night_terrors',
    title: 'Night Terrors',
    icon: 'health',
    weight: 1,
    cooldown: 12,
    when: (s) => canAct(s) && kids(s, 4, 10).length > 0,
    subject: (s) => oneOf(s, kids(s, 4, 10)),
    text: ({ subject }) =>
      `${subject!.name} wakes screaming most nights now. ${pr(subject).He} dreams of falling "upward", out of the station and into the dark, with the stars getting further away.`,
    options: [
      {
        label: 'Sit with them every night',
        then: {
          do: [
            { feel: 25, from: 'subject', why: 'Sat with me through the nightmares', key: 'night', decay: 0.5 },
            { trait: 'calm', to: 'subject', p: 0.5 },
            { lose: 'prestige', n: 5 },
          ],
          text: (c) => `Three weeks of broken sleep, and a court that wonders where you are. ${c.subject!.name} sleeps through the fourth week.`,
        },
      },
      {
        label: 'Hire a night nurse and a counsellor',
        needs: [{ have: 'credits', n: 80 }],
        then: {
          do: [
            { lose: 'credits', n: 80 },
            { trait: 'calm', to: 'subject', p: 0.6 },
          ],
          text: (c) => `The counsellor draws maps of the dark with ${c.subject!.name}, and the dark gets smaller.`,
        },
      },
      {
        label: 'Take them to the temple',
        needs: [{ have: 'faith', n: 20 }],
        then: {
          do: [
            { lose: 'faith', n: 20 },
            { trait: 'zealous', to: 'subject', p: 0.5, or: 'calm' },
          ],
          text: (c) => `The priests give ${c.subject!.name} a small lamp and a long prayer. The nightmares stop. The prayers do not.`,
        },
      },
      {
        label: 'Call it a phase',
        then: {
          do: [
            { feel: -10, from: 'subject', why: 'Told me it was only a phase', key: 'night' },
            { trait: 'paranoid', to: 'subject', p: 0.4, or: 'craven' },
          ],
          text: (c) => `${c.subject!.name} learns that some things have to be borne alone.`,
        },
      },
    ],
  }),
  // ── Court and family ───────────────────────────────────────────────────
  defineEvent({
    id: 'drunk_councillor',
    title: 'A Drunken Councillor',
    icon: 'gala',
    weight: 1.2,
    cooldown: 12,
    when: (s) => canAct(s) && councillors(s).length > 0,
    subject: (s) => oneOf(s, councillors(s)),
    setup: ({ s, subject, data }) => {
      const role = roleOf(s, subject!.id);
      data.role = role ? ROLES[role].name.toLowerCase() : 'councillor';
    },
    text: ({ subject, data }) =>
      `${subject!.name}, your ${data.role}, was found at dawn in a fountain, in full dress uniform, giving a speech to the fish. Three ambassadors saw. One of them is writing it down.`,
    options: [
      {
        label: 'Cover for them',
        then: {
          do: [{ lose: 'prestige', n: 5 }, { deed: 'kindness' }, { feel: 20, from: 'subject', why: 'Covered for me', key: 'drunk' }],
          text: (c) => `You tell the ambassadors it was a ritual of the house. ${c.subject!.name} has never been more grateful, or more hungover.`,
        },
      },
      {
        label: 'Dress them down in public',
        then: {
          do: [{ deed: 'justice' }, { gain: 'prestige', n: 5 }, { feel: -20, from: 'subject', why: 'Shamed me in public', key: 'drunk' }],
          text: (c) => `The court admires your firmness. ${c.subject!.name} admires nothing at all for a fortnight.`,
        },
      },
      {
        label: 'Send them to dry out',
        needs: [{ have: 'credits', n: 60 }],
        then: {
          do: [
            { lose: 'credits', n: 60 },
            { health: 10, to: 'subject' },
          ],
          roll: 0.6,
          pass: {
            do: [
              { feel: 10, from: 'subject', why: 'Got me help', key: 'drunk' },
              { trait: 'diligent', to: 'subject', p: 0.4 },
            ],
            text: (c) => `${c.subject!.name} comes back from the clinic sober, sheepish and, to everyone's surprise, quite good at the job.`,
          },
          fail: { text: 'They are back at the fountain within a month. The fish are thrilled.' },
        },
      },
    ],
  }),
  defineEvent({
    id: 'portrait_commission',
    title: 'The Royal Portrait',
    icon: 'gala',
    weight: 1,
    cooldown: 20,
    when: (s) => canAct(s),
    setup: ({ s, data }) => {
      data.painter = pick(s, ['Ysolde Marrow', 'Tobias Quill', 'Hesper Dunn', 'Old Ferrant', 'Lisavet Crane']);
    },
    text: ({ data }) =>
      `${data.painter} has finished your official portrait. The flattering version is on the left, the honest one on the right. Both are, in their way, accurate.`,
    options: [
      {
        label: 'Hang the flattering one',
        needs: [{ have: 'credits', n: 80 }],
        then: {
          do: [
            { lose: 'credits', n: 80 },
            { gain: 'prestige', n: 20 },
            { trait: 'arrogant', p: 0.3 },
          ],
          text: 'Heroic, square-jawed and about four years younger. You catch yourself checking it in passing.',
        },
      },
      {
        label: 'Hang the honest one',
        then: {
          roll: { base: 0.45, per: { stat: 'dip', n: 0.03 } },
          pass: {
            do: [
              { gain: 'prestige', n: 15 },
              { trait: 'humble', p: 0.4 },
            ],
            text: 'Visitors say it looks like a person who has actually done things. You decide to take it as praise.',
          },
          fail: {
            do: [{ lose: 'prestige', n: 5 }],
            text: 'The court whispers that you look tired. Someone suggests a better portrait. Several people suggest a better ruler.',
          },
        },
      },
      {
        label: 'Commission one of your spouse instead',
        show: [{ exists: 'spouse' }],
        needs: [{ have: 'credits', n: 60 }],
        then: {
          do: [
            { lose: 'credits', n: 60 },
            { feel: 15, from: 'spouse', why: 'Had my portrait painted', key: 'portrait' },
          ],
          text: 'Your spouse spends a week pretending to be bored by it, and a year telling visitors where it hangs.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'guest_overstays',
    title: 'A Guest Who Will Not Leave',
    icon: 'gala',
    weight: 1,
    cooldown: 16,
    when: (s) => canAct(s) && landedAi(s).some((k) => k.opinion > -10),
    setup: ({ s, data }) => {
      data.clan = pick(
        s,
        landedAi(s).filter((k) => k.opinion > -10),
      ).id;
      data.guest = pick(s, ['Corvin', 'Maddox', 'Lysander', 'Orla', 'Thessaly', 'Bram']);
    },
    text: ({ s, data }) =>
      `${data.guest}, a cousin of House ${s.clans[String(data.clan)].name}, arrived for "a long weekend" in spring. It is now autumn. ${data.guest} has opinions about the kitchen, a standing order for Ganymede brandy, and has begun to call the east wing "my rooms".`,
    options: [
      {
        label: 'Drop a polite hint',
        then: {
          roll: { base: 0.5, per: { stat: 'dip', n: 0.04 } },
          pass: { do: [{ opinion: 3, clan: 'clan' }], text: 'The hint lands. They leave within the week, with a case of brandy and a warm letter home.' },
          fail: {
            do: [
              { opinion: -8, clan: 'clan' },
              { lose: 'credits', n: 40 },
            ],
            text: 'The hint is mistaken for an invitation to stay for the winter. You are somehow now paying for a new wing.',
          },
        },
      },
      {
        label: 'Give them a post at court',
        needs: [{ have: 'credits', n: 40 }],
        then: {
          do: [
            { lose: 'credits', n: 40 },
            { opinion: 10, clan: 'clan' },
            { remember: 'Gave our kinsman a place at court', clan: 'clan', value: 8, decay: 0.2 },
          ],
          text: (c) => `${c.data.guest} is made Keeper of the Spare Keys. It is the first job they have ever kept.`,
        },
      },
      {
        label: 'Stop the brandy',
        then: {
          do: [
            { opinion: -12, clan: 'clan' },
            { remember: 'Starved our kinsman out', clan: 'clan', value: -10, decay: 0.3 },
            { gain: 'prestige', n: 5 },
          ],
          text: (c) => `${c.data.guest} is gone by morning, complaining loudly all the way to the docks. Your steward looks ten years younger.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'parent_forgetting',
    title: 'A Parent Forgets',
    icon: 'family',
    weight: 1,
    cooldown: 15,
    when: (s) => canAct(s) && elders(s).length > 0,
    subject: (s) => oneOf(s, elders(s)),
    text: ({ subject }) =>
      `${subject!.name} no longer recognises the new footmen, and called the Venusian ambassador "that nice boy from the greenhouse". Last night ${pr(subject).he} told a full dinner table a story about your childhood that you would very much like to forget.`,
    options: [
      {
        label: 'Keep them at home and care for them',
        then: {
          do: [
            { lose: 'credits', n: 30 },
            { feel: 25, from: 'subject', why: 'Never sent me away', key: 'memory' },
            { trait: 'patient', p: 0.4 },
          ],
          text: (c) => `You sit with ${c.subject!.name} in the evenings. Some nights ${pr(c.subject).he} knows you, and those nights are enough.`,
        },
      },
      {
        label: 'Move them to a quiet sanatorium',
        needs: [{ have: 'credits', n: 90 }],
        then: {
          do: [
            { lose: 'credits', n: 90 },
            { health: 10, to: 'subject' },
            { feel: -15, from: 'subject', why: 'Sent me away', key: 'memory' },
          ],
          text: (c) => `The sanatorium is bright and kind. ${c.subject!.name} asks, every visit, when ${pr(c.subject).he} is going home.`,
        },
      },
      {
        label: 'Let them carry on at court',
        then: {
          do: [
            { lose: 'prestige', n: 10 },
            { feel: 10, from: 'subject', why: 'Let me be myself', key: 'memory' },
          ],
          text: (c) =>
            `${c.subject!.name} tells three more stories at the next banquet. One of them is true, and not one is flattering. The court has never enjoyed a banquet more.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'sibling_debts',
    title: "A Sibling's Debts",
    icon: 'credits',
    weight: 1.2,
    cooldown: 12,
    when: (s) => canAct(s) && siblings(s).some((c) => ageOf(s, c) >= 18),
    subject: (s) =>
      oneOf(
        s,
        siblings(s).filter((c) => ageOf(s, c) >= 18),
      ),
    setup: ({ s, data }) => {
      const amount = int(s, 8, 16) * 10;
      data.amount = amount;
      data.half = Math.round(amount / 2);
    },
    text: ({ subject, data }) =>
      `${subject!.name} has arrived at midnight with a hip flask, a black eye and a story about a card game on Ceres. ${pr(subject).He} owes ${data.amount} credits to people who "don't send letters".`,
    options: [
      {
        label: 'Pay the debt',
        needs: [{ have: 'credits', n: 'amount' }],
        then: {
          do: [
            { lose: 'credits', n: { data: 'amount' } },
            { feel: 20, from: 'subject', why: 'Paid my debts', key: 'debt' },
          ],
          text: (c) => `${c.subject!.name} cries, hugs you, and promises never to touch a deck of cards again. You have heard that one before.`,
        },
      },
      {
        label: 'Pay half and make them work off the rest',
        needs: [{ have: 'credits', n: 'half' }],
        then: {
          do: [
            { lose: 'credits', n: { data: 'half' } },
            { feel: 10, from: 'subject', why: 'Made me earn it back', key: 'debt' },
            { trait: 'diligent', to: 'subject', p: 0.3 },
          ],
          text: (c) =>
            `${c.subject!.name} spends a season doing the accounts of a minor shipyard. By the end, ${pr(c.subject).he} is the only one who understands them.`,
        },
      },
      {
        label: 'Turn them away',
        then: {
          do: [{ feel: -30, from: 'subject', why: 'Turned me away at my lowest', key: 'debt' }],
          roll: 0.6,
          pass: { text: (c) => `${c.subject!.name} leaves without a word. A month later, the debt is somehow paid. You do not ask how.` },
          fail: {
            do: [{ lose: 'prestige', n: 10 }],
            text: (c) => `The creditors sell the story of ${c.subject!.name}'s fall to every newsfeed from here to Neptune, with your name in the headline.`,
          },
        },
      },
    ],
  }),
  defineEvent({
    id: 'unequal_match',
    title: 'A Love Beneath Your Station',
    icon: 'heart',
    weight: 1,
    cooldown: 14,
    when: (s) => canAct(s) && kids(s, 18, 35).some((c) => !c.spouseId && !c.betrothedId),
    subject: (s) =>
      oneOf(
        s,
        kids(s, 18, 35).filter((c) => !c.spouseId && !c.betrothedId),
      ),
    setup: ({ s, data }) => {
      data.partner = pick(s, ['Ilsa', 'Tomas', 'Wren', 'Dov', 'Marit', 'Kell']);
    },
    text: ({ subject, data }) =>
      `${subject!.name} wants to marry a hangar mechanic called ${data.partner}. They have been meeting in a maintenance shaft for a year. ${pr(subject).He} says ${data.partner} is the only person in the system who laughs at the right bits.`,
    options: [
      {
        label: 'Give your blessing',
        then: {
          do: [
            { lose: 'prestige', n: 15 },
            { feel: 30, from: 'subject', why: 'Blessed my marriage', key: 'match' },
            { trait: 'content', to: 'subject' },
          ],
          text: (c) => `The court sniffs. ${c.subject!.name} has never been happier, and the wedding is the best party in years.`,
        },
      },
      {
        label: 'Forbid it',
        then: {
          do: [
            { feel: -30, from: 'subject', why: 'Forbade my marriage', key: 'match' },
            { trait: 'cynical', to: 'subject', p: 0.4 },
          ],
          roll: 0.7,
          pass: {
            do: [{ gain: 'prestige', n: 5 }],
            text: (c) => `The court approves. ${c.data.partner} is quietly given a job on another station. Nobody mentions it again, least of all you.`,
          },
          fail: { do: [{ lose: 'prestige', n: 20 }], text: 'They try to elope. The guards catch them at the docks, and the story is everywhere by breakfast.' },
        },
      },
      {
        label: 'Post the mechanic to Pluto',
        then: {
          do: [
            { deed: 'cruelty' },
            { feel: -40, from: 'subject', why: 'Sent my love to the edge of the dark', key: 'match' },
            { trait: 'depressed', to: 'subject', p: 0.4 },
          ],
          text: (c) => `${c.subject!.name} understands exactly what you have done. ${pr(c.subject).He} will not forget it, and will not say so.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'court_feud',
    title: 'Two Courtiers, One Quarrel',
    icon: 'scheme',
    weight: 1.2,
    cooldown: 10,
    when: (s) => canAct(s) && feudPool(s).length >= 2,
    subject: (s) => oneOf(s, feudPool(s)),
    setup: ({ s, data, subject }) => {
      const other = pick(
        s,
        feudPool(s).filter((c) => c.id !== subject!.id),
      );
      const [elder, younger] = subject!.born <= other.born ? [subject!, other] : [other, subject!];
      data.elder = elder.id;
      data.younger = younger.id;
    },
    text: ({ s, data }) =>
      `${s.characters[String(data.elder)].name} and ${s.characters[String(data.younger)].name} have not spoken since the midwinter banquet, when one was seated a chair lower than the other. Servants now carry their messages in sealed envelopes. One was sealed in wax. It was not a polite message.`,
    options: [
      {
        label: 'Back the elder',
        then: {
          do: [
            { feel: 15, from: 'elder', why: 'Took my side', key: 'feud' },
            { feel: -20, from: 'younger', why: 'Took the other side', key: 'feud' },
            { feel: -15, from: 'younger', to: 'elder', why: 'Won the quarrel', key: 'feud' },
          ],
          text: (c) => `${named(c, 'elder')} gets the better chair. ${named(c, 'younger')} gets a long, quiet grudge.`,
        },
      },
      {
        label: 'Seat them side by side at every feast',
        then: {
          roll: { base: 0.4, per: { stat: 'dip', n: 0.04 } },
          pass: {
            do: [
              { feel: 10, from: 'elder', to: 'younger', why: 'Made peace at table', key: 'feud' },
              { feel: 10, from: 'younger', to: 'elder', why: 'Made peace at table', key: 'feud' },
            ],
            text: 'It takes five feasts, but they are soon sharing jokes about the person who seats them.',
          },
          fail: {
            do: [
              { feel: -10, from: 'elder', to: 'younger', why: 'Made peace at table', key: 'feud' },
              { feel: -10, from: 'younger', to: 'elder', why: 'Made peace at table', key: 'feud' },
            ],
            text: 'Feast two ends in a thrown goblet. Feast three ends in a thrown chair.',
          },
        },
      },
      {
        label: 'Send both to inspect the outer stations',
        then: {
          do: [
            { lose: 'credits', n: 40 },
            { stat: 'eco', n: 1, to: 'elder' },
            { stat: 'eco', n: 1, to: 'younger' },
            { feel: -10, from: 'elder', why: 'Packed me off to the outer stations', key: 'feud' },
            { feel: -10, from: 'younger', why: 'Packed me off to the outer stations', key: 'feud' },
          ],
          text: 'They spend a season in separate ships, inspecting different stations, and both come back wiser about prices and entirely unreformed about each other.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'ancestor_gallery',
    title: 'The Gallery of Ancestors',
    icon: 'relic',
    weight: 0.9,
    cooldown: 25,
    when: (s) => canAct(s) && s.dynasty.rulers.filter((x) => x.to !== undefined).length >= 2,
    setup: ({ s, data }) => {
      const past = s.dynasty.rulers.filter((x) => x.to !== undefined);
      const who = pick(s, past);
      data.ancestor = who.name;
      data.title = who.title;
    },
    text: ({ data }) =>
      `The cleaners ask what to do about the portrait of ${data.ancestor}, ${data.title}. Someone has been drawing moustaches on it for years, and last week somebody added a rude caption about the tax reforms.`,
    options: [
      {
        label: 'Restore it with full honours',
        needs: [{ have: 'credits', n: 60 }],
        then: {
          do: [
            { lose: 'credits', n: 60 },
            { gain: 'prestige', n: 10 },
            { gain: 'faith', n: 10 },
          ],
          text: (c) => `${c.data.ancestor} is cleaned, reframed and rehung. The moustaches are gone, though several cleaners admit they were an improvement.`,
        },
      },
      {
        label: 'Take it down quietly',
        then: {
          do: [{ deed: 'arbitrary' }, { lose: 'prestige', n: 5 }],
          text: (c) => `The wall where ${c.data.ancestor} hung is conspicuously paler than the rest. People keep looking at it and pretending they are not.`,
        },
      },
      {
        label: 'Hold a ceremony of remembrance',
        show: [{ exists: 'heir' }],
        needs: [{ have: 'faith', n: 20 }],
        then: {
          do: [
            { lose: 'faith', n: 20 },
            { gain: 'prestige', n: 15 },
            { feel: 10, from: 'heir', why: 'Honoured our ancestors', key: 'gallery' },
          ],
          text: (c) => `Your heir reads out the deeds of ${c.data.ancestor} in a clear voice, and does not even smirk at the tax reforms.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'dowry_dispute',
    title: 'The Dowry Dispute',
    icon: 'family',
    weight: 1,
    cooldown: 14,
    when: (s) => canAct(s) && marriedOut(s) !== undefined,
    subject: (s) => marriedOut(s),
    setup: ({ subject, data }) => {
      data.clan = subject!.clanId;
    },
    text: ({ s, subject, data }) =>
      `${subject!.name}'s brother has arrived from House ${s.clans[String(data.clan)].name} with a long list. Their family would like the second half of the dowry "reconsidered", a seat on your council for a cousin, and the loan of your best flagship for "a family occasion".`,
    options: [
      {
        label: 'Pay what they ask',
        needs: [{ have: 'credits', n: 120 }],
        then: {
          do: [
            { lose: 'credits', n: 120 },
            { opinion: 12, clan: 'clan' },
            { feel: 10, from: 'subject', why: 'Looked after my family', key: 'dowry' },
          ],
          text: (c) => `The brother leaves with a draft, a sheaf of promises and a very warm farewell for ${c.subject!.name}.`,
        },
      },
      {
        label: 'Lend some ships',
        needs: [{ have: 'fleet', n: 20 }],
        then: {
          do: [
            { lose: 'fleet', n: { base: 3, roll: [0, 6] }, as: 'lost' },
            { opinion: 15, clan: 'clan' },
            { remember: 'Lent us ships', clan: 'clan', value: 10, decay: 0.2 },
            { feel: 10, from: 'subject', why: 'Lent my family ships', key: 'dowry' },
          ],
          text: (c) => `The "family occasion" turns out to be a border skirmish. The ships come home, minus ${c.vars.lost} of them.`,
        },
      },
      {
        label: 'Refuse politely',
        then: {
          do: [
            { opinion: -10, clan: 'clan' },
            { feel: -15, from: 'subject', why: 'Chose the crown over my family', key: 'dowry' },
            { gain: 'prestige', n: 5 },
          ],
          text: (c) => `The brother leaves stiffly. ${c.subject!.name} is cold at dinner for a week, then simply cold.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'old_soldier',
    title: 'The Old Soldier at the Gate',
    icon: 'war',
    weight: 1,
    cooldown: 15,
    when: (s) => canAct(s),
    setup: ({ s, data }) => {
      data.vet = pick(s, ['Old Harn', 'Pell the Lame', 'Marrick', 'Grey Tobiah', 'Sergeant Voss']);
      data.battle = pick(s, ['Hellas', 'Io', 'Mimas', 'the Belt', 'Callisto']);
    },
    text: ({ data }) =>
      `${data.vet}, in a patched flight jacket, has waited at the east gate for two days. ${data.vet} says they flew for your predecessor, took a hit over ${data.battle}, and has been "between pensions" ever since.`,
    options: [
      {
        label: 'Give a pension',
        needs: [{ have: 'credits', n: 80 }],
        then: {
          do: [
            { lose: 'credits', n: 80 },
            { deed: 'charity', n: 80 },
            { gain: 'prestige', n: 8 },
          ],
          text: (c) => `${c.data.vet} salutes, wipes an eye, and tells anyone who will listen about your generosity.`,
        },
      },
      {
        label: 'Make them a cadet instructor',
        show: [{ exists: 'heir' }],
        needs: [{ have: 'credits', n: 30 }],
        then: {
          do: [
            { lose: 'credits', n: 30 },
            { stat: 'cmd', n: 1, to: 'heir' },
          ],
          text: (c) => `${c.data.vet} teaches your heir how to survive a dogfight and how to lose a card game. Both lessons prove useful.`,
        },
      },
      {
        label: 'Send them away',
        then: {
          do: [{ deed: 'arbitrary' }, { lose: 'prestige', n: 8 }],
          text: (c) => `${c.data.vet} shuffles off into the dock district. The story is in every tavern by nightfall.`,
        },
      },
    ],
  }),
  // ── One for each world ─────────────────────────────────────────────────
  defineEvent({
    id: 'sunside_fires',
    title: 'The Sunside Fires',
    icon: 'sun',
    weight: 1,
    cooldown: 20,
    when: (s) => canAct(s) && regionsOn(s, 'mercury').length > 0,
    setup: onWorld('mercury'),
    text: ({ s, data }) =>
      `A collector array has failed above ${regionName(s, data.reg)} and the sunside forges have caught light. Molten slag is running down the terminator streets, and the foundry barons are asking, very politely, whether anyone is coming.`,
    options: [
      {
        label: 'Send the fleet to scoop out the fires',
        needs: [{ have: 'fleet', n: 10 }],
        then: {
          do: [{ lose: 'fleet', n: 3 }],
          roll: { base: 0.5, per: { stat: 'cmd', n: 0.04 } },
          pass: {
            do: [{ gain: 'prestige', n: 12 }],
            text: 'Your ships dive into the heat, tow the burning gantries clear and come back scorched and cheering. +12 prestige.',
          },
          fail: {
            do: [
              { lose: 'fleet', n: 3 },
              { dev: -1, region: 'reg' },
            ],
            text: 'The fires jump the gantries and take more of your ships. The foundries are lost.',
          },
        },
      },
      {
        label: 'Evacuate and rebuild',
        needs: [{ have: 'credits', n: 120 }],
        then: {
          do: [{ lose: 'credits', n: 120 }, { deed: 'kindness' }],
          roll: 0.5,
          pass: { do: [{ dev: 1, region: 'reg' }], text: 'The new forge is better than the old one. The barons are insufferable about it.' },
          fail: { text: 'Everyone gets out alive. The forge, rebuilt, is exactly as good as before.' },
        },
      },
      {
        label: 'Let the foundries burn',
        then: {
          do: [{ deed: 'arbitrary' }, { dev: -1, region: 'reg' }, { gain: 'credits', n: 60 }],
          text: 'The insurers pay out, the barons do not forgive you, and the city smells of hot iron for a month.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'acid_storm',
    title: 'The Acid Storm',
    icon: 'plague',
    weight: 1,
    cooldown: 20,
    when: (s) => canAct(s) && regionsOn(s, 'venus').length > 0,
    setup: onWorld('venus'),
    text: ({ s, data }) =>
      `An acid storm has torn a gash in the underside of a cloud-city above ${regionName(s, data.reg)}. The nobility have retreated to the ballroom, where the orchestra is playing louder.`,
    options: [
      {
        label: 'Subsidise the repairs',
        needs: [{ have: 'credits', n: 100 }],
        then: {
          do: [{ lose: 'credits', n: 100 }],
          roll: 0.5,
          pass: {
            do: [{ dev: 1, region: 'reg' }],
            text: 'The repairs are finished early, and the new hull is prettier than the old one. Venusians approve of that.',
          },
          fail: { text: 'The city is patched. The patches show. The nobility consider this a personal insult.' },
        },
      },
      {
        label: 'Hold the masquerade anyway',
        then: {
          roll: 0.6,
          pass: { do: [{ gain: 'prestige', n: 12 }], text: 'You dance through the storm. Everyone talks about it for years. +12 prestige.' },
          fail: {
            do: [{ trait: 'scarred' }, { lose: 'prestige', n: 10 }],
            text: 'A stray spray of acid takes the mask off your dignity, and a good deal of your face with it. -10 prestige.',
          },
        },
      },
      {
        label: 'Open your own spires to the displaced',
        needs: [{ have: 'credits', n: 40 }],
        then: {
          do: [{ lose: 'credits', n: 40 }, { deed: 'kindness' }, { gain: 'prestige', n: 10 }],
          text: 'Commoners and counts sleep in the same corridors. The commoners are better company, and say so.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'sunken_ruins',
    title: 'Ruins Beneath the Sea',
    icon: 'relic',
    weight: 0.9,
    cooldown: 25,
    when: (s) => canAct(s) && regionsOn(s, 'earth').length > 0,
    setup: onWorld('earth'),
    text: ({ s, data }) =>
      `Deep-sea divers off ${regionName(s, data.reg)} have found a flooded city: streets, a stadium and a vault with its door still shut. Everyone on the Concord has an opinion about who should own it, mostly "me".`,
    options: [
      {
        label: 'Salvage it for sale',
        then: {
          do: [
            { gain: 'credits', n: { roll: [100, 220] }, as: 'got' },
            { lose: 'faith', n: 10, upTo: 'have' },
          ],
          text: (c) => `The auction raises ${c.vars.got} credits. Several old gods are said to be annoyed.`,
        },
      },
      {
        label: 'Open the vault',
        needs: [{ have: 'credits', n: 60 }],
        then: {
          do: [{ lose: 'credits', n: 60 }],
          roll: { base: 0.4, per: { stat: 'sci', n: 0.04 } },
          pass: {
            do: [{ item: { slot: 'relic', origin: 'Raised from a drowned vault' }, as: 'relic' }],
            text: (c) => `The door gives way at last. Inside: ${c.vars.relic}, dry and perfect. It joins your treasury.`,
          },
          fail: { do: [{ lose: 'prestige', n: 5 }], text: 'The vault is flooded, empty, and full of eels. The papers have a field day. -5 prestige.' },
        },
      },
      {
        label: 'Declare it a monument',
        then: {
          do: [
            { gain: 'prestige', n: 12 },
            { gain: 'faith', n: 10 },
          ],
          text: 'A plaque, a flotilla of tourists, and a decree that nobody may touch anything. The salvagers pretend to be sad.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'dust_storm',
    title: 'The Great Dust Storm',
    icon: 'eco',
    weight: 1,
    cooldown: 20,
    when: (s) => canAct(s) && regionsOn(s, 'mars').length > 0,
    setup: onWorld('mars'),
    text: ({ s, data }) =>
      `A dust storm the size of a continent has swallowed ${regionName(s, data.reg)}. The shipyards have stopped, the beacons are screaming, and three ore convoys are stuck outside the walls.`,
    options: [
      {
        label: 'Ride it out',
        then: {
          do: [
            { lose: 'credits', n: 40 },
            { trait: 'patient', p: 0.2 },
          ],
          text: 'The yards sit idle for six weeks. Everyone plays cards. Nobody dies. It is, on the whole, a good storm.',
        },
      },
      {
        label: 'Run the convoys through on instruments',
        then: {
          roll: { base: 0.45, per: { stat: 'cmd', n: 0.04 } },
          pass: {
            do: [
              { gain: 'credits', n: { roll: [80, 160] }, as: 'got' },
              { gain: 'prestige', n: 8 },
            ],
            text: (c) => `Three convoys, one storm, no losses. The ore is worth ${c.vars.got} credits and the legend is worth more.`,
          },
          fail: { do: [{ lose: 'fleet', n: 5 }], text: 'Two haulers collide in the dark. The others make it. The wreckage is still being found.' },
        },
      },
      {
        label: 'Give a speech about terraforming',
        then: {
          roll: { base: 0.45, per: { stat: 'dip', n: 0.04 } },
          pass: { do: [{ gain: 'prestige', n: 15 }], text: 'A planet that can do this can be tamed. The Martians cheer, grimly. +15 prestige.' },
          fail: { do: [{ lose: 'prestige', n: 5 }], text: 'The wind rips your notes away mid-sentence and the crowd rather enjoys it. -5 prestige.' },
        },
      },
    ],
  }),
  defineEvent({
    id: 'water_war',
    title: 'The Water War',
    icon: 'war',
    weight: 1,
    cooldown: 20,
    when: (s) => canAct(s) && regionsOn(s, 'ceres').length > 0 && landedAi(s).length >= 2,
    setup: ({ s, data }) => {
      const pool = landedAi(s);
      const a = pick(s, pool);
      data.a = a.id;
      data.b = pick(
        s,
        pool.filter((k) => k.id !== a.id),
      ).id;
      data.reg = pick(s, regionsOn(s, 'ceres')).id;
    },
    text: ({ s, data }) =>
      `House ${s.clans[String(data.a)].name} has sent ships against House ${s.clans[String(data.b)].name}'s ice-works near ${regionName(s, data.reg)}. Both have sent envoys to you. Both envoys are carrying the same forged treaty.`,
    options: [
      {
        label: 'Back the aggressor',
        then: {
          do: [
            { opinion: 10, clan: 'a' },
            { opinion: -12, clan: 'b' },
            { remember: 'Took the other side in the water war', clan: 'b', value: -10, decay: 0.3 },
          ],
          text: (c) => `House ${c.s.clans[String(c.data.a)].name} gets its ice. House ${c.s.clans[String(c.data.b)].name} gets a new enemy, and a long memory.`,
        },
      },
      {
        label: 'Back the defender',
        then: {
          do: [
            { opinion: 10, clan: 'b' },
            { opinion: -12, clan: 'a' },
            { remember: 'Took the other side in the water war', clan: 'a', value: -10, decay: 0.3 },
          ],
          text: (c) =>
            `House ${c.s.clans[String(c.data.b)].name} keeps its ice. House ${c.s.clans[String(c.data.a)].name} sails home to think of something worse.`,
        },
      },
      {
        label: 'Arbitrate',
        then: {
          roll: { base: 0.4, per: { stat: 'dip', n: 0.05 } },
          pass: {
            do: [
              { opinion: 5, clan: 'a' },
              { opinion: 5, clan: 'b' },
              { gain: 'prestige', n: 10 },
            ],
            text: 'You split the ice, the tolls and the blame. Both sides declare victory, which is the only way a treaty ever works.',
          },
          fail: {
            do: [
              { opinion: -6, clan: 'a' },
              { opinion: -6, clan: 'b' },
            ],
            text: "Both sides decide you are in the other side's pocket. The envoys leave on the same ship, and do not speak.",
          },
        },
      },
      {
        label: 'Sell water to both',
        then: {
          do: [{ gain: 'credits', n: { roll: [80, 140] }, as: 'got' }, { opinion: -5, clan: 'a' }, { opinion: -5, clan: 'b' }, { deed: 'arbitrary' }],
          text: (c) => `A war is a market, and you have the warehouse. +${c.vars.got} credits. Nobody loves a profiteer, but everybody buys.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'helium_skimmer',
    title: 'A Skimmer Lost in the Storm Bands',
    icon: 'ship',
    weight: 1,
    cooldown: 20,
    when: (s) => canAct(s) && regionsOn(s, 'jupiter').length > 0,
    setup: onWorld('jupiter'),
    text: ({ s, data }) =>
      `A helium skimmer from ${regionName(s, data.reg)} has dropped out of contact in the storm bands, forty crew aboard. The radiation belts are at their worst in a decade. The families are at the gate.`,
    options: [
      {
        label: 'Send a rescue squadron',
        needs: [{ have: 'fleet', n: 6 }],
        then: {
          do: [{ lose: 'fleet', n: 3 }],
          roll: { base: 0.45, per: { stat: 'cmd', n: 0.04 } },
          pass: {
            do: [{ gain: 'prestige', n: 15 }, { deed: 'kindness' }],
            text: 'Your squadron finds the skimmer tumbling, half-dark and alive. Thirty-eight of forty come home. +15 prestige.',
          },
          fail: {
            do: [
              { lose: 'fleet', n: 3 },
              { lose: 'prestige', n: 5 },
            ],
            text: 'The belts take more rescue ships and give nothing back. The families at the gate do not blame you, which is worse.',
          },
        },
      },
      {
        label: 'Compensate the families',
        needs: [{ have: 'credits', n: 80 }],
        then: {
          do: [
            { lose: 'credits', n: 80 },
            { deed: 'charity', n: 80 },
            { gain: 'prestige', n: 6 },
          ],
          text: "You pay out the wages and the widows' pensions. It is not what they wanted, but it is what they needed.",
        },
      },
      {
        label: 'Call it an act of the storm',
        then: {
          do: [
            { lose: 'prestige', n: 10 },
            { dev: -1, region: 'reg' },
          ],
          text: 'The skimmer crews walk out for a month. The helium price rises. So does the tension.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'ring_disputation',
    title: 'The Ring-Station Disputation',
    icon: 'study',
    weight: 1,
    cooldown: 20,
    when: (s) => canAct(s) && regionsOn(s, 'saturn').length > 0,
    setup: onWorld('saturn'),
    text: ({ s, data }) =>
      `The scholars of the ring-station at ${regionName(s, data.reg)} have split over whether the machine-priests' prayer wheels are theology or merely very slow computers. Both sides have stopped sharing bandwidth.`,
    options: [
      {
        label: 'Back the engineers',
        then: {
          do: [{ lose: 'faith', n: 15, upTo: 'have' }],
          roll: 0.5,
          pass: { do: [{ stat: 'sci', n: 1 }], text: 'The engineers publish. You read it, and it changes how you think about the problem. +1 Science.' },
          fail: { text: 'The engineers are right and insufferable about it. You learn nothing you did not know.' },
        },
      },
      {
        label: 'Back the machine-priests',
        then: {
          do: [
            { gain: 'faith', n: 20 },
            { lose: 'prestige', n: 5 },
            { trait: 'zealous', p: 0.15 },
          ],
          text: 'The priests bless the wheels. The engineers sulk in the ring, and several of them resign to start a rival ring.',
        },
      },
      {
        label: 'Fund both and demand a joint paper',
        needs: [{ have: 'credits', n: 100 }],
        then: {
          do: [
            { lose: 'credits', n: 100 },
            { gain: 'prestige', n: 10 },
          ],
          roll: 0.5,
          pass: { do: [{ dev: 1, region: 'reg' }], text: 'The paper is dreadful. The station it inspires is not.' },
          fail: { text: 'The paper runs to eleven hundred pages and concludes that more research is needed.' },
        },
      },
    ],
  }),
  defineEvent({
    id: 'seer_prophecy',
    title: 'The Seers Name a Child',
    icon: 'psi',
    weight: 1,
    cooldown: 20,
    when: (s) => canAct(s) && regionsOn(s, 'uranus').length > 0 && kids(s, 3, 15).length > 0,
    subject: (s) => oneOf(s, kids(s, 3, 15)),
    setup: onWorld('uranus'),
    text: ({ s, subject, data }) =>
      `The Seers of ${regionName(s, data.reg)} have read the methane storms and named ${subject!.name} as "the one the wind comes back for". They will not say what it means. They would like to visit weekly.`,
    options: [
      {
        label: 'Embrace the prophecy',
        then: {
          do: [
            { gain: 'faith', n: 20 },
            { trait: 'zealous', to: 'subject', p: 0.5, or: 'arrogant' },
          ],
          text: (c) => `${c.subject!.name} grows up with a destiny nobody can define. ${pr(c.subject).He} is very serious about it.`,
        },
      },
      {
        label: 'Dismiss it as theatre',
        then: {
          do: [
            { lose: 'faith', n: 10, upTo: 'have' },
            { trait: 'cynical', to: 'subject', p: 0.4 },
          ],
          text: (c) =>
            `The Seers leave in a calm, unbothered way that is somehow more insulting. ${c.subject!.name} asks what "the wind comes back for" means. You do not know.`,
        },
      },
      {
        label: 'Let the Seers visit, under guard',
        needs: [{ have: 'credits', n: 30 }],
        then: {
          do: [{ lose: 'credits', n: 30 }],
          roll: { base: 0.5, per: { stat: 'dip', n: 0.03 } },
          pass: {
            do: [
              { gain: 'faith', n: 8 },
              { stat: 'int', n: 1, to: 'subject' },
            ],
            text: (c) =>
              `The Seers teach ${c.subject!.name} to watch storms, and to keep silent about what ${pr(c.subject).he} sees. The Seers leave satisfied.`,
          },
          fail: {
            do: [{ trait: 'paranoid', to: 'subject', p: 0.4 }],
            text: (c) => `${c.subject!.name} spends the visits staring at the guards, and is a nervous child for a year.`,
          },
        },
      },
    ],
  }),
  defineEvent({
    id: 'cryo_cult',
    title: 'The Cult of the Cryo-Volcano',
    icon: 'faith',
    weight: 1,
    cooldown: 20,
    when: (s) => canAct(s) && regionsOn(s, 'neptune').length > 0,
    setup: onWorld('neptune'),
    text: ({ s, data }) =>
      `A cult has taken over the geysers at ${regionName(s, data.reg)}. They throw offerings into the cryo-volcano, which they say is listening. Last night it answered, which the engineers insist was a pressure surge.`,
    options: [
      {
        label: 'Patronise the cult',
        needs: [{ have: 'credits', n: 60 }],
        then: {
          do: [
            { lose: 'credits', n: 60 },
            { gain: 'faith', n: 25 },
            { trait: 'zealous', p: 0.2 },
          ],
          text: 'The cultists crown you "Friend of the Deep". You attend one ceremony, in a borrowed hood, and find it oddly peaceful.',
        },
      },
      {
        label: 'Ban the rites',
        then: {
          do: [{ lose: 'faith', n: 10, upTo: 'have' }],
          roll: 0.5,
          pass: { do: [{ gain: 'prestige', n: 8 }], text: 'The geysers are fenced off. The engineers cheer. The cultists meet in smaller, angrier groups.' },
          fail: { do: [{ dev: -1, region: 'reg' }], text: 'The cultists sit down in the pumping rooms and refuse to move. Production falls.' },
        },
      },
      {
        label: 'Send a spy into the cult',
        then: {
          roll: { base: 0.35, per: { stat: 'int', n: 0.05 } },
          pass: {
            do: [{ item: { slot: 'relic', origin: 'Taken from the cryo-cult vault' }, as: 'relic' }],
            text: (c) => `Your agent returns with ${c.vars.relic} and a strong opinion about cult food. The cult never notices.`,
          },
          fail: { do: [{ lose: 'prestige', n: 10 }], text: 'Your agent is made a high priest within a week, and sends a lyrical letter of resignation.' },
        },
      },
    ],
  }),
  defineEvent({
    id: 'long_night',
    title: 'The Long Night',
    icon: 'comet',
    weight: 1,
    cooldown: 20,
    when: (s) => canAct(s) && regionsOn(s, 'pluto').length > 0 && landedAi(s).length > 0,
    setup: ({ s, data }) => {
      const onPluto = landedAi(s).filter((k) => k.planetId === 'pluto');
      data.clan = pick(s, onPluto.length ? onPluto : landedAi(s)).id;
      data.reg = pick(s, regionsOn(s, 'pluto')).id;
    },
    text: ({ s, data }) =>
      `The Long Night has begun at ${regionName(s, data.reg)}: the sun is a bright star again and the festival lanterns are lit. Wardens of House ${s.clans[String(data.clan)].name} are watching to see how you keep it.`,
    options: [
      {
        label: 'Hold a lavish feast',
        needs: [{ have: 'credits', n: 100 }],
        then: {
          do: [
            { lose: 'credits', n: 100 },
            { gain: 'prestige', n: 15 },
            { opinion: 6, clan: 'clan' },
          ],
          text: 'You spend a fortune on heat and light and wine in a place that has none of them. The Wardens do not forget the gesture.',
        },
      },
      {
        label: 'Keep the austere vigil',
        then: {
          do: [
            { gain: 'faith', n: 15 },
            { trait: 'patient', p: 0.4 },
          ],
          text: 'A candle, a cold chair and eleven hours of silence. It is exactly what the festival is for.',
        },
      },
      {
        label: 'Open the cryo-vaults to the people',
        needs: [{ have: 'credits', n: 60 }],
        then: {
          do: [
            { lose: 'credits', n: 60 },
            { deed: 'charity', n: 60 },
            { gain: 'prestige', n: 8 },
            { opinion: 8, clan: 'clan' },
          ],
          text: 'Hot food, warm bedding and a night without the dark pressing in. Plutonians are not a sentimental people, but several are seen crying.',
        },
      },
    ],
  }),
];
