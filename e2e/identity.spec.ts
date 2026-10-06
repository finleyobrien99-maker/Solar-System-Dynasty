import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { inflateString } from '../src/game/codec';
import { hashString } from '../src/game/rng';
import type { GameState } from '../src/game/types';
import { goalWorld } from '../src/game/warGoalScenarios';
import { createCharacter } from '../src/game/character';
import { ruler, setOwner } from '../src/game/core';
import { cadetBlocker } from '../src/game/cadets';

async function saved(page: Page): Promise<GameState | null> {
  const text = await page.evaluate(() => localStorage.getItem('solar-dynasty:auto'));
  return text ? JSON.parse(inflateString(JSON.parse(text).data)) : null;
}
async function load(page: Page, s = goalWorld()) {
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

test('other houses can be renamed and redesigned without VIP through their public profile', async ({ page }, info) => {
  const s = await load(page);
  const foreign = Object.values(s.clans).find((c) => c.id !== s.playerClanId)!;
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('tab', { name: /^System/ })
    .click();
  await page.getByRole('tablist', { name: 'System views' }).getByRole('tab', { name: 'Houses', exact: true }).click();
  await page.getByRole('button', { name: 'View House ' + foreign.name, exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  await dialog.locator('summary').filter({ hasText: 'House identity & flag' }).click();
  await dialog.getByLabel('House name', { exact: true }).fill('Aurora');
  await dialog.getByLabel('Shield shape', { exact: true }).selectOption('2');
  await dialog.getByLabel('Flag pattern', { exact: true }).selectOption('5');
  await dialog.getByLabel('House symbol', { exact: true }).selectOption('7');
  await dialog.getByLabel('Field colour hex', { exact: true }).fill('#112233');
  await dialog.getByLabel('Pattern colour hex', { exact: true }).fill('#ddeeff');
  await dialog.getByLabel('Symbol colour hex', { exact: true }).fill('#ffcc66');
  expect((await saved(page))!.clans[foreign.id]).toEqual(foreign);
  await dialog.getByRole('button', { name: 'Save house design', exact: true }).click();
  await expect.poll(async () => (await saved(page))?.clans[foreign.id].name).toBe('Aurora');
  const expected = structuredClone(s);
  expected.version = 12;
  Object.assign(expected.clans[foreign.id], {
    name: 'Aurora',
    color: '#112233',
    sigil: { shape: 2, division: 5, charge: 7, c1: '#112233', c2: '#ddeeff', c3: '#ffcc66' },
  });
  expect(await saved(page)).toEqual(expected);
  expect((await saved(page))!.vip?.on).toBeFalsy();
  await screenshot(page, info, 'foreign-house-editor');
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('tab', { name: /^System/ })
    .click();
  await page.getByRole('tablist', { name: 'System views' }).getByRole('tab', { name: 'Houses', exact: true }).click();
  await page.getByRole('button', { name: 'View House Aurora', exact: true }).click();
  await page.getByRole('dialog').last().locator('summary').filter({ hasText: 'House identity & flag' }).click();
  await expect(page.getByRole('dialog').last().getByLabel('House symbol', { exact: true })).toHaveValue('7');
});

test('founding a cadet keeps the parent design with new colours and survives reload', async ({ page }, info) => {
  const s = goalWorld(),
    r = ruler(s),
    parent = s.clans[s.playerClanId];
  parent.sigil = { shape: 4, division: 6, charge: 15, c1: '#c8102e', c2: '#1f4fbf', c3: '#d4a017' };
  parent.color = parent.sigil.c1;
  const extra = Object.values(s.regions).find((x) => x.planetId === 'mars' && !x.capital && x.owner !== parent.id)!;
  setOwner(s, extra, parent.id);
  const heir = createCharacter(s, { born: s.year - 24, gender: 'M', clanId: parent.id, planetId: 'mars', fatherId: r.id, motherId: r.spouseId });
  const kin = createCharacter(s, { born: s.year - 20, gender: 'F', name: 'Lyra', clanId: parent.id, planetId: 'mars', fatherId: r.id, motherId: r.spouseId });
  r.childrenIds.push(heir.id, kin.id);
  s.dynasty.designatedHeir = heir.id;
  expect(cadetBlocker(s, kin.id, extra.id)).toBeNull();
  const seed = s.seed;
  await load(page, s);
  const parentDialog = await openEditor(page, 'house');
  await parentDialog.getByRole('button', { name: /Lyra/ }).click();
  const profile = page.getByRole('dialog').last();
  await profile.locator('summary').filter({ hasText: 'Found a cadet branch' }).click();
  await profile.getByLabel('Region to grant').selectOption(extra.id);
  await profile.getByLabel('New house name').fill('Starlight');
  await profile.getByRole('button', { name: 'Found House Starlight', exact: true }).click();
  await profile.getByRole('button', { name: 'Tap again to grant the land', exact: true }).click();
  await page.getByRole('dialog', { name: 'A Cadet Branch is Founded', exact: true }).getByRole('button', { name: 'Continue', exact: true }).click();
  await expect.poll(async () => Object.values((await saved(page))?.clans ?? {}).some((c) => c.name === 'Starlight')).toBe(true);
  const after = (await saved(page))!,
    cadet = Object.values(after.clans).find((c) => c.name === 'Starlight')!;
  expect([cadet.sigil.shape, cadet.sigil.division, cadet.sigil.charge]).toEqual([4, 6, 15]);
  expect(new Set([cadet.sigil.c1, cadet.sigil.c2, cadet.sigil.c3]).size).toBe(3);
  for (const c of [cadet.sigil.c1, cadet.sigil.c2, cadet.sigil.c3]) expect([parent.sigil.c1, parent.sigil.c2, parent.sigil.c3]).not.toContain(c);
  expect(cadet.color).toBe(cadet.sigil.c1);
  expect(cadet.cadetOf).toBe(parent.id);
  expect(after.clans[parent.id].sigil).toEqual(parent.sigil);
  expect(after.seed).toBe(seed);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('tab', { name: /^System/ })
    .click();
  await page.getByRole('tablist', { name: 'System views' }).getByRole('tab', { name: 'Houses', exact: true }).click();
  await page.getByRole('button', { name: 'View House Starlight', exact: true }).click();
  await page.getByRole('dialog').last().locator('summary').filter({ hasText: 'House identity & flag' }).click();
  await screenshot(page, info, 'cadet-design');
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  await expect.poll(async () => (await saved(page))?.clans[cadet.id].sigil).toEqual(cadet.sigil);
});
