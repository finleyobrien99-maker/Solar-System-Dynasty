import { SAVE_VERSION } from './core';
import { describe, expect, it } from 'vitest';
import { aiPlans, runAiScheme } from './aiIntrigue';
import { beginAffair, exposeAffair } from './aiCourt';
import { prune } from './ai';
import { createCharacter } from './character';
import { clanRegions, ruler } from './core';
import { EVENT_BY_ID, queueEvent } from './events';
import { runScheme, schemeBlocker } from './intrigue';
import { killCharacter } from './life';
import { addFeeling, feelingsSum } from './relations';
import { migrate, exportSave, importSave } from './save';
import {
  consumeHook,
  exposeSecret,
  hookBlocker,
  hooksOf,
  investigate,
  investigateBlocker,
  investigateChance,
  learnSecret,
  marriageHookBlocker,
  recordAffair,
  recordMurder,
  secretLabel,
  secretsKnownTo,
  secretsTick,
  spendMarriageHook,
} from './secrets';
import type { Character, GameState } from './types';
import { createWorld, rollRuler, startGame } from './world';

function court(): GameState {
  const s = createWorld(71);
  const k = Object.values(s.clans).find((x) => x.planetId === 'mars' && !clanRegions(s, x.id).some((r) => r.capital))!;
  startGame(s, { clanId: k.id, ruler: rollRuler(71, 'mars', 'M', 'Oren'), focus: 'int', age: 40, family: 'married' });
  s.credits = 2000;
  s.prestige = 100;
  return s;
}

function rival(s: GameState): Character {
  const k = Object.values(s.clans).find((x) => !x.isPlayer && clanRegions(s, x.id).length)!;
  const h = s.characters[k.headId];
  h.born = s.year - 40;
  delete h.prisonerOf;
  return h;
}

function person(s: GameState, clanId: string, gender: Character['gender'] = 'F', age = 25): Character {
  return createCharacter(s, { clanId, gender, born: s.year - age, planetId: s.clans[clanId].planetId });
}

function evidence(s: GameState, subject = rival(s)) {
  const victim = person(s, subject.clanId);
  victim.died = s.year;
  victim.deathCause = 'assassinated';
  return recordMurder(s, subject, victim);
}

function match(s: GameState) {
  const h = rival(s),
    r = ruler(s);
  const own = person(s, r.clanId, 'M');
  own.fatherId = r.id;
  r.childrenIds.push(own.id);
  h.childrenIds = [];
  const elder = person(s, h.clanId, 'F', 30),
    partner = person(s, h.clanId, 'F', 20);
  for (const kid of [elder, partner]) {
    if (h.gender === 'M') kid.fatherId = h.id;
    else kid.motherId = h.id;
    h.childrenIds.push(kid.id);
  }
  const secret = evidence(s, h);
  learnSecret(s, secret.id, r.id);
  return { h, r, own, partner, elder, secret, hook: hooksOf(s)[0] };
}

describe('real evidence and personal leverage', () => {
  it('queries hide unknown proof, remain pure, and separate suspicion from fact', () => {
    const s = court(),
      h = rival(s),
      secret = evidence(s, h);
    addFeeling(s, s.rulerId, h.id, { why: 'Suspected of murder', value: -30, decay: 1 });
    const before = JSON.stringify(s);
    expect(secretsKnownTo(s)).toEqual([]);
    expect(secretLabel(s, secret)).toBe('Undiscovered secret');
    expect(hooksOf(s)).toEqual([]);
    expect(schemeBlocker(s, 'blackmail', h.clanId)).toContain('hook');
    expect(JSON.stringify(s)).toBe(before);
    learnSecret(s, secret.id, s.rulerId);
    expect(secretsKnownTo(s)).toContain(secret);
    expect(secretLabel(s, secret)).toContain(secret.otherName);
    expect(hooksOf(s)).toHaveLength(1);
  });

  it('repeated discovery and the end of an affair cannot mint another hook', () => {
    const s = court(),
      h = rival(s),
      lover = person(s, h.clanId);
    const secrets = recordAffair(s, ruler(s), lover);
    expect(secrets).toHaveLength(1);
    const secret = secrets[0];
    learnSecret(s, secret.id, h.id);
    const hook = hooksOf(s, h.id).find((x) => x.secretId === secret.id)!;
    expect(consumeHook(s, hook.id, h.id)).toBe(true);
    ruler(s).loverId = undefined;
    expect(learnSecret(s, secret.id, h.id)).toBe(false);
    recordAffair(s, ruler(s), lover);
    expect(s.hooks.filter((x) => x.secretId === secret.id && x.holderId === h.id)).toHaveLength(1);
    expect(hooksOf(s, h.id)).toEqual([]);
    expect(secretsKnownTo(s, h.id)).toContain(secret);
  });

  it('unmarried romance and spouses are not adultery evidence', () => {
    const s = court(),
      a = person(s, s.playerClanId, 'M'),
      b = person(s, rival(s).clanId);
    expect(recordAffair(s, a, b)).toEqual([]);
    expect(recordAffair(s, ruler(s), s.characters[ruler(s).spouseId!])).toEqual([]);
  });

  it('an AI affair is private until exposure and then gives no blackmail leverage', () => {
    const s = court(),
      h = rival(s),
      lover = person(s, ruler(s).clanId);
    beginAffair(s, h, lover);
    expect(secretsKnownTo(s)).toEqual([]);
    exposeAffair(s, h, lover);
    expect(secretsKnownTo(s).some((x) => x.subjectId === h.id)).toBe(true);
    expect(hooksOf(s, lover.id)).toEqual([]);
  });

  it("exposure is once-only and destroys every holder's leverage", () => {
    const s = court(),
      h = rival(s),
      secret = evidence(s, h),
      watcher = person(s, s.playerClanId);
    learnSecret(s, secret.id, s.rulerId);
    learnSecret(s, secret.id, watcher.id);
    expect(exposeSecret(s, secret.id, watcher.id)).toBe(true);
    expect(hooksOf(s)).toEqual([]);
    expect(hooksOf(s, watcher.id)).toEqual([]);
    const before = JSON.stringify(s);
    expect(exposeSecret(s, secret.id)).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
    expect(secretsKnownTo(s, 'stranger')).toContain(secret);
  });

  it('old affair evidence hurts the betrayed spouse, never a later spouse', () => {
    const s = court(),
      h = rival(s),
      oldSpouse = s.characters[h.spouseId!],
      lover = person(s, s.playerClanId);
    const secret = recordAffair(s, h, lover)[0];
    learnSecret(s, secret.id, s.rulerId);
    const later = person(s, h.clanId);
    h.spouseId = later.id;
    later.spouseId = h.id;
    h.loverId = undefined;
    expect(exposeSecret(s, secret.id)).toBe(true);
    expect(feelingsSum(s, oldSpouse, h)).toBe(-40);
    expect(feelingsSum(s, later, h)).toBe(0);
  });

  it('private murder victims survive stranger pruning so future proof still causes grief', () => {
    const s = court(),
      h = rival(s),
      victim = person(s, h.clanId),
      child = person(s, h.clanId);
    child.motherId = victim.id;
    victim.childrenIds.push(child.id);
    const secret = recordMurder(s, h, victim);
    killCharacter(s, victim.id, 'assassinated');
    s.year += 5;
    learnSecret(s, secret.id, s.rulerId);
    prune(s);
    expect(s.characters[victim.id]).toBeDefined();
    exposeSecret(s, secret.id);
    expect(feelingsSum(s, child, h)).toBe(-90);
  });

  it('death and succession end personal hooks instead of passing them to the heir', () => {
    const s = court(),
      { h, own, hook } = match(s);
    expect(hookBlocker(s, hook.id, own.id)).toContain('not your');
    ruler(s).died = s.year;
    s.rulerId = own.id;
    s.clans[own.clanId].headId = own.id;
    expect(hooksOf(s)).toEqual([]);
    h.died = s.year;
    expect(hookBlocker(s, hook.id, hook.holderId)).not.toBeNull();
  });

  it('v4 migration records living affairs but never invents past murder evidence, and is idempotent', () => {
    const s = court(),
      lover = person(s, rival(s).clanId);
    ruler(s).loverId = lover.id;
    ruler(s).traits.push('kinslayer');
    s.version = 4;
    delete (s as Partial<GameState>).secrets;
    delete (s as Partial<GameState>).hooks;
    const migrated = migrate(s);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.secrets.every((x) => x.kind === 'affair')).toBe(true);
    const once = structuredClone(migrated);
    expect(migrate({ ...structuredClone(migrated), version: 4 })).toEqual(once);
    expect(importSave(exportSave(migrated))).toEqual(JSON.parse(JSON.stringify(migrated)));
  });

  it('stops retaining dead-holder hooks and old dead-subject evidence', () => {
    const s = court(),
      { h, hook } = match(s);
    s.characters[hook.holderId].died = s.year;
    h.died = s.year - 16;
    secretsTick(s);
    expect(s.secrets).toEqual([]);
    expect(s.hooks).toEqual([]);
  });
});

describe('investigations and money backed by evidence', () => {
  it('a clean target costs one investigation but never yields invented evidence', () => {
    const s = court(),
      h = rival(s),
      before = s.credits;
    expect(investigate(s, h.id)).toBe(false);
    expect(s.credits).toBe(before - 40);
    expect(s.secrets).toEqual([]);
    const snapshot = JSON.stringify(s);
    expect(investigate(s, h.id)).toBe(false);
    expect(investigateBlocker(s, h.id)).toContain('Already');
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('both heads can find genuine proof with their own paid investigation', () => {
    for (const ai of [false, true]) {
      let found = false;
      for (let seed = 1; seed < 100 && !found; seed++) {
        const s = court(),
          h = rival(s),
          actor = ai ? h : ruler(s),
          target = ai ? ruler(s) : h;
        const secret = evidence(s, target);
        const before = ai ? s.clans[h.clanId].credits : s.credits;
        s.clans[h.clanId].credits = ai ? 1000 : s.clans[h.clanId].credits;
        s.seed = seed;
        found = investigate(s, target.id, actor.id);
        expect(ai ? s.clans[h.clanId].credits : s.credits).toBe((ai ? 1000 : before) - 40);
        if (found) expect(hooksOf(s, actor.id).some((x) => x.secretId === secret.id)).toBe(true);
      }
      expect(found).toBe(true);
    }
  });

  it("the player's spymaster never improves an AI investigator's chance", () => {
    const s = court(),
      h = rival(s),
      spy = person(s, s.playerClanId);
    const before = investigateChance(s, s.rulerId, h.id);
    s.council.spymaster = spy.id;
    spy.base.int = 50;
    expect(investigateChance(s, s.rulerId, h.id)).toBe(before);
    expect(investigateChance(s, h.id)).toBeGreaterThan(0.35);
  });

  it('automatic spymaster discovery gives actual proof, not a rumour', () => {
    let discovered = false;
    for (let seed = 1; seed < 100 && !discovered; seed++) {
      const s = court(),
        h = rival(s),
        spy = person(s, s.playerClanId),
        secret = evidence(s, h);
      spy.base.int = 20;
      s.council.spymaster = spy.id;
      s.seed = seed;
      secretsTick(s);
      discovered = secretsKnownTo(s).some((x) => x.id === secret.id);
      if (discovered) expect(hooksOf(s).some((x) => x.secretId === secret.id)).toBe(true);
    }
    expect(discovered).toBe(true);
  });

  it('player blackmail debits the victim treasury and spends evidence even if they refuse', () => {
    let paid = false,
      refused = false;
    for (let seed = 1; seed < 200 && (!paid || !refused); seed++) {
      const s = court(),
        { h, hook } = match(s),
        k = s.clans[h.clanId];
      k.credits = 100;
      s.seed = seed;
      const before = s.credits + k.credits;
      const success = runScheme(s, 'blackmail', k.id);
      expect(s.credits + k.credits).toBe(before - 20);
      expect(k.credits).toBeGreaterThanOrEqual(0);
      expect(hook.usedYear).toBe(s.year);
      expect(schemeBlocker(s, 'blackmail', k.id)).not.toBeNull();
      if (success) paid = true;
      else refused = true;
    }
    expect(paid && refused).toBe(true);
  });

  it('AI cannot plan or force a blackmail payment without usable evidence', () => {
    const s = court(),
      h = rival(s);
    const other = Object.values(s.clans).find((x) => !x.isPlayer && x.id !== h.clanId && clanRegions(s, x.id).length)!;
    h.traits.push('greedy');
    s.clans[h.clanId].credits = 1000;
    other.credits = 1000;
    expect(aiPlans(s, s.clans[h.clanId]).some((x) => x.kind === 'blackmail')).toBe(false);
    const before = JSON.stringify(s);
    expect(runAiScheme(s, s.clans[h.clanId], { kind: 'blackmail', target: s.characters[other.headId], score: 100 })).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('no blackmail letter is invented from a lover link or kinslayer trait alone', () => {
    const s = court(),
      h = rival(s);
    h.traits.push('greedy');
    s.clans[h.clanId].opinion = -60;
    ruler(s).traits.push('kinslayer');
    ruler(s).loverId = person(s, h.clanId).id;
    const def = EVENT_BY_ID.blackmail_letter;
    expect(def.when!(s)).toBe(false);
    const secret = recordAffair(s, ruler(s), s.characters[ruler(s).loverId!])[0];
    expect(def.when!(s)).toBe(false);
    learnSecret(s, secret.id, h.id);
    expect(def.when!(s)).toBe(true);
    expect(queueEvent(s, def)).toBe(true);
  });
});

describe('a marriage purchased with silence', () => {
  it('uses a hook once, joins the correct household and leaves resentment without goodwill', () => {
    const s = court(),
      { h, own, partner, hook } = match(s),
      k = s.clans[h.clanId],
      before = k.opinion;
    expect(marriageHookBlocker(s, hook.id, own.id, partner.id)).toBeNull();
    expect(spendMarriageHook(s, hook.id, own.id, partner.id)).toBe(true);
    expect(own.spouseId).toBe(partner.id);
    expect(partner.spouseId).toBe(own.id);
    expect(partner.marriedIn).toBe(true);
    expect(own.marriedIn).toBe(false);
    expect(feelingsSum(s, h, ruler(s))).toBe(-50);
    expect(feelingsSum(s, partner, ruler(s))).toBe(-35);
    expect(k.opinion).toBe(before);
    expect(k.allied).toBe(false);
    const snapshot = JSON.stringify(s);
    expect(spendMarriageHook(s, hook.id, own.id, partner.id)).toBe(false);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  for (const invalid of ['child', 'dead', 'captive', 'married', 'betrothed', 'heir', 'wrong parent', 'close kin', 'exposed', 'foreign hook'] as const) {
    it(`rejects ${invalid} without consuming the hook or changing state`, () => {
      const s = court(),
        { h, own, partner, elder, secret, hook } = match(s);
      switch (invalid) {
        case 'child':
          partner.born = s.year - 17;
          break;
        case 'dead':
          partner.died = s.year;
          break;
        case 'captive':
          partner.prisonerOf = s.playerClanId;
          break;
        case 'married':
          partner.spouseId = person(s, h.clanId, 'M').id;
          break;
        case 'betrothed':
          partner.betrothedId = own.id;
          break;
        case 'heir':
          elder.died = s.year;
          break;
        case 'wrong parent':
          partner.fatherId = undefined;
          partner.motherId = undefined;
          break;
        case 'close kin':
          own.motherId = partner.id;
          break;
        case 'exposed':
          exposeSecret(s, secret.id);
          break;
        case 'foreign hook':
          hook.holderId = h.id;
          break;
      }
      const before = JSON.stringify(s);
      expect(marriageHookBlocker(s, hook.id, own.id, partner.id)).not.toBeNull();
      expect(spendMarriageHook(s, hook.id, own.id, partner.id)).toBe(false);
      expect(JSON.stringify(s)).toBe(before);
    });
  }

  it('an AI head can spend real leverage on a non-heir in the player family under the same rules', () => {
    const s = court(),
      h = rival(s),
      r = ruler(s);
    const elder = person(s, r.clanId, 'F', 30),
      partner = person(s, r.clanId, 'F', 20),
      own = person(s, h.clanId, 'M');
    r.childrenIds = [elder.id, partner.id];
    elder.fatherId = r.id;
    partner.fatherId = r.id;
    const secret = evidence(s, r);
    learnSecret(s, secret.id, h.id);
    const hook = hooksOf(s, h.id)[0];
    expect(spendMarriageHook(s, hook.id, own.id, partner.id, h.id)).toBe(true);
    expect(partner.marriedIn).toBe(true);
    expect(own.spouseId).toBe(partner.id);
    expect(hook.usedYear).toBe(s.year);
    expect(s.pending.some((x) => x.kind === 'notice' && x.tone === 'bad')).toBe(true);
  });

  it('also protects a designated player heir when an AI holds the hook', () => {
    const s = court(),
      h = rival(s),
      r = ruler(s);
    const elder = person(s, r.clanId, 'F', 30),
      heir = person(s, r.clanId, 'F', 20),
      own = person(s, h.clanId, 'M');
    r.childrenIds = [elder.id, heir.id];
    elder.fatherId = r.id;
    heir.fatherId = r.id;
    s.dynasty.law = 'designated';
    s.dynasty.designatedHeir = heir.id;
    const secret = evidence(s, r);
    learnSecret(s, secret.id, h.id);
    expect(marriageHookBlocker(s, hooksOf(s, h.id)[0].id, own.id, heir.id, h.id)).not.toBeNull();
  });
});
