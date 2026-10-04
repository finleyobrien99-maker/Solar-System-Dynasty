import { expect, test } from '@playwright/test';
test('Android back returns Saves to Menu, then closes Menu', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { __NATIVE_STORE__: {} });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'New dynasty' }).click();
  for (const name of [/^Next: how you start/, /^Next: your house/, /^Next: your ruler/, /^Begin the dynasty/]) {
    await page.getByRole('button', { name }).click();
  }
  for (let i = 0; i < 25; i++) {
    const choice = page.locator('.overlay').last().locator('button:not(.close-x):not([disabled])').first();
    if (!(await choice.count())) break;
    await choice.click();
  }
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Save / Load' }).click();
  await expect(page.getByRole('dialog')).toContainText('Saves');
  await page.evaluate(() => (window as Window & { __onNativeBack?: () => void }).__onNativeBack?.());
  await expect(page.getByRole('dialog')).toContainText('Save & quit to title');
  await page.evaluate(() => (window as Window & { __onNativeBack?: () => void }).__onNativeBack?.());
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
