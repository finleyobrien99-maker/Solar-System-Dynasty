import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { goalWorld } from '../src/game/warGoalScenarios';
import { clanRegions } from '../src/game/core';
import { declareWithGoal } from '../src/game/war';
import { recordRefusedDemand } from '../src/game/warGoals';
import { offerPeace } from '../src/game/peace';
import { rememberHouse } from '../src/game/houseRelations';
import { hashString } from '../src/game/rng';
import { inflateString } from '../src/game/codec';
import type { GameState } from '../src/game/types';

function world() {
  const s = goalWorld();
  const b = Object.values(s.clans).find((k) => !k.isPlayer && k.planetId === 'venus' && clanRegions(s, k.id).length)!;
  return { s, b };
}
async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  const data = JSON.stringify(s);
  await page
    .getByLabel('Import save file')
    .setInputFiles({ name: 'goals.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ data, checksum: hashString(data) })) });
}
async function saved(page: Page): Promise<GameState | null> {
  const value = await page.evaluate(() => localStorage.getItem('solar-dynasty:auto'));
  if (!value) return null;
  const envelope = JSON.parse(value);
  return JSON.parse(inflateString(envelope.data));
}
async function realm(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('tab', { name: /^Realm/ })
    .click();
}
async function house(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('tab', { name: /^System/ })
    .click();
  await page.getByRole('tablist', { name: 'System views' }).getByRole('tab', { name: 'Houses', exact: true }).click();
  await page.getByRole('button', { name: 'View House ' + name, exact: true }).click();
}
function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  return errors;
}
async function healthy(page: Page, errors: string[], info: TestInfo, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath(name + '.png'), animations: 'disabled' });
}
test('declare a tribute goal through act, fight a real battle, negotiate and reload its exact goal', async ({ page }, info) => {
  const { s, b } = world(),
    errors = watch(page);
  await load(page, s);
  await house(page, b.name);
  const dialog = page.getByRole('dialog').last();
  await dialog.getByLabel('War objective').selectOption('tribute');
  await dialog.getByLabel('Credits each cycle').fill('25');
  await dialog.getByLabel('Tribute cycles').fill('3');
  await dialog.getByRole('button', { name: 'Declare war for this goal', exact: true }).click();
  await dialog.getByRole('button', { name: /Tap again to declare/ }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await realm(page);
  await expect(page.getByText('War goal: Tribute: 25 credits for 3 cycles', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Launch battle', exact: true }).click();
  await page
    .getByRole('dialog', { name: /Victory in Battle|Defeat in Battle/ })
    .getByRole('button', { name: 'Continue', exact: true })
    .click();
  await page.getByText('Negotiate peace', { exact: true }).click();
  await expect(page.getByText(/Their war score:/).first()).toBeVisible();
  await expect.poll(async () => (await saved(page))?.wars[0]?.goal).toEqual({ kind: 'tribute', amount: 25, years: 3 });
  const after = (await saved(page))!;
  expect(after.wars[0].target).toBe('');
  expect(after.stats.battlesWon + after.stats.battlesLost).toBeGreaterThan(0);
  expect(Object.values(after.regions).map((r) => r.owner)).toEqual(Object.values(s.regions).map((r) => r.owner));
  await page
    .getByText(/Their war score:/)
    .first()
    .scrollIntoViewIfNeeded();
  await healthy(page, errors, info, 'goal-negotiation');
  await page.reload();
  await page.getByRole('button', { name: /^Continue: / }).click();
  await realm(page);
  await expect(page.getByText('War goal: Tribute: 25 credits for 3 cycles', { exact: true })).toBeVisible();
});
test('a saved refused demand is explicitly enforceable once for its exact goal', async ({ page }, info) => {
  const { s, b } = world(),
    errors = watch(page);
  const goal = { kind: 'humiliate' as const, prestige: 100 };
  expect(recordRefusedDemand(s, 'refused', s.playerClanId, b.id, goal, s.year + 10)).toBe(true);
  s.prestige = 0;
  await load(page, s);
  await house(page, b.name);
  const dialog = page.getByRole('dialog').last();
  await dialog.getByRole('button', { name: 'Enforce refused demand', exact: true }).click();
  await dialog.getByRole('button', { name: 'Tap again to enforce this demand', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await realm(page);
  await expect(page.getByText('War goal: Humiliation: up to 100 prestige', { exact: true })).toBeVisible();
  await expect.poll(async () => (await saved(page))?.warJustifications?.[0].used).toBe(true);
  const after = (await saved(page))!;
  expect(after.wars[0].cb).toBe('feud');
  expect(after.wars[0].goal).toEqual(goal);
  expect(after.prestige).toBe(0);
  await page.getByText('War goal: Humiliation: up to 100 prestige', { exact: true }).scrollIntoViewIfNeeded();
  await healthy(page, errors, info, 'justified-goal');
});
test('incoming exact tribute terms wait for consent, survive reload and settle without taking land', async ({ page }, info) => {
  const { s, b } = world(),
    errors = watch(page);
  expect(declareWithGoal(s, b.id, s.playerClanId, { kind: 'tribute', amount: 25, years: 3 })).toBe(true);
  const w = s.wars[0];
  expect(offerPeace(s, w, { kind: 'goal', winner: b.id, goal: w.goal! }, b.id)).toBe(true);
  const owners = Object.values(s.regions).map((r) => r.owner);
  await load(page, s);
  await page.getByRole('dialog', { name: 'War Declared!' }).getByRole('button', { name: 'Continue', exact: true }).click();
  await realm(page);
  await expect(page.getByLabel('Incoming peace offer')).toContainText('Tribute: 25 credits for 3 cycles');
  await expect.poll(async () => (await saved(page))?.wars[0]?.peaceOffer?.terms).toEqual(w.peaceOffer!.terms);
  await page.getByLabel('Incoming peace offer').scrollIntoViewIfNeeded();
  await healthy(page, errors, info, 'incoming-goal');
  await page.reload();
  await page.getByRole('button', { name: /^Continue: / }).click();
  await realm(page);
  await page.getByRole('button', { name: 'Accept peace terms', exact: true }).click();
  await page.getByRole('button', { name: /Tap again to accept these terms/ }).click();
  await expect.poll(async () => (await saved(page))?.wars.length).toBe(0);
  const after = (await saved(page))!;
  expect(after.peaceTributes?.[0]).toMatchObject({ from: s.playerClanId, to: b.id, amount: 25 });
  expect(Object.values(after.regions).map((r) => r.owner)).toEqual(owners);
  await page
    .getByRole('dialog', { name: /Peace agreed/ })
    .getByRole('button', { name: 'Continue', exact: true })
    .click();
  await expect(page.getByText('Peace tribute', { exact: true })).toBeVisible();
  await page.getByText('Peace tribute', { exact: true }).scrollIntoViewIfNeeded();
  await healthy(page, errors, info, 'peace-obligation');
});
test('planet-filtered Houses shows real AI-AI pact and protection links without exposing private proof', async ({ page }, info) => {
  const { s, b } = world(),
    errors = watch(page);
  const c = Object.values(s.clans).find((k) => !k.isPlayer && k.planetId === 'earth' && clanRegions(s, k.id).length)!;
  s.diplomacy!.treaties.push(
    { id: 'public-pact', kind: 'defensive', a: b.id, b: c.id, signed: s.year, until: s.year + 10, years: 10 },
    { id: 'public-protection', kind: 'guarantee', a: b.id, b: s.playerClanId, signed: s.year, until: s.year + 15, years: 15 },
  );
  const rival = Object.values(s.clans).find((k) => !k.isPlayer && k.id !== b.id && k.id !== c.id && clanRegions(s, k.id).length)!;
  rememberHouse(s, b.id, rival.id, { text: 'Private proof of a hidden affair', value: -90 });
  await load(page, s);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('tab', { name: /^System/ })
    .click();
  await page.getByRole('tablist', { name: 'System views' }).getByRole('tab', { name: 'Houses', exact: true }).click();
  await page.getByLabel('House home world').selectOption('venus');
  const card = page.getByRole('article', { name: 'House ' + b.name, exact: true });
  await card.getByText('Who stands with them · 2 treaties', { exact: true }).click();
  await expect(card).toContainText('Defensive pact with');
  await expect(card).toContainText('Protects');
  await expect(card).toContainText('Public rivals');
  await expect(card.getByRole('button', { name: 'House ' + rival.name, exact: true })).toBeVisible();
  await expect(card).toContainText('Cold relations');
  await expect(card).not.toContainText('Private proof');
  await expect(card).not.toContainText('hidden affair');
  await healthy(page, errors, info, 'house-web');
  await card.getByRole('button', { name: 'House ' + c.name, exact: true }).click();
  await expect(page.getByRole('dialog').last()).toContainText('House ' + c.name);
});
