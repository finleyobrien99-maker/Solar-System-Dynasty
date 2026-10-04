import { expect, test, type Page } from '@playwright/test';
async function found(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New dynasty' }).click();
  for (const name of [/^Next: how you start/, /^Next: your house/, /^Next: your ruler/, /^Begin the dynasty/]) await page.getByRole('button', { name }).click();
  for (let i = 0; i < 25; i++) {
    const choice = page.locator('.overlay').last().locator('button:not(.close-x):not([disabled])').first();
    if (!(await choice.count())) break;
    await choice.click();
  }
}
test('reading preferences persist and respect system motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByText('Reading & motion', { exact: true }).click();
  await page.getByLabel('Text size').selectOption('larger');
  await page.getByLabel('Reduce motion', { exact: true }).check();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'larger');
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  await found(page);
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const tab of ['Life', 'Family', 'Bloodline', 'Realm', 'System', 'Actions', 'Treasury']) {
    await nav.getByRole('tab', { name: tab, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  }
});
test('tabs, focus rings and nested dialogs work using the keyboard', async ({ page }) => {
  await found(page);
  const life = page.getByRole('navigation', { name: 'Main' }).getByRole('tab', { name: 'Life', exact: true });
  await life.focus();
  await life.press('ArrowRight');
  const family = page.getByRole('tab', { name: 'Family', exact: true });
  await expect(family).toBeFocused();
  await expect(family).toHaveAttribute('aria-selected', 'true');
  expect(await family.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  await family.press('End');
  await expect(page.getByRole('tab', { name: 'Treasury', exact: true })).toBeFocused();
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await menu.focus();
  await menu.press('Enter');
  const save = page.getByRole('button', { name: 'Save / Load' });
  await save.focus();
  await save.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Saves' })).toBeVisible();
  const close = page.getByRole('button', { name: 'Close', exact: true });
  await close.focus();
  await close.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Import from file' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(save).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('loading from a nested save window unlocks the game', async ({ page }) => {
  await found(page);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Save / Load' }).click();
  await page.getByRole('button', { name: 'Save here', exact: true }).first().click();
  await page.getByRole('button', { name: 'Load', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Family', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Family', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(await page.locator('body').evaluate((el) => el.style.overflow)).not.toBe('hidden');
});
