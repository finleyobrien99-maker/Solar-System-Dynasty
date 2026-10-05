// Your realm calls you to arms (WAVE-5-DIPLOMACY.md slice 1). When an
// outsider attacks a house of your realm, AI houses roll; you choose. The
// rules live in realmDefence.ts. Registration in events.ts, and the reservation
// of the ships you send, belong to the war lane (WAVE-5-CONTRACT.md).

import { canAct, fullName } from './core';
import { defineEvent, type Ctx } from './dsl';
import type { EventDef } from './eventKit';
import { PLANET_BY_ID } from './planets';
import { answerBlocker, pendingRealmCall, realmOf, REALM_SHARE, TOKEN_SHARE } from './realmDefence';
import { answerRealm } from './war';
import type { GameState } from './types';

function house(s: GameState, id: string): string {
  return `House ${s.clans[id]?.name ?? 'unknown'}`;
}

const war = (c: Ctx) => String(c.data.war);
const free = (c: Ctx) => !answerBlocker(c.s, war(c));

export const REALM_DEFENCE_EVENTS: EventDef[] = [
  defineEvent({
    id: 'realm_call',
    title: 'The Realm Calls',
    icon: 'war',
    weight: 1,
    urgent: true,
    when: (s) => canAct(s) && !!pendingRealmCall(s),
    subject: (s) => {
      const p = pendingRealmCall(s);
      return p ? s.characters[s.clans[p.war.defender]?.headId ?? ''] : undefined;
    },
    setup: ({ s, data }) => {
      const p = pendingRealmCall(s)!;
      data.war = p.war.id;
      data.attacker = p.war.attacker;
      data.defender = p.war.defender;
      data.top = realmOf(s, p.war.defender);
      data.half = Math.max(1, Math.floor(s.fleet * REALM_SHARE));
      data.token = Math.max(1, Math.floor(s.fleet * TOKEN_SHARE));
    },
    // Only a sworn house is asked: a sovereign (you included) is bound to answer without a choice.
    text: ({ s, subject, data }) => {
      const from = PLANET_BY_ID[s.clans[String(data.attacker)]?.planetId]?.name ?? 'beyond the realm';
      return `${house(s, String(data.attacker))} of ${from} has attacked ${house(s, String(data.defender))}, whose ruler ${fullName(s, subject!)} needs every ship. ${house(s, String(data.top))} calls every house of the realm to its defence, yours included.`;
    },
    options: [
      {
        label: 'Send half the fleet',
        needs: [{ test: free, why: 'You cannot send ships now' }],
        then: {
          do: [{ run: (c) => void answerRealm(c.s, war(c), true, REALM_SHARE), text: (c) => `${c.data.half} ships sail to the realm's defence` }],
          text: (c) => `The fleet sails within the day. ${house(c.s, String(c.data.defender))} will not forget who came.`,
        },
      },
      {
        label: 'Send a token squadron',
        needs: [{ test: free, why: 'You cannot send ships now' }],
        then: {
          do: [
            {
              run: (c) => void answerRealm(c.s, war(c), true, TOKEN_SHARE),
              text: (c) => `${c.data.token} ships go; your liege notices how few`,
            },
          ],
          text: 'A few ships, a fine flag and a carefully worded letter. Everyone knows exactly what it means.',
        },
      },
      {
        label: 'Stay home',
        then: {
          do: [{ run: (c) => void answerRealm(c.s, war(c), false), text: 'Your liege will remember who stayed home' }],
          text: 'Your fleet stays in dock. Somebody else can bleed for the realm this time.',
        },
      },
    ],
  }),
];
