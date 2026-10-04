// @vitest-environment jsdom
import { useEffect } from 'react';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ruler } from '../../game/core';
import { addFeeling, opinionOf, timeLeft } from '../../game/relations';
import { readSave } from '../../game/save';
import type { GameState } from '../../game/types';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../../game/world';
import { GameProvider, useGame } from '../store';
import { RelationshipsSection, SpendTimeSection } from './RelationshipsSection';

function game(age = 35) {
  const world = createWorld(21);
  const clan = scenarioHouses(world, 'mars', 'governor')[0];
  return startGame(world, { clanId: clan.id, ruler: rollRuler(21, 'mars', 'F', 'Ines'), focus: 'dip', age, family: age >= 18 ? 'kids' : 'single' });
}
let current: GameState;
function View() {
  const { s } = useGame();
  useEffect(() => {
    current = s;
  }, [s]);
  return (
    <>
      <SpendTimeSection />
      <RelationshipsSection c={ruler(s)} />
    </>
  );
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('spends time through the store, saves feelings and blocks repeat visits and the cycle limit', async () => {
  const state = game(),
    user = userEvent.setup();
  render(
    <GameProvider initial={state} onQuit={() => {}}>
      <View />
    </GameProvider>,
  );
  const target = state.characters[ruler(state).childrenIds[0]];
  const before = opinionOf(state, target, ruler(state));
  await user.selectOptions(screen.getByLabelText('Spend time with'), target.id);
  await user.selectOptions(screen.getByLabelText('Activity'), 'stargazing');
  await user.click(screen.getByRole('button', { name: 'Spend time together' }));
  expect(timeLeft(current)).toBe(2);
  expect(timeLeft(state)).toBe(3);
  expect(opinionOf(current, current.characters[target.id], ruler(current))).toBeGreaterThanOrEqual(before);
  expect(screen.getByRole('button', { name: 'Spend time together' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByText('You already saw them this cycle.')).toBeTruthy();
  await waitFor(() => expect(readSave('auto')?.state.relations[target.id]?.[state.rulerId]?.together).toBe(state.year));
  const others = [
    ruler(state).spouseId!,
    ...Object.keys(state.characters).filter(
      (id) => id !== state.rulerId && id !== target.id && id !== ruler(state).spouseId && state.characters[id].died === undefined,
    ),
  ];
  for (const id of others.slice(0, 2)) {
    await user.selectOptions(screen.getByLabelText('Spend time with'), id);
    await user.click(screen.getByRole('button', { name: 'Spend time together' }));
  }
  await user.selectOptions(screen.getByLabelText('Spend time with'), others[2]);
  expect(screen.getByText('You can only see 3 people a cycle.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Spend time together' }).hasAttribute('disabled')).toBe(true);
});

it('explains opinion in the direction of the displayed character', async () => {
  const state = game(),
    r = ruler(state),
    spouse = state.characters[r.spouseId!];
  addFeeling(state, r.id, spouse.id, { why: 'A kind word', value: 12, decay: 1 });
  addFeeling(state, spouse.id, r.id, { why: 'A private grudge', value: -40, decay: 1 });
  render(
    <GameProvider initial={state} onQuit={() => {}}>
      <RelationshipsSection c={r} />
    </GameProvider>,
  );
  const row = screen.getByText('A kind word: +12').closest('details')!;
  await userEvent.setup().click(row.querySelector('summary')!);
  expect(within(row).getByText('My spouse: +15')).toBeTruthy();
  expect(screen.queryByText(/A private grudge/)).toBeNull();
  expect(row.textContent).toContain(String(opinionOf(state, r, spouse)));
});

it('explains why spending time is unavailable during a regency', () => {
  const state = game();
  ruler(state).born = state.year - 13;
  render(
    <GameProvider initial={state} onQuit={() => {}}>
      <SpendTimeSection />
    </GameProvider>,
  );
  expect(screen.getByText('A regent rules for now.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Spend time together' }).hasAttribute('disabled')).toBe(true);
});
