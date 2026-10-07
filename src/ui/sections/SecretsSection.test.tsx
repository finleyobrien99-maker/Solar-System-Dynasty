// @vitest-environment jsdom
import { useEffect } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createCharacter } from '../../game/character';
import { ruler } from '../../game/core';
import { readSave } from '../../game/save';
import { hooksOf, learnSecret, recordMurder } from '../../game/secrets';
import type { GameState } from '../../game/types';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../../game/world';
import { GameProvider, useGame } from '../store';
import { SecretsSection } from './SecretsSection';

let current: GameState;
function setup(known = false) {
  const s = createWorld(71),
    k = scenarioHouses(s, 'mars', 'monarch')[0];
  startGame(s, { clanId: k.id, ruler: rollRuler(71, 'mars', 'M', 'Tav'), focus: 'int', age: 40, family: 'kids' });
  const r = ruler(s),
    house = Object.values(s.clans).find((x) => !x.isPlayer)!;
  const target = s.characters[house.headId];
  target.born = s.year - 45;
  target.base.int = 0;
  target.childrenIds = [];
  const person = (clanId: string, gender: 'M' | 'F', age: number) => createCharacter(s, { clanId, gender, born: s.year - age, planetId: 'mars' });
  const elder = person(house.id, 'F', 30),
    partner = person(house.id, 'F', 20),
    own = person(r.clanId, 'M', 20),
    victim = person(house.id, 'F', 40);
  for (const child of [elder, partner]) {
    if (target.gender === 'M') child.fatherId = target.id;
    else child.motherId = target.id;
    target.childrenIds.push(child.id);
  }
  own.fatherId = r.id;
  r.childrenIds.push(own.id);
  victim.died = s.year;
  const secret = recordMurder(s, target, victim);
  if (known) learnSecret(s, secret.id, r.id);
  s.credits = 1000;
  s.seed = 7; // First roll below the minimum investigation odds: this case tests successful discovery.
  s.pending = [];
  return { s, target, own, partner, secret };
}

function View({ id }: { id: string }) {
  const { s } = useGame();
  useEffect(() => {
    current = s;
  }, [s]);
  return <SecretsSection c={s.characters[id]} />;
}
function mount(s: GameState, id: string) {
  render(
    <GameProvider initial={s} onQuit={() => {}}>
      <View id={id} />
    </GameProvider>,
  );
}
beforeEach(() => localStorage.clear());
afterEach(cleanup);

it('investigates through act, uncovers real proof, blocks repeat investigation and saves it', async () => {
  const { s, target, secret } = setup(),
    user = userEvent.setup();
  mount(s, target.id);
  expect(screen.queryByText(/ordered the murder/)).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Investigate (40 credits)' }));
  expect(current.credits).toBe(960);
  expect(s.credits).toBe(1000);
  expect(hooksOf(current)).toHaveLength(1);
  expect(screen.getByText(/ordered the murder/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Investigate (40 credits)' }).hasAttribute('disabled')).toBe(true);
  await waitFor(() => expect(readSave('auto')?.state.secrets.find((x) => x.id === secret.id)?.knownTo).toContain(s.rulerId));
});

it('confirms a marriage once, saves reciprocal spouses, and cannot spend the hook again', async () => {
  const { s, target, own, partner } = setup(true),
    user = userEvent.setup();
  mount(s, target.id);
  await user.click(screen.getByText('Trade silence for a marriage'));
  await user.selectOptions(screen.getByLabelText('Your family member'), own.id);
  await user.selectOptions(screen.getByLabelText('Their child'), partner.id);
  await user.click(screen.getByRole('button', { name: 'Spend hook on marriage' }));
  expect(current.characters[own.id].spouseId).toBeUndefined();
  await user.click(screen.getByRole('button', { name: 'Spend this hook on the marriage?' }));
  expect(current.characters[own.id].spouseId).toBe(partner.id);
  expect(current.characters[partner.id].spouseId).toBe(own.id);
  expect(hooksOf(current)).toEqual([]);
  expect(screen.queryByRole('button', { name: 'Spend hook on marriage' })).toBeNull();
  await waitFor(() => expect(readSave('auto')?.state.characters[own.id].spouseId).toBe(partner.id));
});

it('exposure needs confirmation and removes the marriage favour', async () => {
  const { s, target, secret } = setup(true),
    user = userEvent.setup();
  mount(s, target.id);
  await user.click(screen.getByRole('button', { name: 'Expose evidence' }));
  expect(current.secrets.find((x) => x.id === secret.id)?.exposedYear).toBeUndefined();
  await user.click(screen.getByRole('button', { name: 'Publish this evidence? All hooks on it will be lost.' }));
  expect(hooksOf(current)).toEqual([]);
  expect(screen.getByText(/Public evidence/)).toBeTruthy();
  expect(screen.queryByText('Trade silence for a marriage')).toBeNull();
});

it('shows a blocked marriage reason for an heir without consuming leverage', async () => {
  const { s, target, own } = setup(true),
    user = userEvent.setup(),
    heirId = target.childrenIds[0];
  mount(s, target.id);
  await user.click(screen.getByText('Trade silence for a marriage'));
  await user.selectOptions(screen.getByLabelText('Your family member'), own.id);
  await user.selectOptions(screen.getByLabelText('Their child'), heirId);
  expect(screen.getByRole('button', { name: 'Spend hook on marriage' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByText('A house head or eldest living child cannot be taken away.')).toBeTruthy();
  expect(hooksOf(current)).toHaveLength(1);
});
