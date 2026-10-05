import { expect, test, type Page } from '@playwright/test';
import { beginAffair } from '../src/game/aiCourt';
import { createCharacter } from '../src/game/character';
import { hashString } from '../src/game/rng';
import { addFeeling, murdered } from '../src/game/relations';
import type { Clan, GameState } from '../src/game/types';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../src/game/world';

/** A Mars lord you have wronged, who is suspected of a killing, owes you a favour and hides an affair. */
function fixture() {
  const s = createWorld(83);
  const home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(83, 'mars', 'F', 'Asha'), focus: 'dip', age: 40, family: 'married' });
  const [a, b] = Object.values(s.clans).filter((k) => !k.isPlayer && k.planetId === 'mars');
  a.name = 'Halvorsen';
  const lord = s.characters[a.headId];
  lord.name = 'Varric';
  lord.gender = 'M';
  lord.prisonerOf = undefined;
  const person = (k: Clan, name: string, gender: 'M' | 'F') =>
    createCharacter(s, { clanId: k.id, planetId: k.planetId, faithId: k.faithId, name, gender, born: s.year - 30 });
  addFeeling(s, lord.id, s.rulerId, { why: 'Murdered my wife', value: -90, decay: 0, grave: true });
  addFeeling(s, lord.id, s.rulerId, { why: 'Paid my debt to the Guild', value: 25, decay: 1, key: 'petition' });
  const victim = person(b, 'Corwen', 'M');
  const widow = person(b, 'Ysolde', 'F');
  victim.spouseId = widow.id;
  widow.spouseId = victim.id;
  murdered(s, victim, lord.id, false);
  const mistress = person(b, 'Selwyn Secret', 'F');
  beginAffair(s, lord, mistress);
  s.pending = [];
  return { s, a, lord, mistress };
}

async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  const data = JSON.stringify(s);
  await page
    .getByLabel('Import save file')
    .setInputFiles({ name: 'dossier.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ data, checksum: hashString(data) })) });
}

test('a dossier shows facts, rumours and leverage, and keeps an undiscovered affair secret', async ({ page }, info) => {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') failures.push(e.text());
  });
  const { s, a, lord, mistress } = fixture();
  await load(page, s);
  await page.getByRole('tab', { name: 'System', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${lord.name} House ${a.name}`) }).click();
  // The row opens the house; the lord's profile is one tap further.
  const houseDialog = page.getByRole('dialog').last();
  await expect(houseDialog.getByRole('heading', { name: 'House ' + a.name, exact: true })).toBeVisible();
  await houseDialog
    .locator('.char')
    .filter({ has: page.locator('.nm', { hasText: lord.name }) })
    .first()
    .locator('.nm')
    .click();
  const dialog = page.getByRole('dialog').last();
  const dossier = dialog.locator('.section').filter({ has: page.getByRole('heading', { name: /^Dossier/ }) });
  await expect(dossier).toContainText('Will not forgive you: murdered my wife');
  await expect(dossier).toContainText('Rumoured to be behind the death of Corwen');
  await expect(dossier).toContainText('Ysolde suspects it');
  await expect(dossier).toContainText('Owes you: paid my debt to the guild');
  await expect(dossier).not.toContainText(mistress.name);
  await dossier.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('dossier.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await dossier.getByRole('button', { name: "Open Corwen's profile", exact: true }).click();
  await expect(page.getByRole('dialog').last()).toContainText('Corwen');
  expect(failures).toEqual([]);
});
