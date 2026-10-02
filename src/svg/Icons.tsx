// Hand-built SVG glyphs for the UI. All drawn in a 24x24 box and coloured
// with currentColor so CSS can tint them.

import type { ReactElement } from 'react';

const P = (d: string, extra: Record<string, unknown> = {}) => <path d={d} {...extra} />;

const ICONS: Record<string, ReactElement> = {
  credits: (
    <g>
      <circle cx={12} cy={12} r={9} />
      <path d="M12 6.5 L16.5 9 L16.5 15 L12 17.5 L7.5 15 L7.5 9 Z" />
      <path d="M12 9.5 v5" />
    </g>
  ),
  fleet: P('M3 13 L9 9 L19 10 L22 12 L19 14 L9 15 Z M9 9 L7 5 M9 15 L7 19 M3 13 L1 12'),
  prestige: P('M12 2.5 L14.8 8.8 L21.5 9.4 L16.4 13.8 L18 20.5 L12 17 L6 20.5 L7.6 13.8 L2.5 9.4 L9.2 8.8 Z'),
  faith: P('M12 21 C6 18 6 12 9 9 C9 12 11 13 12 13 C10 9 12 5 15 3 C14 7 18 9 18 14 C18 17.5 15.5 20 12 21 Z'),
  health: P('M12 20 C5 15 2.5 11.5 2.5 8.5 C2.5 5.5 5 3.5 7.5 3.5 C9.5 3.5 11 4.8 12 6.3 C13 4.8 14.5 3.5 16.5 3.5 C19 3.5 21.5 5.5 21.5 8.5 C21.5 11.5 19 15 12 20 Z'),
  age: P('M6 3 H18 M6 21 H18 M7 3 C7 9 17 9 17 12 C17 15 7 15 7 21 M17 3 C17 9 7 9 7 12 C7 15 17 15 17 21'),
  dip: P('M4 5 H20 V15 H11 L6 19 V15 H4 Z M8 9 H16 M8 12 H13'),
  cmd: P('M4 4 L20 20 M20 4 L4 20 M4 4 L8 4 M4 4 L4 8 M20 4 L16 4 M20 4 L20 8 M7 17 L4 20 M17 17 L20 20'),
  eco: P('M4 20 V13 M9 20 V8 M14 20 V11 M19 20 V4 M2 20 H22'),
  int: P('M3 10 C5 6 19 6 21 10 C19 15 15 16 12 13 C9 16 5 15 3 10 Z M7.5 10.5 h2.5 M14 10.5 h2.5'),
  sci: (
    <g>
      <ellipse cx={12} cy={12} rx={10} ry={4} />
      <ellipse cx={12} cy={12} rx={10} ry={4} transform="rotate(60 12 12)" />
      <ellipse cx={12} cy={12} rx={10} ry={4} transform="rotate(-60 12 12)" />
      <circle cx={12} cy={12} r={1.4} fill="currentColor" />
    </g>
  ),
  war: P('M5 3 L19 17 M19 3 L5 17 M3 15 L7 19 M17 19 L21 15 M3 21 L6 18 M21 21 L18 18'),
  peace: P('M5 21 V3 M5 4 C9 2 12 6 19 4 V13 C12 15 9 11 5 13'),
  crown: P('M3 18 L2 7 L7.5 11 L12 4 L16.5 11 L22 7 L21 18 Z M3 21 H21'),
  birth: P('M12 3 L13.5 9 L20 10.5 L13.5 12 L12 18 L10.5 12 L4 10.5 L10.5 9 Z M18 17 l1 2 l2 1 l-2 1 l-1 2 l-1 -2 l-2 -1 l2 -1 Z'),
  death: P('M5 11 C5 5 19 5 19 11 C19 14 17 15 16.5 16.5 V20 H7.5 V16.5 C7 15 5 14 5 11 Z M9 11 h0.1 M15 11 h0.1 M10 20 V17.5 M14 20 V17.5', { strokeWidth: 2 }),
  heart: P('M12 20 C5 15 2.5 11.5 2.5 8.5 C2.5 5.5 5 3.5 7.5 3.5 C9.5 3.5 11 4.8 12 6.3 C13 4.8 14.5 3.5 16.5 3.5 C19 3.5 21.5 5.5 21.5 8.5 C21.5 11.5 19 15 12 20 Z'),
  scheme: P('M14 3 L21 3 L21 10 L10 21 L3 14 Z M7 17 L4 20 M17 7 h0.1'),
  family: P('M8 8 a3 3 0 1 0 0.01 0 M16 9 a2.5 2.5 0 1 0 0.01 0 M3 20 C3 15 13 15 13 20 M13 20 C13 16 21 16 21 20'),
  dna: P('M7 2 C7 8 17 8 17 12 C17 16 7 16 7 22 M17 2 C17 8 7 8 7 12 C7 16 17 16 17 22 M8.5 5 H15.5 M9.5 9.5 H14.5 M9.5 14.5 H14.5 M8.5 19 H15.5'),
  plague: P('M12 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 M12 2 V6 M12 18 V22 M2 12 H6 M18 12 H22 M5 5 L8 8 M16 16 L19 19 M19 5 L16 8 M8 16 L5 19'),
  comet: P('M18 6 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 M15.5 8.5 L3 21 M14 6 L4 13 M18 10 L11 20'),
  sun: P('M12 12 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M19.1 4.9 L17 7 M7 17 L4.9 19.1'),
  ship: P('M3 13 L9 9 L19 10 L22 12 L19 14 L9 15 Z M9 9 L7 5 M9 15 L7 19 M3 13 L1 12'),
  relic: P('M7 3 H17 L21 9 L12 21 L3 9 Z M3 9 H21 M9 3 L12 9 L15 3 M12 9 V21'),
  hunt: P('M5 4 C8 8 8 14 4 20 M10 3 C13 8 13 14 10 21 M15 4 C18 8 18 14 14 20 M20 6 C21 10 21 14 19 18'),
  duel: P('M3 21 L14 10 M10 14 L7 11 M14 10 L20 4 L21 3 M17 21 L6 10 M10 14 L13 11 M6 10 L4 3 L3 3'),
  study: P('M3 5 C6 4 9 4 12 6 C15 4 18 4 21 5 V19 C18 18 15 18 12 20 C9 18 6 18 3 19 Z M12 6 V20'),
  gala: P('M8 3 H16 L15 10 C15 12 13.5 13 12 13 C10.5 13 9 12 9 10 Z M12 13 V20 M8 21 H16'),
  carouse: P('M4 4 H20 L12 13 Z M12 13 V20 M8 21 H16 M15 4 L18 1'),
  cyber: P('M7 7 H17 V17 H7 Z M10 10 H14 V14 H10 Z M9 3 V7 M15 3 V7 M9 17 V21 M15 17 V21 M3 9 H7 M3 15 H7 M17 9 H21 M17 15 H21'),
  signal: P('M12 21 V11 M12 11 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0 M7.8 7 C5.5 9.5 5.5 12.5 7.8 15 M16.2 7 C18.5 9.5 18.5 12.5 16.2 15 M5 4 C1 8.5 1 13.5 5 18 M19 4 C23 8.5 23 13.5 19 18'),
  psi: P('M12 12 m-1 0 a1 1 0 1 1 2 0 a3 3 0 1 1 -6 0 a5 5 0 1 1 10 0 a7 7 0 1 1 -14 0 a9 9 0 1 1 18 0'),
  win: P('M7 3 H17 V9 C17 12 15 14 12 14 C9 14 7 12 7 9 Z M7 5 H3 C3 9 5 10 7 10 M17 5 H21 C21 9 19 10 17 10 M12 14 V18 M8 21 H16 V18 H8 Z'),
  lose: P('M12 3 L20 6 V12 C20 16 16 19 12 21 C8 19 4 16 4 12 V6 Z M12 3 L10 9 L14 12 L11 21'),
  lock: P('M6 11 H18 V21 H6 Z M8.5 11 V7.5 C8.5 3.5 15.5 3.5 15.5 7.5 V11 M12 15 V17'),
  unlock: P('M6 11 H18 V21 H6 Z M8.5 11 V7.5 C8.5 3.5 15 3.5 15.5 6.5 M12 15 V17'),
  purge: P('M12 12 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 M5.6 5.6 L18.4 18.4'),
  info: P('M12 12 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 M12 11 V17 M12 7.5 V8'),
  close: P('M5 5 L19 19 M19 5 L5 19'),
  save: P('M4 4 H17 L20 7 V20 H4 Z M8 4 V9 H15 V4 M7 20 V14 H17 V20'),
  menu: P('M4 6 H20 M4 12 H20 M4 18 H20'),
  map: (
    <g>
      <circle cx={12} cy={12} r={2.5} />
      <ellipse cx={12} cy={12} rx={9.5} ry={4.5} />
      <circle cx={20} cy={10} r={1.3} fill="currentColor" />
    </g>
  ),
  realm: P('M4 21 V9 L7 6 L10 9 V6 H14 V9 L17 6 L20 9 V21 Z M10 21 V16 H14 V21 M4 21 H20'),
  log: P('M6 3 H18 V21 H6 Z M9 7 H15 M9 11 H15 M9 15 H13'),
  vault: P('M3 4 H21 V20 H3 Z M12 12 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M12 8 V9.5 M12 14.5 V16 M8 12 H9.5 M14.5 12 H16'),
  treasury: P('M3 10 H21 V20 H3 Z M3 10 C3 5 21 5 21 10 M10 13 H14 V16 H10 Z'),
  codex: P('M5 3 H18 V21 H5 Z M5 3 C3 3 3 5 3 6 V20 C3 21 4 21 5 21 M9 8 H15 M9 12 H15'),
  next: P('M4 5 L12 12 L4 19 Z M12 5 L20 12 L12 19 Z'),
  eye: P('M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12 Z M12 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0'),
  planet: (
    <g>
      <circle cx={12} cy={12} r={6} />
      <ellipse cx={12} cy={12} rx={11} ry={3.5} transform="rotate(-20 12 12)" />
    </g>
  ),
  users: P('M9 8 a3 3 0 1 0 0.01 0 M3 20 C3 15 15 15 15 20 M16 4 a3 3 0 0 1 0 6 M18 14 C20 15 21 17 21 20'),
  plus: P('M12 5 V19 M5 12 H19'),
  check: P('M4 12 L10 18 L20 6'),
  arrow: P('M5 12 H19 M13 6 L19 12 L13 18'),
  back: P('M19 12 H5 M11 6 L5 12 L11 18'),
  sword: P('M14 3 L21 3 L21 10 L10 21 L3 14 Z'),
  gift: P('M3 9 H21 V13 H3 Z M5 13 V21 H19 V13 M12 9 V21 M12 9 C9 9 7 7 8 5 C9 3 12 6 12 9 C12 6 15 3 16 5 C17 7 15 9 12 9'),
  chain: P('M10 14 L14 10 M8 12 L5.5 14.5 C4 16 4 18 5.5 19.5 C7 21 9 21 10.5 19.5 L13 17 M16 12 L18.5 9.5 C20 8 20 6 18.5 4.5 C17 3 15 3 13.5 4.5 L11 7'),
};

export type IconName = keyof typeof ICONS | string;

export function Icon({ name, size = 18, className, title }: { name: IconName; size?: number; className?: string; title?: string }) {
  const glyph = ICONS[name] ?? ICONS.info;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {glyph}
    </svg>
  );
}
