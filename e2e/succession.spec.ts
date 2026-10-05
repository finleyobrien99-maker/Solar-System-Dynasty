import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { disputedInheritance } from '../src/game/testScenarios';
import { ambitionChoices, chooseAmbition } from '../src/game/ambitions';
import { createCharacter } from '../src/game/character';
import { doActivity } from '../src/game/activities';
import { generateSuitors } from '../src/game/family';
import { ruler } from '../src/game/core';
import { hashString } from '../src/game/rng';
import { learnSecret, recordMurder } from '../src/game/secrets';
import { successionTick } from '../src/game/succession';
import type { GameState } from '../src/game/types';

async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  const data = JSON.stringify(s);
  await page
    .getByLabel('Import save file')
    .setInputFiles({ name: 'succession.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ data, checksum: hashString(data) })) });
}
function errors(page: Page) {
  const out: string[] = [];
  page.on('pageerror', (e) => out.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') out.push(e.text());
  });
  return out;
}
async function notices(page: Page) {
  for (let i = 0; i < 12 && (await page.getByRole('dialog').count()); i++) {
    const dialog = page.getByRole('dialog').last();
    const cont = dialog.getByRole('button', { name: 'Continue', exact: true });
    if (!(await cont.count())) break;
    await cont.click();
  }
}
async function shot(page: Page, info: TestInfo, name: string) {
  await page.mouse.move(0, 0);
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(name + '.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
}
const section = (page: Page, name: string) => page.locator('section').filter({ has: page.getByRole('heading', { name }) });

test('a coronation vow is chosen through Life and survives a reload', async ({ page }, info) => {
  const failures = errors(page),
    { s, heir } = disputedInheritance();
  s.successionCrises = [];
  heir.traits = ['diligent', 'patient'];
  await load(page, s);
  const vows = section(page, 'What will they remember?');
  await vows
    .locator('.card')
    .filter({ has: page.getByText('Leave a better realm', { exact: true }) })
    .getByRole('button', { name: 'Choose this ambition' })
    .click();
  await expect(vows).toContainText('Coronation vow');
  await expect(vows).toContainText('0 / 8');
  await expect(vows.getByRole('button', { name: 'Choose this ambition' })).toHaveCount(0);
  await vows.scrollIntoViewIfNeeded();
  await shot(page, info, 'coronation-vow');
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  await expect(section(page, 'What will they remember?')).toContainText('Leave a better realm');
  expect(failures).toEqual([]);
});

test('the last real donation fulfils a vow immediately and its reward persists', async ({ page }, info) => {
  const failures = errors(page),
    { s, heir } = disputedInheritance();
  s.successionCrises = [];
  heir.traits = ['generous', 'kind'];
  s.credits = 1000;
  chooseAmbition(s, 'patron');
  doActivity(s, 'donate');
  s.year++;
  doActivity(s, 'donate');
  s.year++;
  s.pending = [];
  await load(page, s);
  await expect(section(page, 'What will they remember?')).toContainText('200 / 300');
  await page.getByRole('tab', { name: 'Actions', exact: true }).click();
  await page
    .locator('.card')
    .filter({ has: page.getByText('Donate to the Temple', { exact: true }) })
    .getByRole('button', { name: 'Go', exact: true })
    .click();
  await expect(page.getByRole('dialog').last()).toContainText('A promise kept');
  await expect(page.getByRole('dialog').last()).toContainText('+100 prestige');
  await notices(page);
  await page.getByRole('tab', { name: 'Life', exact: true }).click();
  await expect(section(page, 'What will they remember?')).toContainText('Promise kept');
  await shot(page, info, 'promise-kept');
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  await expect(section(page, 'What will they remember?')).toContainText('Promise kept');
  expect(failures).toEqual([]);
});

test('a contested crown can be settled through Life without triggering a war', async ({ page }, info) => {
  const failures = errors(page),
    { s } = disputedInheritance();
  s.credits = 1000;
  await load(page, s);
  const dispute = section(page, 'A disputed inheritance');
  await expect(dispute).toContainText('Vesper');
  await expect(dispute).toContainText('Backing the claim');
  await dispute.scrollIntoViewIfNeeded();
  await shot(page, info, 'contested-crown');
  await dispute.getByRole('button', { name: /^Settle the claim/ }).click();
  await expect(page.getByRole('dialog').last()).toContainText('renounces the claim');
  await notices(page);
  await expect(section(page, 'A disputed inheritance')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Age up one cycle' })).toBeEnabled();
  expect(failures).toEqual([]);
});

test('conceding preserves the dynasty and shows the deposed ruler and unfinished vow', async ({ page }, info) => {
  const failures = errors(page),
    { s, heir } = disputedInheritance();
  heir.traits = ['diligent', 'patient'];
  chooseAmbition(s, ambitionChoices(s)[0]);
  await load(page, s);
  const concede = section(page, 'A disputed inheritance').getByRole('button', { name: 'Concede the crown' });
  await concede.click();
  await page.getByRole('button', { name: 'Tap again: play as Vesper' }).click();
  await expect(page.getByRole('dialog').last()).toContainText('A Rival Takes the Crown');
  await expect(page.getByRole('dialog').last()).toContainText('Deposed, aged 28');
  await expect(page.getByRole('dialog').last()).toContainText('Unfulfilled');
  await shot(page, info, 'deposed-ruler');
  await notices(page);
  await expect(page.locator('.hero')).toContainText('Vesper');
  await expect(section(page, 'What will they remember?').getByRole('button', { name: 'Choose this ambition' })).toHaveCount(3);
  expect(failures).toEqual([]);
});

test('civil war uses real fleets, prevents a second battle and continues after saving', async ({ page }, info) => {
  const failures = errors(page),
    { s, crisis } = disputedInheritance();
  s.year = crisis.deadline;
  successionTick(s);
  s.pending = [];
  await load(page, s);
  const war = section(page, 'A family at war');
  await expect(war).toContainText('210 loyal ships');
  await expect(war).toContainText('125 rebel ships');
  await war.scrollIntoViewIfNeeded();
  await shot(page, info, 'civil-war');
  await war.getByRole('button', { name: 'Fight for the crown' }).click();
  await expect(war).toContainText('35 / 70');
  await expect(war.getByRole('button', { name: 'Fight for the crown' })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  await expect(section(page, 'A family at war')).toContainText('35 / 70');
  await page.getByRole('button', { name: 'Age up one cycle' }).click();
  // The automatic battle queues its result before normal random events.
  await expect(page.getByRole('dialog').last()).toContainText('inheritance is secured');
  await expect(page.getByRole('dialog').last()).toContainText('imprisoned');
  expect(failures).toEqual([]);
});

test('a real personal hook withdraws a claim and is spent', async ({ page }) => {
  const failures = errors(page),
    { s, heir, claimant } = disputedInheritance();
  const victim = createCharacter(s, { clanId: s.playerClanId, planetId: 'mars', born: s.year - 22 });
  learnSecret(s, recordMurder(s, claimant, victim).id, heir.id);
  await load(page, s);
  await section(page, 'A disputed inheritance').getByRole('button', { name: 'Use a personal hook' }).click();
  await expect(page.getByRole('dialog').last()).toContainText('The hook is spent');
  await notices(page);
  await expect(section(page, 'A disputed inheritance')).toHaveCount(0);
  expect(failures).toEqual([]);
});

test('the matchmaker warns about actual cousin ancestry before a marriage', async ({ page }, info) => {
  const failures = errors(page),
    { s, old } = disputedInheritance();
  s.successionCrises = [];
  const grandfather = createCharacter(s, { clanId: s.playerClanId, planetId: 'mars', born: s.year - 120 });
  const grandmother = createCharacter(s, { clanId: s.playerClanId, planetId: 'mars', born: s.year - 115 });
  old.fatherId = grandfather.id;
  old.motherId = grandmother.id;
  for (const house of Object.values(s.clans))
    if (house.id !== s.playerClanId && s.characters[house.headId]) {
      const head = s.characters[house.headId];
      head.born = s.year - 80;
      head.fatherId = grandfather.id;
      head.motherId = grandmother.id;
    }
  // Find a seed with a genuine highborn offer, then let the UI generate that offer.
  for (let seed = 1; seed < 100; seed++) {
    const probe = structuredClone(s);
    probe.seed = seed;
    generateSuitors(probe, s.rulerId);
    if (probe.suitors?.list.some((x) => x.highborn)) {
      s.seed = seed;
      break;
    }
  }
  await load(page, s);
  await page.getByRole('tab', { name: 'Family', exact: true }).click();
  await page.getByRole('button', { name: 'Find a spouse', exact: true }).click();
  await expect(page.getByRole('dialog').last()).toContainText('Close family: first cousins');
  await expect(page.getByRole('dialog').last()).toContainText('6.25%');
  await shot(page, info, 'cousin-warning');
  expect(ruler(s).motherId).toBe(old.id);
  expect(failures).toEqual([]);
});
