import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { inflateString } from '../src/game/codec';
import { declareWar } from '../src/game/war';
import { declareHouseWar } from '../src/game/ai';
import { ch, clanRegions, SAVE_VERSION } from '../src/game/core';
import { EVENT_BY_ID, queueEvent } from '../src/game/events';
import { hashString } from '../src/game/rng';
import type { Clan, GameState } from '../src/game/types';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../src/game/world';

const PERSONAL = ['brave', 'craven', 'wrathful', 'honest', 'deceitful'];

/** You govern on Mars, sworn to its sovereign; every landed AI ruler is a free adult with 100 ships. */
function world(): GameState {
  const s = createWorld(61);
  const home = scenarioHouses(s, 'mars', 'governor')[0];
  startGame(s, { clanId: home.id, ruler: rollRuler(61, 'mars', 'F', 'Asha'), focus: 'cmd', age: 40, family: 'married' });
  Object.assign(s, { credits: 5000, prestige: 1000, fleet: 120, pending: [] });
  for (const k of Object.values(s.clans)) {
    if (k.isPlayer) continue;
    const head = ch(s, k.headId);
    if (head) {
      head.born = Math.min(head.born, s.year - 35);
      head.prisonerOf = undefined;
      head.traits = head.traits.filter((t) => !PERSONAL.includes(t));
    }
    k.fleet = 100;
    k.prestige = 1000; // Both sides must fund the existing conquest price.
    k.allied = false;
  }
  return s;
}
function vassal(s: GameState, planet: string): Clan {
  return Object.values(s.clans).find(
    (k) => !k.isPlayer && k.planetId === planet && clanRegions(s, k.id).length && !clanRegions(s, k.id).some((r) => r.capital),
  )!;
}

async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  const data = JSON.stringify(s);
  await page
    .getByLabel('Import save file')
    .setInputFiles({ name: 'realms.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ data, checksum: hashString(data) })) });
}
function watch(page: Page): string[] {
  const out: string[] = [];
  page.on('pageerror', (e) => out.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') out.push(e.text());
  });
  return out;
}
async function healthy(page: Page, failures: string[]) {
  await expect(page.locator('.crash')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'page scrolls sideways').toBeLessThanOrEqual(0);
  expect(failures).toEqual([]);
}
async function shot(page: Page, info: TestInfo, name: string) {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath(name + '.png'), animations: 'disabled' });
}

test('see who will defend a Neptunian house, declare, and find the realm’s real defenders on the war card', async ({ page }, info) => {
  const failures = watch(page);
  const s = world();
  const target = vassal(s, 'neptune');
  const sovereign = s.clans[Object.values(s.regions).find((r) => r.capital && r.planetId === 'neptune')!.owner];
  await load(page, s);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('tab', { name: /^System/ })
    .click();
  await page.getByRole('tablist', { name: 'System views' }).getByRole('tab', { name: 'Houses', exact: true }).click();
  await page.getByRole('button', { name: 'View House ' + target.name, exact: true }).click();
  const region = clanRegions(s, target.id)[0];
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: (region.capital ? '♛ ' : '') + region.name, exact: true })
    .click();
  const forecast = page.getByLabel('Who will defend House ' + target.name);
  await expect(forecast).toContainText('House ' + sovereign.name);
  await expect(forecast).toContainText('Will come with 50');
  await expect(forecast).toContainText('Sworn to House ' + sovereign.name);
  await forecast.scrollIntoViewIfNeeded();
  await shot(page, info, 'realm-forecast');
  await healthy(page, failures);

  const war = page.locator('.spread').filter({ hasText: 'Naked Conquest' }).getByRole('button', { name: 'War', exact: true });
  await war.click();
  await page.getByRole('button', { name: 'Tap again: war!', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('tab', { name: /^Realm/ })
    .click();
  const defenders = page.getByLabel('War participants');
  await expect(defenders).toContainText('Defenders');
  await expect(defenders).toContainText('Who stands with House ' + target.name);
  const sov = defenders.getByLabel('Realm answer from House ' + sovereign.name);
  await expect(sov).toContainText('Answered');
  await expect(sov).toContainText('50 of 50 ships remain');
  await sov.getByText('Why this answer?').click();
  await expect(sov).toContainText('Sovereign of the realm');
  await sov.scrollIntoViewIfNeeded();
  await shot(page, info, 'realm-defenders');
  await healthy(page, failures);
});

test('your realm calls you, and the ships you send show as a realm duty', async ({ page }, info) => {
  const failures = watch(page);
  const s = world();
  const defender = vassal(s, 'mars');
  const invader = vassal(s, 'venus');
  invader.liege = 'none';
  if (!declareHouseWar(s, invader.id, clanRegions(s, defender.id)[0].id)) throw new Error('Cannot declare the fixture war');
  s.pending = [];
  if (!queueEvent(s, EVENT_BY_ID.realm_call)) throw new Error('No realm call');
  await load(page, s);
  const call = page.locator('.overlay').last();
  await expect(call).toContainText('The Realm Calls');
  await expect(call).toContainText('House ' + invader.name);
  await shot(page, info, 'realm-call');
  await call.getByRole('button', { name: /^Send half the fleet/ }).click();
  await call.getByRole('button', { name: /^Continue/ }).click();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('tab', { name: /^Realm/ })
    .click();
  const duties = page.locator('.section').filter({ has: page.getByRole('heading', { name: /^Realm duties/ }) });
  await expect(duties).toContainText('60 of 60 ships');
  await duties.scrollIntoViewIfNeeded();
  await shot(page, info, 'realm-duties');
  await healthy(page, failures);
});

async function stored(page: Page): Promise<GameState> {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('solar-dynasty:auto'))).not.toBeNull();
  const raw = await page.evaluate(() => localStorage.getItem('solar-dynasty:auto'));
  expect(raw).toBeTruthy();
  const envelope = JSON.parse(raw!);
  expect(envelope.z).toBe('df');
  const data = inflateString(envelope.data);
  expect(hashString(data)).toBe(envelope.checksum);
  return JSON.parse(data);
}
test('realm casualties retain their own identity and profiles through a battle and reload', async ({ page }, info) => {
  const errors = watch(page),
    s = world(),
    d = vassal(s, 'neptune');
  expect(declareWar(s, clanRegions(s, d.id)[0].id, 'conquest')).toBe(true);
  s.pending = [];
  await load(page, s);
  await page.getByRole('tab', { name: /^Realm/ }).click();
  await page.getByRole('button', { name: 'Launch battle', exact: true }).click();
  const report = page.getByRole('dialog', { name: /Victory in Battle|Defeat in Battle/ });
  const losses = report.getByLabel('Realm casualties');
  await expect(losses).toContainText('Realm defenders');
  await expect(report).toContainText('own-house ships');
  await expect.poll(async () => (await stored(page)).pending.some((p) => p.kind === 'battle')).toBe(true);
  const text = await losses.innerText(),
    saved = await stored(page);
  const battle = saved.pending.find((p) => p.kind === 'battle')!;
  if (battle.kind !== 'battle') throw new Error('No saved battle');
  expect(battle.report.realmLosses?.map((p) => p.clanId).sort()).toEqual(s.wars[0].realmAid!.map((p) => p.clanId).sort());
  expect(battle.report.coalitionLosses).toEqual([]);
  const lost = battle.report.realmLosses!.reduce((n, p) => n + p.losses, 0);
  expect(saved.wars[0].realmAid!.reduce((n, p) => n + p.lost!, 0)).toBe(lost);
  await shot(page, info, 'realm-battle');
  await losses.getByRole('button').first().click();
  await expect(report).toHaveCount(0);
  await page.getByRole('dialog').last().getByRole('button', { name: 'Close', exact: true }).click();
  await expect(losses).toHaveText(text, { useInnerText: true });
  await page.reload();
  await page.getByRole('button', { name: /^Continue:/ }).click();
  await expect(losses).toHaveText(text, { useInnerText: true });
  await healthy(page, errors);
});
test('a stale realm letter can be cleared without ships, grudges or a new answer', async ({ page }, info) => {
  const errors = watch(page),
    s = world(),
    d = vassal(s, 'mars'),
    a = vassal(s, 'venus');
  expect(declareHouseWar(s, a.id, clanRegions(s, d.id)[0].id)).toBe(true);
  s.pending = [];
  expect(queueEvent(s, EVENT_BY_ID.realm_call)).toBe(true);
  s.clans[s.playerClanId].liege = 'none';
  const seed = s.seed,
    relations = structuredClone(s.relations);
  await load(page, s);
  const call = page.locator('.overlay').last();
  await expect(call).toContainText('This call has passed');
  await expect(call.getByRole('button', { name: /^Send half the fleet/ })).toBeDisabled();
  await call.getByRole('button', { name: /^Stay home/ }).click();
  await expect(call).toContainText('No refusal or grievance is recorded');
  await shot(page, info, 'realm-stale-letter');
  await call.getByRole('button', { name: /^Continue/ }).click();
  await expect.poll(async () => (await stored(page)).pending.length).toBe(0);
  const saved = await stored(page);
  expect(saved.version).toBe(SAVE_VERSION);
  expect(saved.fleet).toBe(120);
  expect(saved.seed).toBe(seed);
  expect(saved.relations).toEqual(relations);
  expect(saved.aiWars[0].realmAid!.some((p) => p.clanId === s.playerClanId)).toBe(false);
  await healthy(page, errors);
});
