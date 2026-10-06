// Ultimatums to you (WAVE-5-DIPLOMACY.md slice 3). An expansionist house
// demands a region or tribute: give in, or refuse and face its war. The rules
// live in foreignPolicy.ts. Registered in events.ts.

import { canAct, fullName } from './core';
import { defineEvent, type Ctx } from './dsl';
import type { EventDef } from './eventKit';
import { answerUltimatum, defendedMight, describeDemand, pendingUltimatum } from './foreignPolicy';
import { mightOf } from './houseRelations';
import { PLANET_BY_ID } from './planets';
import { atWarWith } from './war';

const id = (c: Ctx) => String(c.data.id);
// Overtaken by events (a war, a lost region), the demand lapses: only a harmless way out remains.
const stands = { test: (c: Ctx) => !!pendingUltimatum(c.s, id(c)), why: 'The demand has lapsed' };
const lapsed = { test: (c: Ctx) => !pendingUltimatum(c.s, id(c)), why: 'The demand still stands' };

export const FOREIGN_POLICY_EVENTS: EventDef[] = [
  defineEvent({
    id: 'ultimatum',
    title: 'An Ultimatum',
    icon: 'war',
    weight: 1,
    urgent: true,
    when: (s) => canAct(s) && !!pendingUltimatum(s),
    subject: (s) => {
      const u = pendingUltimatum(s);
      return u ? s.characters[s.clans[u.from]?.headId ?? ''] : undefined;
    },
    setup: ({ s, data }) => {
      const u = pendingUltimatum(s)!;
      data.id = u.id;
      data.from = u.from;
      data.demand = describeDemand(s, u.goal);
      data.cede = u.goal.kind === 'cede' ? 1 : 0;
      data.theirs = mightOf(s, u.from);
      data.yours = defendedMight(s, s.playerClanId, u.from);
    },
    text: ({ s, subject, data }) => {
      const house = s.clans[String(data.from)];
      const world = PLANET_BY_ID[house?.planetId ?? '']?.name;
      return `Envoys of ${fullName(s, subject!)}, head of House ${house?.name}${world ? ` of ${world}` : ''}, deliver an ultimatum: ${data.cede ? `hand over ${data.demand}` : `pay ${data.demand}`}, or face war. Their fleet: ${data.theirs} ships. Yours, with every ally bound to you: ${data.yours}.`;
    },
    options: [
      {
        label: 'Give in',
        show: [stands],
        then: {
          do: [
            {
              run: (c) => void answerUltimatum(c.s, true, id(c)),
              text: (c) => (c.data.cede ? `${c.data.demand} passes to House ${c.s.clans[String(c.data.from)]?.name}` : `You pay ${c.data.demand}`),
            },
          ],
          text: 'You sign. Their envoys leave smiling, and everyone at court saw you do it.',
        },
      },
      {
        label: 'Refuse',
        show: [stands],
        then: {
          do: [
            {
              run: (c) => {
                answerUltimatum(c.s, false, id(c));
                const name = c.s.clans[String(c.data.from)]?.name;
                return atWarWith(c.s, String(c.data.from)) ? `House ${name} declares war.` : `House ${name} will not forget it.`;
              },
              text: (c) => `House ${c.s.clans[String(c.data.from)]?.name} may go to war over it`,
            },
          ],
          text: 'You send their envoys home with your answer.',
        },
      },
      {
        label: 'Send the envoys home',
        show: [lapsed],
        then: { text: 'Events have overtaken their demand. The envoys leave without an answer.' },
      },
    ],
  }),
];
