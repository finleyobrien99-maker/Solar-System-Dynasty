// Cadet branches: grant a kinsman a region and they found an offshoot house
// of your bloodline. Cadets are sworn to you, share your Gene Vault, send
// ships to your wars, and if your main line ever dies out, the strongest
// cadet branch takes up the crown instead of the dynasty ending.

import { ageOf, alive, childrenOf, clanRegions, log, newId, notice, playerClan, setOwner } from './core';
import { canAfford, costText, pay, type Cost } from './genetics';
import { currentHeir } from './life';
import { remember } from './memory';
import { granted } from './relations';
import type { Character, Clan, GameState } from './types';
import { fleetTarget } from './world';

export const CADET_COST: Cost = { credits: 250, prestige: 100 };

export function defaultCadetName(s: GameState, regionId: string): string {
  const main = playerClan(s);
  const word = s.regions[regionId]?.name.split(' ')[0] ?? 'Minor';
  return `${main.name}-${word}`;
}

export function cadetBlocker(s: GameState, charId: string, regionId: string): string | null {
  const c = s.characters[charId];
  const reg = s.regions[regionId];
  if (!alive(c) || c.clanId !== s.playerClanId) return 'Only living members of your main house can found a branch.';
  if (c.id === s.rulerId) return 'The ruler leads the main house.';
  if (currentHeir(s)?.id === c.id) return 'Your heir is needed in the main house.';
  if (ageOf(s, c) < 18) return 'Must be at least 18.';
  if (c.bastard) return 'Legitimise them first.';
  if (c.prisonerOf) return 'They are in prison.';
  if (c.marriedIn) return 'They married into another house.';
  if (!reg || reg.owner !== s.playerClanId) return 'Pick one of your own regions.';
  if (reg.capital) return 'You cannot give away a throne-region.';
  if (clanRegions(s, s.playerClanId).length < 2) return 'You need to keep at least one region.';
  if (!canAfford(s, CADET_COST)) return `Need ${costText(CADET_COST)}.`;
  return null;
}

function descendantsInHouse(s: GameState, c: Character, clanId: string, out: Character[] = []): Character[] {
  for (const k of childrenOf(s, c)) {
    if (k.clanId !== clanId) continue;
    out.push(k);
    descendantsInHouse(s, k, clanId, out);
  }
  return out;
}

export function foundCadet(s: GameState, charId: string, regionId: string, name?: string): string | undefined {
  if (cadetBlocker(s, charId, regionId)) return undefined;
  pay(s, CADET_COST);
  const main = playerClan(s);
  const founder = s.characters[charId];
  const reg = s.regions[regionId];
  const id = newId(s, 'cadet');
  const cadet: Clan = {
    id,
    name: name?.trim() || defaultCadetName(s, regionId),
    planetId: reg.planetId,
    faithId: main.faithId,
    headId: founder.id,
    // A cadet's arms echo the main house's with the colours swapped.
    sigil: { ...main.sigil, c1: main.sigil.c2, c2: main.sigil.c1, division: (main.sigil.division + 1) % 7 },
    color: main.sigil.c2,
    credits: 120,
    fleet: 0,
    prestige: 60,
    opinion: 70,
    allied: true,
    liege: main.id,
    titles: {},
    founded: s.year,
    cadetOf: main.id,
    memories: [],
  };
  s.clans[id] = cadet;
  const moving = [founder, ...descendantsInHouse(s, founder, main.id)];
  for (const m of moving) m.clanId = id;
  if (moving.some((m) => m.id === s.dynasty.designatedHeir)) s.dynasty.designatedHeir = undefined;
  setOwner(s, reg, id);
  cadet.fleet = Math.round(fleetTarget(s, id) * 0.5);
  remember(s, id, `Granted us ${reg.name} to found our house`, 35, 0.02);
  granted(s, founder);
  log(s, `${founder.name} founds House ${cadet.name}, a cadet branch, holding ${reg.name}.`, 'good');
  notice(
    s,
    'A Cadet Branch is Founded',
    `${founder.name} now rules ${reg.name} as head of House ${cadet.name}. They are sworn to you, share your bloodline's locked genes, and will fight beside you. Should your main line ever fail, a cadet branch can take up the crown.`,
    { icon: 'family', tone: 'good', portraitId: founder.id },
  );
  return id;
}

/**
 * The main line has died out. The strongest cadet branch rejoins the main
 * house and its head inherits everything. Returns the new ruler, if any.
 */
export function cadetRescue(s: GameState): Character | undefined {
  const main = playerClan(s);
  const options = Object.values(s.clans)
    .filter((k) => k.cadetOf === main.id && alive(s.characters[k.headId]))
    .sort((a, b) => clanRegions(s, b.id).length - clanRegions(s, a.id).length || b.fleet - a.fleet);
  const cadet = options[0];
  if (!cadet) return undefined;
  const head = s.characters[cadet.headId];
  for (const c of Object.values(s.characters)) if (c.clanId === cadet.id) c.clanId = main.id;
  for (const r of clanRegions(s, cadet.id).slice()) setOwner(s, r, main.id);
  s.fleet += cadet.fleet;
  s.credits += cadet.credits;
  s.aiWars = s.aiWars.filter((w) => w.attacker !== cadet.id && w.defender !== cadet.id);
  s.wars = s.wars.filter((w) => w.enemy !== cadet.id);
  s.routes = s.routes.filter((r) => r.partner !== cadet.id);
  delete s.clans[cadet.id];
  log(s, `The main line is gone. House ${cadet.name}, a cadet branch, rejoins the main house and ${head.name} takes up the crown.`, 'info');
  return head;
}
