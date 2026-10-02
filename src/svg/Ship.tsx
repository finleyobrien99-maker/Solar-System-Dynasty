// Procedural warship silhouettes, coloured by house.

import { memo, useId, useMemo } from 'react';
import { int, rand, seeded } from '../game/rng';
import { shade } from './colors';

interface ShipShape {
  hull: string;
  tower: { x: number; y: number; w: number; h: number };
  fins: string;
  engines: number[];
  windows: number[];
}

function buildShip(seed: number): ShipShape {
  const s = seeded(seed);
  const len = 80 + rand(s) * 10;
  const h = 10 + rand(s) * 8;
  const noseX = 10 + len;
  const top: [number, number][] = [];
  const steps = int(s, 3, 5);
  for (let i = 0; i <= steps; i++) {
    const x = 12 + (len * i) / steps;
    const taper = 1 - Math.pow(i / steps, 1.6) * 0.85;
    top.push([x, 30 - h * taper - (rand(s) - 0.5) * 3]);
  }
  const hull =
    `M 12 ${30 + h} ` +
    top.map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') +
    ` L ${noseX} 30 L ${(noseX - 14).toFixed(1)} ${(30 + h * 0.45).toFixed(1)} L ${(len * 0.45).toFixed(1)} ${(30 + h * 0.9).toFixed(1)} Z`;
  const tx = 25 + rand(s) * 25;
  const tower = { x: tx, y: 30 - h - 6, w: 10 + rand(s) * 8, h: 7 };
  const fins = `M 16 ${30 + h * 0.6} L 6 ${30 + h + 9} L 30 ${30 + h * 0.9} Z M 16 ${30 - h * 0.6} L 6 ${30 - h - 7} L 26 ${30 - h * 0.85} Z`;
  const engineCount = int(s, 1, 3);
  const engines = Array.from({ length: engineCount }, (_, i) => 30 - h * 0.5 + ((i + 1) * h * 1.2) / (engineCount + 1));
  const windows = Array.from({ length: int(s, 3, 6) }, (_, i) => 35 + i * 7);
  return { hull, tower, fins, engines, windows };
}

function ShipImpl({ seed, color, size = 80, flip, className }: { seed: number; color: string; size?: number | string; flip?: boolean; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const shape = useMemo(() => buildShip(seed), [seed]);
  const dark = shade(color, -0.45);
  return (
    <svg viewBox="0 0 110 60" width={size} height={typeof size === 'number' ? size * 0.55 : size} className={className} aria-hidden>
      <defs>
        <linearGradient id={`hg${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shade(color, 0.25)} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
        <filter id={`eg${uid}`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>
      <g transform={flip ? 'translate(110 0) scale(-1 1)' : undefined}>
        {shape.engines.map((y, i) => (
          <g key={i}>
            <ellipse cx={8} cy={y} rx={8} ry={3} fill="#5ad1ff" filter={`url(#eg${uid})`} />
            <ellipse cx={10} cy={y} rx={4} ry={1.6} fill="#e8fbff" />
          </g>
        ))}
        <path d={shape.fins} fill={dark} />
        <rect x={shape.tower.x} y={shape.tower.y} width={shape.tower.w} height={shape.tower.h + 4} rx={1.5} fill={shade(color, -0.2)} />
        <path d={shape.hull} fill={`url(#hg${uid})`} stroke={shade(color, -0.6)} strokeWidth={0.8} />
        {shape.windows.map((x) => (
          <rect key={x} x={x} y={29} width={2.4} height={1.4} fill="#ffe9a8" opacity={0.85} />
        ))}
        <rect x={shape.tower.x + 2} y={shape.tower.y + 2} width={shape.tower.w - 4} height={1.6} fill="#9ef0ff" opacity={0.8} />
      </g>
    </svg>
  );
}

export const Ship = memo(ShipImpl);
