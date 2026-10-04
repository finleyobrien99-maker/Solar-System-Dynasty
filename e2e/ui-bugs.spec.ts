import { expect, test } from '@playwright/test';
test('VIP overflow is explained and crowded phone profiles collapse traits', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New dynasty' }).click();
  await page.getByRole('button', { name: /^Next: how you start/ }).click();
  await page.getByRole('button', { name: /VIP sandbox/ }).click();
  for (const name of [/^Next: your house/, /^Next: your ruler/, /^Begin the dynasty/]) await page.getByRole('button', { name }).click();
  for (let i = 0; i < 25; i++) {
    const choice = page.locator('.overlay').last().locator('button:not(.close-x):not([disabled])').first();
    if (!(await choice.count())) break;
    await choice.click();
  }
  await page.getByRole('button', { name: 'VIP console', exact: true }).click();
  await page.getByRole('button', { name: 'Lock every top gene', exact: true }).click();
  await page.getByRole('button', { name: 'Make god-tier', exact: true }).click();
  await page.getByRole('button', { name: 'Open the trait editor', exact: true }).click();
  const dialog = page.getByRole('dialog');
  if (info.project.name === 'phone') {
    await expect(dialog.locator('.trait-groups')).toBeVisible();
    await expect(dialog.locator('.trait-groups details[open]')).toHaveCount(0);
    const genes = dialog.locator('.trait-groups summary').filter({ hasText: 'Genetic' });
    await genes.click();
    await expect(dialog.locator('.trait-groups details[open] .trait').first()).toBeVisible();
    await genes.click();
  } else {
    await expect(dialog.locator('.trait-groups')).toHaveCount(0);
    expect(await dialog.locator('.hero .trait').count()).toBeGreaterThan(8);
  }
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('profile.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Turn VIP off', exact: true }).click();
  await page.getByRole('button', { name: 'Tap again to switch off', exact: true }).click();
  await page.getByRole('tab', { name: 'Bloodline', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your existing locks and purges still work' })).toBeVisible();
  await page.getByRole('button', { name: 'Show locked & purged', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Locked & purged', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('vault.png'), animations: 'disabled' });
});
