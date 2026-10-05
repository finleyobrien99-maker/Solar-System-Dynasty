// Commanders in play (ROADMAP 12.10): a son or sister who wants the fleet, a
// fallen commander's family waiting to see how you remember them, and a
// victorious commander the court starts to admire a little too much. The
// rules live in commanders.ts. Shuffled into the main deck in events.ts.

import { battleRecord, commanderOf, eligibleCommanders, personalCommand, appointCommander } from './commanders';
import { alive, canAct, ch, fullName, hasTrait } from './core';
import { defineEvent } from './dsl';
import { clearFlag, flagDue, getFlag, pr, type EventDef } from './eventKit';
import { pick } from './rng';
import type { Character, GameState } from './types';

/** Kin who want the fleet: bold or ambitious, capable, and better than whoever has it now. */
function eager(s: GameState): Character[] {
  const current = commanderOf(s, s.playerClanId);
  const bar = current ? personalCommand(s, current) : 0;
  return eligibleCommanders(s, s.playerClanId).filter(
    (c) => c.id !== current?.id && (hasTrait(c, 'ambitious') || hasTrait(c, 'brave')) && personalCommand(s, c) >= Math.max(5, bar + 1),
  );
}

/** Your commander, if they have won enough to be talked about. */
function celebrated(s: GameState): Character | undefined {
  const c = commanderOf(s, s.playerClanId);
  return c && battleRecord(c).won >= 3 ? c : undefined;
}

export const COMMANDER_EVENTS: EventDef[] = [
  defineEvent({
    id: 'vanguard_request',
    title: 'The Vanguard',
    icon: 'war',
    weight: 1.2,
    cooldown: 10,
    when: (s) => canAct(s) && (s.wars.length > 0 || s.fleet >= 20) && eager(s).length > 0,
    subject: (s) => {
      const pool = eager(s);
      return pool.length ? pick(s, pool) : undefined;
    },
    setup: ({ s, data }) => {
      data.current = commanderOf(s, s.playerClanId)?.id ?? '';
    },
    text: ({ s, subject, data }) => {
      const current = ch(s, String(data.current));
      return `${fullName(s, subject!)} has been reading battle reports at breakfast and drawing fleet diagrams on the napkins. ${pr(subject).He} wants command of the fleet${current ? `, and says ${current.name} is too cautious by half` : ''}. Command ${personalCommand(s, subject!)}.`;
    },
    options: [
      {
        label: 'Give them the fleet',
        then: {
          do: [
            {
              run: (c) => {
                appointCommander(c.s, c.s.playerClanId, c.subject!.id);
              },
              text: (c) => `${c.subject!.name} takes command of the fleet`,
            },
            { feel: 15, from: 'subject', why: 'Trusted me with the fleet', key: 'vanguard' },
          ],
          text: (c) => `${c.subject!.name} is on the flagship before the ink is dry. The crews have heard good things. They are about to find out.`,
        },
      },
      {
        label: 'Make them second-in-command',
        show: [{ exists: 'current' }],
        then: {
          do: [
            { stat: 'cmd', n: 1, to: 'subject' },
            { feel: 5, from: 'subject', why: 'Gave me a place on the bridge', key: 'vanguard' },
          ],
          text: (c) => `${c.subject!.name} learns the trade beside an old hand, and grumbles about it, and learns.`,
        },
      },
      {
        label: 'Not yet',
        then: {
          do: [{ feel: -15, from: 'subject', why: 'Kept me from command', key: 'vanguard' }],
          text: (c) => `${c.subject!.name} says nothing, very loudly, for a week.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'fallen_commander',
    title: 'A Fallen Commander',
    icon: 'death',
    weight: 1,
    urgent: true,
    when: (s) => canAct(s) && flagDue(s, 'fallen_commander') && alive(ch(s, String(getFlag(s, 'fallen_commander')?.data.kin))),
    setup: ({ s, data }) => {
      const f = getFlag(s, 'fallen_commander')!;
      clearFlag(s, 'fallen_commander');
      data.fallen = String(f.data.id);
      data.kin = String(f.data.kin);
    },
    text: ({ s, data }) =>
      `${s.characters[data.fallen]?.name ?? 'Your commander'} died on the bridge of the flagship. ${s.characters[data.kin].name} is waiting to hear how the house means to remember them.`,
    options: [
      {
        label: 'A state funeral',
        needs: [{ have: 'credits', n: 80 }],
        then: {
          do: [
            { lose: 'credits', n: 80 },
            { gain: 'prestige', n: 10 },
            { feel: 20, from: 'kin', why: 'Gave them a hero’s funeral', key: 'fallen' },
          ],
          text: 'Black banners, a flypast and a eulogy that leaves the hall silent. The fleet will fight harder for a house that buries its own like this.',
        },
      },
      {
        label: 'A pension for the family',
        needs: [{ have: 'credits', n: 50 }],
        then: {
          do: [
            { lose: 'credits', n: 50 },
            { feel: 10, from: 'kin', why: 'Looked after the family', key: 'fallen' },
          ],
          text: 'No ceremony, but the bills are paid and will be for years. It is noticed by the people it matters to.',
        },
      },
      {
        label: 'There is a war on',
        then: {
          do: [{ feel: -20, from: 'kin', why: 'Had no time to mourn them', key: 'fallen' }],
          text: 'You sign the casualty list and move on to the next report. Somebody in your family will remember that you did.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'commander_triumph',
    title: 'A Celebrated Commander',
    icon: 'crown',
    weight: 1,
    cooldown: 15,
    when: (s) => canAct(s) && !!celebrated(s),
    subject: (s) => celebrated(s),
    setup: ({ subject, data }) => {
      data.won = battleRecord(subject!).won;
    },
    text: ({ s, subject, data }) =>
      `${fullName(s, subject!)} has won ${data.won} battles. The crews cheer ${pr(subject).his} name in the docks, the taverns sing about ${pr(subject).him}, and somebody at court has started saying "${subject!.name} would make a fine ruler" a little too often.`,
    options: [
      {
        label: 'Honour them before the court',
        then: {
          do: [
            { gain: 'prestige', n: 10 },
            { feel: 20, from: 'subject', why: 'Honoured my victories', key: 'triumph' },
            { trait: 'arrogant', to: 'subject', p: 0.3 },
          ],
          text: (c) => `A medal, a parade and your hand on ${c.subject!.name}'s shoulder in front of everyone. It is clear whose victories these are. Mostly.`,
        },
      },
      {
        label: 'Share the spoils with them',
        needs: [{ have: 'credits', n: 80 }],
        then: {
          do: [
            { lose: 'credits', n: 80 },
            { feel: 25, from: 'subject', why: 'Shared the spoils with me', key: 'triumph' },
          ],
          text: (c) => `${c.subject!.name} gets a handsome share of the prize money, and the message that loyalty pays.`,
        },
      },
      {
        label: 'Remind them who rules',
        then: {
          do: [{ feel: -15, from: 'subject', why: 'Kept me in my place', key: 'triumph' }],
          text: (c) => `A private word: the fleet is the house's, and so is the glory. ${c.subject!.name} bows, a fraction too late.`,
        },
      },
    ],
  }),
];
