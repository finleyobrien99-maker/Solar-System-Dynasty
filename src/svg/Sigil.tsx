// Procedural house sigils: a shield shape, a field division and a charge.

import { memo, useId, type ReactElement } from 'react';
import type { SigilSpec } from '../game/types';
import { luminance, shade } from './colors';

const SHAPES = [
  // Heater shield
  'M 10 8 L 90 8 L 90 52 C 90 82, 66 100, 50 112 C 34 100, 10 82, 10 52 Z',
  // Round
  'M 50 8 A 52 52 0 1 1 49.9 8 Z',
  // Hexagon
  'M 50 4 L 94 30 L 94 86 L 50 112 L 6 86 L 6 30 Z',
  // Banner
  'M 12 4 L 88 4 L 88 112 L 50 92 L 12 112 Z',
  // Kite
  'M 50 4 L 92 40 L 50 116 L 8 40 Z',
];

// Charges drawn in a 100x100 box centred on (50, 58).
export const CHARGES: ((fill: string, line: string) => ReactElement)[] = [
  // Star
  (f, l) => <polygon points="50,30 57,50 78,50 61,62 68,83 50,70 32,83 39,62 22,50 43,50" fill={f} stroke={l} strokeWidth={2} />,
  // Comet
  (f, l) => (
    <g>
      <path d="M 30 82 Q 44 58 74 36 Q 54 64 38 86 Z" fill={f} opacity={0.7} />
      <circle cx={34} cy={80} r={10} fill={f} stroke={l} strokeWidth={2} />
    </g>
  ),
  // Ringed planet
  (f, l) => (
    <g>
      <circle cx={50} cy={58} r={16} fill={f} stroke={l} strokeWidth={2} />
      <ellipse cx={50} cy={58} rx={30} ry={8} fill="none" stroke={f} strokeWidth={4} transform="rotate(-18 50 58)" />
    </g>
  ),
  // Rocket
  (f, l) => (
    <g stroke={l} strokeWidth={2}>
      <path d="M 50 26 C 62 38, 62 66, 58 78 L 42 78 C 38 66, 38 38, 50 26 Z" fill={f} />
      <path d="M 42 64 L 32 82 L 42 78 Z M 58 64 L 68 82 L 58 78 Z" fill={f} />
      <circle cx={50} cy={50} r={5} fill={l} />
    </g>
  ),
  // Eye
  (f, l) => (
    <g>
      <path d="M 22 58 Q 50 30 78 58 Q 50 86 22 58 Z" fill={f} stroke={l} strokeWidth={2} />
      <circle cx={50} cy={58} r={9} fill={l} />
    </g>
  ),
  // Crown
  (f, l) => <path d="M 26 76 L 24 42 L 37 56 L 50 34 L 63 56 L 76 42 L 74 76 Z" fill={f} stroke={l} strokeWidth={2} />,
  // Gear
  (f, l) => (
    <g>
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={46} y={30} width={8} height={10} fill={f} stroke={l} strokeWidth={1.5} transform={`rotate(${i * 45} 50 58)`} />
      ))}
      <circle cx={50} cy={58} r={20} fill={f} stroke={l} strokeWidth={2} />
      <circle cx={50} cy={58} r={7} fill={l} />
    </g>
  ),
  // Atom
  (f, l) => (
    <g fill="none" stroke={f} strokeWidth={4}>
      <ellipse cx={50} cy={58} rx={28} ry={10} />
      <ellipse cx={50} cy={58} rx={28} ry={10} transform="rotate(60 50 58)" />
      <ellipse cx={50} cy={58} rx={28} ry={10} transform="rotate(-60 50 58)" />
      <circle cx={50} cy={58} r={5} fill={l} stroke="none" />
    </g>
  ),
  // Crescent
  (f, l) => <path d="M 60 32 A 26 26 0 1 0 60 84 A 20 20 0 1 1 60 32 Z" fill={f} stroke={l} strokeWidth={2} />,
  // Sun
  (f, l) => (
    <g>
      {Array.from({ length: 12 }, (_, i) => (
        <polygon key={i} points="50,26 53,40 47,40" fill={f} transform={`rotate(${i * 30} 50 58)`} />
      ))}
      <circle cx={50} cy={58} r={15} fill={f} stroke={l} strokeWidth={2} />
    </g>
  ),
  // Trident
  (f, l) => (
    <path
      d="M 47 86 L 47 50 L 34 46 L 34 30 L 38 40 L 46 42 L 46 26 L 50 18 L 54 26 L 54 42 L 62 40 L 66 30 L 66 46 L 53 50 L 53 86 Z"
      fill={f}
      stroke={l}
      strokeWidth={1.5}
    />
  ),
  // Wing
  (f, l) => (
    <path
      d="M 28 80 C 26 50, 46 32, 78 30 C 70 38, 72 40, 64 44 C 70 46, 66 50, 58 52 C 64 56, 58 60, 50 60 C 52 66, 44 70, 28 80 Z"
      fill={f}
      stroke={l}
      strokeWidth={2}
    />
  ),
  // Skull
  (f, l) => (
    <g>
      <path d="M 30 56 C 30 36, 70 36, 70 56 C 70 66, 64 68, 62 72 L 62 80 L 38 80 L 38 72 C 36 68, 30 66, 30 56 Z" fill={f} stroke={l} strokeWidth={2} />
      <circle cx={41} cy={57} r={5.5} fill={l} />
      <circle cx={59} cy={57} r={5.5} fill={l} />
    </g>
  ),
  // Lightning
  (f, l) => <polygon points="56,26 34,62 48,62 42,90 68,50 53,50 62,26" fill={f} stroke={l} strokeWidth={2} />,
  // Gem
  (f, l) => (
    <g stroke={l} strokeWidth={2}>
      <polygon points="34,44 66,44 78,56 50,88 22,56" fill={f} />
      <polyline points="22,56 78,56" fill="none" />
      <polyline points="42,44 50,56 58,44" fill="none" />
    </g>
  ),
  // Sword
  (f, l) => (
    <g stroke={l} strokeWidth={1.5}>
      <path d="M 47 26 L 53 26 L 53 70 L 47 70 Z M 50 18 L 53 26 L 47 26 Z" fill={f} />
      <rect x={36} y={70} width={28} height={5} fill={f} />
      <rect x={47} y={75} width={6} height={12} fill={f} />
    </g>
  ),
];

function SigilImpl({ spec, size = 48, className, flag = false }: { spec: SigilSpec; size?: number | string; className?: string; flag?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const shape = flag ? 'M 2 22 H 98 V 94 H 2 Z' : SHAPES[spec.shape % SHAPES.length];
  const { c1, c2, c3 } = spec;
  const line = luminance(c3) > 0.55 ? '#1b1b22' : '#f2f2f2';
  const charge = CHARGES[spec.charge % CHARGES.length];
  const division = (() => {
    switch (spec.division % 7) {
      case 1:
        return <rect x={50} y={0} width={50} height={120} fill={c2} />;
      case 2:
        return <rect x={0} y={58} width={100} height={62} fill={c2} />;
      case 3:
        return <polygon points="0,0 100,120 0,120" fill={c2} />;
      case 4:
        return (
          <>
            <rect x={50} y={0} width={50} height={58} fill={c2} />
            <rect x={0} y={58} width={50} height={62} fill={c2} />
          </>
        );
      case 5:
        return <polygon points="0,120 50,50 100,120 100,90 50,22 0,90" fill={c2} />;
      case 6:
        return <path d={shape} fill="none" stroke={c2} strokeWidth={16} />;
      default:
        return null;
    }
  })();
  return (
    <svg
      viewBox={flag ? '0 20 100 76' : '0 0 100 120'}
      width={size}
      height={typeof size === 'number' ? size * (flag ? 0.76 : 1.2) : size}
      className={className}
      aria-hidden
    >
      <defs>
        <clipPath id={`sg${uid}`}>
          <path d={shape} />
        </clipPath>
        <linearGradient id={`sh${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.28} />
          <stop offset="60%" stopColor="#fff" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.25} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#sg${uid})`}>
        <rect width={100} height={120} fill={c1} />
        {division}
        <g transform="translate(0 2)">{charge(c3, line)}</g>
        <rect width={100} height={120} fill={`url(#sh${uid})`} />
      </g>
      <path d={shape} fill="none" stroke={shade(c1, -0.5)} strokeWidth={4} />
      <path d={shape} fill="none" stroke="#d4af37" strokeWidth={1.5} opacity={0.8} />
    </svg>
  );
}

export const Sigil = memo(SigilImpl);
