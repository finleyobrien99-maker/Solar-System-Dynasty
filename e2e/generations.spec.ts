import { expect, test, type Page } from '@playwright/test';
import { ruler } from '../src/game/core';
import { recordDeed } from '../src/game/epithets';
import { currentHeir, killCharacter } from '../src/game/life';
import { hashString } from '../src/game/rng';
import type { GameState } from '../src/game/types';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../src/game/world';

function game() {
  const w = createWorld(21),
    house = scenarioHouses(w, 'mars', 'monarch')[0];
  const s = startGame(w, { clanId: house.id, ruler: rollRuler(21, 'mars', 'F', 'Ines'), age: 45, focus: 'dip', family: 'kids', vip: true });
  s.year += 12;
  currentHeir(s)!.born = s.year - 25;
  recordDeed(s, ruler(s), 'justice', 5);
  s.pending = [];
  return s;
}
async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  const data = JSON.stringify(s);
  await page
    .getByLabel('Import save file')
    .setInputFiles({ name: 'generation.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ data, checksum: hashString(data) })) });
}
function errors(page: Page) {
  const out: string[] = [];
  page.on('pageerror', (e) => out.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') out.push(e.text());
  });
  return out;
}

test('an immortal ruler hands over by choice, retires alive, and keeps their legacy after a reload', async ({ page }, info) => {
  const failures = errors(page),
    s = game(),
    old = ruler(s),
    heir = currentHeir(s)!;
  s.vip!.immortal = true;
  await load(page, s);
  const decision = page.locator('.section').filter({ has: page.getByRole('heading', { name: /^Pass the torch/ }) });
  await expect(decision).toContainText(heir.name);
  await decision.getByRole('button', { name: 'Abdicate', exact: true }).click();
  await expect(page.locator('.topbar')).toContainText(old.name);
  await decision.getByRole('button', { name: /^Tap again: hand over to/ }).click();
  const moment = page.getByRole('dialog');
  await expect(moment).toContainText('The Throne Passes to a New Generation');
  await expect(moment.getByRole('heading', { name: 'The Throne Passes to a New Generation', exact: true })).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(moment).toContainText('Retired, aged 57');
  await expect(moment).toContainText('the Just');
  const legacy = moment.locator('.section').filter({ has: page.getByRole('heading', { name: /^A reign remembered/ }) });
  await expect(legacy).toContainText('Fair judgements');
  await legacy.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('abdication.png'), animations: 'disabled' });
  await moment.getByRole('button', { name: 'Take the throne', exact: true }).click();
  await expect(page.locator('.topbar')).toContainText(heir.name);
  await expect(page.locator('.topbar')).not.toContainText('the Just');
  await page.getByRole('button', { name: 'Open ruler profile' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: old.name, exact: true }).click();
  await expect(page.getByRole('dialog').last().getByText('Retired ruler', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').last()).not.toContainText('Died aged');
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  await expect(page.locator('.topbar')).toContainText(heir.name);
  await page.getByRole('button', { name: 'Open ruler profile' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: old.name, exact: true }).click();
  await expect(page.getByRole('dialog').last().getByText('Retired ruler', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(failures).toEqual([]);
});

for (const ended of [false, true]) {
  test(
    ended ? 'the final ruler receives a memorial when the dynasty ends' : 'death shows a personal memorial before the heir takes the throne',
    async ({ page }, info) => {
      const failures = errors(page),
        s = game(),
        old = ruler(s);
      s.vip!.on = false;
      if (ended) for (const c of Object.values(s.characters)) if (c.clanId === s.playerClanId && c.id !== old.id && c.died === undefined) c.died = s.year - 1;
      killCharacter(s, old.id, 'old age');
      await load(page, s);
      const moment = page.getByRole('dialog');
      await expect(moment).toContainText(ended ? 'The End of a Dynasty' : 'The Ruler is Dead. Long Live the Ruler!');
      await expect(
        moment.getByRole('heading', { name: ended ? 'The End of a Dynasty' : 'The Ruler is Dead. Long Live the Ruler!', exact: true }),
      ).toBeFocused();
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await expect(moment).toContainText('Died aged 57 (old age)');
      await expect(moment).toContainText('the Just');
      const legacy = moment.locator('.section').filter({ has: page.getByRole('heading', { name: /^A reign remembered/ }) });
      await expect(legacy).toContainText('Fair judgements');
      await legacy.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await page.screenshot({ path: info.outputPath(ended ? 'last-ruler.png' : 'memorial.png'), animations: 'disabled' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      expect(failures).toEqual([]);
    },
  );
}
