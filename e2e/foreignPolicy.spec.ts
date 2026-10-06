import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ch, clanRegions, setOwner } from '../src/game/core';
import { EVENT_BY_ID, queueEvent } from '../src/game/events';
import { demandableRegion, issueUltimatum } from '../src/game/foreignPolicy';
import { migrateDiplomacy, rememberHouse } from '../src/game/houseRelations';
import { hashString } from '../src/game/rng';
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

test('an ultimatum arrives with both fleets; refuse it and they remember', async ({ page }, info) => {
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
  await expect(event).toContainText('House ' + big.name + ' will not forget it.');
  await event.getByRole('button', { name: /^Continue/ }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'War Declared!' })).toHaveCount(0);
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
  await expect(page.getByText(/They give in\.|They refuse\. You now hold a claim\./)).toBeVisible();
  // Either way they will not hear another demand for a while.
  await expect(diplomacy.getByRole('button', { name: /^Demand \(\d+%\)/ })).toHaveCount(0);
  await healthy(page, failures);
});
