import { describe, expect, it } from 'vitest';
import { pushPanel, type WindowPanel } from './panels';
describe('window navigation', () => {
  it('keeps parents available when a child opens', () => {
    const menu: WindowPanel[] = [{ kind: 'menu' }];
    const saves = pushPanel(menu, { kind: 'saves' });
    expect(saves.slice(0, -1)).toEqual(menu);
    expect(menu).toEqual([{ kind: 'menu' }]);
  });
  it('returns to an existing ancestor instead of growing a loop', () => {
    const stack: WindowPanel[] = [{ kind: 'menu' }, { kind: 'tree' }, { kind: 'character', id: 'a' }, { kind: 'clan', id: 'house' }];
    expect(pushPanel(stack, { kind: 'character', id: 'a' })).toEqual(stack.slice(0, 3));
    expect(pushPanel(stack, { kind: 'character', id: 'b' })).toHaveLength(5);
  });
});
