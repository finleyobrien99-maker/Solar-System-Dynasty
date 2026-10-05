import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { inflateString } from '../src/game/codec';
import { liegeOf } from '../src/game/core';
import { makeTruce, warWeariness } from '../src/game/peace';
import { hashString } from '../src/game/rng';
import { peaceCampaign } from '../src/game/testScenarios';
import type { GameState } from '../src/game/types';
import { endWar } from '../src/game/war';

async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  const data = JSON.stringify(s);
  await page.getByLabel('Import save file').setInputFiles({
    name: 'peace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ data, checksum: hashString(data) })),
  });
  await expect(page.getByRole('tabpanel', { name: 'Life', exact: true })).toBeVisible();
  await settle(page);
}
async function saved(page: Page): Promise<GameState> {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('solar-dynasty:auto'))).not.toBeNull();
  const raw = await page.evaluate(() => localStorage.getItem('solar-dynasty:auto'));
  return JSON.parse(inflateString(JSON.parse(raw!).data));
}
function errors(page: Page) {
  const out: string[] = [];
  page.on('pageerror', (e) => out.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') out.push(e.text());
  });
  return out;
}
const section = (page: Page, name: string) => page.locator('section').filter({ has: page.getByRole('heading', { name: new RegExp('^' + name) }) });
async function shot(page: Page, info: TestInfo, name: string) {
  await page.mouse.move(0, 0);
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(name + '.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
}
async function reloadRealm(page: Page) {
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  await settle(page);
  await page.getByRole('tab', { name: /^Realm(?: \d+)?$/ }).click();
}
async function settle(page: Page) {
  for (let i = 0; i < 25; i++) {
    const choice = page.locator('.overlay').last().locator('button:not(.close-x):not([disabled])').first();
    if (!(await choice.count())) break;
    await choice.click();
  }
}

test('surrender signs a house truce, visible in both profiles and after reloading', async ({ page }, info) => {
  const failures = errors(page),
    { s, enemy } = peaceCampaign();
  await load(page, s);
  await page.getByRole('tab', { name: /^Realm(?: \d+)?$/ }).click();
  await page.getByRole('button', { name: 'Surrender', exact: true }).click();
  await page.getByRole('button', { name: 'Tap again to surrender', exact: true }).click();
  await settle(page);
  const oath = section(page, 'Peace oaths');
  await expect(oath).toContainText('5 cycles remaining');
  await expect(oath).toContainText('Until ' + (s.year + 5));
  await oath.scrollIntoViewIfNeeded();
  await shot(page, info, 'signed-peace');
  await oath.getByRole('button', { name: 'House ' + enemy.name, exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toContainText('Peace oaths');
  await expect(dialog).toContainText('5 cycles remaining');
  await shot(page, info, 'public-house-truce');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await reloadRealm(page);
  await expect(section(page, 'Peace oaths')).toContainText('5 cycles remaining');
  expect((await saved(page)).truces).toHaveLength(1);
  expect(failures).toEqual([]);
});

test('a claim honours the oath, while an explicit second press pays for betrayal once', async ({ page }, info) => {
  const failures = errors(page),
    { s, enemy, target, war } = peaceCampaign();
  endWar(s, war, 'white');
  await load(page, s);
  await page.getByRole('tab', { name: 'System', exact: true }).click();
  await page.getByRole('button', { name: target.name + ', held by House ' + enemy.name, exact: true }).click();
  const row = page.locator('.spread.wrap').filter({ has: page.getByText('Press Claim', { exact: true }) });
  await expect(row.getByRole('button', { name: 'War', exact: true })).toBeDisabled();
  await expect(row).toContainText('200');
  await row.scrollIntoViewIfNeeded();
  await shot(page, info, 'explicit-oath-cost');
  await row.getByRole('button', { name: 'Break truce and attack', exact: true }).click();
  expect((await saved(page)).wars).toHaveLength(0);
  await row.getByRole('button', { name: 'Tap again: betray House ' + enemy.name, exact: true }).click();
  await expect.poll(async () => (await saved(page)).wars.length).toBe(1);
  const after = await saved(page);
  expect(after.prestige).toBe(s.prestige - 200);
  expect(after.truces).toHaveLength(0);
  expect(after.characters[s.rulerId].reputation!.deeds.oathsBroken).toBe(1);
  await reloadRealm(page);
  await expect(section(page, 'Peace oaths')).toContainText('no current truces');
  await expect(page.getByRole('button', { name: 'Launch battle', exact: true })).toBeEnabled();
  expect(failures).toEqual([]);
});

test('the complete war price is required before a truce can be broken', async ({ page }, info) => {
  const failures = errors(page),
    { s, enemy, target, war } = peaceCampaign();
  endWar(s, war, 'white');
  s.prestige = 319;
  s.claims = [];
  s.faith = 0;
  await load(page, s);
  await page.getByRole('tab', { name: 'System', exact: true }).click();
  await page.getByRole('button', { name: target.name + ', held by House ' + enemy.name, exact: true }).click();
  const row = page.locator('.spread.wrap').filter({ has: page.getByText('Naked Conquest', { exact: true }) });
  await expect(row.getByRole('button', { name: 'Break truce and attack', exact: true })).toBeDisabled();
  await expect(row.getByRole('button', { name: 'Break truce and attack', exact: true })).toHaveAttribute('title', /320/);
  await row.scrollIntoViewIfNeeded();
  await shot(page, info, 'full-war-budget');
  const after = await saved(page);
  expect(after.prestige).toBe(319);
  expect(after.truces).toHaveLength(1);
  expect(after.wars).toHaveLength(0);
  expect(failures).toEqual([]);
});

test('independence uses the same explicit oath gate and persists the resulting war', async ({ page }, info) => {
  const failures = errors(page),
    { s, war } = peaceCampaign();
  endWar(s, war, 'white');
  const liege = liegeOf(s, s.playerClanId)!;
  expect(liege).toBeTruthy();
  makeTruce(s, s.playerClanId, liege);
  await load(page, s);
  await page.getByRole('tab', { name: /^Realm(?: \d+)?$/ }).click();
  await expect(page.getByRole('button', { name: 'Declare independence', exact: true })).toBeDisabled();
  await shot(page, info, 'independence-oath');
  await page.getByRole('button', { name: 'Break truce and revolt (200 prestige)', exact: true }).click();
  await page.getByRole('button', { name: 'Tap again: betray House ' + s.clans[liege].name, exact: true }).click();
  await expect.poll(async () => (await saved(page)).wars.length).toBe(1);
  expect((await saved(page)).wars[0].cb).toBe('independence');
  expect((await saved(page)).prestige).toBe(s.prestige - 200);
  await reloadRealm(page);
  await expect(page.getByRole('button', { name: 'Launch battle', exact: true })).toBeEnabled();
  expect(failures).toEqual([]);
});

test('real losses wear down the house, peace recovers it and saving preserves both', async ({ page }, info) => {
  const failures = errors(page),
    { s, war } = peaceCampaign();
  const before = warWeariness(s, s.playerClanId);
  endWar(s, war, 'white');
  await load(page, s);
  await page.getByRole('tab', { name: /^Realm(?: \d+)?$/ }).click();
  await expect(section(page, 'War weariness')).toContainText(before + '/100');
  await expect(section(page, 'War weariness')).toContainText('At peace: recover 8');
  await section(page, 'War weariness').scrollIntoViewIfNeeded();
  await shot(page, info, 'actual-war-weariness');
  await page.getByRole('button', { name: 'Age up one cycle', exact: true }).click();
  await settle(page);
  await page.getByRole('tab', { name: /^Realm(?: \d+)?$/ }).click();
  await expect(section(page, 'War weariness')).toContainText(Math.max(0, before - 8) + '/100');
  await reloadRealm(page);
  await expect(section(page, 'War weariness')).toContainText(Math.max(0, before - 8) + '/100');
  await expect(section(page, 'Peace oaths')).toContainText('4 cycles remaining');
  expect(failures).toEqual([]);
});
