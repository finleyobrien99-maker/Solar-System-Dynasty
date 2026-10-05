// Justice petitions (wave 1, NEXT-WAVES.md; ROADMAP 12.6): ten cases brought
// to you about real, named people (the lords on your worlds, their children,
// your own kin). Every ruling builds a reputation for justice or caprice
// (`justice` / `arbitrary` deeds feed earned names) and leaves somebody
// grateful or aggrieved, so a verdict can echo for years: a lord you fined
// remembers it, a debtor you bailed out owes you, a son you backed against
// his brother has an enemy at home. Shuffled into the main deck in events.ts.

import { ageOf, alive, canAct, ch, childrenOf, clanRegions, fullName, ruler } from './core';
import { defineEvent, type Ctx, type Effect } from './dsl';
import { named } from './eventBits';
import { pr, type EventCtx, type EventDef } from './eventKit';
import { currentHeir } from './life';
import { int, pick } from './rng';
import type { Character, Clan, GameState } from './types';

// ── Who comes before you (cheap: houses on your worlds and close family) ──

function freeAdult(s: GameState, c: Character | undefined, min = 18): c is Character {
  return alive(c) && !c.prisonerOf && ageOf(s, c) >= min && c.id !== s.rulerId;
}

/** Landed AI houses on the worlds where you hold land, with a free adult lord. */
function localHouses(s: GameState): Clan[] {
  const worlds = new Set(clanRegions(s, s.playerClanId).map((r) => r.planetId));
  return Object.values(s.clans).filter((k) => !k.isPlayer && worlds.has(k.planetId) && clanRegions(s, k.id).length > 0 && freeAdult(s, ch(s, k.headId)));
}

/** Lords of those houses. */
function lords(s: GameState): Character[] {
  return localHouses(s).map((k) => s.characters[k.headId]);
}

/** Adults of standing in those houses: lords and their grown children. */
function nobles(s: GameState): Character[] {
  const out: Character[] = [];
  for (const k of localHouses(s)) {
    const head = s.characters[k.headId];
    out.push(head, ...childrenOf(s, head).filter((c) => c.clanId === k.id && freeAdult(s, c)));
  }
  return out;
}

/** Your grown kin at court: children, brothers and sisters, spouse. */
function kin(s: GameState): Character[] {
  const r = ruler(s);
  const out = new Map<string, Character>();
  for (const c of childrenOf(s, r)) if (c.clanId === s.playerClanId && freeAdult(s, c)) out.set(c.id, c);
  for (const p of [ch(s, r.fatherId), ch(s, r.motherId)])
    for (const id of p?.childrenIds ?? []) {
      const c = s.characters[id];
      if (c?.clanId === s.playerClanId && freeAdult(s, c)) out.set(c.id, c);
    }
  const sp = ch(s, r.spouseId);
  if (freeAdult(s, sp)) out.set(sp.id, sp);
  return [...out.values()];
}

/** Lords on your worlds with at least two grown children at home. */
function quarrellingHouses(s: GameState): Clan[] {
  return localHouses(s).filter((k) => childrenOf(s, s.characters[k.headId]).filter((c) => c.clanId === k.id && freeAdult(s, c)).length >= 2);
}

const oneOf = <T>(s: GameState, pool: T[]): T | undefined => (pool.length ? pick(s, pool) : undefined);
const house = (c: EventCtx | Ctx, key: string): string => c.s.clans[String(c.data[key])]?.name ?? 'a rival house';
const person = (c: EventCtx | Ctx, key: string): Character => c.s.characters[String(c.data[key])];

const COMMONERS = ['Ada Venn', 'Tobin Kesh', 'Mara Quist', 'Old Jory', 'Senna Holt', 'Pell Dunmore'];

// ── The petitions ─────────────────────────────────────────────────────────

/** A named house pays from its own treasury, capped at what it has. */
function payment(n: number, payer = 'clan', recipient?: string): Effect {
  const terms = (c: Ctx) => {
    const fromId = payer === 'player' ? c.s.playerClanId : String(c.data[payer]);
    const toId = recipient ? String(c.data[recipient]) : c.s.playerClanId;
    const from = c.s.clans[fromId],
      to = c.s.clans[toId];
    const funds = from?.isPlayer ? c.s.credits : (from?.credits ?? 0);
    const amount = from && to && fromId !== toId ? Math.min(n, Math.max(0, funds)) : 0;
    return { from, to, amount };
  };
  return {
    run: (c) => {
      const { from, to, amount } = terms(c);
      if (!from || !to || !amount) return 'No credits change hands.';
      if (from.isPlayer) c.s.credits -= amount;
      else from.credits -= amount;
      if (to.isPlayer) c.s.credits += amount;
      else to.credits += amount;
      return `House ${from.name} pays House ${to.name} ${amount} credits.`;
    },
    text: (c) => {
      const { from, to, amount } = terms(c);
      return `House ${from?.name ?? 'unknown'} pays House ${to?.name ?? 'unknown'} ${amount} credits (up to ${n}, from its own treasury)`;
    },
  };
}

export const PETITION_EVENTS: EventDef[] = [
  defineEvent({
    id: 'boundary_dispute',
    title: 'A Boundary Dispute',
    icon: 'realm',
    weight: 1.2,
    cooldown: 12,
    when: (s) => canAct(s) && localHouses(s).length >= 2,
    setup: ({ s, data }) => {
      const pool = localHouses(s);
      const a = pick(s, pool);
      const b = pick(
        s,
        pool.filter((k) => k.id !== a.id),
      );
      Object.assign(data, { clanA: a.id, clanB: b.id, lordA: a.headId, lordB: b.headId });
    },
    text: (c) =>
      `${fullName(c.s, person(c, 'lordA'))} and ${fullName(c.s, person(c, 'lordB'))} both claim the ice-fields between their lands. House ${house(c, 'clanA')} has the older charter; House ${house(c, 'clanB')} has worked the fields for twenty years. They ask you to judge.`,
    options: [
      {
        label: 'Uphold the old charter',
        then: {
          do: [
            { deed: 'justice' },
            { opinion: 8, clan: 'clanA' },
            { opinion: -10, clan: 'clanB' },
            { feel: -15, from: 'lordB', why: 'Ruled against me over the ice-fields', key: 'petition' },
          ],
          text: (c) => `The charter stands. ${named(c, 'lordB')} bows, stiffly, and does not forget.`,
        },
      },
      {
        label: 'Favour those who work the land',
        then: {
          do: [
            { deed: 'justice' },
            { opinion: 8, clan: 'clanB' },
            { opinion: -10, clan: 'clanA' },
            { feel: -15, from: 'lordA', why: 'Ruled against me over the ice-fields', key: 'petition' },
          ],
          text: (c) => `Twenty years of work outweighs a dusty seal. ${named(c, 'lordA')} calls it theft, quietly.`,
        },
      },
      {
        label: 'Split the fields between them',
        then: {
          roll: { base: 0.45, per: { stat: 'dip', n: 0.04 } },
          pass: {
            do: [
              { opinion: 4, clan: 'clanA' },
              { opinion: 4, clan: 'clanB' },
              { gain: 'prestige', n: 6 },
            ],
            text: 'Each gets half and complains about it, which is how you know it was fair.',
          },
          fail: {
            do: [{ deed: 'arbitrary' }, { opinion: -6, clan: 'clanA' }, { opinion: -6, clan: 'clanB' }],
            text: 'Both lords feel cheated, and both are now united in disliking you.',
          },
        },
      },
      {
        label: 'Take the fields for the crown',
        then: {
          do: [{ deed: 'arbitrary' }, { gain: 'credits', n: 80 }, { opinion: -15, clan: 'clanA' }, { opinion: -15, clan: 'clanB' }],
          text: 'If two lords cannot share, neither shall have it. The crown has very cold, very valuable ice.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'widow_accusation',
    title: "A Widow's Accusation",
    icon: 'death',
    weight: 1,
    cooldown: 14,
    when: (s) => canAct(s) && nobles(s).length > 0,
    subject: (s) => oneOf(s, nobles(s)),
    setup: ({ s, subject, data }) => {
      data.widow = pick(s, COMMONERS);
      data.clan = subject!.clanId;
    },
    text: ({ subject, data, s }) =>
      `${data.widow} stands before the court in black. She says her husband, a dock captain, was knifed for refusing to carry cargo for ${fullName(s, subject!)}. She has no witnesses, only a name.`,
    options: [
      {
        label: 'Investigate before you judge',
        then: {
          roll: { base: 0.35, per: { stat: 'int', n: 0.05 } },
          pass: {
            do: [
              { deed: 'justice' },
              { gain: 'prestige', n: 10 },
              { feel: -40, from: 'subject', why: 'Had me exiled for murder', key: 'petition' },
              { remember: 'Exiled our kinsman for murder', clan: 'clan', value: -8, decay: 0.3 },
            ],
            text: (c) => `Your agents find the knife, the boatman and the payment. ${c.subject!.name} is exiled to the outer stations. The docks cheer.`,
          },
          fail: {
            do: [
              { feel: 10, from: 'subject', why: 'Cleared my name', key: 'petition' },
              { lose: 'prestige', n: 5 },
            ],
            text: (c) => `The trail goes cold. ${c.subject!.name} walks free, and ${c.data.widow} walks out in tears.`,
          },
        },
      },
      {
        label: 'Believe the widow',
        then: {
          do: [
            { deed: 'arbitrary' },
            { gain: 'prestige', n: 5 },
            { feel: -45, from: 'subject', why: 'Condemned me without proof', key: 'petition' },
            { remember: 'Condemned our kinsman without proof', clan: 'clan', value: -15, decay: 0.2 },
          ],
          text: (c) => `${c.subject!.name} is exiled on a widow's word. The crowd loves it. House ${house(c, 'clan')} does not.`,
        },
      },
      {
        label: 'Dismiss the case',
        then: {
          do: [
            { feel: 10, from: 'subject', why: 'Threw out the accusation', key: 'petition' },
            { lose: 'prestige', n: 5 },
          ],
          text: 'Without proof there is no case. The docks mutter that there never is, for the likes of them.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'unpaid_debt',
    title: 'An Unpaid Debt',
    icon: 'credits',
    weight: 1.2,
    cooldown: 12,
    when: (s) => canAct(s) && nobles(s).length > 0,
    subject: (s) => oneOf(s, nobles(s)),
    setup: ({ s, subject, data }) => {
      data.amount = int(s, 8, 16) * 10;
      data.clan = subject!.clanId;
    },
    text: ({ s, subject, data }) =>
      `The Shipwrights' Guild says ${fullName(s, subject!)} ordered a racing yacht, took delivery, and has not paid the ${data.amount} credits. ${pr(subject).He} says the yacht "handles badly".`,
    options: [
      {
        label: 'Order them to pay',
        then: {
          do: [
            { deed: 'justice' },
            { gain: 'prestige', n: 5 },
            { feel: -20, from: 'subject', why: 'Made me pay up in public', key: 'petition' },
            { opinion: -5, clan: 'clan' },
          ],
          text: (c) => `${c.subject!.name} pays, with very bad grace. The Guild names its next yacht after you.`,
        },
      },
      {
        label: 'Pay it yourself, and let them owe you',
        needs: [{ have: 'credits', n: 'amount' }],
        then: {
          do: [
            { lose: 'credits', n: { data: 'amount' } },
            { deed: 'kindness' },
            { feel: 25, from: 'subject', why: 'Paid my debt to the Guild', key: 'petition' },
          ],
          text: (c) => `You settle it quietly. ${c.subject!.name} is grateful, and gratitude is a debt too.`,
        },
      },
      {
        label: 'Cancel the debt',
        then: {
          do: [{ deed: 'arbitrary' }, { lose: 'prestige', n: 10 }, { feel: 10, from: 'subject', why: 'Cancelled my debt', key: 'petition' }],
          text: 'The Guild learns what a noble debt is worth. So does every merchant on the station.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'broken_promise',
    title: 'A Broken Promise',
    icon: 'heart',
    weight: 1,
    cooldown: 15,
    when: (s) => canAct(s) && localHouses(s).length > 0 && kin(s).some((c) => !c.spouseId && !c.betrothedId),
    subject: (s) =>
      oneOf(
        s,
        kin(s).filter((c) => !c.spouseId && !c.betrothedId),
      ),
    setup: ({ s, data }) => {
      data.clan = pick(s, localHouses(s)).id;
      data.jilted = pick(s, ['Iselde', 'Romy', 'Callis', 'Tamsin', 'Oriel', 'Veska']);
    },
    text: (c) =>
      `House ${house(c, 'clan')} says ${c.subject!.name} spent a summer courting their ${c.data.jilted}, promised marriage in front of witnesses, and then stopped answering letters. They want satisfaction.`,
    options: [
      {
        label: 'Pay compensation',
        needs: [{ have: 'credits', n: 100 }],
        then: {
          do: [
            payment(100, 'player', 'clan'),
            { opinion: 8, clan: 'clan' },
            { feel: -10, from: 'subject', why: 'Paid them off behind my back', key: 'petition' },
          ],
          text: (c) => `Honour is satisfied, at a price. ${c.subject!.name} is mortified that it had a price.`,
        },
      },
      {
        label: 'Stand by your kin',
        then: {
          do: [
            { opinion: -12, clan: 'clan' },
            { remember: 'Defended the one who jilted our daughter', clan: 'clan', value: -10, decay: 0.3 },
            { feel: 15, from: 'subject', why: 'Stood by me', key: 'petition' },
          ],
          text: (c) => `You say a promise made in summer is not a contract. House ${house(c, 'clan')} says otherwise, loudly.`,
        },
      },
      {
        label: 'Make them apologise in person',
        then: {
          roll: { base: 0.4, per: { stat: 'dip', n: 0.05, of: 'subject' } },
          pass: {
            do: [
              { opinion: 5, clan: 'clan' },
              { stat: 'dip', n: 1, to: 'subject' },
            ],
            text: (c) => `${c.subject!.name} apologises so well that ${c.data.jilted} nearly forgives everything. Nearly.`,
          },
          fail: {
            do: [{ opinion: -8, clan: 'clan' }],
            text: (c) => `${c.subject!.name} apologises badly, then argues, then leaves. It is not an improvement.`,
          },
        },
      },
    ],
  }),
  defineEvent({
    id: 'dock_beating',
    title: 'Blood on the Docks',
    icon: 'war',
    weight: 1,
    cooldown: 12,
    when: (s) => canAct(s) && lords(s).length > 0,
    subject: (s) => oneOf(s, lords(s)),
    setup: ({ s, subject, data }) => {
      data.docker = pick(s, COMMONERS);
      data.clan = subject!.clanId;
    },
    text: ({ s, subject, data }) =>
      `${data.docker}, a dockworker, was beaten half to death by the household guards of ${fullName(s, subject!)} for "blocking a lord's gangway". The dockers have stopped work until somebody answers for it.`,
    options: [
      {
        label: 'Fine the lord',
        then: {
          do: [
            { deed: 'justice' },
            payment(50),
            { gain: 'prestige', n: 8 },
            { feel: -25, from: 'subject', why: 'Shamed me in front of commoners', key: 'petition' },
            { opinion: -6, clan: 'clan' },
          ],
          text: (c) => `${c.subject!.name} receives the fine with a face like thunder. The docks go back to work singing your name.`,
        },
      },
      {
        label: 'Side with the lord',
        then: {
          do: [{ deed: 'arbitrary' }, { lose: 'prestige', n: 10 }, { feel: 10, from: 'subject', why: 'Took my side against the rabble', key: 'petition' }],
          text: 'The strike lasts a week. Every docker remembers whose side you were on.',
        },
      },
      {
        label: "Pay the docker's family yourself",
        needs: [{ have: 'credits', n: 40 }],
        then: {
          do: [
            { lose: 'credits', n: 40 },
            { deed: 'charity', n: 40 },
            { gain: 'prestige', n: 5 },
          ],
          text: (c) => `${c.data.docker}'s family is looked after. The lord is not punished, and everyone notices that too.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'heresy_charge',
    title: 'A Charge of Heresy',
    icon: 'faith',
    weight: 1,
    cooldown: 15,
    when: (s) => canAct(s) && [...kin(s), ...nobles(s)].length > 0,
    subject: (s) => {
      const pool = [...kin(s), ...nobles(s)];
      const strangers = pool.filter((c) => c.faithId !== s.clans[s.playerClanId].faithId);
      return oneOf(s, strangers.length ? strangers : pool);
    },
    text: ({ s, subject }) =>
      `A preacher of your faith has denounced ${fullName(s, subject!)} for heresy: something about ${pr(subject).his} prayers going the wrong way round the altar. The congregation wants a trial.`,
    options: [
      {
        label: 'Hold a trial',
        then: {
          do: [
            { deed: 'arbitrary' },
            { gain: 'faith', n: 15 },
            { feel: -30, from: 'subject', why: 'Put me on trial for heresy', key: 'petition' },
            { trait: 'zealous', to: 'subject', p: 0.35, or: 'cynical' },
          ],
          text: (c) => `${c.subject!.name} recants in front of everybody. Whether ${pr(c.subject).he} means it is between ${pr(c.subject).him} and the altar.`,
        },
      },
      {
        label: 'Dismiss the charge',
        then: {
          do: [
            { deed: 'justice' },
            { lose: 'faith', n: 10, upTo: 'have' },
            { feel: 15, from: 'subject', why: 'Defended me against the preachers', key: 'petition' },
          ],
          text: 'You tell the preacher that prayers are not a crime. The preacher tells everyone what you said.',
        },
      },
      {
        label: 'Have a quiet word with both',
        then: {
          roll: { base: 0.45, per: { stat: 'dip', n: 0.04 } },
          pass: {
            do: [
              { gain: 'faith', n: 5 },
              { feel: 5, from: 'subject', why: 'Kept it quiet', key: 'petition' },
            ],
            text: 'A private prayer, a public handshake, and a sermon about something else next week.',
          },
          fail: { do: [{ lose: 'faith', n: 5, upTo: 'have' }], text: 'Both sides decide you are on the other one. The sermon next week is about you.' },
        },
      },
    ],
  }),
  defineEvent({
    id: 'smuggling_charge',
    title: 'Contraband in the Hold',
    icon: 'ship',
    weight: 1,
    cooldown: 12,
    when: (s) => canAct(s) && nobles(s).length > 0,
    subject: (s) => oneOf(s, nobles(s)),
    setup: ({ subject, data }) => {
      data.clan = subject!.clanId;
    },
    text: ({ s, subject }) =>
      `Customs officers searched a yacht belonging to ${fullName(s, subject!)} and found forty crates of untaxed Ganymede brandy, two crates of illegal gene-samples and one very surprised parrot.`,
    options: [
      {
        label: 'Fine them',
        then: {
          do: [
            { deed: 'justice' },
            payment(80),
            { feel: -20, from: 'subject', why: 'Fined me for smuggling', key: 'petition' },
            { remember: 'Fined our kinsman for smuggling', clan: 'clan', value: -8, decay: 0.3 },
          ],
          text: 'The fine is collected as far as their house can afford. The brandy is, regrettably, evidence. The parrot is adopted by the customs office.',
        },
      },
      {
        label: 'Seize the yacht',
        then: {
          do: [
            { deed: 'arbitrary' },
            { gain: 'fleet', n: 2 },
            { feel: -35, from: 'subject', why: 'Seized my yacht', key: 'petition' },
            { remember: 'Seized our kinsman’s yacht', clan: 'clan', value: -15, decay: 0.2 },
          ],
          text: (c) => `The yacht is refitted for your fleet. ${c.subject!.name} will be telling this story, with a different ending, for years.`,
        },
      },
      {
        label: 'Take a cut and look away',
        then: {
          do: [{ deed: 'arbitrary' }, payment(120), { feel: 20, from: 'subject', why: 'Looked the other way', key: 'petition' }, { trait: 'greedy', p: 0.2 }],
          text: (c) => `The crates are "lost" and your treasury is mysteriously richer. ${c.subject!.name} knows exactly what you are, and so do you.`,
        },
      },
    ],
  }),
  defineEvent({
    id: 'duel_death',
    title: 'Death in a Duel',
    icon: 'duel',
    weight: 1,
    cooldown: 15,
    when: (s) => canAct(s) && nobles(s).length > 0 && localHouses(s).length >= 2,
    subject: (s) => oneOf(s, nobles(s)),
    setup: ({ s, subject, data }) => {
      data.clan = subject!.clanId;
      data.mourners = pick(
        s,
        localHouses(s).filter((k) => k.id !== subject!.clanId),
      ).id;
      data.dead = pick(s, ['Ser Vance', 'Ser Ilma', 'Ser Doran', 'Ser Kestrel', 'Ser Amabel']);
    },
    text: (c) =>
      `${c.data.dead} of House ${house(c, 'mourners')} is dead, run through at dawn in a duel with ${fullName(c.s, c.subject!)}. It was a fair fight, everyone agrees. House ${house(c, 'mourners')} wants blood anyway.`,
    options: [
      {
        label: 'Punish the survivor',
        then: {
          do: [
            { deed: 'justice' },
            { opinion: 8, clan: 'mourners' },
            { feel: -30, from: 'subject', why: 'Punished me for a fair fight', key: 'petition' },
            { remember: 'Punished our kinsman for a fair fight', clan: 'clan', value: -8, decay: 0.3 },
          ],
          text: (c) => `${c.subject!.name} is fined, disarmed and sent home. House ${house(c, 'mourners')} is satisfied, for now.`,
        },
      },
      {
        label: 'Pardon them: it was a fair fight',
        then: {
          do: [
            { deed: 'pardons' },
            { feel: 20, from: 'subject', why: 'Pardoned me', key: 'petition' },
            { remember: 'Pardoned the killer of our kin', clan: 'mourners', value: -12, decay: 0.2 },
          ],
          text: (c) => `The law is clear and you follow it. House ${house(c, 'mourners')} hears only that you protected a killer.`,
        },
      },
      {
        label: 'Order blood money',
        then: {
          do: [
            payment(100, 'clan', 'mourners'),
            { deed: 'justice' },
            { opinion: 6, clan: 'mourners' },
            { feel: -10, from: 'subject', why: 'Made me pay blood money', key: 'petition' },
          ],
          text: 'Money changes hands, the dead are honoured, and both houses grumble about the price. Nobody else dies.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'inheritance_quarrel',
    title: 'Brothers Before the Throne',
    icon: 'family',
    weight: 1,
    cooldown: 15,
    when: (s) => canAct(s) && quarrellingHouses(s).length > 0,
    setup: ({ s, data }) => {
      const k = pick(s, quarrellingHouses(s));
      const kids = childrenOf(s, s.characters[k.headId])
        .filter((c) => c.clanId === k.id && freeAdult(s, c))
        .sort((a, b) => a.born - b.born);
      Object.assign(data, { clan: k.id, lord: k.headId, elder: kids[0].id, younger: kids[kids.length - 1].id });
    },
    text: (c) =>
      `${person(c, 'elder').name} and ${person(c, 'younger').name}, children of ${fullName(c.s, person(c, 'lord'))}, have come to your court to argue over who inherits. Their father is very much alive, and very much embarrassed.`,
    options: [
      {
        label: 'Back the elder',
        then: {
          do: [
            { feel: 15, from: 'elder', why: 'Backed my claim', key: 'petition' },
            { feel: -15, from: 'younger', why: 'Backed my sibling over me', key: 'petition' },
            { feel: -20, from: 'younger', to: 'elder', why: 'Stole my inheritance at court', key: 'inheritance' },
          ],
          text: (c) => `Custom favours the elder, and so do you. ${named(c, 'younger')} leaves without a word to anyone.`,
        },
      },
      {
        label: 'Back the younger',
        then: {
          do: [
            { deed: 'arbitrary' },
            { feel: 15, from: 'younger', why: 'Backed my claim', key: 'petition' },
            { feel: -20, from: 'elder', why: 'Backed my sibling over me', key: 'petition' },
            { feel: -20, from: 'elder', to: 'younger', why: 'Turned the court against me', key: 'inheritance' },
            { feel: -10, from: 'lord', why: 'Meddled in my succession', key: 'petition' },
          ],
          text: (c) => `${named(c, 'younger')} is the better candidate and you say so. ${named(c, 'lord')} is not pleased to have it said.`,
        },
      },
      {
        label: "Tell them it is their father's business",
        then: {
          do: [
            { deed: 'justice' },
            { feel: 10, from: 'lord', why: 'Respected my house', key: 'petition' },
            { feel: -5, from: 'elder', why: 'Would not hear me', key: 'petition' },
            { feel: -5, from: 'younger', why: 'Would not hear me', key: 'petition' },
          ],
          text: 'You send them home. Their father thanks you. They thank nobody.',
        },
      },
    ],
  }),
  defineEvent({
    id: 'assembly_insult',
    title: 'An Insult at the Assembly',
    icon: 'gala',
    weight: 1,
    cooldown: 12,
    when: (s) => {
      const heir = currentHeir(s);
      return canAct(s) && lords(s).length > 0 && alive(heir) && ageOf(s, heir) >= 14 && !heir.prisonerOf;
    },
    subject: (s) => oneOf(s, lords(s)),
    setup: ({ subject, data }) => {
      data.clan = subject!.clanId;
    },
    text: ({ s, subject }) =>
      `At the planetary assembly, ${fullName(s, subject!)} described your heir, ${currentHeir(s)?.name ?? 'your heir'}, as "a portrait of a ruler, painted by someone who had only heard one described". The hall laughed.`,
    options: [
      {
        label: 'Demand an apology',
        then: {
          roll: { base: 0.45, per: { stat: 'dip', n: 0.04 } },
          pass: {
            do: [
              { gain: 'prestige', n: 5 },
              { feel: -5, from: 'subject', why: 'Made me apologise', key: 'petition' },
              { feel: 10, from: 'heir', why: 'Stood up for me', key: 'petition' },
            ],
            text: (c) => `${c.subject!.name} apologises, almost sincerely. Your heir stands a little straighter.`,
          },
          fail: {
            do: [
              { lose: 'prestige', n: 5 },
              { feel: -15, from: 'subject', why: 'Demanded I grovel', key: 'petition' },
            ],
            text: (c) => `${c.subject!.name} apologises "for any offence your heir may have imagined". The hall laughs again.`,
          },
        },
      },
      {
        label: 'Let your heir answer it',
        then: {
          roll: { base: 0.4, per: { stat: 'dip', n: 0.05, of: 'heir' } },
          pass: {
            do: [
              { stat: 'dip', n: 1, to: 'heir' },
              { gain: 'prestige', n: 8 },
            ],
            text: 'Your heir replies with a joke so good it is quoted on three worlds. The lord laughs loudest, which is wise.',
          },
          fail: {
            do: [
              { trait: 'wrathful', to: 'heir', p: 0.5 },
              { feel: -10, from: 'subject', why: 'Your heir lost their temper with me', key: 'petition' },
            ],
            text: 'Your heir throws a goblet. It misses. The insult lands rather better.',
          },
        },
      },
      {
        label: 'Fine the lord for insolence',
        then: {
          do: [
            { deed: 'justice' },
            payment(60),
            { feel: -20, from: 'subject', why: 'Fined me for a joke', key: 'petition' },
            { remember: 'Fined our lord for a joke', clan: 'clan', value: -10, decay: 0.3 },
          ],
          text: (c) => `${c.subject!.name} pays. Nobody laughs at your heir again, at least not in the hall.`,
        },
      },
    ],
  }),
];
