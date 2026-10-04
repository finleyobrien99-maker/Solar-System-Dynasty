// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportSave, listSaves, readSave, writeSave } from '../../game/save';
import { createWorld, rollRuler, scenarioHouses, startGame } from '../../game/world';
import { SavesPanel } from './SavesModal';

function game() {
  const world = createWorld(11),
    clan = scenarioHouses(world, 'mars', 'governor')[0];
  return startGame(world, { clanId: clan.id, ruler: rollRuler(11, 'mars', 'F', 'Ysra'), focus: 'cmd', scenario: 'governor' });
}
function slot(name: string) {
  return within(screen.getByText(name, { exact: true }).closest('.card') as HTMLElement);
}
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('saves panel', () => {
  it('saves to the chosen slot, announces success and loads that state', async () => {
    const state = game(),
      load = vi.fn(),
      user = userEvent.setup();
    render(<SavesPanel current={state} onLoad={load} onClose={vi.fn()} />);
    await user.click(slot('Slot 1').getByRole('button', { name: 'Save here' }));
    expect(screen.getByRole('status', { name: 'Save status' }).textContent).toBe('Saved to Slot 1.');
    expect(readSave('slot1')?.state.rulerId).toBe(state.rulerId);
    await user.click(slot('Slot 1').getByRole('button', { name: 'Load' }));
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ rulerId: state.rulerId, year: state.year }));
  });
  it('requires two presses before deleting a saved slot', async () => {
    const state = game(),
      user = userEvent.setup();
    writeSave('slot1', state);
    render(<SavesPanel onLoad={vi.fn()} onClose={vi.fn()} />);
    await user.click(slot('Slot 1').getByRole('button', { name: 'Delete' }));
    expect(readSave('slot1')).not.toBeNull();
    await user.click(slot('Slot 1').getByRole('button', { name: 'Tap again to delete' }));
    expect(readSave('slot1')).toBeNull();
    expect(slot('Slot 1').getByText('Empty')).toBeTruthy();
  });
  it('reports a failed write without claiming success', async () => {
    const state = game(),
      user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage is full');
    });
    render(<SavesPanel current={state} onLoad={vi.fn()} onClose={vi.fn()} />);
    await user.click(slot('Slot 1').getByRole('button', { name: 'Save here' }));
    expect(screen.getByRole('status', { name: 'Save status' }).textContent).toMatch(/^Save failed:/);
    expect(listSaves()).toHaveLength(0);
  });
  it('rejects an invalid import and keeps existing saves', async () => {
    const state = game(),
      load = vi.fn(),
      user = userEvent.setup();
    writeSave('slot1', state);
    render(<SavesPanel onLoad={load} onClose={vi.fn()} />);
    const file = new File(['bad'], 'bad.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => 'bad' });
    await user.upload(screen.getByLabelText('Import save file'), file);
    expect((await screen.findByRole('status', { name: 'Save status' })).textContent).toMatch(/not a valid Solar Dynasty save/);
    expect(load).not.toHaveBeenCalled();
    expect(readSave('slot1')?.state.rulerId).toBe(state.rulerId);
  });
  it('loads a valid imported save without rewriting other slots', async () => {
    const state = game(),
      load = vi.fn(),
      user = userEvent.setup();
    render(<SavesPanel onLoad={load} onClose={vi.fn()} />);
    const text = exportSave(state),
      file = new File([text], 'dynasty.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => text });
    await user.upload(screen.getByLabelText('Import save file'), file);
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ rulerId: state.rulerId }));
    expect(listSaves()).toHaveLength(0);
  });
});
