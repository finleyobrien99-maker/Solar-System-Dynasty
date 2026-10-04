// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRAIT_LIST } from '../../game/traits';
import { TraitPicker } from './TraitPicker';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('trait picker', () => {
  it('reports the selected trait and reflects the parent selection', async () => {
    const trait = TRAIT_LIST.find((t) => t.cat === 'genetic')!;
    const toggle = vi.fn(),
      user = userEvent.setup();
    const view = render(<TraitPicker selected={[]} onToggle={toggle} />);
    const chip = screen.getByRole('button', { name: 'Genetic: ' + trait.name });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    await user.click(chip);
    expect(toggle).toHaveBeenCalledWith(trait.id);
    view.rerender(<TraitPicker selected={[trait.id]} onToggle={toggle} />);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('tab', { name: /Genes/ }).textContent).toContain('1');
    await user.click(chip);
    expect(toggle).toHaveBeenCalledTimes(2);
  });
  it('moves between categories using arrows, Home and End', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<TraitPicker selected={[]} onToggle={vi.fn()} cats={['genetic', 'personality', 'cyber']} />);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    const personality = screen.getByRole('tab', { name: 'Personality' });
    expect(document.activeElement).toBe(personality);
    expect(personality.getAttribute('aria-selected')).toBe('true');
    const panel = screen.getByRole('tabpanel', { name: 'Personality' });
    expect(personality.getAttribute('aria-controls')).toBe(panel.id);
    expect(screen.queryByRole('button', { name: /^Genetic:/ })).toBeNull();
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Implants' }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Genes' }));
    await user.keyboard('{End}{Home}');
    expect(screen.getByRole('tab', { name: 'Genes' }).getAttribute('aria-selected')).toBe('true');
    expect(errors).not.toHaveBeenCalled();
  });
});
