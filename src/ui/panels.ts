// UI navigation only: nothing in this stack belongs in a game save.
export type Panel = 'saves' | 'codex' | 'tree' | 'suitors' | 'menu' | 'vip';
export type WindowPanel = { kind: Panel } | { kind: 'character' | 'clan'; id: string };

export function panelKey(panel: WindowPanel): string {
  return 'id' in panel ? panel.kind + ':' + panel.id : panel.kind;
}

/** Reopening an ancestor returns to it, keeping navigation loops bounded. */
export function pushPanel(stack: WindowPanel[], panel: WindowPanel): WindowPanel[] {
  const index = stack.findIndex((entry) => panelKey(entry) === panelKey(panel));
  return index < 0 ? [...stack, panel] : stack.slice(0, index + 1);
}
