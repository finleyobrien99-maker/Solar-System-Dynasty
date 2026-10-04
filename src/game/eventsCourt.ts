// AI houses deal with you as equals (ROADMAP 8.1; Fin: "I want AI
// characters to have the same freedom I have"). A house that took your kin
// in war names a price; a house that likes you and shares your enemies
// offers an alliance; an ally at war calls on you to honour it. Shuffled
// into the main deck in events.ts.

import { captiveRansom } from './aiCourt';
import { alive, canAct, ch, clanRegions, fullName } from './core';
import { defineEvent, type Ctx } from './dsl';
import { pr, type EventDef } from './eventKit';
import { isRival } from './memory';
import { opinionOf } from './relations';
import { pick } from './rng';
import type { AiWar, Character, Clan, GameState } from './types';
import { atWarWith } from './war';

/** One of your kin sitting in an AI house's cells, if any. */
export function heldKin(s: GameState): Character | undefined {
  for (const id in s.characters) {
    const c = s.characters[id];
    if (!c.prisonerOf || c.clanId !== s.playerClanId || !alive(c)) continue;
    const k = s.clans[c.prisonerOf];
    if (k && !k.isPlayer && clanRegions(s, k.id).length > 0 && alive(ch(s, k.headId))) return c;
  }
  return undefined;
}

function freeHead(s: GameState, k: Clan): Character | undefined {
  const h = ch(s, k.headId);
  return alive(h) && !h.prisonerOf ? h : undefined;
}

/** A house your enemies are also theirs: someone you're at war or feuding with whose lord they can't stand. */
function sharedFoe(s: GameState, k: Clan): Clan | undefined {
  const head = freeHead(s, k);
  if (!head) return undefined;
  const mine = new Set([...s.wars.map((w) => w.enemy), ...s.feuds]);
  for (const id of mine) {
    const foe = s.clans[id];
    const theirs = foe && ch(s, foe.headId);
    if (foe && foe.id !== k.id && alive(theirs) && opinionOf(s, head, theirs) <= -30) return foe;
  }
  return undefined;
}

function theirWar(s: GameState, k: Clan): AiWar | undefined {
  return s.aiWars.find((w) => w.attacker === k.id || w.defender === k.id);
}

/** Houses that would like you at their side: warm toward you, and either at war or sharing an enemy. */
function wouldAlly(s: GameState): Clan[] {
  return Object.values(s.clans).filter(
    (k) =>
      !k.isPlayer &&
      !k.allied &&
      k.opinion >= 30 &&
      !isRival(k) &&
      clanRegions(s, k.id).length > 0 &&
      !atWarWith(s, k.id) &&
      !!freeHead(s, k) &&
      (!!theirWar(s, k) || !!sharedFoe(s, k)),
  );
}

/** An ally of yours that is at war and still thinks well of you. */
function callingAlly(s: GameState): Clan | undefined {
  return Object.values(s.clans).find((k) => k.allied && !k.isPlayer && k.opinion >= 0 && !!freeHead(s, k) && !!theirWar(s, k));
}

function freeKin(c: Ctx): void {
  c.subject!.prisonerOf = undefined;
}

export const COURT_EVENTS: EventDef[] = [
  defineEvent({
    id: 'kin_ransom',
    title: 'A Ransom Demand',
    icon: 'scheme',
    weight: 1,
    cooldown: 3,
    urgent: true,
    when: (s) => canAct(s) && (s.eventCooldowns.kin_ransom ?? 0) <= s.year && !!heldKin(s),
    subject: heldKin,
    setup: ({ s, subject, data }) => {
      const k = s.clans[subject!.prisonerOf!];
      data.clan = k.id;
      data.captor = k.headId;
      data.amount = captiveRansom(s, subject!);
    },
    text: ({ s, subject, data }) =>
      `An envoy from House ${s.clans[String(data.clan)].name} bows a little too low. ${fullName(s, s.characters[String(data.captor)])} holds ${subject!.name}, and will part with ${pr(subject).him} for ${data.amount} credits.`,
    options: [
      {
        label: 'Pay the ransom',
        needs: [{ have: 'credits', n: 'amount' }],
        then: {
          do: [
            { lose: 'credits', n: { data: 'amount' } },
            {
              run: (c) => {
                const k = c.s.clans[String(c.data.clan)];
                if (k) k.credits += Number(c.data.amount);
                freeKin(c);
              },
              text: (c) => `${c.subject!.name} is freed`,
            },
            { feel: -20, from: 'root', to: 'captor', why: 'Held my kin to ransom', decay: 1 },
          ],
          text: (c) => `${c.subject!.name} comes home thinner, paler and very glad to see you.`,
        },
      },
      {
        label: 'Refuse',
        then: {
          do: [{ feel: -10, from: 'captor', why: 'Refused our terms', decay: 1 }],
          text: (c) =>
            `You send the envoy home empty-handed. House ${c.s.clans[String(c.data.clan)].name} will ask again, or lose patience with ${c.subject!.name}.`,
        },
      },
      {
        label: 'Send agents to break them out',
        then: {
          roll: { base: 0.3, per: { stat: 'int', n: 0.04 } },
          pass: {
            do: [
              { run: freeKin, text: (c) => `${c.subject!.name} is freed` },
              { gain: 'prestige', n: 15 },
              { feel: -15, from: 'captor', why: 'Stole our prisoner', decay: 1 },
            ],
            text: (c) => `Your agents get ${c.subject!.name} out through the waste chutes. Undignified, but home. +15 prestige.`,
          },
          fail: {
            do: [
              { lose: 'prestige', n: 10 },
              { feel: -20, from: 'captor', why: 'Tried to steal our prisoner', decay: 1 },
            ],
            text: (c) =>
              `Your agents are caught at the outer gate. ${c.subject!.name} is moved to a deeper cell, and ${pr(c.subject).his} captors are not amused. -10 prestige.`,
          },
        },
      },
    ],
  }),
  defineEvent({
    id: 'alliance_offer',
    title: 'An Offer of Alliance',
    icon: 'peace',
    weight: 1.2,
    cooldown: 12,
    when: (s) => canAct(s) && wouldAlly(s).length > 0,
    subject: (s) => {
      const pool = wouldAlly(s);
      return pool.length ? freeHead(s, pick(s, pool)) : undefined;
    },
    setup: ({ s, subject, data }) => {
      const k = s.clans[subject!.clanId];
      data.clan = k.id;
      const war = theirWar(s, k);
      const foe = sharedFoe(s, k) ?? (war && s.clans[war.attacker === k.id ? war.defender : war.attacker]);
      data.foe = foe?.name ?? '';
    },
    text: ({ s, subject, data }) =>
      `${fullName(s, subject!)} sends word: House ${s.clans[String(data.clan)].name} would stand with you${data.foe ? ` against House ${data.foe}` : ''}, if you will stand with them.`,
    options: [
      {
        label: 'Seal the alliance',
        then: {
          do: [
            {
              run: (c) => {
                c.s.clans[String(c.data.clan)].allied = true;
              },
              text: (c) => `House ${c.s.clans[String(c.data.clan)].name} becomes your ally`,
            },
            { remember: 'Stood with us as allies', clan: 'clan', value: 15, decay: 0.04 },
          ],
          text: 'The alliance is sealed. They will expect you to answer when they call.',
        },
      },
      { label: 'Politely decline', then: { do: [{ opinion: -10, clan: 'clan' }], text: 'Their envoy bows stiffly and leaves.' } },
    ],
  }),
  defineEvent({
    id: 'call_to_arms',
    title: 'A Call to Arms',
    icon: 'war',
    weight: 2,
    cooldown: 6,
    when: (s) => canAct(s) && s.fleet >= 20 && !!callingAlly(s),
    subject: (s) => {
      const k = callingAlly(s);
      return k && freeHead(s, k);
    },
    setup: ({ s, subject, data }) => {
      const k = s.clans[subject!.clanId];
      const war = theirWar(s, k)!;
      data.clan = k.id;
      data.war = war.id;
      data.foe = s.clans[war.attacker === k.id ? war.defender : war.attacker]?.name ?? 'their enemies';
      data.attacked = war.defender === k.id ? 1 : 0;
      data.ships = Math.max(3, Math.round(s.fleet * 0.1));
    },
    text: ({ s, subject, data }) =>
      `House ${s.clans[String(data.clan)].name} is at war with House ${data.foe}${data.attacked ? ', who attacked them' : ''}. ${fullName(s, subject!)} calls on you as an ally: ${data.ships} of your ships would turn the tide.`,
    options: [
      {
        label: 'Send the ships',
        needs: [{ have: 'fleet', n: 'ships' }],
        then: {
          do: [
            { lose: 'fleet', n: { data: 'ships' } },
            {
              run: (c) => {
                const w = c.s.aiWars.find((x) => x.id === c.data.war);
                if (w) w.progress += w.attacker === c.data.clan ? 35 : -35;
              },
              text: 'their war swings their way',
            },
            { gain: 'prestige', n: 10 },
            { remember: 'Answered our call to arms', clan: 'clan', value: 20, decay: 0.05 },
          ],
          text: (c) => `Your squadrons arrive just as House ${c.data.foe} commits its reserves. Not all of them come home. +10 prestige.`,
        },
      },
      {
        label: 'Send money instead',
        needs: [{ have: 'credits', n: 150 }],
        then: {
          do: [
            { lose: 'credits', n: 150 },
            {
              run: (c) => {
                c.s.clans[String(c.data.clan)].credits += 150;
              },
              text: 'the credits go to their war chest',
            },
            { remember: 'Sent gold, not ships', clan: 'clan', value: 6, decay: 0.5 },
          ],
          text: 'They take the credits. Their envoy manages to say thank you without quite smiling.',
        },
      },
      {
        label: 'Stay out of it',
        then: {
          do: [
            { lose: 'prestige', n: 10 },
            { remember: 'Abandoned us in our war', clan: 'clan', value: -25, decay: 0.04 },
          ],
          roll: 0.5,
          pass: { text: 'You stay home. They will remember who did not come. -10 prestige.' },
          fail: {
            do: [
              {
                run: (c) => {
                  c.s.clans[String(c.data.clan)].allied = false;
                },
                text: (c) => `House ${c.s.clans[String(c.data.clan)].name} breaks the alliance`,
              },
            ],
            text: (c) => `You stay home. House ${c.s.clans[String(c.data.clan)].name} tears up the alliance. -10 prestige.`,
          },
        },
      },
    ],
  }),
];
