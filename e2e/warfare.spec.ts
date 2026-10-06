import { expect, test, type Page } from '@playwright/test';
import { coalitionCampaign } from '../src/game/testScenarios';
import { declareHouseWar } from '../src/game/ai';
import { alive, ch, clanRegions } from '../src/game/core';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../src/game/world';
import LZString from 'lz-string';
import { hashString } from '../src/game/rng';
function rawSave(s: GameState) {
  const data = JSON.stringify(s);
  return JSON.stringify({ data, checksum: hashString(data) });
}
import type { GameState } from '../src/game/types';

async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  await page.getByLabel('Import save file').setInputFiles({
    name: 'warfare.json',
    mimeType: 'application/json',
    buffer: Buffer.from(rawSave(s)),
  });
  await page.getByRole('tab', { name: /^Realm/ }).click();
}
function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  return errors;
}
async function stored(page: Page): Promise<GameState> {
  // Export the actual current state via the game's own save menu.
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export save file', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const envelope = JSON.parse(Buffer.concat(chunks).toString());
  const data = LZString.decompressFromBase64(envelope.data);
  expect(hashString(data)).toBe(envelope.checksum);
  const result = JSON.parse(data) as GameState;
  await page.getByRole('dialog').last().getByRole('button', { name: 'Close', exact: true }).click();
  return result;
}
test('real coalition campaign: paid blockade, physical costs and reload gate', async ({ page }, info) => {
  const errors = watch(page),
    { s, war } = coalitionCampaign();
  await load(page, s);
  const wars = page.locator('.section').filter({ has: page.getByRole('heading', { name: /^Wars \(/ }) });
  await expect(wars).toContainText('Coalition defence');
  await expect(wars).toContainText('ships remain');
  const league = page.locator('.section').filter({ has: page.getByRole('heading', { name: /^Threat and coalitions/ }) });
  await expect(league).toContainText('77/100 threat');
  await page.getByRole('button', { name: 'Starve them out', exact: true }).click();
  await expect(wars.getByLabel('Last siege operation')).toContainText('Succeeded');
  await expect(wars.getByRole('button', { name: 'Launch battle', exact: true })).toBeDisabled();
  await expect(wars.getByRole('button', { name: 'Bribe a gate', exact: true })).toBeDisabled();
  const after = await stored(page),
    result = after.wars.find((w) => w.id === war.id)!.siege!;
  expect(after.credits).toBe(s.credits - result.cost);
  expect(after.fleet).toBe(s.fleet - result.losses);
  expect(result.progress).toBeGreaterThanOrEqual(5);
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  await page.getByRole('tab', { name: /^Realm/ }).click();
  await expect(wars.getByRole('button', { name: 'Launch battle', exact: true })).toBeDisabled();
  await expect(wars.getByLabel('Last siege operation')).toContainText('Starve them out');
  await wars.getByLabel('Last siege operation').scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('siege-and-coalition.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});

test('explicit player pledge lends real ships, survives reload and withdrawal recalls them', async ({ page }, info) => {
  const errors = watch(page),
    s = createWorld(97),
    home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(97, 'mars', 'F', 'Asha'), focus: 'dip', age: 40, family: 'married' });
  s.pending = [];
  s.fleet = 100;
  for (const c of Object.values(s.characters)) c.spouseId = undefined;
  const houses = Object.values(s.clans).filter((c) => !c.isPlayer && clanRegions(s, c.id).length && alive(ch(s, c.headId)));
  const [a, d] = houses;
  ch(s, a.headId)!.born = s.year - 40;
  a.fleet = 300;
  s.houseThreat[a.id] = 75;
  await load(page, s);
  const league = page.locator('.section').filter({ has: page.getByRole('heading', { name: /^Threat and coalitions/ }) });
  await league.getByRole('button', { name: 'Pledge defence', exact: true }).click();
  await league.getByRole('button', { name: /^Tap again to pledge/ }).click();
  await expect(league).toContainText('You have pledged defence');
  const pledged = await stored(page);
  expect(pledged.coalitions.find((c) => c.target === a.id)!.members).toContain(s.playerClanId);
  pledged.clans[a.id].prestige = 1000;
  expect(declareHouseWar(pledged, a.id, clanRegions(pledged, d.id)[0].id)).toBe(true);
  pledged.pending = [];
  await page.reload();
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  await page.getByLabel('Import save file').setInputFiles({
    name: 'coalition-call.json',
    mimeType: 'application/json',
    buffer: Buffer.from(rawSave(pledged)),
  });
  await page.getByRole('tab', { name: /^Realm/ }).click();
  const fleet = page.locator('.section').filter({ has: page.getByRole('heading', { name: /^Fleet(?: More|$)/ }) });
  await expect(fleet).toContainText('50 committed to defence');
  await league.getByRole('button', { name: 'Withdraw pledge and recall ships', exact: true }).click();
  await league.getByRole('button', { name: 'Tap again to withdraw your pledge', exact: true }).click();
  await expect(fleet).toContainText('100 ships at home');
  const recalled = await stored(page);
  expect(recalled.aiWars[0].coalition![0].ships).toBe(0);
  expect(recalled.fleet).toBe(100);
  await league.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('coalition-pledge.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});

test('assault produces one real battle and remembers every coalition casualty after reload', async ({ page }, info) => {
  const errors = watch(page),
    { s } = coalitionCampaign();
  // Realm defenders (realmDefence.ts) make the opening battles closer: start near victory so one won assault ends the war.
  s.wars[0].score = 85;
  await load(page, s);
  await page.getByRole('button', { name: 'Assault', exact: true }).click();
  await page.getByRole('button', { name: 'Tap again to assault', exact: true }).click();
  const report = page.getByRole('dialog', { name: /Victory in Battle|Defeat in Battle/ });
  await expect(report.getByLabel('Coalition casualties')).toContainText('Coalition defenders');
  const before = await report.getByLabel('Coalition casualties').innerText();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('coalition-battle.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await report.getByLabel('Coalition casualties').getByRole('button').first().click();
  await expect(report).toHaveCount(0);
  const house = page.getByRole('dialog').last();
  await expect(house).toContainText('Threat and coalitions');
  await house.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(report.getByLabel('Coalition casualties')).toHaveText(before, { useInnerText: true });
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  await expect(report.getByLabel('Coalition casualties')).toHaveText(before, { useInnerText: true });
  await report.getByRole('button', { name: 'Continue', exact: true }).click();
  for (let i = 0; i < 10 && (await page.getByRole('dialog').count()); i++)
    await page.getByRole('dialog').last().getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab', { name: /^Realm/ }).click();
  await expect(page.getByRole('heading', { name: /^Wars \(0\)/ })).toBeVisible();
  const after = await stored(page);
  expect(after.wars).toHaveLength(0);
  // A justified conquest adds 12 threat, a throne-region 20 more, capped at 100 (coalitions.ts).
  const capital = s.regions[s.wars[0].target].capital;
  expect(after.houseThreat[s.playerClanId]).toBe(Math.min(100, s.houseThreat[s.playerClanId] + 12 + (capital ? 20 : 0)));
  for (const p of s.wars[0].coalition!) expect(after.clans[p.clanId].fleet).toBeGreaterThan(s.clans[p.clanId].fleet);
  expect(errors).toEqual([]);
});
