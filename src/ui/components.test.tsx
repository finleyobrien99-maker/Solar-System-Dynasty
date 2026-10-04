// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Btn } from './components';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('tap-twice confirmation', () => {
  it('announces the confirmation and acts only on the second press', async () => {
    const onClick = vi.fn(),
      user = userEvent.setup();
    render(
      <Btn confirm="Press again to delete" onClick={onClick}>
        Delete
      </Btn>,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Press again to delete');
    const armed = screen.getByRole('button', { name: 'Press again to delete' });
    expect(armed.getAttribute('aria-describedby')).toBe(screen.getByRole('status').id);
    await user.click(armed);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
  });
  it('expires the first press after four seconds', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    render(
      <Btn confirm="Press again" onClick={onClick}>
        Delete
      </Btn>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    act(() => {
      vi.advanceTimersByTime(4001);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Press again' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('supports keyboard confirmation and disarms when focus leaves', async () => {
    const onClick = vi.fn(),
      user = userEvent.setup();
    render(
      <>
        <Btn confirm="Press again" onClick={onClick}>
          Delete
        </Btn>
        <button>Elsewhere</button>
      </>,
    );
    await user.tab();
    await user.keyboard('{Enter}');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    await user.tab({ shift: true });
    await user.keyboard('{Enter}');
    expect(onClick).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('keeps a blocked action disabled and explains why', async () => {
    const onClick = vi.fn(),
      user = userEvent.setup();
    render(
      <Btn confirm="Press again" reason="Not enough credits" showReason onClick={onClick}>
        Buy
      </Btn>,
    );
    const button = screen.getByRole('button', { name: 'Buy' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('Not enough credits');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
