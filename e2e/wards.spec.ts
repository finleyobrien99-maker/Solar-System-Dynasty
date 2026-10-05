import { expect, test, type Page } from '@playwright/test';
import { createCharacter } from '../src/game/character';
import { ruler } from '../src/game/core';
import { hashString } from '../src/game/rng';
import type { GameState } from '../src/game/types';
import { sendAsWard } from '../src/game/wards';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../src/game/world';

/** A Mars ruler with two young children, among houses that like them. */
function fixture() {
  const s = createWorld(97);
  const home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(97, 'mars', 'F', 'Asha'), focus: 'dip', age: 40, family: 'married' });
  Object.assign(s, { credits: 2000, prestige: 500 });
  for (const k of Object.values(s.clans)) if (!k.isPlayer) k.opinion = 90;
  const r = ruler(s);
  const kid = (name: string, age: number) => {
    const c = createCharacter(s, { name, gender: 'M', born: s.year - age, clanId: s.playerClanId, planetId: 'mars', motherId: r.id });
    r.childrenIds.push(c.id);
    return c;
  };
  const pip = kid('Pip', 8);
  const tam = kid('Tam', 9);
  s.pending = [];
  return { s, pip, tam };
}

async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  const data = JSON.stringify(s);
  await page
    .getByLabel('Import save file')
    .setInputFiles({ name: 'wards.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ data, checksum: hashString(data) })) });
}

function watch(page: Page) {
  const out: string[] = [];
  page.on('pageerror', (e) => out.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') out.push(e.text());
  });
  return out;
}

async function openChild(page: Page, name: string) {
  await page.getByRole('tab', { name: 'Family', exact: true }).click();
  await page
    .locator('.char')
    .filter({ has: page.locator('.nm', { hasText: name }) })
    .first()
    .locator('.nm')
    .click();
  return page.locator('.section').filter({ has: page.getByRole('heading', { name: /^Upbringing/ }) });
}

test('choose a mentor, then send a child to be raised at another court', async ({ page }, info) => {
  const failures = watch(page);
  const { s } = fixture();
  await load(page, s);
  const up = await openChild(page, 'Pip');
  await expect(up).toContainText('Raised at home by tutors.');
  await up.getByRole('button', { name: 'Appoint mentor', exact: true }).click();
  await expect(up).toContainText('Mentored by');
  await up.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('upbringing.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await up.getByRole('button', { name: 'Ask them', exact: true }).click();
  await expect(up).toContainText('Being raised at the court of House');
  await expect(up).not.toContainText('Mentored by');
  expect(failures).toEqual([]);
});

test('a ward abroad can be brought home early', async ({ page }) => {
  const failures = watch(page);
  const { s, tam } = fixture();
  const host = Object.values(s.clans).find((k) => !k.isPlayer && k.planetId === 'mars' && s.characters[k.headId]?.died === undefined)!;
  expect(sendAsWard(s, tam.id, host.id, true)).toBe(true);
  s.pending = [];
  await load(page, s);
  const up = await openChild(page, 'Tam');
  await expect(up).toContainText(`Being raised at the court of House ${host.name}`);
  const recall = up.getByRole('button', { name: 'Bring them home early', exact: true });
  await recall.click();
  // The button arms first: its label becomes the warning, and a second tap confirms.
  await up.getByRole('button', { name: 'Tap again: their hosts will be offended', exact: true }).click();
  await expect(up).toContainText('Raised at home by tutors.');
  expect(failures).toEqual([]);
});
