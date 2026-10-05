// Regencies in play (ROADMAP 12.3): who rules for a child, what the child
// finds in the ledgers, what the regent teaches them, and the regent who will
// not hand back the seal. These are the stories a child ruler can answer, so
// they do not wait for canAct(). The rules live in regency.ts. Shuffled into
// the main deck in events.ts.

import { ageOf, effStats, fullName, ruler } from './core';
import { closeKin, addFeeling } from './relations';
import { defineEvent, type Ctx } from './dsl';
import { clearFlag, flagDue, pr, type EventDef } from './eventKit';
import {
  CHALLENGE_FLAG,
  CHOICE_FLAG,
  clinging,
  endRegency,
  exposeSkimming,
  extendRegency,
  gripOf,
  regencyOf,
  regentCandidates,
  regentScore,
  regentTie,
  replaceRegent,
  appointRegent,
} from './regency';
import { chance, clamp } from './rng';
import type { Character, GameState, StatKey } from './types';

function mine(s: GameState) {
  return regencyOf(s, s.playerClanId);
}

/** A regency of a child ruler (not a grown one with a clinging regent). */
function childRegency(s: GameState) {
  const r = mine(s);
  return r && ageOf(s, r.ward) < 16 ? r : undefined;
}

/** The best alternative of one kind: a parent, other family, or a councillor who is not family. */
function alternative(s: GameState, kind: 'parent' | 'kin' | 'councillor'): Character | undefined {
  const r = mine(s);
  if (!r) return undefined;
  const pool = regentCandidates(s, s.playerClanId, r.ward).filter((c) => {
    if (c.id === r.regent.id) return false;
    const tie = regentTie(s, r.ward, c);
    if (kind === 'parent') return tie === 'mother' || tie === 'father';
    if (kind === 'councillor') return tie === 'councillor';
    return tie !== 'mother' && tie !== 'father' && tie !== 'councillor';
  });
  return pool.sort((a, b) => regentScore(s, r.ward, b) - regentScore(s, r.ward, a))[0];
}

function swap(key: string) {
  return {
    run: (c: Ctx) => {
      appointRegent(c.s, c.s.playerClanId, String(c.data[key]));
    },
    text: (c: Ctx) => `${c.s.characters[String(c.data[key])]?.name ?? 'Someone else'} becomes regent instead`,
  };
}

/** The regent's best governing skill, for lessons at their elbow. */
function bestSkill(s: GameState, c: Character): StatKey {
  const st = effStats(s, c);
  return (['dip', 'eco', 'int', 'cmd'] as const).reduce((a, b) => (st[b] > st[a] ? b : a));
}

const SKILL: Record<StatKey, string> = { dip: 'Diplomacy', eco: 'Economy', int: 'Intrigue', cmd: 'Command', sci: 'Science' };

/** Unseating a clinging regent before the council: your Diplomacy against theirs, and proof of their thieving helps. */
function demandOdds(c: Ctx): number {
  const r = mine(c.s);
  if (!r) return 0;
  return clamp(0.35 + (effStats(c.s, c.r).dip - effStats(c.s, r.regent).dip) * 0.03 + (r.exposed ? 0.25 : 0), 0.1, 0.85);
}

/** Arresting them: your Intrigue against theirs, and a spymaster's help. */
function arrestOdds(c: Ctx): number {
  const r = mine(c.s);
  if (!r) return 0;
  return clamp(0.3 + (effStats(c.s, c.r).int - effStats(c.s, r.regent).int) * 0.03 + (c.s.council.spymaster ? 0.1 : 0), 0.1, 0.8);
}

export const REGENCY_EVENTS: EventDef[] = [
  defineEvent({
    id: 'regency_choice',
    title: 'A Regent for the Child',
    icon: 'crown',
    weight: 1,
    urgent: true,
    when: (s) => flagDue(s, CHOICE_FLAG) && !!childRegency(s),
    subject: (s) => mine(s)?.regent,
    setup: ({ s, data }) => {
      clearFlag(s, CHOICE_FLAG);
      for (const kind of ['parent', 'kin', 'councillor'] as const) {
        const c = alternative(s, kind);
        if (c) data[kind] = c.id;
      }
    },
    text: ({ s, subject }) => {
      const r = mine(s)!;
      const g = gripOf(s, subject!, r.ward);
      const worry = g.reasons.filter((x) => !/Rules for|Fond|Honest|Content|Humble/.test(x));
      return `${r.ward.name} is ${ageOf(s, r.ward)}, and somebody has to rule until ${pr(r.ward).he} is sixteen. The council puts forward ${fullName(s, subject!)}, ${r.ward.name}'s ${regentTie(s, r.ward, subject!)}.${worry.length ? ` Some at court mutter: ${worry.join(', ').toLowerCase()}.` : ''}`;
    },
    options: [
      {
        label: 'Let them serve',
        then: {
          do: [{ feel: 10, from: 'subject', why: 'Trusted me with the regency', key: 'regency_trust' }],
          text: (c) => `${c.subject!.name} takes the seal and a very large chair. The council exhales.`,
        },
      },
      {
        label: 'The surviving parent instead',
        show: [{ exists: 'parent' }],
        then: {
          do: [swap('parent')],
          text: (c) => `${c.s.characters[String(c.data.parent)].name} will rule for their own child. ${c.subject!.name} takes it badly.`,
        },
      },
      {
        label: 'Another of the family instead',
        show: [{ exists: 'kin' }],
        then: { do: [swap('kin')], text: (c) => `${c.s.characters[String(c.data.kin)].name} gets the seal. ${c.subject!.name} gets a polite letter.` },
      },
      {
        label: 'A councillor instead',
        show: [{ exists: 'councillor' }],
        then: {
          do: [swap('councillor')],
          text: (c) => `${c.s.characters[String(c.data.councillor)].name} runs the realm as a matter of business. Family is kept out of it, and notices.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'regent_ledger',
    title: 'The Ledgers',
    icon: 'credits',
    weight: 1.5,
    cooldown: 6,
    when: (s) => {
      const r = childRegency(s);
      return !!r && ageOf(s, r.ward) >= 10 && r.skimmed >= 30 && !r.exposed;
    },
    subject: (s) => mine(s)?.regent,
    setup: ({ s, data }) => {
      data.skimmed = mine(s)!.skimmed;
    },
    text: ({ s, subject, data }) =>
      `A junior clerk who should be more careful takes ${ruler(s).name} aside with the treasury ledgers. ${data.skimmed} credits have gone somewhere they should not, and the signature on every withdrawal is ${subject!.name}'s.`,
    options: [
      {
        label: 'Remember every number',
        then: {
          do: [{ run: (c) => exposeSkimming(c.s), text: 'You have proof for when you come of age' }],
          text: (c) => `${c.r.name} copies the figures into a schoolbook and hides it under a loose floor tile. One day this will matter.`,
        },
      },
      {
        label: 'Tell the council',
        then: {
          roll: {
            text: 'The council believes a child over the regent',
            odds: (c) => clamp(0.3 + (ageOf(c.s, c.r) - 10) * 0.08, 0.3, 0.8),
            roll: (c) => chance(c.s, clamp(0.3 + (ageOf(c.s, c.r) - 10) * 0.08, 0.3, 0.8)),
          },
          pass: {
            do: [
              { run: (c) => exposeSkimming(c.s), text: 'The theft is on record' },
              { feel: -40, from: 'subject', why: 'Exposed me before the council', key: 'exposed', decay: 0.3 },
              {
                run: (c) => {
                  const next = replaceRegent(c.s, c.s.playerClanId);
                  return next ? `${next.name} takes the regent's chair.` : 'Nobody else can do the job, so the regent stays, watched.';
                },
                text: 'The council replaces the regent if anyone else can serve',
              },
            ],
            text: (c) => `The council reads the ledgers twice, then looks at ${c.subject!.name} for a long time.`,
          },
          fail: {
            do: [{ feel: -25, from: 'subject', why: 'Tried to turn the council against me', key: 'exposed', decay: 0.3 }],
            text: (c) => `The council pats ${c.r.name} on the head and returns the ledgers to ${c.subject!.name}, who now knows exactly who read them.`,
          },
        },
      },
      {
        label: 'Say nothing',
        then: { text: 'The ledgers go back on the shelf. The numbers keep getting worse.' },
      },
    ],
  }),
  defineEvent({
    id: 'regent_lessons',
    title: 'Lessons in Rule',
    icon: 'crown',
    weight: 1,
    cooldown: 6,
    when: (s) => {
      const r = childRegency(s);
      return !!r && ageOf(s, r.ward) >= 8;
    },
    subject: (s) => mine(s)?.regent,
    setup: ({ s, subject, data }) => {
      data.skill = bestSkill(s, subject!);
    },
    text: ({ s, subject, data }) =>
      `${fullName(s, subject!)} offers to let ${ruler(s).name} sit in on the business of the realm: petitions, accounts, the occasional threat. ${pr(subject).He} is known for ${pr(subject).his} ${SKILL[data.skill as StatKey]}.`,
    options: [
      {
        label: 'Sit at their elbow',
        then: {
          do: [
            {
              run: (c) => {
                c.r.base[c.data.skill as StatKey] += 1;
              },
              text: (c) => `+1 ${SKILL[c.data.skill as StatKey]}`,
            },
            { feel: 10, from: 'subject', why: 'Listened to my lessons', key: 'lessons' },
            { feel: 5, from: 'root', to: 'subject', why: 'Taught me how a realm works', key: 'lessons' },
          ],
          text: (c) => `${c.r.name} learns how a realm is actually run, which is not how the songs describe it.`,
        },
      },
      {
        label: 'Slip off to the docks',
        then: {
          do: [
            { stat: 'cmd', n: 1, to: 'root' },
            { feel: -10, from: 'subject', why: 'Skipped my lessons for the docks', key: 'lessons' },
          ],
          text: (c) => `${c.r.name} learns knots, swearing and how a frigate turns. ${c.subject!.name} learns where the young ruler goes when bored.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'regent_clings',
    title: 'The Regent Will Not Go',
    icon: 'crown',
    weight: 1,
    urgent: true,
    when: (s) => flagDue(s, CHALLENGE_FLAG) && clinging(s, s.playerClanId),
    subject: (s) => mine(s)?.regent,
    setup: ({ s, subject, data }) => {
      clearFlag(s, CHALLENGE_FLAG);
      const r = mine(s)!;
      data.until = r.until;
      data.price = Math.max(60, 60 + 20 * gripOf(s, subject!, r.ward, r.since).score);
    },
    text: ({ s, subject, data }) => {
      const r = mine(s)!;
      const why = gripOf(s, subject!, r.ward, r.since).reasons;
      return `${r.ward.name} is ${ageOf(s, r.ward)} and of age by any law in the system. ${fullName(s, subject!)} agrees entirely, and has simply not quite finished: the seal stays where it is until ${data.until}.${why.length ? ` (${why.join(', ')}.)` : ''}${r.exposed ? ` You still have the ledgers: ${r.skimmed} credits.` : ''}`;
    },
    options: [
      {
        label: 'Demand the seal before the council',
        then: {
          roll: { text: 'Your Diplomacy against theirs (proof helps)', odds: demandOdds, roll: (c) => chance(c.s, demandOdds(c)) },
          pass: {
            do: [
              { gain: 'prestige', n: 10 },
              { feel: -30, from: 'subject', why: 'Unseated me before the council', key: 'unseated', decay: 0.3 },
              { run: (c) => endRegency(c.s, c.s.playerClanId), text: 'The regency ends' },
            ],
            text: (c) =>
              `${c.r.name} holds out a hand in front of the whole council. After a silence you could cut glass with, ${c.subject!.name} puts the seal in it.`,
          },
          fail: {
            do: [
              { lose: 'prestige', n: 10, upTo: 'have' },
              { run: (c) => extendRegency(c.s), text: 'The regency lasts a cycle longer' },
            ],
            text: (c) => `The council finds a great deal to study in the ceiling. ${c.subject!.name} thanks ${c.r.name} for the suggestion.`,
          },
        },
      },
      {
        label: 'Buy them out',
        needs: [{ have: 'credits', n: 'price' }],
        then: {
          do: [
            { lose: 'credits', n: { data: 'price' } },
            { feel: 5, from: 'subject', why: 'Paid me handsomely to step aside', key: 'unseated' },
            { run: (c) => endRegency(c.s, c.s.playerClanId), text: 'The regency ends' },
          ],
          text: (c) =>
            `A generous estate, a title with no duties and a very comfortable chair somewhere else. ${c.subject!.name} discovers that retirement suits them.`,
        },
      },
      {
        label: 'Have them arrested',
        then: {
          roll: { text: 'Your Intrigue against theirs (a spymaster helps)', odds: arrestOdds, roll: (c) => chance(c.s, arrestOdds(c)) },
          pass: {
            do: [
              {
                run: (c) => {
                  const regent = c.subject!;
                  regent.prisonerOf = c.s.playerClanId;
                  endRegency(c.s, c.s.playerClanId);
                  addFeeling(c.s, regent.id, c.r.id, { why: 'Threw me in a cell', value: -50, decay: 0.2, grave: true, key: 'arrested' });
                  for (const k of closeKin(c.s, regent))
                    if (k.id !== c.r.id) addFeeling(c.s, k.id, c.r.id, { why: `Imprisoned ${regent.name}`, value: -20, decay: 0.5, key: 'arrested' });
                },
                text: (c) => `${c.subject!.name} goes to your cells; their family will not forget it`,
              },
            ],
            text: (c) => `The guards ${c.r.name} chose come at dawn. ${c.subject!.name} is still in a dressing gown when the door locks.`,
          },
          fail: {
            do: [
              { lose: 'prestige', n: 15, upTo: 'have' },
              { feel: -40, from: 'subject', why: 'Tried to have me arrested', key: 'arrested', decay: 0.2 },
              { run: (c) => extendRegency(c.s), text: 'The regency lasts a cycle longer' },
            ],
            text: (c) => `The guards ${c.r.name} chose report straight to ${c.subject!.name}. Breakfast is very quiet.`,
          },
        },
      },
      {
        label: 'Wait it out',
        then: { text: (c) => `${c.r.name} bides their time. ${c.subject!.name} will be gone by ${c.data.until}, one way or another.` },
      },
    ],
  }),
];
