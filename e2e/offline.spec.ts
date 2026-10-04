import { expect, test } from '@playwright/test';
test('bundled fonts remain available after an offline reload', async ({ page, context }) => {
  const remoteFonts: string[] = [];
  page.on('request', (request) => {
    if (/fonts\\.(googleapis|gstatic)\\.com/.test(request.url())) remoteFonts.push(request.url());
  });
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(async () => {
    const cache = await caches.open('solar-dynasty-v2');
    const urls = (await cache.keys()).map((request) => request.url);
    return urls.some((url) => url.endsWith('.js')) && urls.some((url) => url.endsWith('.css')) && urls.some((url) => url.endsWith('orbitron-latin.woff2'));
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'New dynasty' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('700 16px Orbitron') && document.fonts.check('400 16px "Exo 2"'))).toBe(true);
  expect(remoteFonts).toEqual([]);
});
