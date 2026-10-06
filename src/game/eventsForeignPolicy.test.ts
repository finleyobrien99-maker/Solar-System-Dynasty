import { describe, expect, it } from 'vitest';
import { ch, clanRegions } from './core';
import { buildCtx, EVENT_BY_ID, queueEvent } from './events';
import { defectorFrom, fearfulOfYou, migrateForeignPolicy, quarrelNearYou } from './foreignPolicy';
import { migrateDiplomacy, neighbours, rememberHouse } from './houseRelations';
import type { Clan, GameState, Pending } from './types';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';

type Pend = Extract<Pending, { kind: 'event' }>;

/** You govern on Mars; every landed AI ruler is a free adult with 100 ships, at peace and neutral towards you. */
function world(): GameState {
  const s = createWorld(61);
  const home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(61, 'mars', 'F', 'Asha'), focus: 'dip', age: 40, family: 'married' });
  Object.assign(s, { credits: 5000, prestige: 1000, fleet: 120, pending: [] });
  for (const k of Object.values(s.clans)) {
    if (k.isPlayer) continue;
    const head = ch(s, k.headId);
    if (head) {
      head.born = Math.min(head.born, s.year - 35);
      head.prisonerOf = undefined;
    }
    k.fleet = 100;
    k.allied = false;
    k.opinion = 0;
    k.memories = [];
  }
  migrateDiplomacy(s);
  migrateForeignPolicy(s);
  return s;
}
/** Landed AI houses next to you. */
function near(s: GameState): Clan[] {
  return Object.values(s.clans).filter((k) => !k.isPlayer && clanRegions(s, k.id).length && neighbours(s, k.id, s.playerClanId));
}
/** Queue the event, check its text and tooltips are clean and pure, then take option `n`. */
function play(s: GameState, id: string, n: number) {
  const def = EVENT_BY_ID[id];
  expect(def.when!(s)).toBe(true);
  expect(queueEvent(s, def)).toBe(true);
  const ctx = buildCtx(s, s.pending.at(-1) as Pend);
  expect(def.text(ctx)).not.toMatch(/undefined|NaN|\{/);
  const before = JSON.stringify(s);
  for (const c of def.choices) expect(c.describe(ctx)).not.toMatch(/undefined|NaN/);
  expect(JSON.stringify(s)).toBe(before);
  return def.choices[n].run(ctx);
}
const memo = (k: Clan, text: string) => (k.memories ?? []).some((m) => m.text === text);
const houseMemo = (s: GameState, observer: string, subject: string, text: string) =>
  s.diplomacy!.memories.some((m) => m.observer === observer && m.subject === subject && m.text === text);

describe('A Border Incident', () => {
  function quarrel() {
    const s = world();
    const [a, b] = near(s);
    rememberHouse(s, a.id, b.id, { text: 'Sank our convoy', value: -40 });
    expect(quarrelNearYou(s)).toEqual({ a: a.id, b: b.id });
    return { s, a, b };
  }

  it('needs a real quarrel between two neighbours of yours', () => {
    expect(quarrelNearYou(world())).toBeUndefined();
  });

  it('mediating costs credits, earns prestige and cools both sides', () => {
    const { s, a, b } = quarrel();
    const credits = s.credits,
      prestige = s.prestige;
    play(s, 'border_incident', 0);
    expect(s.credits).toBe(credits - 40);
    expect(s.prestige).toBe(prestige + 20);
    expect(memo(a, 'Kept the peace between us and our neighbours') && memo(b, 'Kept the peace between us and our neighbours')).toBe(true);
    expect(houseMemo(s, a.id, b.id, 'Made peace before a foreign court')).toBe(true);
  });

  it('taking a side wins one house and loses the other, and deepens their quarrel', () => {
    const { s, a, b } = quarrel();
    play(s, 'border_incident', 1);
    expect(memo(a, 'Took our side against our neighbours')).toBe(true);
    expect(memo(b, 'Sided against us')).toBe(true);
    expect(b.opinion).toBeLessThan(0);
    expect(houseMemo(s, b.id, a.id, 'Turned a foreign court against us')).toBe(true);
  });
});

describe('The Neighbours Confer', () => {
  it('only when you are a rising power with frightened neighbours', () => {
    const s = world();
    expect(fearfulOfYou(s)).toEqual([]);
    s.fleet = 2000;
    expect(fearfulOfYou(s).length).toBeGreaterThanOrEqual(2);
  });

  it('gifts buy off their host; a parade frightens them all', () => {
    let s = world();
    s.fleet = 2000;
    const lead = s.clans[fearfulOfYou(s)[0]];
    const credits = s.credits;
    play(s, 'giant_summit', 0);
    expect(s.credits).toBe(credits - 80);
    expect(memo(lead, 'Sent rich gifts when we feared them')).toBe(true);

    s = world();
    s.fleet = 2000;
    const fearful = fearfulOfYou(s);
    const prestige = s.prestige;
    play(s, 'giant_summit', 1);
    expect(s.prestige).toBe(prestige + 25);
    for (const id of fearful) expect(memo(s.clans[id], 'Paraded their fleet to cow us')).toBe(true);
  });
});

describe('A Defector', () => {
  function rival() {
    const s = world();
    // A neighbour with someone at court besides its lord.
    const k = near(s).find((x) =>
      Object.values(s.characters).some((c) => c.clanId === x.id && c.id !== x.headId && c.died === undefined && s.year - c.born >= 18),
    )!;
    k.opinion = -60;
    const d = defectorFrom(s)!;
    expect(d.clanId).toBe(k.id);
    expect(d.personId).not.toBe(k.headId);
    return { s, k };
  }

  it('only from a house set against you', () => {
    expect(defectorFrom(world())).toBeUndefined();
  });

  it('their maps let your own saboteurs try, by the ordinary rules: paid, one scheme, no fleet needed', () => {
    const seen = { ablaze: false, foiled: false };
    for (let seed = 1; seed < 60 && !(seen.ablaze && seen.foiled); seed++) {
      const { s, k } = rival();
      s.fleet = 0; // covert work, not a raid
      s.seed = seed;
      const credits = s.credits;
      play(s, 'defector', 0);
      expect(s.credits).toBe(credits - 90);
      expect(s.fleet).toBe(0);
      expect(memo(k, 'Sheltered our traitor')).toBe(true);
      const report = s.pending.find((p) => p.kind === 'notice' && (p.title === 'Shipyards Ablaze' || p.title === 'Sabotage Foiled'));
      expect(report).toBeTruthy();
      if (report?.kind === 'notice' && report.title === 'Shipyards Ablaze') {
        seen.ablaze = true;
        expect(k.fleet).toBeLessThan(100);
      } else {
        seen.foiled = true;
        expect(k.fleet).toBe(100);
      }
    }
    expect(seen).toEqual({ ablaze: true, foiled: true });
  });

  it('without credits or a scheme to spare, the saboteurs stay home; the other answers remain', () => {
    const { s } = rival();
    s.credits = 0;
    const def = EVENT_BY_ID.defector;
    queueEvent(s, def);
    const ctx = buildCtx(s, s.pending.at(-1) as Pend);
    expect(def.choices[0].available!(ctx)).toBe(false);
    expect(def.choices.slice(1).every((c) => !c.available || c.available(ctx))).toBe(true);
  });

  it('sending them back earns a cold thanks', () => {
    const { s, k } = rival();
    play(s, 'defector', 1);
    expect(memo(k, 'Returned a traitor to us')).toBe(true);
    expect(k.fleet).toBe(100);
  });
});
