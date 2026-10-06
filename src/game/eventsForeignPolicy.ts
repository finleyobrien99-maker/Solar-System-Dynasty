// Foreign policy reaching your court (WAVE-5-DIPLOMACY.md slice 3). An
// expansionist house demands a region or tribute: give in, or refuse and face
// its war. Quarrelling neighbours ask you to judge, the neighbours of a rising
// power (you) confer against it, and people flee houses set against you. The
// rules live in foreignPolicy.ts. Registered in events.ts.

import { canAct, fullName } from './core';
import { defineEvent, type Ctx } from './dsl';
import type { EventDef } from './eventKit';
import { answerUltimatum, defectorFrom, defendedMight, describeDemand, fearfulOfYou, pendingUltimatum, quarrelNearYou, rulerFree } from './foreignPolicy';
import { runScheme, schemeBlocker, schemeChance } from './intrigue';
import { headOf, mightOf, rememberHouse } from './houseRelations';
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
    when: (s) => rulerFree(s) && !!pendingUltimatum(s),
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
  defineEvent({
    id: 'border_incident',
    title: 'A Border Incident',
    icon: 'war',
    weight: 1,
    when: (s) => canAct(s) && !!quarrelNearYou(s),
    subject: (s) => {
      const q = quarrelNearYou(s);
      return q ? headOf(s, q.a) : undefined;
    },
    setup: ({ s, data }) => {
      const q = quarrelNearYou(s)!;
      data.a = q.a;
      data.b = q.b;
      data.aName = s.clans[q.a].name;
      data.bName = s.clans[q.b].name;
    },
    text: ({ s, subject, data }) =>
      `Warships of House ${data.aName} and House ${data.bName} have traded fire over a disputed convoy lane, and the old quarrel between them is in the open. ${fullName(s, subject!)} asks you to judge between them. House ${data.bName}'s envoy is already waiting outside.`,
    options: [
      {
        label: 'Mediate',
        needs: [{ have: 'credits', n: 40 }],
        then: {
          do: [
            { lose: 'credits', n: 40, as: 'for the envoys' },
            { gain: 'prestige', n: 20 },
            { remember: 'Kept the peace between us and our neighbours', clan: 'a', value: 8, decay: 0.08 },
            { remember: 'Kept the peace between us and our neighbours', clan: 'b', value: 8, decay: 0.08 },
            {
              run: (c) => {
                const a = String(c.data.a),
                  b = String(c.data.b);
                rememberHouse(c.s, a, b, { text: 'Made peace before a foreign court', value: 10, decay: 0.08 });
                rememberHouse(c.s, b, a, { text: 'Made peace before a foreign court', value: 10, decay: 0.08 });
              },
              text: (c) => `House ${c.data.aName} and House ${c.data.bName} cool towards each other`,
            },
          ],
          text: 'Both envoys put their seals to your judgement. The quarrel cools, for now, and the whole system heard who settled it.',
        },
      },
      {
        label: 'Side with the house that asked',
        then: {
          do: [
            { remember: 'Took our side against our neighbours', clan: 'a', value: 15, decay: 0.05 },
            { remember: 'Sided against us', clan: 'b', value: -20, decay: 0.05 },
            {
              run: (c) => void rememberHouse(c.s, String(c.data.b), String(c.data.a), { text: 'Turned a foreign court against us', value: -10 }),
              text: (c) => `House ${c.data.bName} resents House ${c.data.aName} all the more`,
            },
          ],
          text: 'You find for the house that asked. Its lord will not forget the favour, and neither will the other.',
        },
      },
      {
        label: 'Side with the envoy outside',
        then: {
          do: [
            { remember: 'Took our side against our neighbours', clan: 'b', value: 15, decay: 0.05 },
            { remember: 'Sided against us', clan: 'a', value: -20, decay: 0.05 },
            {
              run: (c) => void rememberHouse(c.s, String(c.data.a), String(c.data.b), { text: 'Turned a foreign court against us', value: -10 }),
              text: (c) => `House ${c.data.aName} resents House ${c.data.bName} all the more`,
            },
          ],
          text: 'You find for the envoy waiting outside. The house that asked you leaves humiliated.',
        },
      },
      { label: 'Stay out of it', then: { text: 'You let them settle it themselves. Neither side thanks you, and neither blames you.' } },
    ],
  }),
  defineEvent({
    id: 'giant_summit',
    title: 'The Neighbours Confer',
    icon: 'crown',
    weight: 1,
    when: (s) => canAct(s) && fearfulOfYou(s).length > 0,
    subject: (s) => headOf(s, fearfulOfYou(s)[0] ?? ''),
    setup: ({ s, data }) => {
      const houses = fearfulOfYou(s);
      data.lead = houses[0];
      data.leadName = s.clans[houses[0]].name;
      data.others = houses
        .slice(1, 4)
        .map((id) => `House ${s.clans[id].name}`)
        .join(', ');
    },
    text: ({ s, subject, data }) =>
      `Your spymaster reports quiet meetings: ${fullName(s, subject!)} of House ${data.leadName} ${data.others ? `has met ${data.others} in secret` : 'has been sounding out the other courts'}. The talk was all of your fleet, and of what it would take to stop it.`,
    options: [
      {
        label: 'Buy off their host',
        needs: [{ have: 'credits', n: 80 }],
        then: {
          do: [
            { lose: 'credits', n: 80, as: 'in gifts' },
            { remember: 'Sent rich gifts when we feared them', clan: 'lead', value: 12, decay: 0.08 },
          ],
          text: 'Your gifts reach the host before the guests have left. One of them, at least, will think twice.',
        },
      },
      {
        label: 'Parade the fleet past their worlds',
        then: {
          do: [
            { gain: 'prestige', n: 25 },
            {
              run: (c) => {
                for (const id of fearfulOfYou(c.s)) rememberHouse(c.s, id, c.s.playerClanId, { text: 'Paraded their fleet to cow us', value: -8, decay: 0.08 });
              },
              text: 'Every house at the meeting likes you a little less',
            },
          ],
          text: 'Your ships pass in review over every world at the meeting. The system is impressed; the neighbours are frightened.',
        },
      },
      { label: 'Let them talk', then: { text: 'Talk is cheap. Ships are not. You let them meet.' } },
    ],
  }),
  defineEvent({
    id: 'defector',
    title: 'A Defector',
    icon: 'scheme',
    weight: 1,
    when: (s) => canAct(s) && !!defectorFrom(s),
    subject: (s) => s.characters[defectorFrom(s)?.personId ?? ''],
    setup: ({ s, data }) => {
      const d = defectorFrom(s)!;
      data.clan = d.clanId;
      data.house = s.clans[d.clanId].name;
    },
    text: ({ s, subject, data }) =>
      `${fullName(s, subject!)} of House ${data.house} arrives by night and begs sanctuary. They say they know where House ${data.house} keeps its ships, and they will tell you, for a home.`,
    options: [
      {
        // Covert work by your own agents, by the ordinary sabotage rules: paid, one of your schemes this cycle, its usual odds.
        label: 'Send your saboteurs with their maps',
        needs: [{ test: (c) => !schemeBlocker(c.s, 'sabotage', String(c.data.clan)), why: 'Your agents cannot act: no scheme or credits to spare this cycle' }],
        then: {
          do: [
            {
              run: (c) => void runScheme(c.s, 'sabotage', String(c.data.clan)),
              text: (c) =>
                `Sabotage House ${c.data.house}'s shipyards: ${Math.round(schemeChance(c.s, 'sabotage', String(c.data.clan)) * 100)}% chance, 90 credits, as any sabotage`,
            },
            { remember: 'Sheltered our traitor', clan: 'clan', value: -15, decay: 0.05 },
          ],
          text: (c) => `You give them a home, and your agents their maps. House ${c.data.house} knows where its traitor went.`,
        },
      },
      {
        label: 'Send them back',
        then: {
          do: [{ remember: 'Returned a traitor to us', clan: 'clan', value: 15, decay: 0.05 }],
          text: 'You send them home under guard. Their lord is grateful, in a cold sort of way.',
        },
      },
      {
        label: 'Shelter them, and nothing more',
        then: {
          do: [{ remember: 'Sheltered our traitor', clan: 'clan', value: -15, decay: 0.05 }],
          text: (c) => `They find a quiet home at your court. House ${c.data.house} knows where its traitor went.`,
        },
      },
      { label: 'Let them go elsewhere', then: { text: 'You give them a ship and a day’s start. Whatever they know goes with them.' } },
    ],
  }),
];
