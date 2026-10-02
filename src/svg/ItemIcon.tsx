// Procedural treasury art: crowns, blades, armour, flagships and relics.

import { memo, useId } from 'react';
import { RARITY_COLOR } from '../game/items';
import type { Item } from '../game/types';
import { shade } from './colors';
import { Ship } from './Ship';

const HUES = ['#4cc9f0', '#f72585', '#7cff6b', '#ffb703', '#b388ff', '#ff5d5d'];

function ItemIconImpl({ item, size = 56 }: { item: Item; size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const rc = RARITY_COLOR[item.rarity];
  const hue = HUES[item.seed % HUES.length];
  const metal = item.rarity === 'legendary' || item.rarity === 'epic' ? '#f2c94c' : '#c9d1db';
  const art = (() => {
    switch (item.slot) {
      case 'head':
        return (
          <g>
            <path d="M 22 66 L 20 36 L 34 50 L 50 28 L 66 50 L 80 36 L 78 66 Z" fill={metal} stroke={shade(metal, -0.4)} strokeWidth={2} />
            <rect x={22} y={62} width={56} height={8} rx={2} fill={shade(metal, -0.15)} />
            <circle cx={50} cy={52} r={5} fill={hue} />
            <circle cx={33} cy={58} r={3} fill={hue} opacity={0.8} />
            <circle cx={67} cy={58} r={3} fill={hue} opacity={0.8} />
          </g>
        );
      case 'weapon':
        return (
          <g transform="rotate(-40 50 50)">
            <rect x={46} y={12} width={8} height={52} rx={4} fill={hue} filter={`url(#gl${uid})`} />
            <rect x={47.5} y={14} width={5} height={48} rx={2.5} fill="#fff" opacity={0.85} />
            <rect x={38} y={64} width={24} height={5} rx={2} fill={metal} />
            <rect x={45} y={69} width={10} height={18} rx={2} fill="#3a3f4b" stroke={metal} strokeWidth={1} />
          </g>
        );
      case 'suit':
        return (
          <g>
            <path d="M 26 30 L 40 24 Q 50 34 60 24 L 74 30 L 80 52 L 70 54 L 68 80 L 32 80 L 30 54 L 20 52 Z" fill={shade(metal, -0.2)} stroke={shade(metal, -0.5)} strokeWidth={2} />
            <path d="M 40 40 L 60 40 L 58 62 L 50 68 L 42 62 Z" fill={hue} opacity={0.7} />
          </g>
        );
      case 'flagship':
        return (
          <g transform="translate(6 26)">
            <Ship seed={item.seed} color={hue} size={88} />
          </g>
        );
      case 'relic': {
        const v = item.seed % 4;
        if (v === 0)
          return (
            <g>
              <circle cx={50} cy={50} r={20} fill={hue} filter={`url(#gl${uid})`} opacity={0.8} />
              <circle cx={50} cy={50} r={16} fill={hue} />
              <circle cx={44} cy={44} r={5} fill="#fff" opacity={0.7} />
              <rect x={38} y={68} width={24} height={8} rx={2} fill={metal} />
            </g>
          );
        if (v === 1)
          return (
            <g>
              <path d="M 30 50 C 30 26, 70 26, 70 50 C 70 60, 64 62, 62 66 L 62 76 L 38 76 L 38 66 C 36 62, 30 60, 30 50 Z" fill="#e9e4d4" stroke="#8a826e" strokeWidth={2} />
              <circle cx={41} cy={50} r={6} fill={hue} filter={`url(#gl${uid})`} />
              <circle cx={59} cy={50} r={6} fill={hue} filter={`url(#gl${uid})`} />
            </g>
          );
        if (v === 2)
          return (
            <g>
              <rect x={30} y={22} width={40} height={56} rx={4} fill="#6b5b45" stroke={metal} strokeWidth={2} />
              {[32, 42, 52, 62].map((y) => (
                <path key={y} d={`M 36 ${y} l 8 0 l 3 4 l 8 -4 l 9 0`} stroke={hue} strokeWidth={2} fill="none" />
              ))}
            </g>
          );
        return (
          <g>
            <polygon points="50,14 64,40 58,84 42,84 36,40" fill={hue} opacity={0.85} filter={`url(#gl${uid})`} />
            <polygon points="50,14 64,40 50,50 36,40" fill="#fff" opacity={0.45} />
          </g>
        );
      }
    }
  })();
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-label={item.name} role="img">
      <defs>
        <radialGradient id={`ib${uid}`} cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor={shade(rc, -0.45)} />
          <stop offset="100%" stopColor="#0b0e18" />
        </radialGradient>
        <filter id={`gl${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x={2} y={2} width={96} height={96} rx={14} fill={`url(#ib${uid})`} stroke={rc} strokeWidth={3} />
      {art}
    </svg>
  );
}

export const ItemIcon = memo(ItemIconImpl);
