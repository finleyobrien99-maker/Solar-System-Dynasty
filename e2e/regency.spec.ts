import { expect, test, type Page } from '@playwright/test';
import { createCharacter } from '../src/game/character';
import { ch, ruler } from '../src/game/core';
import { getFlag, setFlag } from '../src/game/eventKit';
import { EVENT_BY_ID, queueEvent } from '../src/game/events';
import { killCharacter } from '../src/game/life';
import { CHALLENGE_FLAG, regencyTick } from '../src/game/regency';
import { hashString } from '../src/game/rng';
import type { GameState } from '../src/game/types';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../src/game/world';

const PERSONAL = ['ambitious', 'content', 'greedy', 'generous', 'honest', 'deceitful', 'humble', 'arrogant', 'kind', 'cruel'];

/** A Mars governor with a young daughter, her mother and the ruler's brother. */
function family(age: number) {
  const s = createWorld(211);
  const home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(211, 'mars', 'M', 'Oren'), focus: 'dip', age: 36, family: 'married' });
  Object.assign(s, { credits: 900, prestige: 300, fleet: 60 });
  const r = ruler(s);
  const mother = s.characters[r.spouseId!];
  const ward = createCharacter(s, {
    name: 'Ysolde',
    gender: 'F',
    born: s.year - age,
    clanId: s.playerClanId,
    planetId: 'mars',
    fatherId: r.id,
    motherId: mother.id,
  });
  r.childrenIds.push(ward.id);
  mother.childrenIds.push(ward.id);
  let gf = ch(s, r.fatherId);
  if (!gf) {
    gf = createCharacter(s, { gender: 'M', born: s.year - 72, clanId: s.playerClanId, planetId: 'mars', adultExtras: true });
    gf.childrenIds.push(r.id);
    r.fatherId = gf.id;
  }
  const uncle = createCharacter(s, {
    name: 'Corvin',
    gender: 'M',
    born: s.year - 41,
    clanId: s.playerClanId,
    planetId: 'mars',
    fatherId: gf.id,
    adultExtras: true,
  });
  gf.childrenIds.push(uncle.id);
  for (const c of [mother, uncle]) c.traits = c.traits.filter((t) => !PERSONAL.includes(t));
  s.pending = [];
  return { s, ward, mother, uncle };
}

/** The ruler has died; the council's choice of regent is waiting for you. */
function orphaned(age: number, uncleTraits: string[]) {
  const f = family(age);
  f.uncle.traits.push(...uncleTraits);
  killCharacter(f.s, f.s.rulerId, 'a fall');
  f.s.pending = [];
  regencyTick(f.s);
  f.s.pending = [];
  queueEvent(f.s, EVENT_BY_ID.regency_choice);
  return f;
}

function regentFlag(s: GameState) {
  return getFlag(s, 'regent:' + s.playerClanId)!;
}

async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  const data = JSON.stringify(s);
  await page
    .getByLabel('Import save file')
    .setInputFiles({ name: 'regency.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ data, checksum: hashString(data) })) });
}

function watch(page: Page): string[] {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') failures.push(e.text());
  });
  return failures;
}

async function healthy(page: Page, failures: string[]) {
  await expect(page.locator('.crash')).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);
  expect(failures).toEqual([]);
}

function section(page: Page, heading: RegExp) {
  return page.locator('.section').filter({ has: page.getByRole('heading', { name: heading }) });
}

async function lifeTab(page: Page) {
  await page.getByRole('tab', { name: /^Life/ }).click();
}

test('name a guardian for a young heir', async ({ page }, info) => {
  const failures = watch(page);
  const { s, uncle } = family(6);
  await load(page, s);
  await lifeTab(page);
  const guardian = section(page, /^Guardian for your heir/);
  await expect(guardian).toContainText('Nobody is named');
  await guardian.getByLabel('Choose a guardian').selectOption(uncle.id);
  await guardian.getByRole('button', { name: 'Name as guardian', exact: true }).click();
  await expect(guardian).toContainText('Named guardian');
  await expect(guardian).toContainText(uncle.name);
  await guardian.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('guardian.png'), animations: 'disabled' });
  await healthy(page, failures);
});

test('a child inherits: overrule the council, live under the regent, and take the seal at sixteen', async ({ page }, info) => {
  const failures = watch(page);
  const { s, uncle, ward } = orphaned(15, ['honest', 'content', 'kind']);
  await load(page, s);
  const event = page.locator('.overlay').last();
  await expect(event).toContainText('A Regent for the Child');
  await page.screenshot({ path: info.outputPath('regency-choice.png'), animations: 'disabled' });
  await event.getByRole('button', { name: 'Another of the family instead' }).click();
  await event.getByRole('button', { name: /^Continue/ }).click();
  await lifeTab(page);
  await expect(page.getByText('Regency until age 16: war, schemes and activities are locked')).toBeVisible();
  const regency = section(page, /^The regency/);
  await expect(regency).toContainText(uncle.name);
  await expect(regency).toContainText(`Rules until ${ward.name} turns 16`);
  await regency.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('regency.png'), animations: 'disabled' });
  await healthy(page, failures);

  await page.getByRole('button', { name: 'Age up one cycle' }).click();
  await expect(page.locator('.overlay').filter({ hasText: 'The Regent Steps Down' })).toBeVisible();
  for (let i = 0; i < 10 && (await page.locator('.overlay').count()); i++) {
    await page.locator('.overlay').last().locator('button:not(.close-x):not([disabled])').first().click();
  }
  await lifeTab(page);
  await expect(section(page, /^The regency/)).toHaveCount(0);
  await expect(page.getByText(/war, schemes and activities are locked/)).toHaveCount(0);
  await healthy(page, failures);
});

test('a regent who will not go can be bought out', async ({ page }, info) => {
  const failures = watch(page);
  const { s, uncle } = orphaned(15, ['ambitious', 'greedy']);
  s.pending = [];
  regentFlag(s).data.id = uncle.id;
  s.year += 1;
  regentFlag(s).data.until = s.year + 2;
  setFlag(s, CHALLENGE_FLAG, s.year);
  queueEvent(s, EVENT_BY_ID.regent_clings);
  await load(page, s);
  const event = page.locator('.overlay').last();
  await expect(event).toContainText('The Regent Will Not Go');
  await page.screenshot({ path: info.outputPath('regent-clings.png'), animations: 'disabled' });
  await event.getByRole('button', { name: 'Wait it out' }).click();
  await event.getByRole('button', { name: /^Continue/ }).click();
  await lifeTab(page);
  await expect(page.getByText('The regent still holds the seal: war, schemes and activities are locked')).toBeVisible();
  const regency = section(page, /^The regency/);
  await expect(regency).toContainText(`Refuses to hand over the seal until ${s.year + 2}`);
  await expect(regency).toContainText('Hungry for power');
  await regency.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('regency-clinging.png'), animations: 'disabled' });
  await healthy(page, failures);
});

test('nothing on screen for a grown heir', async ({ page }) => {
  const failures = watch(page);
  const { s } = family(20);
  await load(page, s);
  await lifeTab(page);
  await expect(section(page, /^Guardian for your heir/)).toHaveCount(0);
  await expect(section(page, /^The regency/)).toHaveCount(0);
  await healthy(page, failures);
});
