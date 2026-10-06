import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { inflateString } from '../src/game/codec';
import { hashString } from '../src/game/rng';
import type { GameState } from '../src/game/types';
import { goalWorld } from '../src/game/warGoalScenarios';

async function saved(page: Page): Promise<GameState | null> {
  const text = await page.evaluate(() => localStorage.getItem('solar-dynasty:auto'));
  return text ? JSON.parse(inflateString(JSON.parse(text).data)) : null;
}
async function load(page: Page) {
  const s = goalWorld();
  s.version = 11;
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  const data = JSON.stringify(s);
  await page
    .getByLabel('Import save file')
    .setInputFiles({ name: 'old-save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ data, checksum: hashString(data) })) });
  await expect.poll(async () => (await saved(page))?.version).toBe(12);
  return s;
}
async function openEditor(page: Page, kind: 'character' | 'house') {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const text = kind === 'character' ? 'Character appearance' : 'House identity & flag';
  await page.getByRole('button', { name: text, exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  await dialog.locator('summary').filter({ hasText: text }).click();
  return dialog;
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.mouse.move(0, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  const dialog = page.getByRole('dialog').last();
  expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  await dialog.locator('.identity-preview').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(name + '.png'), animations: 'disabled' });
}

test('character drafts, invalid colours, save/reload and inherited reset preserve simulation', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = await load(page),
    c = s.characters[s.rulerId];
  const dialog = await openEditor(page, 'character');
  await dialog.getByLabel('Skin colour hex', { exact: true }).fill('#72ccad');
  await dialog.getByLabel('Hair colour hex', { exact: true }).fill('#7e22ce');
  await dialog.getByLabel('Eye colour hex', { exact: true }).fill('#ff8800');
  await dialog.getByLabel('Face shape', { exact: true }).selectOption('3');
  await dialog.getByLabel('Hair style', { exact: true }).selectOption('5');
  expect((await saved(page))!.characters[c.id].portrait).toBeUndefined();
  await expect(dialog.getByRole('img', { name: 'Character appearance preview' }).locator('[fill="#7e22ce"]').first()).toBeVisible();
  await dialog.getByLabel('Eye colour hex', { exact: true }).fill('#nope');
  await expect(dialog.getByRole('button', { name: 'Save appearance', exact: true })).toBeDisabled();
  await dialog.getByLabel('Eye colour hex', { exact: true }).fill('#ff8800');
  await dialog.getByRole('button', { name: 'Save appearance', exact: true }).click();
  const style = { skinColor: '#72ccad', hairColor: '#7e22ce', eyeColor: '#ff8800', face: 3, hairStyle: 5 };
  await expect.poll(async () => (await saved(page))?.characters[c.id].portrait).toEqual(style);
  const after = (await saved(page))!;
  const expected = structuredClone(s);
  expected.version = 12;
  expected.characters[c.id].portrait = style;
  expect(after).toEqual(expected);
  await dialog.getByLabel('Skin colour hex', { exact: true }).fill('#ffffff');
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(dialog.getByLabel('Skin colour hex', { exact: true })).toHaveValue('#72ccad');
  await screenshot(page, info, 'character-editor');
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  const reloaded = await openEditor(page, 'character');
  await expect(reloaded.getByLabel('Hair colour hex', { exact: true })).toHaveValue('#7e22ce');
  await reloaded.getByRole('button', { name: 'Use inherited looks', exact: true }).click();
  expect((await saved(page))!.characters[c.id].portrait).toEqual(style);
  await reloaded.getByRole('button', { name: 'Save appearance', exact: true }).click();
  await expect.poll(async () => (await saved(page))?.characters[c.id].portrait).toBeUndefined();
  expect((await saved(page))!.characters[c.id].looks).toEqual(c.looks);
  expect(errors).toEqual([]);
});

test('house flag, symbol and full colours save atomically without changing power', async ({ page }, info) => {
  const s = await load(page),
    clan = s.clans[s.playerClanId];
  const dialog = await openEditor(page, 'house');
  await dialog.getByLabel('House name', { exact: true }).fill('Starlight');
  await dialog.getByLabel('Shield shape', { exact: true }).selectOption('3');
  await dialog.getByLabel('Flag pattern', { exact: true }).selectOption('4');
  await dialog.getByLabel('House symbol', { exact: true }).selectOption('15');
  await dialog.getByLabel('Field colour hex', { exact: true }).fill('#17385b');
  await dialog.getByLabel('Pattern colour hex', { exact: true }).fill('#efefef');
  const symbol = dialog.getByRole('group', { name: 'Symbol colour palette', exact: true });
  await dialog.locator('fieldset').filter({ hasText: 'Symbol colour' }).locator('summary').click();
  await symbol.getByRole('button', { name: 'Symbol colour #f97316', exact: true }).click();
  await expect(dialog.getByLabel('Symbol colour hex', { exact: true })).toHaveValue('#f97316');
  await dialog.getByLabel('Symbol colour hex', { exact: true }).fill('#ff9933');
  expect((await saved(page))!.clans[clan.id]).toEqual(clan);
  await dialog.getByLabel('Field colour hex', { exact: true }).fill('invalid');
  await expect(dialog.getByRole('button', { name: 'Save house design', exact: true })).toBeDisabled();
  await dialog.getByLabel('Field colour hex', { exact: true }).fill('#17385b');
  await dialog.getByRole('button', { name: 'Save house design', exact: true }).click();
  await expect.poll(async () => (await saved(page))?.clans[clan.id].name).toBe('Starlight');
  const expected = structuredClone(s);
  expected.version = 12;
  Object.assign(expected.clans[clan.id], {
    name: 'Starlight',
    color: '#17385b',
    sigil: { shape: 3, division: 4, charge: 15, c1: '#17385b', c2: '#efefef', c3: '#ff9933' },
  });
  expect(await saved(page)).toEqual(expected);
  await screenshot(page, info, 'house-editor');
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  const reloaded = await openEditor(page, 'house');
  await expect(reloaded.getByLabel('House symbol', { exact: true })).toHaveValue('15');
  await expect(reloaded.getByLabel('Field colour hex', { exact: true })).toHaveValue('#17385b');
});

test('new dynasty uses the shared appearance and house designers without VIP', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New dynasty', exact: true }).click();
  await page.getByRole('button', { name: /^Next: how you start/ }).click();
  await page.getByRole('button', { name: /^Next: your house/ }).click();
  await page.getByLabel('House symbol', { exact: true }).selectOption('12');
  await page.getByLabel('Field colour hex', { exact: true }).fill('#224466');
  await page.getByLabel('Pattern colour hex', { exact: true }).fill('#ffcc00');
  await page.getByRole('button', { name: /^Next: your ruler/ }).click();
  await page
    .locator('summary')
    .filter({ hasText: /^Appearance$/ })
    .click();
  await page.getByLabel('Hair colour hex', { exact: true }).fill('#33bb88');
  await page.getByLabel('Skin colour hex', { exact: true }).fill('#88aaff');
  await page.getByLabel('Eye colour hex', { exact: true }).fill('#ff0066');
  await page.getByRole('button', { name: /^Begin the dynasty/ }).click();
  await expect.poll(async () => (await saved(page))?.version).toBe(12);
  const after = (await saved(page))!;
  expect(after.vip?.on).toBeFalsy();
  expect(after.characters[after.rulerId].portrait).toEqual({ hairColor: '#33bb88', skinColor: '#88aaff', eyeColor: '#ff0066' });
  expect(after.clans[after.playerClanId].sigil.charge).toBe(12);
  expect(after.clans[after.playerClanId].color).toBe('#224466');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});
