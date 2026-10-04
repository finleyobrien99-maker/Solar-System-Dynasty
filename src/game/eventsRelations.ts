// The relationships deck (ROADMAP 1.1, ticket 9): romance, friendship,
// rivalry and family drama, built on relations.ts. These events react to how
// people feel and change it, which is how friendships and rivalries form
// (deep dives §C: a friend needs high opinion plus an interaction, a rival
// low opinion plus a conflict). Shuffled into the main deck in events.ts.

import { createCharacter } from './character';
import { ageOf, alive, canAct, ch, childrenOf, effStats, fullName, ruler } from './core';
import { defineEvent, type Ctx } from './dsl';
import { named } from './eventBits';
import { pr, rivalClan, type EventDef } from './eventKit';
import { endAffair } from './family';
import { opinionOf, relationOf } from './relations';
import { int, pick } from './rng';
import { STAT_NAMES, TRAITS } from './traits';
import { STAT_KEYS, type Character, type GameState, type StatKey } from './types';

// ── Who the events are about (cheap: stored relations and close family only)

function spouseOf(s: GameState): Character | undefined {
  const sp = ch(s, ruler(s).spouseId);
  return alive(sp) ? sp : undefined;
}

/** Living people with a stored history toward the ruler. */
function withHistory(s: GameState): Character[] {
  const out: Character[] = [];
  for (const [id, row] of Object.entries(s.relations)) {
    if (!row[s.rulerId] || id === s.rulerId) continue;
    const c = s.characters[id];
    if (alive(c)) out.push(c);
  }
  return out;
}

/** The ruler's friends, either way round. */
function friendsOf(s: GameState): Character[] {
  const out = new Map<string, Character>();
  for (const c of withHistory(s)) if (relationOf(s, c.id, s.rulerId)?.kind === 'friend') out.set(c.id, c);
  for (const [id, rel] of Object.entries(s.relations[s.rulerId] ?? {})) {
    const c = s.characters[id];
    if (rel.kind === 'friend' && alive(c)) out.set(id, c);
  }
  return [...out.values()];
}

function ownKids(s: GameState, lo: number, hi: number): Character[] {
  return childrenOf(s, ruler(s)).filter((c) => alive(c) && c.clanId === s.playerClanId && ageOf(s, c) >= lo && ageOf(s, c) <= hi);
}

function adults(s: GameState, cs: Character[]): Character[] {
  return cs.filter((c) => ageOf(s, c) >= 16);
}

function sharesPersonality(a: Character, b: Character): string | undefined {
  return a.traits.find((t) => TRAITS[t]?.cat === 'personality' && b.traits.includes(t));
}

/** Heads of other houses who share a trait with the ruler and don't know them yet. */
function kindredSpirits(s: GameState): Character[] {
  const r = ruler(s);
  return Object.values(s.clans)
    .filter((k) => !k.isPlayer)
    .map((k) => s.characters[k.headId])
    .filter((h) => alive(h) && h.id !== r.id && !!sharesPersonality(h, r) && !relationOf(s, r.id, h.id));
}

function bestStat(s: GameState, w: Character): StatKey {
  const st = effStats(s, w);
  return STAT_KEYS.reduce((a, b) => (st[b] > st[a] ? b : a));
}

/** The two quarrelling children, eldest first. */
function byAge(c: Ctx): Character[] {
  return [c.s.characters[String(c.data.a)], c.s.characters[String(c.data.b)]].sort((x, y) => x.born - y.born);
}

// ── The deck ──────────────────────────────────────────────────────────────

export const RELATION_EVENTS: EventDef[] = [
  // ── Romance and marriage
  defineEvent({
    id: 'cold_marriage',
    title: 'A Cold Marriage',
    icon: 'heart',
    weight: 1.5,
    cooldown: 10,
    when: (s) => {
      const sp = spouseOf(s);
      return canAct(s) && !!sp && opinionOf(s, sp, ruler(s)) <= -20;
    },
    subject: spouseOf,
    text: ({ subject }) => `${subject!.name} has moved into the east wing and now speaks to you only through the steward.`,
    options: [
      {
        label: 'A grand gesture',
        needs: [{ have: 'credits', n: 100 }],
        then: {
          do: [
            { lose: 'credits', n: 100 },
            { feel: 25, from: 'subject', why: 'A grand gesture', key: 'gesture' },
          ],
          text: (c) => `A ring of Jovian amber and a string quartet under the window. ${c.subject!.name} pretends not to be impressed, and fails.`,
        },
      },
      {
        label: 'See the marriage seers',
        needs: [{ have: 'faith', n: 30 }],
        then: {
          do: [{ lose: 'faith', n: 30 }],
          roll: { base: 0.3, per: { stat: 'dip', n: 0.05 } },
          pass: { do: [{ feel: 30, from: 'subject', why: 'Worked on our marriage' }], text: 'Three long sessions, two shouting matches, one breakthrough.' },
          fail: { text: 'The seers recommend separate wings. You already have those.' },
        },
      },
      {
        label: 'Let them sulk',
        then: { do: [{ feel: -10, from: 'subject', why: 'Left me to sulk' }], text: 'The east wing gets colder.' },
      },
    ],
  }),
  defineEvent({
    id: 'jealous_spouse',
    title: 'Letters in a Drawer',
    icon: 'heart',
    weight: 2,
    cooldown: 8,
    when: (s) => {
      const sp = spouseOf(s);
      return canAct(s) && !!sp && alive(ch(s, ruler(s).loverId)) && !!relationOf(s, sp.id, s.rulerId)?.feelings.some((f) => f.key === 'lover');
    },
    subject: spouseOf,
    text: ({ s, r, subject }) => `${subject!.name} has found your letters from ${ch(s, r.loverId)!.name}. There is a smashed vase, and a very long silence.`,
    options: [
      {
        label: 'End the affair',
        then: {
          do: [
            { run: (c) => endAffair(c.s), text: (c) => `you end things with ${ch(c.s, c.r.loverId)?.name ?? 'your lover'}` },
            { forgive: 'lover', from: 'subject' },
            { feel: 20, from: 'subject', why: 'Ended the affair' },
          ],
          text: (c) => `It is over. ${c.subject!.name} says nothing, but leaves the east wing door unlocked.`,
        },
      },
      {
        label: 'Deny everything',
        then: {
          roll: { base: 0.3, per: { stat: 'int', n: 0.05 } },
          pass: { do: [{ forgive: 'lover', from: 'subject' }], text: 'Forgeries, you say, planted by your enemies. They half believe you.' },
          fail: { do: [{ feel: -20, from: 'subject', why: 'Lied to my face' }], text: 'Nobody believes a word, least of all you.' },
        },
      },
      {
        label: 'Flaunt it',
        then: {
          do: [
            { lose: 'prestige', n: 15 },
            { feel: -30, from: 'subject', why: 'Flaunted a lover' },
          ],
          text: 'You take your lover to the opera, in the royal box. The court talks of nothing else.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'anniversary',
    title: 'An Anniversary',
    icon: 'gala',
    weight: 1,
    cooldown: 10,
    when: (s) => {
      const sp = spouseOf(s);
      return canAct(s) && !!sp && opinionOf(s, sp, ruler(s)) >= 30 && opinionOf(s, ruler(s), sp) >= 10;
    },
    subject: spouseOf,
    text: ({ subject }) => `Another year married to ${subject!.name}. The court expects you to mark it.`,
    options: [
      {
        label: 'A ball in their honour',
        needs: [{ have: 'credits', n: 80 }],
        then: {
          do: [
            { lose: 'credits', n: 80 },
            { gain: 'prestige', n: 10 },
            { feel: 15, from: 'subject', why: 'Our anniversary ball', key: 'anniversary' },
          ],
          text: (c) => `Chandeliers, a forty-piece orchestra and ${c.subject!.name} glowing at the centre of it all. +10 prestige.`,
        },
      },
      {
        label: 'A quiet dinner for two',
        then: {
          do: [
            { feel: 10, from: 'subject', why: 'A quiet anniversary', key: 'anniversary' },
            { feel: 10, from: 'root', to: 'subject', why: 'A quiet anniversary', key: 'anniversary' },
            { health: 3 },
          ],
          text: 'Candlelight, old jokes and nobody from the council. Bliss.',
        },
      },
      {
        label: 'Forget the date',
        then: { do: [{ feel: -15, from: 'subject', why: 'Forgot our anniversary' }], text: 'You remember at breakfast the next day. So does everyone else.' },
      },
    ],
  }),
  defineEvent({
    id: 'crush',
    title: 'First Love',
    icon: 'heart',
    weight: 1.2,
    cooldown: 12,
    subject: (s) => {
      const pool = ownKids(s, 14, 19).filter((c) => !c.spouseId && !c.betrothedId);
      return pool.length ? pick(s, pool) : undefined;
    },
    setup: ({ s, subject, data }) => {
      const kid = subject!;
      const k = rivalClan(s) ?? Object.values(s.clans).find((x) => !x.isPlayer)!;
      const crush = createCharacter(s, {
        gender: kid.gender === 'M' ? 'F' : 'M',
        born: s.year - Math.max(14, ageOf(s, kid) + int(s, -2, 2)),
        clanId: k.id,
        planetId: k.planetId,
        faithId: k.faithId,
      });
      data.crush = crush.id;
    },
    text: ({ s, subject, data }) => {
      const crush = s.characters[String(data.crush)];
      return `${subject!.name} has been mooning about the gardens for weeks. The servants say it is ${fullName(s, crush)}, whom ${pr(subject).he} met at the last gala.`;
    },
    options: [
      {
        label: 'Invite their family to court',
        needs: [{ have: 'credits', n: 50 }],
        then: {
          do: [
            { lose: 'credits', n: 50 },
            { feel: 15, from: 'subject', why: 'Invited my sweetheart' },
            { feel: 25, from: 'subject', to: 'crush', why: 'First love', decay: 0.5 },
            { feel: 15, from: 'crush', to: 'subject', why: 'A summer at court', decay: 0.5 },
          ],
          text: (c) => `A long summer of picnics and chaperones. ${c.subject!.name} has never been happier.`,
        },
      },
      {
        label: 'Forbid it',
        then: { do: [{ feel: -20, from: 'subject', why: 'Forbade my first love' }], text: (c) => `${c.subject!.name} slams every door in the palace.` },
      },
      {
        label: 'Tease them mercilessly',
        then: {
          do: [
            { feel: -5, from: 'subject', why: 'Teased me' },
            { trait: 'shy', to: 'subject', p: 0.3, say: 'grows up' },
          ],
          text: (c) => `You hum wedding marches whenever ${c.subject!.name} walks in. Hilarious, for you.`,
        },
      },
    ],
  }),

  // ── Friendship
  defineEvent({
    id: 'kindred_spirit',
    title: 'A Kindred Spirit',
    icon: 'gala',
    weight: 1.2,
    cooldown: 12,
    when: (s) => canAct(s) && kindredSpirits(s).length > 0,
    subject: (s) => {
      const pool = kindredSpirits(s);
      return pool.length ? pick(s, pool) : undefined;
    },
    setup: ({ subject, data }) => {
      data.clan = subject!.clanId;
    },
    text: ({ s, r, subject }) => {
      const t = TRAITS[sharesPersonality(subject!, r)!];
      return `At the Saturnine regatta you fall into easy conversation with ${fullName(s, subject!)}. It turns out you are both ${t.name}, and you talk until the lanterns go out.`;
    },
    options: [
      {
        label: 'Share a bottle of Martian red',
        then: {
          do: [
            { feel: 60, from: 'subject', why: 'Kindred spirits', decay: 0.5 },
            { feel: 60, from: 'root', to: 'subject', why: 'Kindred spirits', decay: 0.5 },
            {
              run: (c) => {
                relationOf(c.s, c.subject!.id, c.r.id, true)!.together = c.s.year;
                relationOf(c.s, c.r.id, c.subject!.id, true)!.together = c.s.year;
              },
              text: '',
            },
            { opinion: 10, clan: 'clan', max: 100 },
          ],
          text: (c) => `One bottle becomes three. By dawn you and ${c.subject!.name} are firm friends.`,
        },
      },
      {
        label: 'Talk alliances and trade',
        then: {
          do: [
            { opinion: 15, clan: 'clan', max: 100 },
            { feel: 10, from: 'subject', why: 'Good company' },
          ],
          text: 'Pleasant, useful and very slightly dull.',
        },
      },
      { label: 'Keep your distance', then: { text: 'A ruler has no friends, only interests. Probably.' } },
    ],
  }),
  defineEvent({
    id: 'friend_favour',
    title: 'A Friend in Need',
    icon: 'eco',
    weight: 1.5,
    cooldown: 10,
    when: (s) => canAct(s) && friendsOf(s).length > 0,
    subject: (s) => {
      const pool = friendsOf(s);
      return pool.length ? pick(s, pool) : undefined;
    },
    text: ({ subject }) => `${subject!.name} is in debt to a Cererian loan-shark and asks you, a little shamefaced, for 100 credits.`,
    options: [
      {
        label: 'Lend it gladly',
        needs: [{ have: 'credits', n: 100 }],
        then: {
          do: [
            { lose: 'credits', n: 100 },
            { feel: 20, from: 'subject', why: 'Lent me money when I needed it' },
          ],
          text: (c) => `${c.subject!.name} hugs you so hard your medals rattle.`,
        },
      },
      {
        label: 'Pay the loan-shark a visit',
        then: {
          roll: { base: 0.4, per: { stat: 'cmd', n: 0.04 } },
          pass: {
            do: [
              { feel: 25, from: 'subject', why: 'Faced down my creditors' },
              { gain: 'prestige', n: 5 },
            ],
            text: 'You and four marines explain the meaning of "debt forgiven". He understands.',
          },
          fail: { do: [{ trait: 'wounded' }], text: 'The loan-shark has bigger marines.' },
        },
      },
      {
        label: 'Refuse',
        then: {
          do: [{ feel: -25, from: 'subject', why: 'Refused me when I needed it' }],
          text: (c) => `${c.subject!.name} says they understand. They do not.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'friend_counsel',
    title: "A Friend's Counsel",
    icon: 'study',
    weight: 1.2,
    cooldown: 8,
    when: (s) => canAct(s) && adults(s, friendsOf(s)).length > 0,
    subject: (s) => {
      const pool = adults(s, friendsOf(s));
      return pool.length ? pick(s, pool) : undefined;
    },
    text: (c) => `Over a late game of void-chess, ${c.subject!.name} offers some hard-won advice about ${STAT_NAMES[bestStat(c.s, c.subject!)].toLowerCase()}.`,
    options: [
      {
        label: 'Take it to heart',
        then: {
          do: [
            {
              run: (c) => {
                c.r.base[bestStat(c.s, c.subject!)] += 1;
              },
              text: (c) => `+1 ${STAT_NAMES[bestStat(c.s, c.subject!)]}`,
            },
            { feel: 5, from: 'subject', why: 'Listened to my advice' },
          ],
          text: 'It is good advice. Annoyingly good.',
        },
      },
      {
        label: 'Wave it away',
        then: { do: [{ feel: -10, from: 'subject', why: 'Ignored my advice' }], text: (c) => `${c.subject!.name} shrugs and takes your queen.` },
      },
    ],
  }),

  // ── Rivalry
  defineEvent({
    id: 'gala_mockery',
    title: 'Mocked at the Gala',
    icon: 'gala',
    weight: 1.5,
    cooldown: 8,
    when: (s) => canAct(s) && adults(s, withHistory(s)).some((c) => c.id !== s.characters[s.rulerId].spouseId && opinionOf(s, c, ruler(s)) <= -40),
    subject: (s) => {
      const pool = adults(s, withHistory(s)).filter((c) => c.id !== ruler(s).spouseId && opinionOf(s, c, ruler(s)) <= -40);
      return pool.length ? pick(s, pool) : undefined;
    },
    text: ({ s, r, subject }) =>
      `At the Governors' gala ${fullName(s, subject!)} raises a glass "to ${r.name}, who has never once been right", and half the room laughs.`,
    options: [
      {
        label: 'Answer with wit',
        then: {
          roll: { base: 0.35, per: { stat: 'dip', n: 0.04 } },
          pass: {
            do: [
              { gain: 'prestige', n: 15 },
              { feel: -10, from: 'subject', why: 'Bested me in public' },
            ],
            text: 'Your reply is quoted in every newsfeed by morning. +15 prestige.',
          },
          fail: { do: [{ lose: 'prestige', n: 15 }], text: 'You stammer. They smirk. -15 prestige.' },
        },
      },
      {
        label: 'Challenge them to a duel',
        then: {
          roll: { base: 0.4, per: { stat: 'cmd', n: 0.04 } },
          pass: {
            do: [
              { gain: 'prestige', n: 25 },
              { trait: 'wounded', to: 'subject' },
              { feel: -15, from: 'subject', why: 'Cut me in a duel' },
            ],
            text: (c) => `${c.subject!.name} leaves the gala with your saber's mark on ${pr(c.subject).his} cheek. +25 prestige.`,
          },
          fail: {
            do: [{ trait: 'wounded' }, { lose: 'prestige', n: 10 }],
            text: 'You leave the gala bleeding, and the joke is now on you. -10 prestige.',
          },
        },
      },
      {
        label: 'Smile and say nothing',
        then: {
          do: [
            { lose: 'prestige', n: 5 },
            { trait: 'calm', p: 0.3, say: 'becomes' },
          ],
          text: 'You let it pass. It stings, but it passes.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'envoy_slight',
    title: 'An Insult to Your House',
    icon: 'war',
    weight: 1.2,
    cooldown: 12,
    when: (s) => canAct(s) && Object.values(s.clans).some((k) => !k.isPlayer),
    subject: (s) => {
      const k = rivalClan(s);
      const head = k && ch(s, k.headId);
      return alive(head) ? head : undefined;
    },
    setup: ({ subject, data }) => {
      data.clan = subject!.clanId;
    },
    text: ({ s, subject }) =>
      `${fullName(s, subject!)} calls your house "a family of jumped-up dock-wardens" in front of half the system's envoys. It is in every newsfeed by morning.`,
    options: [
      {
        label: 'Demand a public apology',
        then: {
          do: [{ feel: -40, from: 'root', to: 'subject', why: 'Insulted my house' }],
          roll: { base: 0.3, per: { stat: 'dip', n: 0.05 } },
          pass: {
            do: [
              { gain: 'prestige', n: 15 },
              { feel: -10, from: 'subject', why: 'Forced me to apologise' },
            ],
            text: 'The apology is grovelling, public and very satisfying. +15 prestige.',
          },
          fail: {
            do: [
              { lose: 'prestige', n: 10 },
              { feel: -20, from: 'subject', why: 'Demanded an apology' },
            ],
            text: 'They refuse, loudly. Now it is a feud. -10 prestige.',
          },
        },
      },
      {
        label: 'Return the insult with interest',
        then: {
          do: [
            { feel: -40, from: 'root', to: 'subject', why: 'Insulted my house' },
            { feel: -30, from: 'subject', why: 'Insulted my house' },
            { gain: 'prestige', n: 10 },
            { opinion: -15, clan: 'clan' },
          ],
          text: 'Your reply involves their grandmother, a mining drone and a choir. The system is delighted. +10 prestige.',
        },
      },
      {
        label: 'Laugh it off',
        then: {
          do: [
            { lose: 'prestige', n: 5 },
            { feel: 5, from: 'subject', why: 'Took it well' },
          ],
          text: 'You laugh loudest of all. Some call it grace; some call it weakness.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'nemesis_strikes',
    title: 'Blood for Blood',
    icon: 'death',
    weight: 2,
    cooldown: 10,
    when: (s) =>
      canAct(s) && adults(s, withHistory(s)).some((c) => relationOf(s, c.id, s.rulerId)!.feelings.some((f) => f.grave) && opinionOf(s, c, ruler(s)) <= -60),
    subject: (s) => {
      const pool = adults(s, withHistory(s)).filter((c) => relationOf(s, c.id, s.rulerId)!.feelings.some((f) => f.grave) && opinionOf(s, c, ruler(s)) <= -60);
      return pool.length ? pick(s, pool) : undefined;
    },
    text: ({ s, subject }) =>
      `A poisoned dart misses your throat by a finger's width. The assassin dies before talking, but the dart bears the mark of ${fullName(s, subject!)}'s household.`,
    options: [
      {
        label: 'Hunt them down',
        then: {
          roll: { base: 0.3, per: { stat: 'int', n: 0.05 } },
          pass: {
            do: [
              { kill: 'subject', cause: 'hunted down for attempted murder' },
              { gain: 'prestige', n: 20 },
            ],
            text: (c) => `Your agents find ${c.subject!.name} within the month. It ends there. +20 prestige.`,
          },
          fail: {
            do: [
              { feel: -20, from: 'subject', why: 'Hunted me like an animal' },
              { trait: 'paranoid', p: 0.5, say: 'becomes' },
            ],
            text: 'They slip away, and now they know you are coming.',
          },
        },
      },
      {
        label: 'Offer blood money',
        needs: [{ have: 'credits', n: 200 }],
        then: {
          do: [
            { lose: 'credits', n: 200 },
            { feel: 40, from: 'subject', why: 'Paid blood money', decay: 0.5 },
          ],
          text: 'A great deal of money changes hands. It does not bring anyone back, but it helps.',
        },
      },
      {
        label: 'Double your guard',
        needs: [{ have: 'credits', n: 60 }],
        then: {
          do: [
            { lose: 'credits', n: 60 },
            { trait: 'paranoid', p: 0.4, say: 'becomes' },
          ],
          text: 'Marines at every door, tasters at every meal. You sleep badly but you sleep.',
        },
      },
    ],
  }),

  // ── Family
  defineEvent({
    id: 'resentful_child',
    title: 'A Resentful Child',
    icon: 'family',
    weight: 2,
    cooldown: 6,
    when: (s) => canAct(s) && ownKids(s, 8, 30).some((k) => opinionOf(s, k, ruler(s)) <= -15),
    subject: (s) => {
      const pool = ownKids(s, 8, 30).filter((k) => opinionOf(s, k, ruler(s)) <= -15);
      return pool.length ? pick(s, pool) : undefined;
    },
    text: ({ subject }) => `${subject!.name} refuses to come to dinner again. "Why would I? You never come to anything of mine."`,
    options: [
      {
        label: 'Ask what is wrong',
        then: {
          roll: { base: 0.4, per: { stat: 'dip', n: 0.04 } },
          pass: {
            do: [
              { forgive: 'neglect', from: 'subject' },
              { feel: 15, from: 'subject', why: 'Listened to me' },
            ],
            text: (c) => `It all comes out, years of it. By midnight ${c.subject!.name} is laughing at your terrible jokes again.`,
          },
          fail: { do: [{ feel: -5, from: 'subject', why: 'Did not really listen' }], text: 'You say all the wrong things, in the wrong order.' },
        },
      },
      {
        label: 'Buy their affection',
        needs: [{ have: 'credits', n: 60 }],
        then: {
          do: [
            { lose: 'credits', n: 60 },
            { feel: 15, from: 'subject', why: 'Bought me things', decay: 2 },
          ],
          text: (c) => `A racing skiff with ${c.subject!.name}'s name on the hull. It works, for now.`,
        },
      },
      {
        label: 'Discipline them',
        then: {
          do: [
            { feel: -15, from: 'subject', why: 'Punished me' },
            { trait: 'wrathful', to: 'subject', p: 0.3 },
          ],
          text: (c) => `${c.subject!.name} spends a week confined to quarters, and a lifetime remembering it.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'child_drawing',
    title: 'A Gift from a Child',
    icon: 'family',
    weight: 1.2,
    cooldown: 8,
    when: (s) => canAct(s) && ownKids(s, 4, 9).some((k) => opinionOf(s, k, ruler(s)) >= 15),
    subject: (s) => {
      const pool = ownKids(s, 4, 9).filter((k) => opinionOf(s, k, ruler(s)) >= 15);
      return pool.length ? pick(s, pool) : undefined;
    },
    text: ({ subject }) => `${subject!.name} hands you a drawing: you, a warship, and something that is either a dog or a reactor fire.`,
    options: [
      {
        label: 'Hang it in the throne room',
        then: {
          do: [
            { lose: 'prestige', n: 5 },
            { feel: 20, from: 'subject', why: 'Hung my drawing in the throne room' },
            { trait: 'kind', to: 'subject', p: 0.2, say: 'grows up' },
          ],
          text: 'Visiting envoys are baffled. You could not be prouder.',
        },
      },
      {
        label: 'Keep it in your desk',
        then: { do: [{ feel: 10, from: 'subject', why: 'Kept my drawing' }], text: 'You look at it more often than you will admit.' },
      },
      {
        label: 'You are too busy',
        then: { do: [{ feel: -15, from: 'subject', why: 'Too busy for me' }], text: (c) => `${c.subject!.name} puts the drawing in the recycler.` },
      },
    ],
  }),
  defineEvent({
    id: 'sibling_war',
    title: 'Siblings at War',
    icon: 'family',
    weight: 1.2,
    cooldown: 10,
    when: (s) => {
      const kids = ownKids(s, 10, 40);
      return canAct(s) && kids.some((a) => kids.some((b) => a.id !== b.id && opinionOf(s, a, b) <= 5));
    },
    setup: ({ s, data }) => {
      const kids = ownKids(s, 10, 40);
      const pairs = kids.flatMap((a) => kids.filter((b) => a.id !== b.id && opinionOf(s, a, b) <= 5).map((b) => [a, b] as const));
      const [a, b] = pick(s, pairs);
      data.a = a.id;
      data.b = b.id;
    },
    text: ({ s, data }) =>
      `${s.characters[String(data.a)].name} and ${s.characters[String(data.b)].name} have not spoken in a month, and now there has been a fistfight in the chapel.`,
    options: [
      {
        label: 'Sit them down together',
        then: {
          roll: { base: 0.35, per: { stat: 'dip', n: 0.05 } },
          pass: {
            do: [
              { feel: 20, from: 'a', to: 'b', why: 'Made peace', decay: 0.5 },
              { feel: 20, from: 'b', to: 'a', why: 'Made peace', decay: 0.5 },
            ],
            text: 'Tears, a handshake, and eventually a hug. Mostly sincere.',
          },
          fail: {
            do: [
              { feel: -10, from: 'a', to: 'b', why: 'Would not apologise' },
              { feel: -10, from: 'b', to: 'a', why: 'Would not apologise' },
            ],
            text: 'The meeting ends with a thrown teapot.',
          },
        },
      },
      {
        label: 'Side with the elder',
        then: {
          do: [
            { pick: 'elder', get: (c) => byAge(c)[0], text: (c) => byAge(c)[0].name },
            { pick: 'younger', get: (c) => byAge(c)[1], text: (c) => byAge(c)[1].name },
            { feel: 10, from: 'elder', why: 'Took my side' },
            { feel: -20, from: 'younger', why: 'Took their side' },
            { feel: -15, from: 'younger', to: 'elder', why: 'Got me in trouble' },
          ],
          text: (c) => `${named(c, 'elder')} smirks. ${named(c, 'younger')} will not forget it.`,
        },
      },
      {
        label: 'Let them fight it out',
        then: {
          do: [
            { feel: -20, from: 'a', to: 'b', why: 'Bloodied my nose' },
            { feel: -20, from: 'b', to: 'a', why: 'Bloodied my nose' },
            { trait: 'brave', to: 'a', p: 0.3, say: 'grows up' },
          ],
          text: 'Two black eyes, one chipped tooth and no winner.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'passed_over_demands',
    title: 'The Passed-Over Heir',
    icon: 'crown',
    weight: 2,
    cooldown: 8,
    when: (s) => canAct(s) && adults(s, withHistory(s)).some((c) => relationOf(s, c.id, s.rulerId)!.feelings.some((f) => f.key === 'passed_over')),
    subject: (s) => {
      const pool = adults(s, withHistory(s)).filter((c) => relationOf(s, c.id, s.rulerId)!.feelings.some((f) => f.key === 'passed_over'));
      return pool.length ? pick(s, pool) : undefined;
    },
    text: ({ subject }) => `${subject!.name} has not forgotten being passed over as heir, and today says so in front of the whole court.`,
    options: [
      {
        label: 'Grant them a stipend',
        needs: [{ have: 'credits', n: 150 }],
        then: {
          do: [
            { lose: 'credits', n: 150 },
            { forgive: 'passed_over', from: 'subject' },
            { feel: 10, from: 'subject', why: 'Gave me a stipend' },
          ],
          text: (c) => `A generous income and a seat at the high table. ${c.subject!.name} lets it go.`,
        },
      },
      {
        label: 'Apologise',
        then: {
          do: [
            { lose: 'prestige', n: 10 },
            { feel: 15, from: 'subject', why: 'Apologised' },
          ],
          text: 'You admit it was hard on them. The court is surprised; so are they.',
        },
      },
      {
        label: 'Remind them of their place',
        then: {
          do: [
            { feel: -20, from: 'subject', why: 'Humiliated me before the court' },
            { trait: 'ambitious', to: 'subject', p: 0.4 },
          ],
          text: (c) => `${c.subject!.name} bows, very low, and says nothing at all.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'olive_branch',
    title: 'An Olive Branch',
    icon: 'peace',
    weight: 1.5,
    cooldown: 8,
    when: (s) =>
      canAct(s) &&
      adults(s, withHistory(s)).some((c) => {
        const op = opinionOf(s, c, ruler(s));
        return op <= -15 && op >= -60 && !relationOf(s, c.id, s.rulerId)!.feelings.some((f) => f.grave);
      }),
    subject: (s) => {
      const pool = adults(s, withHistory(s)).filter((c) => {
        const op = opinionOf(s, c, ruler(s));
        return op <= -15 && op >= -60 && !relationOf(s, c.id, s.rulerId)!.feelings.some((f) => f.grave);
      });
      return pool.length ? pick(s, pool) : undefined;
    },
    text: ({ subject }) => `${subject!.name} arrives with an old bottle of Venusian brandy and an awkward speech. "Shall we bury this?"`,
    options: [
      {
        label: 'Accept graciously',
        then: {
          do: [
            { feel: 30, from: 'subject', why: 'Made peace', decay: 0.5 },
            { feel: 10, from: 'root', to: 'subject', why: 'Made peace', decay: 0.5 },
          ],
          text: 'The brandy is excellent. So, it turns out, is the company.',
        },
      },
      {
        label: 'Make them grovel first',
        then: {
          do: [
            { gain: 'prestige', n: 10 },
            { feel: 10, from: 'subject', why: 'Made peace, grudgingly' },
          ],
          text: 'They grovel. You enjoy it rather too much. +10 prestige.',
        },
      },
      {
        label: 'Send them away',
        then: { do: [{ feel: -10, from: 'subject', why: 'Rejected my apology' }], text: 'You keep the brandy and close the door.' },
      },
    ],
  }),
];
