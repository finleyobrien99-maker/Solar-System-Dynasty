import { describe, expect, it } from 'vitest';
import { alive, ch, clanRegions, liegeOf, ruler, setOwner } from './core';
import type { RealmCallAnswer } from './diplomacyTypes';
import { buildCtx, queueEvent } from './events';
import { REALM_DEFENCE_EVENTS } from './eventsRealmDefence';
import { makeTruce } from './peace';
import {
  answerBlocker,
  answerRealmCall,
  OUTRAGE_FADE,
  pendingRealmCall,
  planetOutrageOf,
  realmCall,
  realmCallApplies,
  realmCallPreview,
  realmDefenceTick,
  realmMembers,
  realmOf,
  recordPlanetConquest,
  REFUSAL_GRIEVANCE,
  unitedUntil,
  UNITY_YEARS,
} from './realmDefence';
import { relationOf } from './relations';
import type { AiWar, Clan, GameState, Pending, Region } from './types';
import { createWorld, rollRuler, scenarioHouses, startGame } from './world';

type Pend = Extract<Pending, { kind: 'event' }>;
const PERSONAL = ['brave', 'craven', 'wrathful', 'honest', 'deceitful'];

/** You govern on Mars, sworn to its sovereign. Every landed AI ruler is a free adult with a fleet of 100 and no oaths. */
function world(seed = 61): GameState {
  const s = createWorld(seed);
  const home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(seed, 'mars', 'F', 'Asha'), focus: 'cmd', age: 40, family: 'married' });
  Object.assign(s, { credits: 5000, prestige: 1000, fleet: 120, pending: [] });
  for (const k of Object.values(s.clans)) {
    if (k.isPlayer) continue;
    const head = ch(s, k.headId);
    if (head) {
      head.born = Math.min(head.born, s.year - 35);
      head.prisonerOf = undefined;
      head.traits = head.traits.filter((t) => !PERSONAL.includes(t));
    }
    k.fleet = 100;
    k.allied = false;
  }
  return s;
}

function capital(s: GameState, planet: string): Region {
  return Object.values(s.regions).find((r) => r.capital && r.planetId === planet)!;
}
function sovereign(s: GameState, planet: string): Clan {
  return s.clans[capital(s, planet).owner];
}
/** A landed house of the planet that is not its sovereign. */
function vassal(s: GameState, planet: string, skip: string[] = []): Clan {
  return Object.values(s.clans).find(
    (k) => !k.isPlayer && k.planetId === planet && clanRegions(s, k.id).length && !clanRegions(s, k.id).some((r) => r.capital) && !skip.includes(k.id),
  )!;
}
function target(s: GameState, k: Clan): string {
  return clanRegions(s, k.id)[0].id;
}

describe('who a realm calls', () => {
  it('attacking a Neptunian house from Mars calls Neptune: its sovereign is bound to come, every sworn house weighs it', () => {
    const s = world();
    const d = vassal(s, 'neptune');
    const sov = sovereign(s, 'neptune');
    const offers = realmCallPreview(s, s.playerClanId, d.id, target(s, d));
    expect(offers.map((o) => o.clanId).sort()).toEqual(realmMembers(s, d.id).sort());
    expect(offers[0]).toMatchObject({ clanId: sov.id, role: 'sovereign', chance: 1, proposedShips: 50 });
    for (const o of offers.slice(1)) {
      expect(o.role).toBe('vassal');
      expect(o.liegeId).toBe(liegeOf(s, o.clanId) ?? undefined);
      expect(o.chance).toBeGreaterThanOrEqual(0.05);
      expect(o.chance).toBeLessThanOrEqual(0.95);
      expect(o.reasons[0].label).toBe(`Sworn to House ${sov.name}`);
    }
    expect(offers.some((o) => s.clans[o.clanId].planetId === 'mars')).toBe(false);
  });

  it('describing a call never rolls dice or changes anything', () => {
    const s = world();
    const d = vassal(s, 'neptune');
    const before = JSON.stringify(s);
    realmCallPreview(s, s.playerClanId, d.id, target(s, d));
    planetOutrageOf(s, 'neptune');
    unitedUntil(s, 'neptune');
    pendingRealmCall(s);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('fights inside one realm stay local, and revolts and independence wars never summon a realm', () => {
    const s = world();
    const a = vassal(s, 'neptune');
    const d = vassal(s, 'neptune', [a.id]);
    expect(realmOf(s, a.id)).toBe(realmOf(s, d.id));
    expect(realmCallPreview(s, a.id, d.id, target(s, d))).toEqual([]);
    const outsider = vassal(s, 'venus');
    for (const cb of ['revolt', 'independence'] as const) expect(realmCallApplies(s, outsider.id, d.id, cb)).toBe(false);
    expect(realmCallApplies(s, outsider.id, d.id, 'holy')).toBe(true);
  });

  it('an AI invader and you are judged by the same rules', () => {
    const s = world();
    const d = vassal(s, 'neptune');
    const martian = vassal(s, 'mars');
    expect(realmOf(s, martian.id)).toBe(realmOf(s, s.playerClanId));
    const strip = (id: string) => realmCallPreview(s, id, d.id, target(s, d)).map((o) => [o.clanId, o.role, o.blocker ?? '']);
    expect(strip(martian.id)).toEqual(strip(s.playerClanId));
  });

  it('a captive, a child, a house at war or sworn to peace with the attacker is blocked, not refusing', () => {
    const s = world();
    const d = vassal(s, 'neptune');
    const offers = realmCallPreview(s, s.playerClanId, d.id, target(s, d)).filter((o) => o.role === 'vassal');
    expect(offers.length).toBeGreaterThan(0);
    const v = s.clans[offers[0].clanId];
    const head = ch(s, v.headId)!;
    head.prisonerOf = d.id;
    expect(realmCallPreview(s, s.playerClanId, d.id, target(s, d)).find((o) => o.clanId === v.id)?.blocker).toMatch(/captive/);
    head.prisonerOf = undefined;
    head.born = s.year - 10;
    expect(realmCallPreview(s, s.playerClanId, d.id, target(s, d)).find((o) => o.clanId === v.id)?.blocker).toMatch(/regent/);
    head.born = s.year - 40;
    makeTruce(s, s.playerClanId, v.id);
    const sworn = realmCall(s, { warId: 'w-x', attackerId: s.playerClanId, defenderId: d.id, regionId: target(s, d) }).find((a) => a.clanId === v.id)!;
    expect(sworn.answer).toBe('blocked');
    expect(sworn.blocker).toMatch(/peace/);
    expect(relationOf(s, ch(s, s.clans[realmOf(s, d.id)].headId)!.id, head.id)?.feelings.some((f) => f.key === 'realm_call') ?? false).toBe(false);
  });
});

describe('the realm answers', () => {
  it('the sovereign answers without a roll; sworn houses roll once; a refusal is a personal grievance of their liege; answers name the ruler who decided', () => {
    let refused = false;
    for (let seed = 1; seed < 40 && !refused; seed++) {
      const s = world();
      const d = vassal(s, 'neptune');
      for (const id of realmMembers(s, d.id)) {
        const h = ch(s, s.clans[id].headId)!;
        if (id !== realmOf(s, d.id)) h.traits.push('craven');
      }
      s.seed = seed * 7;
      const answers = realmCall(s, { warId: 'w-1', attackerId: s.playerClanId, defenderId: d.id, regionId: target(s, d) });
      const sov = answers.find((a) => a.role === 'sovereign')!;
      expect(sov.answer).toBe('accepted');
      for (const a of answers) {
        expect(a.rulerId).toBe(s.clans[a.clanId].headId);
        expect(a.year).toBe(s.year);
      }
      const no = answers.find((a) => a.answer === 'refused');
      if (!no) continue;
      refused = true;
      const liege = ch(s, s.clans[no.liegeId!].headId)!;
      const feeling = relationOf(s, liege.id, s.clans[no.clanId].headId)?.feelings.find((f) => f.key === 'realm_call');
      expect(feeling?.value).toBe(REFUSAL_GRIEVANCE);
    }
    expect(refused).toBe(true);
  });

  it('the same saved world and seed always gives the same answers', () => {
    const run = () => {
      const s = world();
      s.seed = 4242;
      const d = vassal(s, 'neptune');
      return realmCall(s, { warId: 'w-2', attackerId: s.playerClanId, defenderId: d.id, regionId: target(s, d) }).map((a) => a.answer);
    };
    expect(run()).toEqual(run());
  });

  it('as a sovereign you are bound exactly like an AI sovereign', () => {
    const s = world();
    const cap = capital(s, 'mars');
    setOwner(s, cap, s.playerClanId);
    const d = vassal(s, 'mars');
    expect(liegeOf(s, d.id)).toBe(s.playerClanId);
    const invader = vassal(s, 'venus');
    const mine = realmCall(s, { warId: 'w-3', attackerId: invader.id, defenderId: d.id, regionId: target(s, d) }).find((a) => a.clanId === s.playerClanId)!;
    expect(mine).toMatchObject({ role: 'sovereign', answer: 'accepted', proposedShips: 60, rulerId: s.rulerId });
  });
});

describe('your own call to arms', () => {
  /** An outsider attacks your Martian liege's realm; the answers are saved with the AI war as the war lane will. */
  function called(): { s: GameState; war: AiWar & { realmCalls: RealmCallAnswer[] } } {
    const s = world();
    const d = vassal(s, 'mars');
    const invader = vassal(s, 'venus');
    const regionId = target(s, d);
    const war: AiWar & { realmCalls: RealmCallAnswer[] } = {
      id: 'aw-1',
      attacker: invader.id,
      defender: d.id,
      target: regionId,
      started: s.year,
      progress: 0,
      coalition: [],
      realmCalls: realmCall(s, { warId: 'aw-1', attackerId: invader.id, defenderId: d.id, regionId }),
    };
    s.aiWars.push(war);
    return { s, war };
  }

  it('you are asked, never rolled for', () => {
    const { s, war } = called();
    const mine = war.realmCalls.find((a) => a.clanId === s.playerClanId)!;
    expect(mine.answer).toBe('pending');
    expect(pendingRealmCall(s)?.war.id).toBe(war.id);
  });

  it('accepting fixes the ships you send and who decided; you cannot accept once you are at war, but you can still refuse', () => {
    const { s, war } = called();
    const t = structuredClone(s);
    const yes = answerRealmCall(s, war.id, true)!;
    expect(yes).toMatchObject({ answer: 'accepted', proposedShips: 60, rulerId: s.rulerId });
    expect(pendingRealmCall(s)).toBeUndefined();
    t.wars.push({ id: 'w-mine', enemy: war.attacker, playerAttacker: true, target: war.target, cb: 'conquest', score: 0, started: t.year });
    expect(answerBlocker(t, war.id)).toMatch(/war/);
    const before = JSON.stringify(t);
    expect(answerRealmCall(t, war.id, true)).toBeUndefined();
    expect(JSON.stringify(t)).toBe(before);
    const no = answerRealmCall(t, war.id, false)!;
    expect(no.answer).toBe('refused');
    const liege = ch(t, t.clans[no.liegeId!].headId)!;
    expect(relationOf(t, liege.id, t.rulerId)?.feelings.find((f) => f.key === 'realm_call')?.value).toBe(REFUSAL_GRIEVANCE);
  });

  it('a call to a finished war is inert', () => {
    const { s, war } = called();
    s.aiWars = [];
    const before = JSON.stringify(s);
    expect(answerRealmCall(s, war.id, true)).toBeUndefined();
    expect(JSON.stringify(s)).toBe(before);
  });

  it('the event fires while you are asked, every option resolves, and describing it changes nothing', () => {
    const def = REALM_DEFENCE_EVENTS[0];
    for (const i of def.choices.keys()) {
      const { s } = called();
      expect(def.when!(s)).toBe(true);
      expect(queueEvent(s, def)).toBe(true);
      const ctx = buildCtx(s, s.pending.at(-1) as Pend);
      expect(def.text(ctx)).not.toMatch(/undefined|NaN/);
      const before = JSON.stringify(s);
      for (const c of def.choices) {
        c.describe(ctx);
        c.available?.(ctx);
        c.why?.(ctx);
      }
      expect(JSON.stringify(s)).toBe(before);
      expect(def.choices[i].run(ctx)).not.toMatch(/undefined|NaN/);
      expect(pendingRealmCall(s)).toBeUndefined();
      expect(def.when!(s)).toBe(false);
    }
  });
});

describe('a world unites', () => {
  function conquer(s: GameState, attacker: string, planet: string): Region {
    const r = Object.values(s.regions).find((x) => x.planetId === planet && !x.capital && x.owner !== attacker)!;
    setOwner(s, r, attacker);
    recordPlanetConquest(s, attacker, r);
    return r;
  }

  it('repeated foreign conquest unites a world, and then every house of it answers, even those outside the realm', () => {
    const s = world();
    const venus = vassal(s, 'venus');
    conquer(s, venus.id, 'neptune');
    expect(planetOutrageOf(s, 'neptune')).toBe(1);
    expect(unitedUntil(s, 'neptune')).toBeUndefined();
    conquer(s, s.playerClanId, 'neptune');
    expect(unitedUntil(s, 'neptune')).toBe(s.year + UNITY_YEARS);
    const loner = vassal(s, 'neptune');
    loner.liege = 'none';
    expect(realmOf(s, loner.id)).toBe(loner.id);
    const d = vassal(s, 'neptune', [loner.id]);
    const offers = realmCallPreview(s, s.playerClanId, d.id, target(s, d));
    const theirs = offers.find((o) => o.clanId === loner.id)!;
    expect(theirs).toMatchObject({ role: 'planet', chance: 1 });
    expect(offers.filter((o) => !o.blocker).every((o) => o.chance === 1)).toBe(true);
  });

  it('a conquest by a house of the same world does not anger it, and outrage fades with quiet', () => {
    const s = world();
    const a = vassal(s, 'neptune');
    conquer(s, a.id, 'neptune');
    expect(planetOutrageOf(s, 'neptune')).toBe(0);
    conquer(s, vassal(s, 'venus').id, 'neptune');
    expect(planetOutrageOf(s, 'neptune')).toBe(1);
    s.year += OUTRAGE_FADE;
    expect(planetOutrageOf(s, 'neptune')).toBe(0);
    realmDefenceTick(s);
    expect(s.flags?.['outrage:neptune']).toBeUndefined();
  });

  it('unity ends when its time is up', () => {
    const s = world();
    conquer(s, vassal(s, 'venus').id, 'neptune');
    conquer(s, vassal(s, 'venus').id, 'neptune');
    expect(unitedUntil(s, 'neptune')).toBeTruthy();
    s.year += UNITY_YEARS;
    expect(unitedUntil(s, 'neptune')).toBeUndefined();
    realmDefenceTick(s);
    expect(s.flags?.['united:neptune']).toBeUndefined();
  });

  it('every landed house in the test world has a living ruler', () => {
    const s = world();
    for (const k of Object.values(s.clans)) if (clanRegions(s, k.id).length && !k.isPlayer) expect(alive(ch(s, k.headId))).toBe(true);
    expect(ruler(s)).toBeTruthy();
  });
});
