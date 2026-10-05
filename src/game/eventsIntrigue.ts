// AI houses use the player's own toolkit on the player (ROADMAP 8.1; Fin:
// "AI characters should have the same freedom I have"): a lord who knows
// your secret blackmails you, a lustful lord seduces your spouse. The
// player answers with the same tools: pay, call the bluff, duel, or murder,
// with the same consequences as any other murder. Shuffled into the main
// deck in events.ts.

import { consumeHook, exposeSecret, hookBlocker, hooksOf, recordAffair, secretLabel, secretsKnownTo } from './secrets';
import { ageOf, alive, canAct, ch, clanRank, clanRegions, fullName, hasTrait, ruler } from './core';
import { defineEvent, type Ctx, type Outcome } from './dsl';
import { recordDeed } from './epithets';
import { pr, type EventDef } from './eventKit';
import { remember } from './memory';
import { addFeeling, attempted, murdered, opinionOf } from './relations';
import { pick } from './rng';
import type { Character, GameState } from './types';

/** Something the ruler would pay to keep quiet, if anything. */
export function secretOf(s: GameState): string | undefined {
  const secret = secretsKnownTo(s).find((x) => x.subjectId === s.rulerId && x.exposedYear === undefined);
  return secret ? secretLabel(s, secret) : undefined;
}

function aiHeads(s: GameState): Character[] {
  return Object.values(s.clans)
    .filter((k) => !k.isPlayer && clanRegions(s, k.id).length)
    .map((k) => s.characters[k.headId])
    .filter((h) => alive(h) && !h.prisonerOf && ageOf(s, h) >= 18);
}

/** Lords who'd stoop to blackmail you: greedy, deceitful or ambitious, and no friend of yours. */
function blackmailers(s: GameState): Character[] {
  return aiHeads(s).filter(
    (h) =>
      (hasTrait(h, 'greedy') || hasTrait(h, 'deceitful') || hasTrait(h, 'ambitious')) &&
      (s.clans[h.clanId]?.opinion ?? 0) <= -10 &&
      hooksOf(s, h.id).some((x) => x.targetId === s.rulerId),
  );
}

/** Lustful lords who might take up with the ruler's spouse. */
function seducers(s: GameState): Character[] {
  const sp = ch(s, ruler(s).spouseId);
  if (!alive(sp)) return [];
  return aiHeads(s).filter((h) => hasTrait(h, 'lustful') && h.gender !== sp.gender && ageOf(s, h) <= 60 && h.spouseId !== sp.id);
}

function unhappySpouse(s: GameState): Character | undefined {
  const r = ruler(s);
  const sp = ch(s, r.spouseId);
  return alive(sp) && ageOf(s, sp) >= 18 && !alive(ch(s, sp.loverId)) && opinionOf(s, sp, r) <= 20 ? sp : undefined;
}

/** The subject is murdered on your orders. Nobody can prove it, but their family suspects you. */
function killed(cause: string): Outcome {
  return {
    do: [
      { kill: 'subject', cause },
      {
        run: (c: Ctx) => {
          recordDeed(c.s, c.r, 'assassinations');
          recordDeed(c.s, c.r, 'cruelty');
          murdered(c.s, c.subject!, c.r.id, false);
          remember(c.s, c.subject!.clanId, `Suspected of murdering ${c.subject!.name}`, -25, 0.03);
        },
        text: 'their family suspects you',
      },
    ],
  };
}

/** A failed murder: the target survives and their house knows who sent the assassin. */
const caughtOut: Outcome['do'] = [
  {
    run: (c: Ctx) => {
      remember(c.s, c.subject!.clanId, `Sent an assassin after ${c.subject!.name}`, -45, undefined, true);
      attempted(c.s, c.subject!, c.r.id);
    },
    text: 'their house learns you sent an assassin',
  },
];

export const INTRIGUE_EVENTS: EventDef[] = [
  defineEvent({
    id: 'blackmail_letter',
    title: 'A Blackmail Letter',
    icon: 'scheme',
    weight: 1.5,
    cooldown: 10,
    when: (s) => canAct(s) && !!secretOf(s) && blackmailers(s).length > 0,
    subject: (s) => {
      const pool = blackmailers(s);
      return pool.length ? pick(s, pool) : undefined;
    },
    setup: ({ s, subject, data }) => {
      data.clan = subject!.clanId;
      data.amount = 100 + clanRank(s, subject!.clanId) * 50;
      const hook = hooksOf(s, subject!.id).find((x) => x.targetId === s.rulerId)!;
      data.hookId = hook.id;
      data.secretId = hook.secretId;
      data.secret = secretLabel(
        s,
        s.secrets.find((x) => x.id === hook.secretId)!,
        subject!.id,
      );
    },
    text: ({ s, subject, data }) =>
      `A sealed letter from ${fullName(s, subject!)}: ${pr(subject).he} knows about ${data.secret}, and ${data.amount} credits will keep ${pr(subject).him} quiet.`,
    options: [
      {
        label: 'Pay them',
        needs: [
          { have: 'credits', n: 'amount' },
          {
            test: (c) =>
              !!c.subject && !hookBlocker(c.s, String(c.data.hookId), c.subject.id) && c.s.hooks.some((x) => x.id === c.data.hookId && x.targetId === c.r.id),
            why: 'This demand no longer has usable evidence.',
          },
        ],
        then: {
          do: [
            {
              run: (c) => {
                if (!consumeHook(c.s, String(c.data.hookId), c.subject!.id)) return;
                const amount = Number(c.data.amount);
                c.s.credits -= amount;
                c.s.clans[String(c.data.clan)].credits += amount;
                recordDeed(c.s, c.subject!, 'blackmails');
              },
              text: (c) => `-${c.data.amount} credits; their hook is spent`,
            },
          ],
          text: (c) => `You pay. ${c.subject!.name} smiles, but this piece of evidence cannot buy a second favour.`,
        },
      },
      {
        label: 'Call their bluff',
        then: {
          roll: { base: 0.4, per: { stat: 'int', n: 0.04 } },
          pass: {
            do: [
              { gain: 'prestige', n: 10 },
              {
                run: (c) => {
                  consumeHook(c.s, String(c.data.hookId), c.subject!.id);
                },
                text: 'their hook is spent',
              },
            ],
            text: "You laugh in their envoy's face. Nothing is ever printed. +10 prestige.",
          },
          fail: {
            do: [
              {
                run: (c) => {
                  exposeSecret(c.s, String(c.data.secretId), c.subject!.id);
                },
                text: 'they publish the evidence; prestige and family relationships suffer',
              },
            ],
            text: (c) => `It was not a bluff. Every newsfeed in the system is talking about ${c.data.secret}. All hooks on this secret are worthless now.`,
          },
        },
      },
      {
        label: 'Have them silenced',
        then: {
          roll: { base: 0.35, per: { stat: 'int', n: 0.05 } },
          pass: killed('silenced'),
          fail: {
            do: [...caughtOut!, { lose: 'prestige', n: 20 }],
            text: 'Your assassin is caught. They still hold the evidence, and your attack has made a bitter enemy. -20 prestige.',
          },
          text: (c) => `${c.subject!.name} has a fatal accident on the way to the printers.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'seducer',
    title: 'A Rival in Your Bed',
    icon: 'heart',
    weight: 1.2,
    cooldown: 12,
    when: (s) => canAct(s) && !!unhappySpouse(s) && seducers(s).length > 0,
    subject: (s) => {
      const pool = unhappySpouse(s) ? seducers(s) : [];
      return pool.length ? pick(s, pool) : undefined;
    },
    setup: ({ s, r, subject, data }) => {
      // The affair has happened: they take up with each other, and you know.
      const sp = ch(s, r.spouseId)!;
      sp.loverId = subject!.id;
      subject!.loverId = sp.id;
      recordAffair(s, sp, subject!, [r.id]);
      data.clan = subject!.clanId;
      addFeeling(s, r.id, sp.id, { why: 'Betrayed me', value: -30, decay: 1, key: 'betrayed' });
      addFeeling(s, r.id, subject!.id, { why: 'Seduced my spouse', value: -50, decay: 0.5, key: 'seduced' });
    },
    text: ({ s, r, subject }) => `${ch(s, r.spouseId)?.name ?? 'Your spouse'} has been seen leaving ${fullName(s, subject!)}'s private yacht at dawn. Twice.`,
    options: [
      {
        label: 'Challenge them to a duel',
        then: {
          roll: { base: 0.4, per: { stat: 'cmd', n: 0.04 } },
          pass: {
            do: [
              { trait: 'wounded', to: 'subject' },
              { gain: 'prestige', n: 20 },
              { run: (c) => endSpouseAffair(c), text: 'the affair ends' },
            ],
            text: (c) => `You leave ${c.subject!.name} bleeding on the duelling deck. The affair ends that night. +20 prestige.`,
          },
          fail: {
            do: [{ trait: 'wounded' }, { lose: 'prestige', n: 15 }],
            text: 'You lose the duel, and the affair goes on. -15 prestige.',
          },
        },
      },
      {
        label: 'Have them quietly killed',
        then: {
          roll: { base: 0.35, per: { stat: 'int', n: 0.05 } },
          pass: killed('found floating in their own pool'),
          fail: {
            do: caughtOut,
            text: (c) => `${c.subject!.name} survives, and now the whole system knows why you wanted ${pr(c.subject).him} dead.`,
          },
          text: (c) => `${c.subject!.name} is found floating in ${pr(c.subject).his} own pool. Such a tragedy.`,
        },
      },
      {
        label: 'Forgive your spouse',
        then: {
          do: [
            { run: (c) => endSpouseAffair(c), text: 'the affair ends' },
            { feel: 25, from: 'spouse', why: 'Forgave me' },
          ],
          text: 'A long, painful talk. The affair ends, and something between you begins again.',
        },
      },
    ],
  }),
];

function endSpouseAffair(c: Ctx): void {
  const sp = ch(c.s, c.r.spouseId);
  if (!sp) return;
  const lover = ch(c.s, sp.loverId);
  if (lover?.loverId === sp.id) lover.loverId = undefined;
  sp.loverId = undefined;
}
