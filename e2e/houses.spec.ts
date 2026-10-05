import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createCharacter } from '../src/game/character';
import { inflateString } from '../src/game/codec';
import { ch, clanRegions, fullName, ruler } from '../src/game/core';
import { setFlag } from '../src/game/eventKit';
import { hashString } from '../src/game/rng';
import type { GameState } from '../src/game/types';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../src/game/world';

function housesWorld() {
  const s = createWorld(211);
  const home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(211, 'mars', 'F', 'Asha'), focus: 'dip', age: 36, family: 'married' });
  s.pending = [];
  const player = ruler(s);
  player.faithId = 'machine';
  // The active ruler is authoritative even when a legacy house pointer is stale.
  const staleHead = ch(s, player.spouseId)!;
  staleHead.faithId = 'red';
  s.clans[s.playerClanId].headId = staleHead.id;
  const neptune = Object.values(s.clans).filter((k) => k.planetId === 'neptune');
  for (const house of neptune) s.characters[house.headId].faithId = 'abyssal';
  const foreign = neptune[0];
  s.characters[foreign.headId].faithId = 'solar';
  foreign.allied = true;
  foreign.opinion = 37;
  // A campaign-weary house, so its profile has politics to place after its identity.
  s.warWeariness[foreign.id] = 40;
  s.truces.push({ a: s.playerClanId, b: foreign.id, started: s.year - 1, until: s.year + 4 });
  const unknown = Object.values(s.clans).find((k) => k.planetId === 'pluto')!;
  s.characters[unknown.headId].faithId = 'unrecorded-faith';
  return { s, foreign, player, unknown };
}

async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  const data = JSON.stringify(s);
  await page.getByLabel('Import save file').setInputFiles({
    name: 'houses.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ data, checksum: hashString(data) })),
  });
  await expect(page.getByRole('tabpanel', { name: 'Life', exact: true })).toBeVisible();
}

async function saved(page: Page): Promise<GameState> {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('solar-dynasty:auto'))).not.toBeNull();
  const raw = await page.evaluate(() => localStorage.getItem('solar-dynasty:auto'));
  return JSON.parse(inflateString(JSON.parse(raw!).data));
}

async function browser(page: Page) {
  await page.getByRole('tab', { name: 'System', exact: true }).click();
  await page.getByRole('tablist', { name: 'System views', exact: true }).getByRole('tab', { name: 'Houses', exact: true }).click();
  return page.getByRole('tabpanel', { name: 'Houses', exact: true });
}

function errors(page: Page) {
  const out: string[] = [];
  page.on('pageerror', (e) => out.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') out.push(e.text());
  });
  return out;
}

async function shot(page: Page, info: TestInfo, name: string) {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath(name + '.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

test('Houses combines actual home-world and ruler-faith filters, counts matches and resets empty results', async ({ page }, info) => {
  const failures = errors(page),
    { s, foreign } = housesWorld();
  await load(page, s);
  const before = await saved(page);
  const houses = await browser(page);
  const total = Object.keys(s.clans).length;
  await expect(houses.getByRole('status')).toHaveText('Showing ' + total + ' of ' + total + ' houses');
  await expect(houses.getByRole('article')).toHaveCount(total);
  await houses.getByLabel('House home world', { exact: true }).selectOption('neptune');
  await expect(houses.getByRole('article')).toHaveCount(4);
  await houses.getByLabel('Ruler faith', { exact: true }).selectOption('solar');
  await expect(houses.getByRole('status')).toHaveText('Showing 1 of ' + total + ' houses');
  const card = houses.getByRole('article', { name: 'House ' + foreign.name, exact: true });
  await expect(card).toContainText('Home world: Neptune');
  await expect(card).toContainText('Ruler faith: Solar Orthodoxy');
  await expect(card).toContainText('Allied to you');
  await expect(card).toContainText('Truce with you until ' + (s.year + 4));
  await expect(card).toContainText('+37');
  await shot(page, info, 'houses-filtered');
  await houses.getByLabel('Ruler faith', { exact: true }).selectOption('red');
  await expect(houses.getByRole('status')).toHaveText('Showing 0 of ' + total + ' houses');
  await expect(houses).toContainText('No houses match these filters');
  await expect(houses.getByRole('article')).toHaveCount(0);
  await shot(page, info, 'houses-empty');
  await houses.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(houses.getByRole('article')).toHaveCount(total);
  await expect(houses.getByLabel('House home world')).toHaveValue('all');
  await expect(houses.getByLabel('Ruler faith')).toHaveValue('all');
  await expect(houses.getByRole('button', { name: 'Reset filters', exact: true })).toBeDisabled();
  expect(await saved(page)).toEqual(before);
  expect(failures).toEqual([]);
});

test('keyboard tabs and profile links preserve real ruler facts and return region links to the map', async ({ page }, info) => {
  const failures = errors(page),
    { s, foreign, player } = housesWorld();
  await load(page, s);
  const before = await saved(page);
  await page.getByRole('tab', { name: 'System', exact: true }).click();
  const views = page.getByRole('tablist', { name: 'System views', exact: true });
  await views.getByRole('tab', { name: 'Map', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(views.getByRole('tab', { name: 'Houses', exact: true })).toBeFocused();
  await expect(views.getByRole('tab', { name: 'Houses', exact: true })).toHaveAttribute('aria-selected', 'true');
  const houses = page.getByRole('tabpanel', { name: 'Houses', exact: true });
  await houses.getByLabel('House home world').selectOption('mars');
  await houses.getByLabel('Ruler faith').selectOption('machine');
  const own = houses.getByRole('article', { name: 'House ' + s.clans[s.playerClanId].name, exact: true });
  await expect(own).toContainText(player.name);
  await expect(own).toContainText('Ruler faith: Machine Synod');
  await own.getByRole('button', { name: 'View ruler ' + fullName(s, player), exact: true }).focus();
  await page.keyboard.press('Enter');
  let dialog = page.getByRole('dialog').last();
  await expect(dialog).toContainText(player.name);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await houses.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await houses.getByRole('button', { name: 'View House ' + foreign.name, exact: true }).click();
  dialog = page.getByRole('dialog').last();
  await expect(dialog.getByRole('heading', { name: 'Current ruler', exact: true })).toBeVisible();
  const order = await dialog.getByRole('heading').allTextContents();
  expect(order.indexOf('Current ruler')).toBeLessThan(order.findIndex((h) => h.startsWith('War weariness')));
  await expect(dialog).toContainText('House faith: Abyssal Choir');
  await expect(dialog).toContainText('Ruler faith: Solar Orthodoxy');
  await shot(page, info, 'house-identity-first');
  const region = clanRegions(s, foreign.id)[0];
  await dialog.getByRole('button', { name: (region.capital ? '♛ ' : '') + region.name, exact: true }).click();
  await expect(views.getByRole('tab', { name: 'Map', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Map', exact: true })).toContainText(region.name);
  expect(await saved(page)).toEqual(before);
  expect(failures).toEqual([]);
});

test('unknown ruler faith stays unknown, and browsing survives reload without changing the saved dynasty', async ({ page }, info) => {
  const failures = errors(page),
    { s, unknown } = housesWorld();
  await load(page, s);
  const before = await saved(page);
  let houses = await browser(page);
  await houses.getByLabel('Ruler faith').selectOption('unknown');
  await expect(houses.getByRole('article')).toHaveCount(1);
  await expect(houses.getByRole('article', { name: 'House ' + unknown.name, exact: true })).toContainText('Ruler faith: Unknown');
  await shot(page, info, 'unknown-faith');
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  houses = await browser(page);
  await expect(houses.getByRole('article')).toHaveCount(Object.keys(s.clans).length);
  await houses.getByLabel('Ruler faith').selectOption('unknown');
  await expect(houses.getByRole('article')).toHaveCount(1);
  expect(await saved(page)).toEqual(before);
  expect(failures).toEqual([]);
});

test('foreign house profiles name their real regent without revealing an unexposed treasury theft', async ({ page }, info) => {
  const failures = errors(page),
    { s, foreign } = housesWorld();
  const ward = s.characters[foreign.headId];
  ward.born = s.year - 12;
  const regent = createCharacter(s, {
    name: 'Quiet Regent',
    gender: 'F',
    born: s.year - 40,
    clanId: foreign.id,
    planetId: foreign.planetId,
    faithId: foreign.faithId,
  });
  setFlag(s, 'regent:' + foreign.id, 0, { id: regent.id, ward: ward.id, since: s.year - 2, skimmed: 987, exposed: 0, until: 0 });
  await load(page, s);
  const before = await saved(page);
  const houses = await browser(page);
  await houses.getByRole('button', { name: 'View House ' + foreign.name, exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog.getByRole('heading', { name: 'Regent', exact: true })).toBeVisible();
  await expect(dialog).toContainText('Quiet Regent');
  await expect(dialog).toContainText('Governs for ' + ward.name + ' since ' + (s.year - 2));
  await expect(dialog).not.toContainText('987');
  await expect(dialog).not.toContainText(/skimmed|skimming|stole|theft/i);
  await shot(page, info, 'public-regent');
  expect(await saved(page)).toEqual(before);
  expect(failures).toEqual([]);
});
