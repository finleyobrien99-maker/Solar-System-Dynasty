import { expect, test, type Page } from '@playwright/test';
import { ruler } from '../src/game/core';
import { recordDeed } from '../src/game/epithets';
import { hashString } from '../src/game/rng';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../src/game/world';

async function settle(page: Page) {
  for (let i = 0; i < 10; i++) {
    const choice = page.locator('.overlay').last().locator('button:not(.close-x):not([disabled])').first();
    if (!(await choice.count())) return;
    await choice.click();
  }
}

test('deeds earn names, player and AI profiles explain them, and the history survives reloading', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  const world = createWorld(21),
    house = scenarioHouses(world, 'mars', 'governor')[0];
  const s = startGame(world, { clanId: house.id, ruler: rollRuler(21, 'mars', 'F', 'Ines'), focus: 'dip', age: 35, family: 'kids', vip: false });
  const r = ruler(s);
  s.credits = 10000;
  // Four past donations: the fifth must go through the real UI action.
  recordDeed(s, r, 'charity', 400);
  recordDeed(s, r, 'kindness', 4);
  const aiHouse = Object.values(s.clans).find((k) => !k.isPlayer && k.planetId === 'mars')!;
  const aiHead = s.characters[aiHouse.headId];
  recordDeed(s, aiHead, 'regionsTaken', 5);
  s.pending = [];
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  await page.getByLabel('Import save file').setInputFiles({
    name: 'epithets.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ data: JSON.stringify(s), checksum: hashString(JSON.stringify(s)) })),
  });
  await expect(page.getByRole('button', { name: 'Age up one cycle' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('tab', { name: 'Actions', exact: true }).click();
  await page
    .locator('.card')
    .filter({ has: page.getByText('Donate to the Temple', { exact: true }) })
    .getByRole('button', { name: 'Go', exact: true })
    .click();
  await expect(page.getByRole('dialog').first()).toContainText('A name earned');
  await settle(page);
  await expect(page.locator('.topbar')).toContainText('the Benevolent');
  await page.getByRole('button', { name: 'Open ruler profile' }).first().click();
  const profile = page.getByRole('dialog').last();
  const section = profile.locator('.section').filter({ has: page.getByRole('heading', { name: /^Earned epithets/ }) });
  await expect(section.getByText('the Generous', { exact: true })).toBeVisible();
  await expect(section.getByText('the Benevolent', { exact: true })).toBeVisible();
  await expect(section.getByText('Credits donated: 500.', { exact: true })).toBeVisible();
  await expect(section.getByText('Acts of kindness: 5.', { exact: true })).toBeVisible();
  await section.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('earned-epithets.png'), animations: 'disabled' });
  const catalogue = section.locator('details');
  await catalogue.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(catalogue).toHaveAttribute('open', '');
  await expect(catalogue.locator('.card.flat')).toHaveCount(57);
  await expect(catalogue.getByText('Credits donated: 500 / 500', { exact: true })).toBeVisible();
  await catalogue.getByText('Commit five cruel acts, including executions and violent repression.', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('epithet-catalogue.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('tab', { name: 'System', exact: true }).click();
  await page
    .locator('.char[role="button"]')
    .filter({ hasText: 'House ' + aiHouse.name })
    .first()
    .click();
  await page.getByRole('dialog').last().locator('.char[role="button"]').filter({ hasText: 'the Conqueror' }).first().locator('.nm').click();
  await expect(page.getByRole('dialog').last()).toContainText('Regions conquered: 5.');
  await expect(page.getByRole('dialog').last().getByText('Known by this name', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  // Closing/reloading triggers the normal autosave; the earned names must come back.
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  await expect(page.locator('.topbar')).toContainText('the Benevolent');
  await page.getByRole('button', { name: 'Open ruler profile' }).first().click();
  await expect(page.getByRole('dialog').last().getByText('Credits donated: 500.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
