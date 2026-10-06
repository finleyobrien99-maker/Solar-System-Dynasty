import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ch, clanRegions, setOwner } from '../src/game/core';
import { EVENT_BY_ID, queueEvent } from '../src/game/events';
import { demandableRegion, issueUltimatum } from '../src/game/foreignPolicy';
import { migrateDiplomacy, rememberHouse } from '../src/game/houseRelations';
import { hashString } from '../src/game/rng';
import { inflateString } from '../src/game/codec';
import type { Clan, GameState } from '../src/game/types';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../src/game/world';

const PERSONAL = ['brave', 'craven', 'wrathful', 'honest', 'deceitful', 'ambitious', 'paranoid', 'greedy', 'arrogant', 'just', 'content', 'zealous'];

/** You govern on Mars; every landed AI ruler is a free adult with 100 ships and no strong leanings. */
function world(): GameState {
  const s = createWorld(61);
  const home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(61, 'mars', 'F', 'Asha'), focus: 'cmd', age: 40, family: 'married' });
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
    k.liege = 'none';
  }
  migrateDiplomacy(s);
  return s;
}
/** A landed AI house of the planet with at least two regions, so one can be demanded. */
function on(s: GameState, planet: string): Clan {
  return Object.values(s.clans).find((k) => !k.isPlayer && k.planetId === planet && clanRegions(s, k.id).length >= 2)!;
}
/** An ambitious, wrathful Earth house with a big fleet. */
function bully(s: GameState): Clan {
  const big = on(s, 'earth');
  big.fleet = 600;
  ch(s, big.headId)!.traits.push('ambitious', 'wrathful');
  return big;
}

async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  const data = JSON.stringify(s);
  await page
    .getByLabel('Import save file')
    .setInputFiles({ name: 'foreign.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ data, checksum: hashString(data) })) });
}
function watch(page: Page): string[] {
  const out: string[] = [];
  page.on('pageerror', (e) => out.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') out.push(e.text());
  });
  return out;
}
async function healthy(page: Page, failures: string[]) {
  await expect(page.locator('.crash')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'page scrolls sideways').toBeLessThanOrEqual(0);
  expect(failures).toEqual([]);
}
async function shot(page: Page, info: TestInfo, name: string) {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath(name + '.png'), animations: 'disabled' });
}
async function openHouse(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('tab', { name: /^System/ })
    .click();
  await page.getByRole('tablist', { name: 'System views' }).getByRole('tab', { name: 'Houses', exact: true }).click();
  await page.getByRole('button', { name: 'View House ' + name, exact: true }).click();
  return page.getByRole('dialog').last();
}

test('an ultimatum arrives with both fleets; refuse it and face the exact war', async ({ page }, info) => {
  const failures = watch(page);
  const s = world();
  const big = bully(s);
  if (clanRegions(s, s.playerClanId).length < 2) {
    const extra = Object.values(s.regions).find((r) => r.planetId === 'mars' && !r.capital && r.owner !== s.playerClanId && r.owner !== big.id)!;
    setOwner(s, extra, s.playerClanId);
  }
  const region = demandableRegion(s, s.playerClanId)!;
  if (issueUltimatum(s, big.id, s.playerClanId, { kind: 'cede', regionId: region.id }) !== 'pending') throw new Error('No ultimatum');
  if (!queueEvent(s, EVENT_BY_ID.ultimatum)) throw new Error('No event');
  await load(page, s);
  const event = page.locator('.overlay').last();
  await expect(event).toContainText('An Ultimatum');
  await expect(event).toContainText('hand over ' + region.name);
  await expect(event).toContainText('Their fleet: 600 ships');
  await shot(page, info, 'ultimatum');
  await event.getByRole('button', { name: /^Refuse/ }).click();
  // The war over exactly this demand is the war lane's (declareWithGoal); until then they remember it.
  await expect(event).toContainText('House ' + big.name + ' declares war.');
  await event.getByRole('button', { name: /^Continue/ }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'War Declared!' })).toHaveCount(1);
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem('solar-dynasty:auto'));
      return raw ? (JSON.parse(inflateString(JSON.parse(raw).data)) as GameState).wars[0]?.goal : null;
    })
    .toEqual({ kind: 'cede', regionId: region.id });
  const raw = await page.evaluate(() => localStorage.getItem('solar-dynasty:auto'));
  expect(raw).toBeTruthy();
  const after = JSON.parse(inflateString(JSON.parse(raw!).data)) as GameState;
  expect(after.wars[0].goal).toEqual({ kind: 'cede', regionId: region.id });
  expect(after.wars[0].cb).toBe('feud');
  expect(after.warJustifications?.[0].used).toBe(true);
  await healthy(page, failures);
});

test('a house shows its stance, and you can press a demand on it', async ({ page }, info) => {
  const failures = watch(page);
  const s = world();
  s.fleet = 500;
  const target = on(s, 'venus');
  ch(s, target.headId)!.traits.push('greedy');
  const enemy = on(s, 'earth');
  rememberHouse(s, target.id, enemy.id, { text: 'Sank our convoys', value: -90 });
  await load(page, s);
  const house = await openHouse(page, target.name);
  const diplomacy = house.locator('.section').filter({ has: page.getByRole('heading', { name: /^Diplomacy/ }) });
  await expect(diplomacy).toContainText('Mercantile');
  await expect(diplomacy).toContainText('Rivals: House ' + enemy.name + ' (Cold relations');
  await expect(diplomacy).toContainText('Press a demand');
  const demand = diplomacy.getByRole('button', { name: /^Demand \(\d+%\)/ }).first();
  await expect(demand).toBeVisible();
  await demand.scrollIntoViewIfNeeded();
  await shot(page, info, 'press-a-demand');
  await demand.click();
  await diplomacy.getByRole('button', { name: 'Tap again: send the ultimatum', exact: true }).click();
  await expect(page.getByText(/^(They give in|They refuse)\.$/)).toBeVisible();
  // Either way they will not hear another demand for a while.
  await expect(diplomacy.getByRole('button', { name: /^Demand \(\d+%\)/ })).toHaveCount(0);
  await healthy(page, failures);
});

test('a new ruler can repudiate a predecessor’s treaty, but not one they signed', async ({ page }, info) => {
  const failures = watch(page);
  const s = world();
  const partner = on(s, 'venus');
  s.dynasty.rulers.find((r) => r.id === s.rulerId && r.to === undefined)!.from = s.year;
  s.diplomacy!.treaties.push(
    { id: 'told', kind: 'defensive', a: s.playerClanId, b: partner.id, years: 10, signed: s.year - 4, until: s.year + 6 },
    { id: 'tnew', kind: 'trade', a: s.playerClanId, b: partner.id, years: 10, signed: s.year, until: s.year + 10 },
  );
  await load(page, s);
  const house = await openHouse(page, partner.name);
  const diplomacy = house.locator('.section').filter({ has: page.getByRole('heading', { name: /^Diplomacy/ }) });
  const pact = diplomacy.locator('.spread').filter({ hasText: /Defensive pact · until/ });
  const trade = diplomacy.locator('.spread').filter({ hasText: /Trade agreement: \+/ });
  await expect(trade).toHaveCount(1);
  await expect(trade.getByRole('button', { name: 'Repudiate' })).toHaveCount(0);
  await pact.scrollIntoViewIfNeeded();
  await shot(page, info, 'repudiate');
  await pact.getByRole('button', { name: 'Repudiate', exact: true }).click();
  await diplomacy.getByRole('button', { name: 'Tap again: repudiate your predecessor’s treaty', exact: true }).click();
  await expect(diplomacy.locator('.spread').filter({ hasText: /Defensive pact · until/ })).toHaveCount(0);
  await expect(trade).toHaveCount(1);
  await healthy(page, failures);
});

test('accepting an exact tribute ultimatum after reload creates payments without a protection pact', async ({ page }, info) => {
  const failures = watch(page);
  const s = world();
  const big = bully(s);
  const goal = { kind: 'tribute' as const, amount: 35, years: 4 };
  expect(issueUltimatum(s, big.id, s.playerClanId, goal)).toBe('pending');
  expect(queueEvent(s, EVENT_BY_ID.ultimatum)).toBe(true);
  await load(page, s);
  // Import reads the file asynchronously: wait for the actual saved demand before reloading.
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem('solar-dynasty:auto'));
      return raw ? (JSON.parse(inflateString(JSON.parse(raw).data)) as GameState).foreignPolicy?.ultimatums[0]?.goal : null;
    })
    .toEqual(goal);
  await page.reload();
  await page.getByRole('button', { name: /^Continue: / }).click();
  const event = page.locator('.overlay').last();
  await expect(event).toContainText('35 credits a cycle in tribute for 4 cycles');
  await shot(page, info, 'reloaded-tribute-ultimatum');
  await event.getByRole('button', { name: /^Give in/ }).click();
  await event.getByRole('button', { name: /^Continue/ }).click();
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem('solar-dynasty:auto'));
      return raw ? (JSON.parse(inflateString(JSON.parse(raw).data)) as GameState).peaceTributes?.[0] : null;
    })
    .toMatchObject({ from: s.playerClanId, to: big.id, amount: 35, started: s.year, until: s.year + 5 });
  const raw = await page.evaluate(() => localStorage.getItem('solar-dynasty:auto'));
  const after = JSON.parse(inflateString(JSON.parse(raw!).data)) as GameState;
  expect(after.foreignPolicy?.ultimatums).toEqual([]);
  expect(after.diplomacy?.treaties.some((t) => t.kind === 'tribute' && (t.a === big.id || t.b === big.id))).toBe(false);
  expect(after.wars).toEqual([]);
  expect(Object.values(after.regions).map((r) => r.owner)).toEqual(Object.values(s.regions).map((r) => r.owner));
  await healthy(page, failures);
});
