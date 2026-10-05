import { expect, test, type Page } from '@playwright/test';
import { beginAffair, captiveRansom, exposeAffair } from '../src/game/aiCourt';
import { createCharacter } from '../src/game/character';
import { ruler } from '../src/game/core';
import { hashString } from '../src/game/rng';
import type { Clan, GameState } from '../src/game/types';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../src/game/world';

function fixture() {
  const s = createWorld(71),
    house = scenarioHouses(s, 'mars', 'monarch')[0];
  startGame(s, { clanId: house.id, ruler: rollRuler(71, 'mars', 'M', 'Tav'), focus: 'dip', age: 40, family: 'kids' });
  const [a, b, c] = Object.values(s.clans).filter((k) => !k.isPlayer && k.planetId === 'mars');
  a.name = 'The Keepers of the Long Crimson Horizon';
  b.name = 'The Knights of the Outer Martian Marches';
  const head = s.characters[a.headId];
  head.name = 'Varric';
  head.gender = 'M';
  const person = (k: Clan, name: string, gender: 'M' | 'F') =>
    createCharacter(s, { clanId: k.id, planetId: k.planetId, faithId: k.faithId, name, gender, born: s.year - 25 });
  const spouse = person(a, 'Livia', 'F'),
    lover = person(b, 'Selene', 'F');
  head.spouseId = spouse.id;
  spouse.spouseId = head.id;
  beginAffair(s, head, lover);
  for (const k of [b, c]) {
    const son = person(a, 'Ansel-' + k.id, 'M'),
      daughter = person(k, 'Mira-' + k.id, 'F');
    son.fatherId = head.id;
    head.childrenIds.push(son.id);
    daughter.fatherId = k.headId;
    s.characters[k.headId].childrenIds.push(daughter.id);
    son.spouseId = daughter.id;
    daughter.spouseId = son.id;
    daughter.marriedIn = true;
  }
  const captive = s.characters[ruler(s).childrenIds[0]];
  captive.name = 'Tala';
  captive.born = s.year - 20;
  captive.prisonerOf = a.id;
  for (let i = 0; i < 41; i++) person(s.clans[s.playerClanId], 'Kin ' + i, 'M');
  const distant = person(s.clans[s.playerClanId], 'The Last Warden', 'M');
  distant.prisonerOf = a.id;
  s.pending = [];
  return { s, a, b, head, lover, captive, distant };
}
async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  const data = JSON.stringify(s);
  await page
    .getByLabel('Import save file')
    .setInputFiles({ name: 'court.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ data, checksum: hashString(data) })) });
}
function errors(page: Page) {
  const out: string[] = [];
  page.on('pageerror', (e) => out.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') out.push(e.text());
  });
  return out;
}
test('captive relatives remain visible beyond the kin limit, and marriage ties open their houses on phones', async ({ page }, info) => {
  const failures = errors(page),
    { s, a, b, captive } = fixture();
  await load(page, s);
  await page.getByRole('tab', { name: 'Family', exact: true }).click();
  const captives = page.locator('.section').filter({ has: page.getByRole('heading', { name: /^Captive relatives/ }) });
  await expect(captives).toContainText('Captive relatives (2)');
  await expect(captives).toContainText('The Last Warden');
  await expect(captives).toContainText('Held by House ' + a.name);
  await expect(captives).toContainText('Ransom price: ' + captiveRansom(s, captive) + ' credits');
  await captives.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('captive-family.png'), animations: 'disabled' });
  await captives
    .locator('.char')
    .filter({ has: page.locator('.nm', { hasText: 'Tala' }) })
    .click();
  let dialog = page.getByRole('dialog').last();
  await expect(dialog).toContainText('Held by House ' + a.name);
  await dialog.getByRole('button', { name: 'View captor', exact: true }).click();
  dialog = page.getByRole('dialog').last();
  const pacts = dialog.locator('.section').filter({ has: page.getByRole('heading', { name: /^Marriage ties/ }) });
  await expect(pacts).toContainText('Marriage ties (2)');
  await pacts.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('marriage-ties.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await pacts.getByRole('button', { name: 'Bound by marriage to House ' + b.name, exact: true }).click();
  await expect(
    page
      .getByRole('dialog')
      .last()
      .getByRole('heading', { name: 'House ' + b.name, exact: true }),
  ).toBeVisible();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page
      .getByRole('dialog')
      .last()
      .getByRole('heading', { name: 'House ' + a.name, exact: true }),
  ).toBeVisible();
  // Opening profiles and houses must not move money or advance time.
  expect(failures).toEqual([]);
});
for (const exposed of [false, true])
  test(
    exposed ? 'an exposed AI affair survives reloading and the lover link works' : 'a secret AI affair is not presented as discovered',
    async ({ page }, info) => {
      const failures = errors(page),
        { s, head, lover, a, captive } = fixture();
      if (exposed) exposeAffair(s, head, lover);
      await load(page, s);
      await page.getByRole('tab', { name: 'Family', exact: true }).click();
      await page
        .locator('.section')
        .filter({ has: page.getByRole('heading', { name: /^Captive relatives/ }) })
        .locator('.char')
        .filter({ has: page.locator('.nm', { hasText: captive.name }) })
        .click();
      await page.getByRole('dialog').last().getByRole('button', { name: 'View captor', exact: true }).click();
      await page
        .getByRole('dialog')
        .last()
        .locator('.char')
        .filter({ has: page.locator('.nm', { hasText: head.name }) })
        .first()
        .locator('.nm')
        .click();
      const dialog = page.getByRole('dialog').last(),
        link = dialog.getByRole('button', { name: lover.name, exact: true });
      if (exposed) await expect(dialog).toContainText('Exposed affair');
      else {
        await expect(dialog).not.toContainText('Selene');
        await expect(link).toHaveCount(0);
      }
      if (exposed) await link.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await page.screenshot({ path: info.outputPath(exposed ? 'exposed-affair.png' : 'secret-affair.png'), animations: 'disabled' });
      if (exposed) {
        await link.click();
        await expect(
          page
            .getByRole('dialog')
            .last()
            .getByRole('heading', { name: lover.name + ' ' + s.clans[lover.clanId].name, exact: true }),
        ).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await expect.poll(async () => page.evaluate(() => localStorage.getItem('solar-dynasty:auto'))).not.toBeNull();
      await page.reload();
      await page.getByRole('button', { name: /^Continue:/ }).click();
      await page.getByRole('tab', { name: 'Family', exact: true }).click();
      await page
        .locator('.section')
        .filter({ has: page.getByRole('heading', { name: /^Captive relatives/ }) })
        .locator('.char')
        .filter({ has: page.locator('.nm', { hasText: captive.name }) })
        .click();
      await page.getByRole('dialog').last().getByRole('button', { name: 'View captor', exact: true }).click();
      await expect(
        page
          .getByRole('dialog')
          .last()
          .getByRole('heading', { name: 'House ' + a.name, exact: true }),
      ).toBeVisible();
      await page
        .getByRole('dialog')
        .last()
        .locator('.char')
        .filter({ has: page.locator('.nm', { hasText: head.name }) })
        .first()
        .locator('.nm')
        .click();
      if (exposed) await expect(page.getByRole('dialog').last()).toContainText('Exposed affair');
      else await expect(page.getByRole('dialog').last()).not.toContainText('Selene');
      expect(failures).toEqual([]);
    },
  );

test('rival bloodline programmes show vault rules and research without overflowing a phone', async ({ page }, info) => {
  const failures = errors(page),
    { s, a } = fixture();
  a.genetics = {
    locked: ['genius', 'ironblood'],
    purged: ['sickly'],
    slots: 4,
    faith: 22,
    forge: { level: 2, researched: ['genius', 'radiant'], project: { trait: 'ageless', progress: 18.6, needed: 34 } },
  };
  await load(page, s);
  await page.getByRole('tab', { name: 'Family', exact: true }).click();
  await page
    .locator('.char')
    .filter({ has: page.locator('.nm', { hasText: 'Tala' }) })
    .first()
    .click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'View captor', exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  await dialog.locator('summary').filter({ hasText: 'Bloodline programme' }).click();
  const programme = dialog.locator('details').filter({ has: page.locator('summary', { hasText: 'Bloodline programme' }) });
  await expect(programme).toContainText('Vault: 3/4 slots');
  await expect(programme).toContainText('Gene-Forge and vats');
  await expect(programme).toContainText('Sequencing Ageless: 19/34 research points');
  await expect(programme).toContainText('Upkeep: 40 credits per cycle');
  await expect(programme).toContainText('Locked genes');
  await expect(programme).toContainText('Purged genes');
  await expect(programme).toContainText('Sequenced genes');
  await programme.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('rival-bloodline.png'), animations: 'disabled' });
  expect(failures).toEqual([]);
});
