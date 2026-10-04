import { expect, test } from '@playwright/test';

test('spending time persists and profiles explain relationships', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'New dynasty' }).click();
  for (const name of [/^Next: how you start/, /^Next: your house/, /^Next: your ruler/]) await page.getByRole('button', { name }).click();
  await page.getByRole('button', { name: /Married with kids/ }).click();
  await page.getByRole('button', { name: /^Begin the dynasty/ }).click();
  for (let i = 0; i < 25; i++) {
    const choice = page.locator('.overlay').last().locator('button:not(.close-x):not([disabled])').first();
    if (!(await choice.count())) break;
    await choice.click();
  }
  const person = page.getByRole('combobox', { name: 'Spend time with', exact: true });
  const ids = await person.locator('option').evaluateAll((options) => options.slice(0, 4).map((option) => (option as HTMLOptionElement).value));
  await page.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('stargazing');
  await person.selectOption(ids[0]);
  await page.getByRole('button', { name: 'Spend time together' }).click();
  await expect(page.getByText('2 of 3 visits left this cycle.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spend time together' })).toBeDisabled();
  await expect(page.getByText('You already saw them this cycle.')).toBeVisible();
  await page.getByRole('button', { name: 'Open ruler profile' }).first().click();
  const row = page.getByRole('dialog').locator('details').filter({ hasText: 'Time together: +5' }).first();
  await row.locator('summary').click();
  await expect(row.getByText('Time together: +5')).toBeVisible();
  await row.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('relationships.png'), animations: 'disabled' });
  await row.getByRole('button', { name: /^Open .* profile$/ }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(row.getByText('Time together: +5')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  for (const id of ids.slice(1, 3)) {
    await person.selectOption(id);
    await page.getByRole('button', { name: 'Spend time together' }).click();
  }
  await person.selectOption(ids[3]);
  await expect(page.getByText('You can only see 3 people a cycle.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spend time together' })).toBeDisabled();
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('spend-time.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await expect.poll(async () => page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes('auto')).length)).toBeGreaterThan(0);
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  await expect(page.getByText('0 of 3 visits left this cycle.')).toBeVisible();
  expect(errors).toEqual([]);
});
