// AI houses deal with you as equals (ROADMAP 8.1; Fin: "I want AI
// characters to have the same freedom I have"). A house that took your kin
// in war names a price; a house that likes you and shares your enemies
// offers an alliance; an ally at war calls on you to honour it; a stronger
// house demands your fealty; a liege who hates you summons you to answer
// charges. Shuffled into the main deck in events.ts.

import { aiAmbition } from './aiAmbition';
import { captiveRansom } from './aiCourt';
import { ageOf, alive, canAct, ch, clanRank, clanRegions, fullName, hasTrait, liegeOf } from './core';
import { defineEvent, type Ctx } from './dsl';
import { pr, type EventDef } from './eventKit';
import { currentHeir, isCloseFamily } from './life';
import { isRival } from './memory';
import { neighbourPlanets } from './planets';
import { feelingsSum, opinionOf } from './relations';
import { pick, weighted } from './rng';
import type { AiWar, Character, Clan, GameState } from './types';
import { aiDeclareWar, atWarWith } from './war';

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

/** A frightened house that sees you as the stronger friend. */
function wantsProtector(s: GameState, k: Clan): boolean {
  return k.opinion >= 15 && s.fleet > k.fleet && aiAmbition(s, k).kind === 'security';
}

/** Houses that would like you at their side: warm toward you, and at war, sharing an enemy, or afraid. */
function wouldAlly(s: GameState): Clan[] {
  return Object.values(s.clans).filter(
    (k) =>
      !k.isPlayer &&
      !k.allied &&
      !isRival(k) &&
      clanRegions(s, k.id).length > 0 &&
      !atWarWith(s, k.id) &&
      !!freeHead(s, k) &&
      ((k.opinion >= 30 && (!!theirWar(s, k) || !!sharedFoe(s, k))) || wantsProtector(s, k)),
  );
}

/**
 * How much a house wants to marry into yours, or 0 if it won't: never a house
 * that dislikes you, is your sworn rival, is fighting you, or whose lord holds
 * a personal grudge. The frightened and the heirless want it most, and
 * everyone likes a powerful in-law.
 */
export function courtship(s: GameState, k: Clan): number {
  const head = freeHead(s, k);
  const r = ch(s, s.rulerId);
  if (k.isPlayer || !head || !alive(r) || k.opinion < 10 || isRival(k) || atWarWith(s, k.id) || !clanRegions(s, k.id).length) return 0;
  if (feelingsSum(s, head, r) <= -20) return 0;
  const want = { security: 2, heir: 1.5, peace: 1, wealth: 1, conquest: 0.7, crusade: 0.5, revenge: 0.5 }[aiAmbition(s, k).kind];
  return (1 + k.opinion / 25 + clanRank(s, s.playerClanId) / 2 + (s.fleet > k.fleet ? 1 : 0)) * want;
}

/** A house that would like a match with yours, picked by how much it wants one. */
export function courtingHouse(s: GameState): Clan | undefined {
  const pool = Object.values(s.clans)
    .map((k) => [k, courtship(s, k)] as const)
    .filter(([, w]) => w > 0);
  return pool.length ? weighted(s, pool) : undefined;
}

/** An ally of yours that is at war and still thinks well of you. */
function callingAlly(s: GameState): Clan | undefined {
  return Object.values(s.clans).find((k) => k.allied && !k.isPlayer && k.opinion >= 0 && !!freeHead(s, k) && !!theirWar(s, k));
}

function freeKin(c: Ctx): void {
  c.subject!.prisonerOf = undefined;
}

/** Whether a house is close enough to your land to lean on you: your planets or the next orbit out. */
function nearYou(s: GameState, k: Clan): boolean {
  const mine = new Set(clanRegions(s, s.playerClanId).map((r) => r.planetId));
  return mine.has(k.planetId) || neighbourPlanets(k.planetId).some((p) => mine.has(p));
}

/**
 * Stronger houses that would have you kneel, as you can demand of weaker
 * ones: they outrank you, can take vassals, have half again your fleet, sit
 * near your land, and either covet it or are ambitious and don't like you.
 */
function overbearing(s: GameState): Clan[] {
  const mine = clanRank(s, s.playerClanId);
  if (mine >= 3) return [];
  const liege = liegeOf(s, s.playerClanId);
  return Object.values(s.clans).filter((k) => {
    if (k.isPlayer || k.allied || k.id === liege || atWarWith(s, k.id) || liegeOf(s, k.id) === s.playerClanId) return false;
    const head = freeHead(s, k);
    const rank = clanRank(s, k.id);
    if (!head || rank < 2 || rank <= mine || k.fleet < s.fleet * 1.5 || !nearYou(s, k)) return false;
    const aim = aiAmbition(s, k);
    return (aim.kind === 'conquest' && aim.target === s.playerClanId) || (k.opinion <= -10 && hasTrait(head, 'ambitious'));
  });
}

/** Your liege, if it has turned against you: the house, or its lord personally. */
function hostileLiege(s: GameState): Clan | undefined {
  const id = liegeOf(s, s.playerClanId);
  const k = id ? s.clans[id] : undefined;
  const head = k && freeHead(s, k);
  const r = ch(s, s.rulerId);
  if (!k || !head || !alive(r) || atWarWith(s, k.id)) return undefined;
  return k.opinion <= -30 || feelingsSum(s, head, r) <= -40 ? k : undefined;
}

/** Close kin a liege might take as a hostage: grown, free, and never the ruler. */
function hostages(s: GameState): Character[] {
  return Object.values(s.characters).filter(
    (c) => alive(c) && c.clanId === s.playerClanId && c.id !== s.rulerId && !c.prisonerOf && ageOf(s, c) >= 16 && isCloseFamily(s, c),
  );
}

/** Hand one of your family to the house in `clan`: your heir if they can get them. */
function giveHostage(c: Ctx): string {
  const pool = hostages(c.s);
  if (!pool.length) return '';
  const heir = currentHeir(c.s);
  const h = heir && pool.includes(heir) ? heir : pick(c.s, pool);
  h.prisonerOf = String(c.data.clan);
  c.vars.hostage = h.name;
  return '';
}

/** The region a war on you would be fought over: one on their planet if you hold one. */
function warTarget(s: GameState, k: Clan): string {
  const mine = clanRegions(s, s.playerClanId);
  return (mine.find((r) => r.planetId === k.planetId && !r.capital) ?? mine.find((r) => r.planetId === k.planetId) ?? mine[0])?.id ?? '';
}

function clanName(c: Ctx): string {
  return c.s.clans[String(c.data.clan)].name;
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
    id: 'fealty_demand',
    title: 'Kneel, or Else',
    icon: 'crown',
    weight: 1,
    cooldown: 15,
    when: (s) => canAct(s) && clanRegions(s, s.playerClanId).length > 0 && overbearing(s).length > 0,
    subject: (s) => {
      const pool = overbearing(s);
      return pool.length ? freeHead(s, pick(s, pool)) : undefined;
    },
    setup: ({ s, subject, data }) => {
      const k = s.clans[subject!.clanId];
      data.clan = k.id;
      data.price = 150 + clanRank(s, k.id) * 100;
    },
    text: ({ s, subject, data }) =>
      `${fullName(s, subject!)} has ${s.clans[String(data.clan)].fleet} warships and a short temper. House ${s.clans[String(data.clan)].name} would have you swear fealty, "for your own protection".`,
    options: [
      {
        label: 'Bend the knee',
        then: {
          do: [
            {
              run: (c) => {
                c.s.clans[c.s.playerClanId].liege = String(c.data.clan);
              },
              text: (c) => `House ${clanName(c)} becomes your liege and takes its tribute`,
            },
            { lose: 'prestige', n: 50 },
            { remember: 'Bent the knee to us', clan: 'clan', value: 15, decay: 0.2 },
          ],
          text: "You kneel. It costs you some pride and a slice of every year's income, but their warships point elsewhere. -50 prestige.",
        },
      },
      {
        label: 'Buy them off',
        needs: [{ have: 'credits', n: 'price' }],
        then: {
          do: [
            { lose: 'credits', n: { data: 'price' } },
            {
              run: (c) => {
                c.s.clans[String(c.data.clan)].credits += Number(c.data.price);
              },
              text: 'the credits go to their treasury',
            },
            { remember: 'Paid us to go away', clan: 'clan', value: 10, decay: 0.5 },
          ],
          text: 'A generous "gift" changes hands. Their envoy discovers urgent business elsewhere.',
        },
      },
      {
        label: 'Refuse',
        then: {
          do: [
            { gain: 'prestige', n: 15 },
            { remember: 'Refused to kneel', clan: 'clan', value: -20, decay: 0.5 },
          ],
          roll: 0.5,
          pass: { text: 'You send their envoy home with a flea in his ear. They bluster, and do nothing. For now. +15 prestige.' },
          fail: {
            do: [
              {
                run: (c) => {
                  c.vars.declared = aiDeclareWar(c.s, String(c.data.clan), 'conquest', warTarget(c.s, c.s.clans[String(c.data.clan)])) ? 1 : 0;
                },
                text: (c) => (c.vars.declared ? `House ${clanName(c)} declares war` : `House ${clanName(c)} cannot begin another war`),
              },
            ],
            text: (c) =>
              c.vars.declared
                ? `You refuse. House ${clanName(c)} was not bluffing. +15 prestige, and a war.`
                : 'You refuse. They threaten war, but their sworn peace or other commitments hold them back. +15 prestige.',
          },
        },
      },
    ],
  }),
  defineEvent({
    id: 'liege_charges',
    title: 'Summoned to Answer Charges',
    icon: 'scheme',
    weight: 1.2,
    cooldown: 12,
    when: (s) => canAct(s) && !!hostileLiege(s) && hostages(s).length > 0,
    subject: (s) => {
      const k = hostileLiege(s);
      return k && freeHead(s, k);
    },
    setup: ({ subject, data }) => {
      data.clan = subject!.clanId;
    },
    text: ({ s, subject }) =>
      `Your liege, ${fullName(s, subject!)}, summons you to court to answer "certain charges". Nobody will say what they are. Everybody knows what happens to vassals who don't come.`,
    options: [
      {
        label: 'Answer the summons',
        then: {
          roll: { base: 0.25, per: { stat: 'dip', n: 0.03 } },
          pass: {
            do: [{ opinion: 10, clan: 'clan' }],
            text: 'You talk, they listen, and the charges quietly evaporate. You go home with your head and all of your family.',
          },
          fail: {
            do: [{ run: giveHostage, text: 'they keep one of your family as a hostage' }],
            text: (c) =>
              `The charges stick. You may go home, but ${c.vars.hostage ?? 'one of your family'} stays behind as a guarantee of your good behaviour.`,
          },
        },
      },
      {
        label: 'Offer a hostage of your own accord',
        then: {
          do: [
            { run: giveHostage, text: 'one of your family (your heir if possible) goes to their court as a hostage' },
            { remember: 'Gave us a hostage in good faith', clan: 'clan', value: 15, decay: 0.3 },
          ],
          text: (c) => `${c.vars.hostage ?? 'One of your family'} goes to your liege's court. It is called an honour. It is not.`,
        },
      },
      {
        label: 'Ignore the summons',
        then: {
          do: [
            { gain: 'prestige', n: 10 },
            {
              run: (c) => {
                c.vars.declared = aiDeclareWar(c.s, String(c.data.clan), 'feud', warTarget(c.s, c.s.clans[String(c.data.clan)])) ? 1 : 0;
              },
              text: (c) => (c.vars.declared ? 'your liege comes for you' : 'your liege cannot call the banners'),
            },
          ],
          text: (c) =>
            c.vars.declared
              ? 'You stay home. Your liege takes that as the answer it was, and calls the banners. +10 prestige.'
              : 'You stay home. Your liege threatens you, but sworn peace or other commitments hold back the fleet. +10 prestige.',
        },
      },
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
