import { describe, expect, it } from 'vitest';
import { ACTIVITIES, doActivity, type ActivityKind } from './activities';
import { alive, clanRegions, dynastyMembers, ruler } from './core';
import { EVENT_BY_ID, buildCtx, resolveEvent } from './events';
import { acceptSuitor, generateSuitors, augment } from './family';
import { inheritGenetics, lockTrait, purgeTrait, vaultCandidates, buySlot } from './genetics';
import { runScheme, SCHEMES, type SchemeKind } from './intrigue';
import { developRegion, recruitShips, buyItem, equip } from './realm';
import { chance, pick, type Seeded } from './rng';
import { ageUp } from './tick';
import type { Character, GameState } from './types';
import { cbOptions, declareWar, fightBattle, warBlocker } from './war';
import { createWorld, rollRuler, startGame } from './world';
import { exportSave, importSave } from './save';
import { foundCadet } from './cadets';
import { appoint, candidates, ROLE_KEYS } from './council';
import { buildForge, buildVats, cloneCharacter, growVatHeir, researchable, splice, startResearch } from './forge';
import { openRoute } from './trade';

function newGame(seed: number, growth: 'capped' | 'uncapped' = 'uncapped'): GameState {
  const s = createWorld(seed);
  const clan = Object.values(s.clans).find((c) => c.planetId === 'mars' && !clanRegions(s, c.id).some((r) => r.capital))!;
  return startGame(s, { clanId: clan.id, ruler: rollRuler(seed, 'mars', 'F', 'Tess'), focus: 'cmd', growth });
}

function drain(s: GameState, bot: Seeded): void {
  let guard = 0;
  while (s.pending.length && guard++ < 50) {
    const p = s.pending[0];
    if (p.kind === 'event') {
      const def = EVENT_BY_ID[p.eventId];
      const ctx = buildCtx(s, p);
      const ok = def.choices.map((c, i) => [c, i] as const).filter(([c]) => (!c.show || c.show(ctx)) && (!c.available || c.available(ctx)));
      if (!ok.length) {
        s.pending.shift();
        continue;
      }
      resolveEvent(s, p.uid, pick(bot, ok)[1]);
    } else s.pending.shift();
  }
}

function checkInvariants(s: GameState): void {
  for (const r of Object.values(s.regions)) expect(s.clans[r.owner], `region ${r.id} owner`).toBeTruthy();
  for (const c of Object.values(s.clans)) expect(s.characters[c.headId], `clan ${c.id} head`).toBeTruthy();
  for (const role of ROLE_KEYS) if (s.council[role]) expect(s.characters[s.council[role]!]).toBeTruthy();
  for (const t of s.routes) {
    expect(s.regions[t.from].owner).toBe(s.playerClanId);
    expect(s.clans[t.partner]).toBeTruthy();
  }
  for (const k of Object.values(s.clans)) if (k.cadetOf) expect(s.clans[k.cadetOf]).toBeTruthy();
  if (!s.gameOver) {
    const r = ruler(s);
    expect(alive(r)).toBe(true);
    expect(r.clanId).toBe(s.playerClanId);
  }
  for (const v of [s.credits, s.fleet, s.prestige, s.faith]) expect(Number.isFinite(v)).toBe(true);
  for (const c of Object.values(s.characters)) {
    expect(Number.isFinite(c.health)).toBe(true);
    for (const v of Object.values(c.base)) expect(Number.isFinite(v)).toBe(true);
  }
}

function botTurn(s: GameState, bot: Seeded): void {
  const r = ruler(s);
  if (!r.spouseId && s.year - r.born >= 18) {
    generateSuitors(s, r.id);
    if (s.suitors?.list.length) acceptSuitor(s, s.suitors.list.findIndex((x) => x.prestigeCost <= s.prestige));
  }
  for (const kid of dynastyMembers(s)) {
    if (kid.id !== r.id && !kid.spouseId && !kid.betrothedId && s.year - kid.born >= 16 && chance(bot, 0.1)) {
      generateSuitors(s, kid.id);
      acceptSuitor(s, 0);
    }
  }
  recruitShips(s, 20);
  for (const reg of clanRegions(s, s.playerClanId)) developRegion(s, reg.id);
  const acts = Object.keys(ACTIVITIES) as ActivityKind[];
  doActivity(s, pick(bot, acts));
  if (s.shop.items[0] && chance(bot, 0.3)) {
    const it = s.shop.items[0];
    if (buyItem(s, it.id)) equip(s, it.id);
  }
  const kinds = Object.keys(SCHEMES) as SchemeKind[];
  const kind = pick(bot, kinds);
  const others = Object.values(s.clans).filter((c) => !c.isPlayer && clanRegions(s, c.id).length);
  if (others.length) {
    const clan = pick(bot, others);
    const target =
      SCHEMES[kind].target === 'clan'
        ? clan.id
        : SCHEMES[kind].target === 'region'
          ? clanRegions(s, clan.id)[0].id
          : clan.headId;
    runScheme(s, kind, target);
  }
  if (chance(bot, 0.15) && s.wars.length === 0 && others.length) {
    const clan = pick(bot, others);
    const reg = clanRegions(s, clan.id)[0];
    if (reg && !warBlocker(s, reg)) {
      const opt = cbOptions(s, reg).find((o) => o.ok);
      if (opt) declareWar(s, reg.id, opt.cb);
    }
  }
  for (const w of s.wars.slice()) fightBattle(s, w.id);
  const cands = vaultCandidates(s);
  if (cands.length && chance(bot, 0.2)) lockTrait(s, cands[0]);
  if (chance(bot, 0.1)) purgeTrait(s, 'gene_rot');
  if (chance(bot, 0.05)) buySlot(s);
  if (chance(bot, 0.05)) augment(s, r.id, 'neural_lace');
  // New systems: council, cadets, gene-forge, trade.
  for (const role of ROLE_KEYS) if (!s.council[role] && chance(bot, 0.3)) {
    const c = candidates(s, role)[0];
    if (c) appoint(s, role, c.id);
  }
  if (chance(bot, 0.05)) {
    const kin = dynastyMembers(s).find((c) => c.id !== r.id && s.year - c.born >= 20);
    const reg = clanRegions(s, s.playerClanId).find((x) => !x.capital);
    if (kin && reg) foundCadet(s, kin.id, reg.id);
  }
  if (chance(bot, 0.1)) buildForge(s);
  if (chance(bot, 0.05)) buildVats(s);
  if (!s.forge.project && researchable(s).length && chance(bot, 0.3)) startResearch(s, pick(bot, researchable(s)));
  if (s.forge.researched.length && chance(bot, 0.1)) splice(s, pick(bot, dynastyMembers(s)).id, pick(bot, s.forge.researched));
  if (s.forge.level >= 2 && chance(bot, 0.05)) growVatHeir(s, r.id, s.forge.researched.slice(0, 2));
  if (s.forge.level >= 2 && chance(bot, 0.02)) cloneCharacter(s, s.dynasty.rulers[0].id);
  if (chance(bot, 0.2) && others.length) {
    const partner = pick(bot, others);
    const from = clanRegions(s, s.playerClanId)[0];
    if (from) openRoute(s, from.id, partner.id);
  }
}

describe('long simulation', () => {
  const runs: [number, 'capped' | 'uncapped'][] = [
    [1, 'uncapped'],
    [42, 'uncapped'],
    [1337, 'capped'],
    [9001, 'capped'],
  ];
  for (const [seed, growth] of runs) {
    it(`survives 200 cycles (seed ${seed}, ${growth})`, { timeout: 120000 }, () => {
      const s = newGame(seed, growth);
      const bot: Seeded = { seed: seed * 7 };
      let years = 0;
      for (; years < 200 && !s.gameOver; years++) {
        drain(s, bot);
        if (s.gameOver) break;
        botTurn(s, bot);
        drain(s, bot);
        ageUp(s);
        checkInvariants(s);
      }
      const json = exportSave(s);
      const back = importSave(json);
      expect(back.year).toBe(s.year);
      // eslint-disable-next-line no-console
      console.log(
        `seed ${seed} (${growth}): ${years} cycles, year ${s.year}, rulers ${s.dynasty.rulers.length}, chars ${Object.keys(s.characters).length}, living dynasty ${dynastyMembers(s).length}, regions ${clanRegions(s, s.playerClanId).length}, save ${Math.round(json.length / 1024)}KB, over: ${s.gameOver?.reason ?? 'no'}`,
      );
    });
  }
});

describe('dynasty growth', () => {
  it('capped mode keeps the dynasty smaller than uncapped', { timeout: 120000 }, () => {
    const sizes: Record<string, number> = {};
    for (const growth of ['capped', 'uncapped'] as const) {
      const s = newGame(77, growth);
      const bot: Seeded = { seed: 5 };
      for (let y = 0; y < 150 && !s.gameOver; y++) {
        drain(s, bot);
        const r = ruler(s);
        if (!r.spouseId && s.year - r.born >= 18) {
          generateSuitors(s, r.id);
          acceptSuitor(s, s.suitors!.list.findIndex((x) => x.prestigeCost <= s.prestige));
        }
        for (const kid of dynastyMembers(s)) {
          if (kid.id !== r.id && !kid.spouseId && !kid.betrothedId && s.year - kid.born >= 16 && chance(bot, 0.3)) {
            generateSuitors(s, kid.id);
            acceptSuitor(s, 0);
          }
        }
        s.credits = Math.max(s.credits, 500);
        drain(s, bot);
        ageUp(s);
      }
      sizes[growth] = dynastyMembers(s).length;
    }
    // eslint-disable-next-line no-console
    console.log('dynasty sizes after 150 cycles', sizes);
    expect(sizes.capped).toBeLessThan(sizes.uncapped);
    expect(sizes.capped).toBeLessThanOrEqual(75);
  });
});

describe('gene vault', () => {
  it('locked traits are always inherited and purged ones never', () => {
    const s = newGame(5);
    const mk = (traits: string[]) => ({ traits } as unknown as Character);
    const rng: Seeded = { seed: 3 };
    for (let i = 0; i < 300; i++) {
      const kid = inheritGenetics(rng, mk(['slow', 'gene_rot']), mk(['gene_rot']), { locked: ['genius'], purged: ['gene_rot'] });
      expect(kid).toContain('genius');
      expect(kid).not.toContain('slow');
      expect(kid).not.toContain('gene_rot');
    }
    expect(s.dynasty.slots).toBe(2);
  });

  it('two brilliant parents can produce a genius', () => {
    const rng: Seeded = { seed: 11 };
    const mk = (traits: string[]) => ({ traits } as unknown as Character);
    let genius = 0;
    for (let i = 0; i < 2000; i++) if (inheritGenetics(rng, mk(['brilliant']), mk(['brilliant'])).includes('genius')) genius++;
    expect(genius).toBeGreaterThan(100);
  });
});
