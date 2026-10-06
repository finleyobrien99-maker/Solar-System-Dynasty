// Treaty offers to you (WAVE-5-DIPLOMACY.md slice 2). AI houses propose by
// the rules in treaties.ts; their offer waits for your answer here. Registered
// in events.ts by the war lane (WAVE-5-CONTRACT.md).

import { canAct } from './core';
import { defineEvent, type Ctx } from './dsl';
import type { EventDef } from './eventKit';
import { treatyName } from './houseRelations';
import { PLANET_BY_ID } from './planets';
import { answerTreaty, offerBlocker, offersToYou, tradeIncomeOf } from './treaties';
import type { TreatyProposal } from './diplomacyTypes';
import type { GameState } from './types';

function offer(s: GameState, id: string): TreatyProposal | undefined {
  return offersToYou(s).find((p) => p.id === id);
}

function terms(s: GameState, p: TreatyProposal): string {
  const until = s.year + p.years;
  const name = `House ${s.clans[p.from]?.name ?? 'unknown'}`;
  switch (p.kind) {
    case 'nonAggression':
      return `${name} proposes that neither of your houses makes war on the other until ${until}.`;
    case 'defensive':
      return `${name} proposes a defensive pact: each comes to the other's aid when attacked, until ${until}. Stay home when they call and you break it.`;
    case 'trade':
      return `${name} proposes a trade agreement: about ${tradeIncomeOf(s, { ...p, signed: s.year, until })} credits a cycle for each of you, until ${until}.`;
    case 'guarantee':
      return p.a === p.from
        ? `${name} offers to guarantee your independence: they will defend you against anyone until ${until}.`
        : `${name} asks you to guarantee their independence: you would defend them against anyone until ${until}.`;
    case 'tribute':
      return p.b === p.from
        ? `${name} offers you ${p.amount} credits a cycle in tribute until ${until}, if you swear not to attack them and to defend them.`
        : `${name} demands ${p.amount} credits a cycle in tribute until ${until}.`;
  }
}

const id = (c: Ctx) => String(c.data.offer);

export const DIPLOMACY_EVENTS: EventDef[] = [
  defineEvent({
    id: 'treaty_offer',
    title: 'Envoys at Court',
    icon: 'peace',
    weight: 1,
    urgent: true,
    when: (s) => canAct(s) && offersToYou(s).length > 0,
    subject: (s) => {
      const p = offersToYou(s)[0];
      return p ? s.characters[s.clans[p.from]?.headId ?? ''] : undefined;
    },
    setup: ({ s, data }) => {
      const p = offersToYou(s)[0];
      data.offer = p.id;
      data.from = p.from;
      data.kind = p.kind;
    },
    text: ({ s, data }) => {
      const p = offer(s, String(data.offer));
      if (!p) return 'The envoys have gone home.';
      const world = PLANET_BY_ID[s.clans[p.from]?.planetId ?? '']?.name;
      return `Envoys of House ${s.clans[p.from]?.name}${world ? ` of ${world}` : ''} bring an offer. ${terms(s, p)}`;
    },
    options: [
      {
        label: 'Accept',
        needs: [{ test: (c) => !offerBlocker(c.s, id(c)), why: 'The terms can no longer be met' }],
        then: {
          do: [
            { run: (c) => void answerTreaty(c.s, id(c), true), text: (c) => `A ${treatyName(c.data.kind as TreatyProposal['kind']).toLowerCase()} is signed` },
          ],
          text: 'Seals are pressed, glasses raised and copies sent to every court. Promises are cheap to make; this one is now on record.',
        },
      },
      {
        label: 'Decline',
        then: {
          do: [{ run: (c) => void answerTreaty(c.s, id(c), false), text: (c) => `House ${c.s.clans[String(c.data.from)]?.name} is a little put out` }],
          text: 'The envoys are thanked, fed and sent home with nothing but a polite letter.',
        },
      },
    ],
  }),
];
