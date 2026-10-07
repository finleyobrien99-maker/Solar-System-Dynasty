// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLANETS, PLANET_BY_ID } from '../game/planets';
import { createWorld } from '../game/world';
import { planetPos, SolarMap } from './SolarMap';

afterEach(cleanup);

describe('expanded system map', () => {
  it('keeps every realm finite, fixes the Sun at the centre and places the Moon beside Earth', () => {
    for (const year of [2500, 2501, 2550, 3000]) {
      for (const realm of PLANETS) expect(planetPos(realm, year).every(Number.isFinite)).toBe(true);
      expect(planetPos(PLANET_BY_ID.sun, year)).toEqual([0, 0]);
      const earth = planetPos(PLANET_BY_ID.earth, year);
      const moon = planetPos(PLANET_BY_ID.moon, year);
      expect(Math.hypot(earth[0] - moon[0], earth[1] - moon[1])).toBeLessThan(80);
      expect(Math.hypot(earth[0] - moon[0], earth[1] - moon[1])).toBeGreaterThan(50);
    }
  });

  it('makes all twelve realms selectable by keyboard, including the central Sun', () => {
    const selected = vi.fn();
    const { container } = render(<SolarMap s={createWorld(42)} selected="sun" onSelect={selected} />);
    expect(screen.getAllByRole('button')).toHaveLength(12);
    const sun = screen.getByRole('button', { name: /^Sun, ruled by House/ });
    expect(sun.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(sun, { key: 'Enter' });
    expect(selected).toHaveBeenLastCalledWith('sun');
    fireEvent.keyDown(screen.getByRole('button', { name: /^Moon, ruled by House/ }), { key: ' ' });
    expect(selected).toHaveBeenLastCalledWith('moon');
    expect(container.innerHTML).not.toMatch(/NaN|Infinity|undefined/);
  });
});
