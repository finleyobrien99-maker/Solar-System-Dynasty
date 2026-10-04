import { expect, test, type Page } from '@playwright/test';

// For every starting scenario: found a dynasty, play 20 cycles answering every
// pop-up, then open every tab and window. Fails on any console error, page
// error, the crash screen, or sideways scrolling.

const SCENARIOS = ['Governor', 'Viceroy', 'Monarch', 'Solar Emperor'];
const TABS = ['Life', 'Family', 'Bloodline', 'Realm', 'System', 'Actions', 'Treasury'];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Answer any open pop-ups with their first available choice. */
async function settle(page: Page): Promise<void> {
  for (let i = 0; i < 25; i++) {
    const choice = page.locator('.overlay').last().locator('button:not(.close-x):not([disabled])').first();
    if (!(await choice.count())) return;
    await choice.click();
  }
}

async function healthy(page: Page): Promise<void> {
  await expect(page.locator('.crash')).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);
}

async function closeTop(page: Page): Promise<void> {
  await page.locator('.overlay').last().getByRole('button', { name: 'Close' }).click();
}

async function found(page: Page, scenario: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New dynasty' }).click();
  await page.getByRole('button', { name: /^Next: how you start/ }).click();
  await page
    .locator('.opt.scenario')
    .filter({ has: page.locator('.t', { hasText: new RegExp(`^${scenario}$`) }) })
    .click();
  await page.getByRole('button', { name: /^Next: your house/ }).click();
  await page.getByRole('button', { name: /^Next: your ruler/ }).click();
  await page.getByRole('button', { name: /^Begin the dynasty/ }).click();
  await expect(page.getByRole('button', { name: 'Age up one cycle' })).toBeVisible();
}

for (const scenario of SCENARIOS) {
  test(`${scenario}: 20 cycles, every tab and window`, async ({ page }) => {
    const errors = watchErrors(page);
    await found(page, scenario);
    await healthy(page);

    for (let i = 0; i < 20; i++) {
      await settle(page);
      const ageUp = page.getByRole('button', { name: 'Age up one cycle' });
      if (!(await ageUp.count())) break; // the dynasty ended
      await ageUp.click();
    }
    await settle(page);
    await healthy(page);

    if (await page.getByRole('button', { name: 'Age up one cycle' }).count()) {
      const nav = page.getByRole('navigation', { name: 'Main' });
      for (const tab of TABS) {
        await nav.getByRole('button', { name: tab }).click();
        await healthy(page);
      }

      await page.locator('.who').first().click(); // the ruler's profile
      await healthy(page);
      await closeTop(page);

      for (const item of ['Save / Load', 'Codex & guide', 'Dynasty tree']) {
        await page.getByRole('button', { name: 'Menu' }).click();
        await page.getByRole('button', { name: item }).click();
        await healthy(page);
        await closeTop(page);
      }

      if (scenario === 'Governor') {
        // VIP mode: tap twice to confirm, then the console opens.
        await page.getByRole('button', { name: 'Menu' }).click();
        const vip = page.getByRole('button', { name: /Turn on VIP mode|Tap again/ });
        await vip.click();
        await vip.click();
        await expect(page.locator('.overlay').last()).toContainText('VIP');
        await healthy(page);
        await closeTop(page);
      }
    }

    expect(errors).toEqual([]);
  });
}
