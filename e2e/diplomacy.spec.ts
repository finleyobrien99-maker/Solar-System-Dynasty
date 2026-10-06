import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ch, clanRegions } from '../src/game/core';
import { EVENT_BY_ID, queueEvent } from '../src/game/events';
import { hashString } from '../src/game/rng';
import { proposeTreaty, termsFor } from '../src/game/treaties';
import type { Clan, GameState } from '../src/game/types';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../src/game/world';

const PERSONAL = ['brave', 'craven', 'wrathful', 'honest', 'deceitful', 'ambitious', 'paranoid', 'greedy', 'arrogant'];

/** You govern on Mars; every landed AI ruler is a free adult with 100 ships. */
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
  }
  return s;
}
function vassal(s: GameState, planet: string): Clan {
  return Object.values(s.clans).find(
    (k) => !k.isPlayer && k.planetId === planet && clanRegions(s, k.id).length && !clanRegions(s, k.id).some((r) => r.capital),
  )!;
}

async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  const data = JSON.stringify(s);
  await page
    .getByLabel('Import save file')
    .setInputFiles({ name: 'diplomacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ data, checksum: hashString(data) })) });
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

test('envoys bring a defensive pact to court', async ({ page }, info) => {
  const failures = watch(page);
  const s = world();
  const from = vassal(s, 'earth');
  if (proposeTreaty(s, from.id, s.playerClanId, termsFor(s, 'defensive', from.id, s.playerClanId)) !== 'pending') throw new Error('No offer');
  if (!queueEvent(s, EVENT_BY_ID.treaty_offer)) throw new Error('No envoys');
  await load(page, s);
  const event = page.locator('.overlay').last();
  await expect(event).toContainText('Envoys at Court');
  await expect(event).toContainText('defensive pact');
  await shot(page, info, 'envoys');
  await event.getByRole('button', { name: /^Accept/ }).click();
  await event.getByRole('button', { name: /^Continue/ }).click();
  const house = await openHouse(page, from.name);
  await expect(house.locator('.section').filter({ has: page.getByRole('heading', { name: /^Diplomacy/ }) })).toContainText('Defensive pact');
  await healthy(page, failures);
});

test('a trade offer waits on Realm; accepted, it shows in their profile with its income and reasons', async ({ page }, info) => {
  const failures = watch(page);
  const s = world();
  const from = vassal(s, 'venus');
  if (proposeTreaty(s, from.id, s.playerClanId, termsFor(s, 'trade', from.id, s.playerClanId)) !== 'pending') throw new Error('No offer');
  await load(page, s);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('tab', { name: /^Realm/ })
    .click();
  const envoys = page.locator('.section').filter({ has: page.getByRole('heading', { name: /^Envoys waiting/ }) });
  await expect(envoys).toContainText('trade agreement');
  await envoys.scrollIntoViewIfNeeded();
  await shot(page, info, 'envoys-waiting');
  await envoys.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(envoys).toHaveCount(0);
  const house = await openHouse(page, from.name);
  const diplomacy = house.locator('.section').filter({ has: page.getByRole('heading', { name: /^Diplomacy/ }) });
  await expect(diplomacy).toContainText('How they regard you');
  await expect(diplomacy).toContainText('Treaties between you');
  await expect(diplomacy).toContainText('Trade agreement: +');
  await expect(diplomacy).toContainText('Make an offer');
  await expect(diplomacy.getByRole('button', { name: /^Offer \(\d+%\)/ }).first()).toBeVisible();
  await diplomacy.scrollIntoViewIfNeeded();
  await shot(page, info, 'house-diplomacy');
  await healthy(page, failures);
});

test('a non-aggression pact blocks your war until you break your word', async ({ page }, info) => {
  const failures = watch(page);
  const s = world();
  const target = vassal(s, 'venus');
  s.diplomacy!.treaties.push({ id: 'tnap', kind: 'nonAggression', a: s.playerClanId, b: target.id, years: 10, signed: s.year, until: s.year + 10 });
  await load(page, s);
  const house = await openHouse(page, target.name);
  const region = clanRegions(s, target.id)[0];
  await house.getByRole('button', { name: (region.capital ? '♛ ' : '') + region.name, exact: true }).click();
  await expect(page.getByText(/Bound by a non-aggression pact with House/).first()).toBeVisible();
  const conquest = page.locator('.spread').filter({ hasText: 'Naked Conquest' });
  await expect(conquest.getByRole('button', { name: 'War', exact: true })).toBeDisabled();
  await conquest.scrollIntoViewIfNeeded();
  await shot(page, info, 'pact-blocks-war');
  await conquest.getByRole('button', { name: 'Break the treaty and attack', exact: true }).click();
  await page.getByRole('button', { name: 'Tap again: betray House ' + target.name, exact: true }).click();
  // Breaking your word earns you a name.
  const named = page.getByRole('dialog').filter({ hasText: 'A name earned' });
  await expect(named).toContainText('Oathbreaker');
  await named.getByRole('button', { name: 'Continue', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('tab', { name: /^Realm/ })
    .click();
  await expect(page.getByLabel('War participants')).toContainText('Who stands with House ' + target.name);
  const after = await openHouse(page, target.name);
  const diplomacy = after.locator('.section').filter({ has: page.getByRole('heading', { name: /^Diplomacy/ }) });
  await expect(diplomacy).toContainText('Broken promises');
  await expect(diplomacy).not.toContainText('Treaties between you');
  await healthy(page, failures);
});
