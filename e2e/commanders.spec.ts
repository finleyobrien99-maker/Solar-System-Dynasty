import { expect, test, type Page } from '@playwright/test';
import { declareWar } from '../src/game/war';
import { createCharacter } from '../src/game/character';
import { commandersTick, commanderOf } from '../src/game/commanders';
import { clanRegions, ruler } from '../src/game/core';
import { hashString } from '../src/game/rng';
import type { GameState } from '../src/game/types';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../src/game/world';

/** A Mars governor at war with a neighbour, with a bold grown son who can take the fleet. */
function fixture() {
  const s = createWorld(131);
  const home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(131, 'mars', 'F', 'Asha'), focus: 'dip', age: 50, family: 'married' });
  Object.assign(s, { credits: 2000, prestige: 300, fleet: 120 });
  const r = ruler(s);
  const son = createCharacter(s, { name: 'Bram', gender: 'M', born: s.year - 24, clanId: s.playerClanId, planetId: 'mars', motherId: r.id, adultExtras: true });
  son.base.cmd = 9;
  r.childrenIds.push(son.id);
  const enemy = Object.values(s.clans).find(
    (k) => !k.isPlayer && k.planetId === 'mars' && clanRegions(s, k.id).length > 0 && !clanRegions(s, k.id).some((x) => x.capital),
  )!;
  if (!declareWar(s, clanRegions(s, enemy.id)[0].id, 'conquest')) throw new Error('Cannot declare the commander fixture war');
  const enemyHead = s.characters[enemy.headId];
  enemyHead.born = s.year - 40;
  enemyHead.traits = enemyHead.traits.filter((t) => t !== 'craven');
  commandersTick(s);
  s.pending = [];
  return { s, son, enemy, theirs: commanderOf(s, enemy.id)! };
}

async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  const data = JSON.stringify(s);
  await page
    .getByLabel('Import save file')
    .setInputFiles({ name: 'commanders.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ data, checksum: hashString(data) })) });
}

test('appoint a commander, see who leads the enemy, and a real battle goes on their record', async ({ page }, info) => {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') failures.push(e.text());
  });
  const { s, son, enemy, theirs } = fixture();
  await load(page, s);
  await page.getByRole('tab', { name: /^Realm/ }).click();
  const section = page.locator('.section').filter({ has: page.getByRole('heading', { name: /^Fleet commander/ }) });
  await expect(section).toContainText('Nobody in command');
  await expect(section).toContainText(`House ${enemy.name}`);
  await expect(section).toContainText(theirs.name);
  await section.getByRole('button', { name: 'House ' + enemy.name, exact: true }).click();
  const house = page.getByRole('dialog').last();
  await expect(house).toContainText('Fleet commander');
  await expect(house).toContainText(theirs.name);
  await house.getByRole('button', { name: 'Close', exact: true }).click();
  await section.getByLabel('Appoint a commander').selectOption(son.id);
  await section.getByRole('button', { name: 'Give them the fleet', exact: true }).click();
  await expect(section).toContainText('no battles yet');
  await expect(section).toContainText('In command since');
  await section.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('commander.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

  await page.getByRole('button', { name: 'Launch battle', exact: true }).first().click();
  const report = page.getByRole('dialog', { name: /Victory in Battle|Defeat in Battle/ });
  await expect(report).toContainText(/Victory in Battle|Defeat in Battle/);
  await expect(report).toContainText(son.name);
  await expect(report).toContainText(theirs.name);
  await expect(report).toContainText('Commanded your fleet');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('named-battle.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await report.getByRole('button', { name: /Commanded your fleet/ }).click();
  const ownProfile = page.getByRole('dialog', { name: new RegExp(son.name) });
  await expect(report).toHaveCount(0);
  await expect(ownProfile.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.screenshot({ path: info.outputPath('commander-profile.png'), animations: 'disabled' });
  await ownProfile.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(report).toContainText(son.name);
  await report.getByRole('button', { name: /Commanded the opposing fleet/ }).click();
  const rivalProfile = page.getByRole('dialog', { name: new RegExp(theirs.name) });
  await expect(report).toHaveCount(0);
  await expect(rivalProfile.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(report).toContainText(theirs.name);
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  await expect(page.getByRole('dialog').last()).toContainText(son.name);
  await page.getByRole('dialog').last().getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('tab', { name: /^Realm/ }).click();
  await expect(section).toContainText(/won 1, lost 0|won 0, lost 1|Nobody in command/);
  expect(failures).toEqual([]);
});
