import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import LZString from 'lz-string';
import { inflateString } from '../src/game/codec';
import type { GameState } from '../src/game/types';

function errors(page: Page) {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') failures.push(e.text());
  });
  return failures;
}

async function saved(page: Page): Promise<GameState> {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('solar-dynasty:auto'))).not.toBeNull();
  const raw = await page.evaluate(() => localStorage.getItem('solar-dynasty:auto'));
  return JSON.parse(inflateString(JSON.parse(raw!).data));
}

async function settle(page: Page) {
  for (let i = 0; i < 40; i++) {
    const overlay = page.locator('.overlay').last();
    const next = overlay.getByRole('button', { name: 'Continue', exact: true });
    const choice = (await next.count()) ? next : overlay.locator('.choice:not([disabled]), button:not(.close-x):not([disabled])').last();
    if (!(await choice.count())) return;
    await choice.click();
  }
  throw new Error('Unsettled annual choices');
}

for (const realm of ['Moon', 'Sun']) {
  test(`${realm}: found, play, inspect twelve regions, filter houses and reload`, async ({ page }, info) => {
    const failures = errors(page);
    await page.addInitScript(() => {
      Math.random = () => 0.000007331;
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'New dynasty', exact: true }).click();
    const card = page.locator('.planet-card').filter({ has: page.locator('.nm', { hasText: new RegExp(`^${realm}$`) }) });
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /^Next: how you start/ }).click();
    await page
      .locator('.opt.scenario')
      .filter({ has: page.locator('.t', { hasText: /^Monarch$/ }) })
      .click();
    await page.getByRole('button', { name: /^Next: your house/ }).click();
    await page.getByRole('button', { name: /^Next: your ruler/ }).click();
    await page.getByRole('button', { name: /^Begin the dynasty/ }).click();
    for (let i = 0; i < 5; i++) {
      await settle(page);
      await page.getByRole('button', { name: 'Age up one cycle' }).click();
    }
    await settle(page);
    await page.getByRole('tab', { name: 'System', exact: true }).click();
    await page.getByLabel('Choose realm', { exact: true }).selectOption(realm.toLowerCase());
    const regions = page.getByRole('group', { name: `Regions of ${realm}`, exact: true });
    await expect(regions.getByRole('button')).toHaveCount(12);
    await regions.getByRole('button').last().click();
    await expect(page.locator('.card.hl')).toContainText(realm === 'Moon' ? 'South Pole Vault' : 'Ember Gate');
    await page.getByLabel('Choose realm').scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`realm-${realm.toLowerCase()}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.getByLabel('Choose realm').selectOption('earth');
    await page.getByRole('button', { name: /^Sun, ruled by House/ }).click();
    await expect(page.getByLabel('Choose realm')).toHaveValue('sun');
    await page.getByRole('button', { name: /^Moon, ruled by House/ }).click();
    await expect(page.getByLabel('Choose realm')).toHaveValue('moon');
    await page.getByRole('tablist', { name: 'System views' }).getByRole('tab', { name: 'Houses', exact: true }).click();
    await page.getByLabel('House home world').selectOption(realm.toLowerCase());
    await expect(page.getByRole('tabpanel', { name: 'Houses', exact: true }).getByRole('article')).toHaveCount(6);
    const before = await saved(page);
    expect(Object.keys(before.regions)).toHaveLength(144);
    expect(before.clans[before.playerClanId].planetId).toBe(realm.toLowerCase());
    await page.reload();
    await page.getByRole('button', { name: /^Continue:/ }).click();
    expect(await saved(page)).toEqual(before);
    expect(failures).toEqual([]);
  });
}

test('imports a real v12 campaign, preserves its territory and discovers both new realms', async ({ page }, info) => {
  const failures = errors(page);
  const raw = readFileSync(new URL('../src/game/__fixtures__/save-v12-realm-campaign.json', import.meta.url), 'utf8');
  const old: GameState = JSON.parse(LZString.decompressFromBase64(JSON.parse(raw).data));
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  await page.getByLabel('Import save file').setInputFiles({ name: 'old-campaign.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  const upgraded = await saved(page);
  expect(upgraded.version).toBe(13);
  expect(upgraded.seed).toBe(old.seed);
  expect(upgraded.wars).toEqual(old.wars);
  for (const [id, region] of Object.entries(old.regions)) expect(upgraded.regions[id]).toEqual(region);
  // Drain the real legacy decisions after checking the migration did not answer them.
  expect(upgraded.pending).toEqual(old.pending);
  await settle(page);
  await page.getByRole('tab', { name: 'System', exact: true }).click();
  for (const realm of ['moon', 'sun', 'earth']) {
    await page.getByLabel('Choose realm').selectOption(realm);
    await expect(
      page.getByRole('group', { name: `Regions of ${realm === 'moon' ? 'Moon' : realm === 'sun' ? 'Sun' : 'Earth'}`, exact: true }).getByRole('button'),
    ).toHaveCount(12);
  }
  await page.screenshot({ path: info.outputPath('legacy-expanded-earth.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  expect(failures).toEqual([]);
});
