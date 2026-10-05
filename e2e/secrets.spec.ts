import { expect, test, type Page } from '@playwright/test';
import { createCharacter } from '../src/game/character';
import { ruler } from '../src/game/core';
import { hashString } from '../src/game/rng';
import { recordMurder } from '../src/game/secrets';
import { inflateString } from '../src/game/codec';
import type { GameState } from '../src/game/types';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../src/game/world';

function fixture() {
  const s = createWorld(71),
    clan = scenarioHouses(s, 'mars', 'monarch')[0];
  startGame(s, { clanId: clan.id, ruler: rollRuler(71, 'mars', 'M', 'Tav'), focus: 'int', age: 40, family: 'kids' });
  const r = ruler(s),
    house = Object.values(s.clans).find((k) => !k.isPlayer && k.planetId === 'mars')!;
  const head = s.characters[house.headId];
  head.name = 'Varric';
  head.born = s.year - 45;
  head.base.int = 0;
  head.traits = [];
  head.childrenIds = [];
  const person = (clanId: string, name: string, gender: 'M' | 'F', age: number) =>
    createCharacter(s, { clanId, name, gender, born: s.year - age, planetId: 'mars' });
  const elder = person(house.id, 'The Elder', 'F', 30),
    partner = person(house.id, 'Selene', 'F', 20);
  for (const kid of [elder, partner]) {
    if (head.gender === 'M') kid.fatherId = head.id;
    else kid.motherId = head.id;
    head.childrenIds.push(kid.id);
  }
  const own = person(r.clanId, 'Our Son', 'M', 20);
  own.fatherId = r.id;
  r.childrenIds.push(own.id);
  const victim = person(house.id, 'The Lost Steward', 'M', 40);
  victim.died = s.year;
  recordMurder(s, head, victim);
  const captive = s.characters[r.childrenIds[0]];
  captive.name = 'The Captive';
  captive.born = s.year - 20;
  captive.prisonerOf = house.id;
  s.credits = 2000;
  s.seed = 1;
  s.pending = [];
  return { s, head, own, partner, captive };
}
async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  const data = JSON.stringify(s);
  await page
    .getByLabel('Import save file')
    .setInputFiles({ name: 'secrets.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ data, checksum: hashString(data) })) });
}
async function profile(page: Page, captiveName: string, headName: string) {
  await page.getByRole('tab', { name: 'Family', exact: true }).click();
  await page
    .locator('.section')
    .filter({ has: page.getByRole('heading', { name: /^Captive relatives/ }) })
    .locator('.char')
    .filter({ has: page.locator('.nm', { hasText: captiveName }) })
    .click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'View captor', exact: true }).click();
  await page
    .getByRole('dialog')
    .last()
    .locator('.char')
    .filter({ has: page.locator('.nm', { hasText: headName }) })
    .first()
    .locator('.nm')
    .click();
  return page.getByRole('dialog').last();
}

test('finds real murder proof, spends one marriage favour and preserves the result after reloading', async ({ page }, info) => {
  const { s, head, own, partner, captive } = fixture(),
    failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  await load(page, s);
  let dialog = await profile(page, captive.name, head.name);
  const section = dialog.locator('.section').filter({ has: page.getByRole('heading', { name: /^Secrets & hooks/ }) });
  await expect(section).not.toContainText('The Lost Steward');
  await section.getByRole('button', { name: 'Investigate (40 credits)' }).click();
  const notice = page.getByRole('dialog').last();
  await expect(notice).toContainText('Evidence Uncovered');
  await notice.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(section).toContainText('The Lost Steward');
  await expect(section.getByRole('button', { name: 'Investigate (40 credits)' })).toBeDisabled();
  await section.getByText('Trade silence for a marriage', { exact: true }).click();
  await section.getByLabel('Your family member', { exact: true }).selectOption(own.id);
  await section.getByLabel('Their child', { exact: true }).selectOption(partner.id);
  await section.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('secrets-marriage.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await section.getByRole('button', { name: 'Spend hook on marriage' }).click();
  await section.getByRole('button', { name: 'Spend this hook on the marriage?' }).click();
  await expect(page.getByRole('dialog').last()).toContainText('A Marriage Bought with Silence');
  await page.getByRole('dialog').last().getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(section).toContainText('Your hook is spent.');
  await expect(section.getByRole('button', { name: 'Spend hook on marriage' })).toHaveCount(0);
  let saved: GameState | undefined;
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem('solar-dynasty:auto'));
      if (raw) {
        const envelope = JSON.parse(raw);
        saved = JSON.parse(inflateString(envelope.data)!) as GameState;
      }
      return saved?.characters[own.id].spouseId;
    })
    .toBe(partner.id);
  expect(saved!.characters[partner.id].spouseId).toBe(own.id);
  expect(saved!.characters[partner.id].marriedIn).toBe(true);
  expect(saved!.hooks.some((x) => x.holderId === s.rulerId && x.usedYear === s.year)).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  dialog = await profile(page, captive.name, head.name);
  await expect(dialog).toContainText('Your hook is spent.');
  expect(failures).toEqual([]);
});

test('exposes proof once and removes all marriage leverage', async ({ page }) => {
  const { s, head, captive } = fixture();
  // Discovery is staged as an actual player investigation in the first test; here test publication.
  const secret = s.secrets[0];
  secret.knownTo.push(s.rulerId);
  s.hooks.push({ id: 'hook-publication', secretId: secret.id, holderId: s.rulerId, targetId: head.id, year: s.year });
  await load(page, s);
  const dialog = await profile(page, captive.name, head.name);
  const section = dialog.locator('.section').filter({ has: page.getByRole('heading', { name: /^Secrets & hooks/ }) });
  await section.getByRole('button', { name: 'Expose evidence' }).click();
  await section.getByRole('button', { name: 'Publish this evidence? All hooks on it will be lost.' }).click();
  await expect(section).toContainText('Public evidence');
  await expect(section.getByText('Trade silence for a marriage', { exact: true })).toHaveCount(0);
  await expect(section.getByRole('button', { name: 'Expose evidence' })).toHaveCount(0);
});
