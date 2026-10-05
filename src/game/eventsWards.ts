// Wards and mentors in play (wave 2, WAVE-2-WARDS.md): children come home
// changed, mentors finish their work, letters arrive from foster courts,
// other houses offer to raise your children or ask you to raise theirs, and a
// war turns a ward into a hostage. The rules live in wards.ts; these events
// are where you answer for them. Shuffled into the main deck in events.ts.

import { aiAmbition } from './aiAmbition';
import { ageOf, alive, canAct, ch, childrenOf, clanRegions, fullName, hasTrait } from './core';
import { defineEvent, type Ctx, type Effect } from './dsl';
import { pr, type EventCtx, type EventDef } from './eventKit';
import { isRival } from './memory';
import { pick, weighted } from './rng';
import type { Character, Clan, GameState } from './types';
import { atWarWith } from './war';
import {
  allMentorships,
  allWardships,
  canBeMentored,
  completeWardship,
  detainWard,
  endMentorship,
  fosterBlocker,
  guardianOf,
  hostWard,
  mentorshipOf,
  recallWard,
  sendAsWard,
  teachingText,
  wardAtWar,
  wardsHostedBy,
  wardshipOf,
  WARD_AGES,
  type Wardship,
} from './wards';

// ── Whose turn it is ──────────────────────────────────────────────────────

const living = (s: GameState, w: Wardship) => alive(ch(s, w.childId)) && !ch(s, w.childId)!.prisonerOf;

/** Your children living at other courts. */
function abroad(s: GameState): Wardship[] {
  return allWardships(s).filter((w) => w.homeId === s.playerClanId && living(s, w));
}

/** Other houses' children living at yours. */
function here(s: GameState): Wardship[] {
  return wardsHostedBy(s, s.playerClanId).filter((w) => living(s, w));
}

const gone = (s: GameState, clanId: string) => !s.clans[clanId] || !clanRegions(s, clanId).length;
const due = (s: GameState, w: Wardship) => w.due <= s.year;

function homecoming(s: GameState): Wardship | undefined {
  return abroad(s).find((w) => !wardAtWar(s, w) && (due(s, w) || gone(s, w.hostId)));
}

function leaving(s: GameState): Wardship | undefined {
  return here(s).find((w) => !wardAtWar(s, w) && (due(s, w) || gone(s, w.homeId)));
}

/** A mentorship that has run its course: the pupil is grown, or the mentor is dead, captive or gone. */
function finishedMentoring(s: GameState): string | undefined {
  for (const m of allMentorships(s)) {
    const child = ch(s, m.childId);
    if (!alive(child)) continue;
    const mentor = ch(s, m.mentorId);
    if (m.due <= s.year || !alive(mentor) || !!mentor.prisonerOf || !canBeMentored(s, child)) return child.id;
  }
  return undefined;
}

/** Your children of fostering age who are at home and free. */
function atHome(s: GameState): Character[] {
  const r = ch(s, s.rulerId);
  return childrenOf(s, r!).filter(
    (c) => alive(c) && c.clanId === s.playerClanId && !c.prisonerOf && !wardshipOf(s, c.id) && ageOf(s, c) >= WARD_AGES[0] && ageOf(s, c) <= 12,
  );
}

/** Houses that would like to raise one of your children: warm to you, not plotting against you. */
function wouldFoster(s: GameState, childId: string): Clan[] {
  return Object.values(s.clans).filter((k) => {
    if (fosterBlocker(s, childId, k.id) || k.opinion < 20) return false;
    const aim = aiAmbition(s, k).kind;
    return aim !== 'revenge' && aim !== 'conquest';
  });
}

/** A child of a friendly house, of fostering age, whom their lord might send to you. */
function wouldSend(s: GameState): Character[] {
  const out: Character[] = [];
  for (const k of Object.values(s.clans)) {
    if (k.isPlayer || k.opinion < 15 || isRival(k) || atWarWith(s, k.id) || !clanRegions(s, k.id).length) continue;
    const head = ch(s, k.headId);
    if (!alive(head) || head.prisonerOf) continue;
    for (const c of childrenOf(s, head))
      if (alive(c) && c.clanId === k.id && !c.prisonerOf && !wardshipOf(s, c.id) && ageOf(s, c) >= WARD_AGES[0] && ageOf(s, c) <= 12) out.push(c);
  }
  return out;
}

const houseOf = (c: EventCtx | Ctx, key: string) => c.s.clans[String(c.data[key])]?.name ?? 'their foster house';
const nameOf = (c: EventCtx | Ctx, key: string) => c.s.characters[String(c.data[key])]?.name;

const comeHome: Effect = {
  run: (c) => completeWardship(c.s, c.subject!.id),
  text: (c) => `${c.subject!.name} comes home, shaped by the years away`,
};
const comeHomeEarly: Effect = {
  run: (c) => completeWardship(c.s, c.subject!.id, true),
  text: (c) => `${c.subject!.name} is sent home early`,
};
const sendHome: Effect = {
  run: (c) => completeWardship(c.s, c.subject!.id),
  text: (c) => `${c.subject!.name} goes home to House ${houseOf(c, 'home')}`,
};
const finishLessons: Effect = {
  run: (c) => endMentorship(c.s, c.subject!.id),
  text: (c) => `${c.subject!.name}'s lessons come to an end`,
};
const holdHostage: Effect = {
  run: (c) => {
    detainWard(c.s, c.subject!.id);
  },
  text: (c) => `${c.subject!.name} becomes a hostage of House ${houseOf(c, 'host')}`,
};

// ── The deck ──────────────────────────────────────────────────────────────

export const WARD_EVENTS: EventDef[] = [
  defineEvent({
    id: 'ward_returns',
    title: 'A Ward Comes Home',
    icon: 'family',
    weight: 1,
    urgent: true,
    when: (s) => canAct(s) && !!homecoming(s),
    subject: (s) => ch(s, homecoming(s)?.childId),
    setup: ({ s, subject, data }) => {
      const w = wardshipOf(s, subject!.id)!;
      Object.assign(data, { host: w.hostId, years: s.year - w.since, guardian: guardianOf(s, w)?.id ?? '' });
    },
    text: (c) =>
      `${c.subject!.name} is coming home after ${c.data.years} years at the court of House ${houseOf(c, 'host')}${nameOf(c, 'guardian') ? `, raised by ${nameOf(c, 'guardian')}` : ''}. ${pr(c.subject).He} has grown, and not only taller.`,
    options: [
      {
        label: 'Throw a homecoming feast',
        needs: [{ have: 'credits', n: 60 }],
        then: {
          do: [{ lose: 'credits', n: 60 }, comeHome, { feel: 10, from: 'subject', why: 'Welcomed me home', key: 'homecoming' }],
          text: 'The whole court turns out. Your child stands a little apart at first, then laughs at something, and is home.',
        },
      },
      {
        label: 'Put them straight to work',
        then: {
          do: [comeHome, { trait: 'diligent', to: 'subject', p: 0.25 }],
          text: 'A handshake, a desk, a pile of reports. They raised a grown-up over there, and you mean to use one.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'ward_goes_home',
    title: 'Your Ward Goes Home',
    icon: 'family',
    weight: 1,
    urgent: true,
    when: (s) => canAct(s) && !!leaving(s),
    subject: (s) => ch(s, leaving(s)?.childId),
    setup: ({ s, subject, data }) => {
      const w = wardshipOf(s, subject!.id)!;
      Object.assign(data, { home: w.homeId, years: s.year - w.since });
    },
    text: (c) =>
      `After ${c.data.years} years at your court, ${fullName(c.s, c.subject!)} is going home to House ${houseOf(c, 'home')}. ${pr(c.subject).He} knows every corridor of this place, and some of your secrets.`,
    options: [
      {
        label: 'Send them home with gifts',
        needs: [{ have: 'credits', n: 50 }],
        then: {
          do: [{ lose: 'credits', n: 50 }, sendHome, { opinion: 8, clan: 'home' }],
          text: 'A good horse, a good sword and a better letter of thanks to their parents. House ties are made of such things.',
        },
      },
      {
        label: 'Say a warm goodbye',
        then: { do: [sendHome], text: 'There is a lump in more throats than you expected, including yours.' },
      },
    ],
  }),
  defineEvent({
    id: 'mentor_done',
    title: 'The Lessons End',
    icon: 'study',
    weight: 1,
    urgent: true,
    when: (s) => canAct(s) && !!finishedMentoring(s),
    subject: (s) => ch(s, finishedMentoring(s)),
    setup: ({ s, subject, data }) => {
      const m = mentorshipOf(s, subject!.id)!;
      Object.assign(data, { mentor: m.mentorId, years: s.year - m.since });
    },
    text: (c) => {
      const mentor = c.s.characters[String(c.data.mentor)];
      if (!alive(mentor))
        return `${c.subject!.name}'s mentor, ${mentor?.name ?? 'their teacher'}, is gone. What ${pr(c.subject).he} learned in ${c.data.years} years will have to be enough.`;
      if (mentor.prisonerOf) return `${c.subject!.name}'s mentor, ${mentor.name}, has been taken captive. The lessons stop.`;
      return `${c.subject!.name}'s years under ${mentor.name} are over. ${c.data.years} years of lessons, arguments and, lately, something like friendship.`;
    },
    options: [
      {
        label: 'Thank the mentor in front of the court',
        show: [{ exists: 'mentor' }],
        then: {
          do: [finishLessons, { feel: 10, from: 'mentor', why: 'Thanked me before the court', key: 'thanks' }, { gain: 'prestige', n: 3 }],
          text: 'A short speech, a long round of applause, and a mentor who pretends not to be moved.',
        },
      },
      {
        label: 'Let the lessons speak for themselves',
        then: { do: [finishLessons], text: 'Nobody makes a speech. Your child simply walks a little differently now.' },
      },
    ],
  }),
  defineEvent({
    id: 'ward_detained',
    title: 'A Ward Behind Enemy Lines',
    icon: 'war',
    weight: 1,
    urgent: true,
    when: (s) => canAct(s) && abroad(s).some((w) => wardAtWar(s, w)),
    subject: (s) => ch(s, abroad(s).find((w) => wardAtWar(s, w))?.childId),
    setup: ({ s, subject, data }) => {
      data.host = wardshipOf(s, subject!.id)!.hostId;
    },
    text: (c) =>
      `You are at war with House ${houseOf(c, 'host')}, and ${c.subject!.name} is still living at their court. Their lord has posted guards on ${pr(c.subject).his} door "for ${pr(c.subject).his} protection".`,
    options: [
      {
        label: 'Demand their return under a flag of truce',
        then: {
          roll: { base: 0.35, per: { stat: 'dip', n: 0.04 } },
          pass: { do: [comeHomeEarly], text: 'Honour wins, just. Your child is sent home in a courier ship with their belongings and a polite note.' },
          fail: { do: [holdHostage], text: 'Their answer is a closed door. Your child is a hostage now, and they will want something for them.' },
        },
      },
      {
        label: 'Leave it to the war',
        then: { do: [holdHostage], text: 'You cannot bargain for one child in the middle of a war. They will have to wait, as a hostage.' },
      },
    ],
  }),
  defineEvent({
    id: 'hostage_choice',
    title: 'Their Child, Your Court',
    icon: 'scheme',
    weight: 1,
    urgent: true,
    when: (s) => canAct(s) && here(s).some((w) => wardAtWar(s, w)),
    subject: (s) => ch(s, here(s).find((w) => wardAtWar(s, w))?.childId),
    setup: ({ s, subject, data }) => {
      const w = wardshipOf(s, subject!.id)!;
      Object.assign(data, { home: w.homeId, host: w.hostId });
    },
    text: (c) =>
      `House ${houseOf(c, 'home')} is at war with you, and their child, ${c.subject!.name}, has lived at your court for years. Your councillors point out, delicately, what a useful thing a hostage is.`,
    options: [
      {
        label: 'Keep them as a hostage',
        then: {
          do: [{ deed: 'arbitrary' }, holdHostage, { remember: 'Kept our child as a hostage', clan: 'home', value: -15, decay: 0.2 }],
          text: (c) => `${c.subject!.name} is moved to a locked room with a view. ${pr(c.subject).He} understands perfectly.`,
        },
      },
      {
        label: 'Send them home under escort',
        then: {
          do: [
            { deed: 'justice' },
            comeHomeEarly,
            { gain: 'prestige', n: 10 },
            { remember: 'Sent our child home in wartime', clan: 'home', value: 10, decay: 0.1 },
          ],
          text: 'War is between houses, not children. Even your enemies admit it was well done.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'foster_offer',
    title: 'An Offer to Raise Your Child',
    icon: 'family',
    weight: 1,
    cooldown: 12,
    when: (s) => canAct(s) && atHome(s).some((c) => wouldFoster(s, c.id).length > 0),
    subject: (s) => {
      const pool = atHome(s).filter((c) => wouldFoster(s, c.id).length > 0);
      return pool.length ? pick(s, pool) : undefined;
    },
    setup: ({ s, subject, data }) => {
      const k = weighted(
        s,
        wouldFoster(s, subject!.id).map((x) => [x, 1 + x.opinion / 20] as const),
      );
      Object.assign(data, { clan: k.id, lord: k.headId, teaches: teachingText(s, s.characters[k.headId]) });
    },
    text: (c) =>
      `${fullName(c.s, c.s.characters[String(c.data.lord)])} offers to raise ${c.subject!.name} at the court of House ${houseOf(c, 'clan')} until ${pr(c.subject).he} comes of age. The lord is known for ${c.data.teaches}.`,
    options: [
      {
        label: 'Accept the offer',
        then: {
          do: [
            {
              run: (c) => {
                sendAsWard(c.s, c.subject!.id, String(c.data.clan), true);
              },
              text: (c) => `${c.subject!.name} goes to be raised at House ${houseOf(c, 'clan')}'s court until 16`,
            },
          ],
          text: (c) => `${c.subject!.name} packs a small trunk and a large amount of bravado. The ship leaves at dawn.`,
        },
      },
      {
        label: 'Decline with thanks',
        then: { do: [{ opinion: -5, clan: 'clan' }], text: 'Your child stays at home. Their lord says they understand, which means they do not.' },
      },
    ],
  }),
  defineEvent({
    id: 'ward_offered',
    title: 'A Child to Raise',
    icon: 'family',
    weight: 1,
    cooldown: 12,
    when: (s) => canAct(s) && wouldSend(s).length > 0,
    subject: (s) => {
      const pool = wouldSend(s);
      return pool.length ? pick(s, pool) : undefined;
    },
    setup: ({ subject, data }) => {
      data.home = subject!.clanId;
    },
    text: (c) =>
      `House ${houseOf(c, 'home')} asks whether you would raise ${c.subject!.name}, ${ageOf(c.s, c.subject!)}, at your court until ${pr(c.subject).he} comes of age. It is an honour, an obligation, and a hostage to fortune, all at once.`,
    options: [
      {
        label: 'Take them in',
        then: {
          do: [
            {
              run: (c) => {
                hostWard(c.s, c.subject!.id);
              },
              text: (c) => `${c.subject!.name} comes to live at your court until 16`,
            },
            { remember: 'Agreed to raise our child', clan: 'home', value: 10, decay: 0.1 },
          ],
          text: (c) => `${c.subject!.name} arrives with a trunk, a tutor and a very stiff upper lip. Your children are already curious.`,
        },
      },
      {
        label: 'Decline',
        then: { do: [{ opinion: -8, clan: 'home' }], text: 'Your court has no room, you say. Their lord takes it about as well as you would.' },
      },
    ],
  }),
  defineEvent({
    id: 'ward_letter',
    title: 'A Letter from Your Ward',
    icon: 'family',
    weight: 2.5,
    cooldown: 6,
    when: (s) => canAct(s) && abroad(s).some((w) => !wardAtWar(s, w) && !due(s, w)),
    subject: (s) => {
      const pool = abroad(s).filter((w) => !wardAtWar(s, w) && !due(s, w));
      return pool.length ? ch(s, pick(s, pool).childId) : undefined;
    },
    setup: ({ s, subject, data }) => {
      const w = wardshipOf(s, subject!.id)!;
      const g = guardianOf(s, w);
      const mood =
        g && (hasTrait(g, 'cruel') || hasTrait(g, 'wrathful'))
          ? 'hard'
          : g && (hasTrait(g, 'kind') || hasTrait(g, 'generous') || hasTrait(g, 'gregarious'))
            ? 'happy'
            : 'homesick';
      Object.assign(data, { host: w.hostId, guardian: g?.id ?? '', mood });
    },
    text: (c) => {
      const g = nameOf(c, 'guardian') ?? 'their guardian';
      if (c.data.mood === 'hard')
        return `A short letter from ${c.subject!.name} at House ${houseOf(c, 'host')}. The handwriting is very careful. ${g} is "strict". The word is underlined twice.`;
      if (c.data.mood === 'happy')
        return `A long letter from ${c.subject!.name} at House ${houseOf(c, 'host')}, full of new friends, ${g}'s hunting trips and a horse called Pudding. There is one line at the end asking after home.`;
      return `A letter from ${c.subject!.name} at House ${houseOf(c, 'host')}. ${g} is kind enough, but the food is wrong, the stars are wrong, and ${pr(c.subject).he} would like to know if ${pr(c.subject).his} room is still the same.`;
    },
    options: [
      {
        label: 'Visit them',
        needs: [{ have: 'credits', n: 60 }],
        then: {
          do: [
            { lose: 'credits', n: 60 },
            { feel: 15, from: 'subject', why: 'Came all that way to see me', key: 'letter' },
          ],
          text: 'A week at a foreign court, mostly spent walking with your child and saying very little. It is enough.',
        },
      },
      {
        label: 'Send a gift to their hosts',
        needs: [{ have: 'credits', n: 40 }],
        then: {
          do: [
            { lose: 'credits', n: 40 },
            { opinion: 6, clan: 'host' },
          ],
          text: 'A crate of good wine to your child’s hosts. Your child’s life there gets very slightly better.',
        },
      },
      {
        label: 'Have words with their guardian',
        show: [{ test: (c) => c.data.mood === 'hard', why: '' }],
        then: {
          do: [
            { opinion: -8, clan: 'host' },
            { feel: 15, from: 'subject', why: 'Stood up for me', key: 'letter' },
            { feel: -10, from: 'guardian', why: 'Questioned how I raise a ward', key: 'ward_complaint' },
          ],
          text: 'A frosty exchange of letters. Your child is treated more gently afterwards, and the house more coolly.',
        },
      },
      {
        label: 'Bring them home',
        then: {
          do: [{ run: (c) => recallWard(c.s, c.subject!.id), text: (c) => `${c.subject!.name} comes home early, and their hosts are put out` }],
          text: 'Home is home. The house that raised them is offended, a little.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'ward_trouble',
    title: 'Trouble with Your Ward',
    icon: 'family',
    weight: 2.5,
    cooldown: 6,
    when: (s) => canAct(s) && here(s).some((w) => !due(s, w) && ageOf(s, s.characters[w.childId]) >= 8),
    subject: (s) => {
      const pool = here(s).filter((w) => !due(s, w) && ageOf(s, s.characters[w.childId]) >= 8);
      return pool.length ? ch(s, pick(s, pool).childId) : undefined;
    },
    setup: ({ s, subject, data }) => {
      data.home = subject!.clanId;
      const r = ch(s, s.rulerId)!;
      const near = childrenOf(s, r).filter((k) => alive(k) && !k.prisonerOf && !wardshipOf(s, k.id) && Math.abs(k.born - subject!.born) <= 4);
      data.kid = near.length ? pick(s, near).id : '';
    },
    text: (c) =>
      nameOf(c, 'kid')
        ? `${c.subject!.name}, the ward from House ${houseOf(c, 'home')}, and your own ${nameOf(c, 'kid')} have been fighting again. Today it was over a model ship. Last week it was over everything.`
        : `${c.subject!.name}, the ward from House ${houseOf(c, 'home')}, has stopped eating and sits by the observation window every evening, watching for ships from home.`,
    options: [
      {
        label: 'Take them under your wing',
        then: {
          do: [
            { feel: 20, from: 'subject', why: 'Treated me as their own', key: 'kindness' },
            { lose: 'prestige', n: 3 },
          ],
          text: (c) => `You make time for ${c.subject!.name}: a walk, a lesson, a game of void-dice. ${pr(c.subject).He} will remember who did.`,
        },
      },
      {
        label: 'Make them share a room with your child',
        show: [{ exists: 'kid' }],
        then: {
          roll: 0.5,
          pass: {
            do: [
              { feel: 20, from: 'subject', to: 'kid', why: 'Shared a room and every secret', key: 'raised_together' },
              { feel: 20, from: 'kid', to: 'subject', why: 'Shared a room and every secret', key: 'raised_together' },
            ],
            text: 'A week of cold silence, then a joint midnight raid on the kitchens. They are thick as thieves now.',
          },
          fail: {
            do: [
              { feel: -15, from: 'subject', to: 'kid', why: 'Forced to share a room', key: 'raised_together' },
              { feel: -15, from: 'kid', to: 'subject', why: 'Forced to share a room', key: 'raised_together' },
            ],
            text: 'There is a line of tape down the middle of the room. Neither will say who put it there.',
          },
        },
      },
      {
        label: 'Be strict with them',
        then: {
          do: [
            { feel: -10, from: 'subject', why: 'Was hard on me', key: 'kindness' },
            { trait: 'diligent', to: 'subject', p: 0.3 },
          ],
          text: (c) => `${c.subject!.name} gets a timetable, a tutor and no sympathy. ${pr(c.subject).He} gets on with it.`,
        },
      },
    ],
  }),
];
