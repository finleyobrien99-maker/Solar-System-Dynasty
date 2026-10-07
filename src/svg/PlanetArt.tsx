// Procedural planets. Every world is generated from its id, so it always
// looks the same, but no two worlds share a texture.

import { memo, useId, useMemo, type ReactElement } from 'react';
import { PLANET_BY_ID } from '../game/planets';
import { rand, seeded, type Seeded } from '../game/rng';
import { mix, shade } from './colors';

type Pt = [number, number];

/** Smooth closed path through points (Catmull-Rom → Bézier). */
export function smoothPath(pts: Pt[]): string {
  const n = pts.length;
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)}, ${c2[0].toFixed(2)} ${c2[1].toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + ' Z';
}

function blob(s: Seeded, cx: number, cy: number, r: number, jitter = 0.35, n = 9): string {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - jitter / 2 + rand(s) * jitter);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85]);
  }
  return smoothPath(pts);
}

function inDisk(s: Seeded, r: number): Pt {
  const a = rand(s) * Math.PI * 2;
  const d = Math.sqrt(rand(s)) * r;
  return [Math.cos(a) * d, Math.sin(a) * d];
}

function wavyBand(s: Seeded, y0: number, y1: number, r: number, amp: number): string {
  const steps = 8;
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = -r - 5 + ((2 * r + 10) * i) / steps;
    top.push([x, y0 + (rand(s) - 0.5) * amp]);
    bot.push([x, y1 + (rand(s) - 0.5) * amp]);
  }
  const line = (p: Pt[]) => p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ');
  return `M ${line(top)} L ${line(bot.reverse())} Z`;
}

function craters(s: Seeded, r: number, base: string, n: number): ReactElement[] {
  return Array.from({ length: n }, (_, i) => {
    const [x, y] = inDisk(s, r * 0.92);
    const cr = 1.5 + rand(s) * 5;
    return (
      <g key={`c${i}`}>
        <circle cx={x} cy={y} r={cr} fill={shade(base, -0.22)} opacity={0.75} />
        <circle cx={x - cr * 0.18} cy={y - cr * 0.18} r={cr * 0.82} fill={shade(base, -0.08)} opacity={0.6} />
      </g>
    );
  });
}

interface Art {
  surface: ReactElement[];
  rings?: { rx: number; ry: number; tilt: number; color: string };
  clip?: string;
}

function buildArt(planetId: string, r: number): Art {
  const p = PLANET_BY_ID[planetId];
  const s = seeded(`planet-${planetId}`);
  const base = p.base;
  const acc = p.accent;
  const out: ReactElement[] = [];
  switch (p.type) {
    case 'star':
      for (let i = 0; i < 18; i++) {
        const [x, y] = inDisk(s, r * 0.85);
        out.push(<path key={`flare${i}`} d={blob(s, x, y, r * (0.08 + rand(s) * 0.2))} fill={i % 3 ? acc : '#e86924'} opacity={0.6} />);
      }
      break;
    case 'moon':
      for (let i = 0; i < 5; i++) {
        const [x, y] = inDisk(s, r * 0.65);
        out.push(<path key={`mare${i}`} d={blob(s, x, y, r * 0.3)} fill={shade(base, -0.3)} opacity={0.65} />);
      }
      out.push(...craters(s, r, base, 22));
      break;
    case 'rocky':
      out.push(...craters(s, r, base, 18));
      out.push(<path key="d" d={blob(s, -r * 0.3, r * 0.2, r * 0.35)} fill={acc} opacity={0.25} />);
      break;
    case 'red':
      for (let i = 0; i < 6; i++) {
        const [x, y] = inDisk(s, r * 0.7);
        out.push(<path key={`b${i}`} d={blob(s, x, y, r * (0.2 + rand(s) * 0.25))} fill={shade(base, -0.28)} opacity={0.55} />);
      }
      out.push(
        <path
          key="vm"
          d={`M ${-r * 0.6} ${r * 0.05} C ${-r * 0.2} ${-r * 0.05}, ${r * 0.1} ${r * 0.15}, ${r * 0.55} ${r * 0.02}`}
          stroke={shade(base, -0.4)}
          strokeWidth={2.2}
          fill="none"
          opacity={0.7}
        />,
      );
      out.push(<ellipse key="pc" cx={0} cy={-r * 0.92} rx={r * 0.45} ry={r * 0.16} fill="#f5efe8" opacity={0.9} />);
      out.push(...craters(s, r, base, 6));
      break;
    case 'cloud':
      for (let i = 0; i < 9; i++) {
        const y = -r + (i / 9) * 2 * r;
        out.push(<path key={`w${i}`} d={wavyBand(s, y, y + r * 0.18, r, 8)} fill={i % 2 ? shade(acc, 0.2) : shade(base, -0.15)} opacity={0.45} />);
      }
      for (let i = 0; i < 4; i++) {
        const [x, y] = inDisk(s, r * 0.6);
        out.push(
          <path
            key={`sw${i}`}
            d={`M ${x - 12} ${y} Q ${x} ${y - 8} ${x + 12} ${y} Q ${x} ${y + 4} ${x - 6} ${y + 1}`}
            stroke={shade(acc, 0.3)}
            strokeWidth={2}
            fill="none"
            opacity={0.5}
          />,
        );
      }
      break;
    case 'ocean':
      for (let i = 0; i < 5; i++) {
        const [x, y] = inDisk(s, r * 0.75);
        const land = i % 2 ? acc : mix(acc, '#c9a66b', 0.45);
        out.push(<path key={`l${i}`} d={blob(s, x, y, r * (0.18 + rand(s) * 0.22), 0.6, 11)} fill={land} />);
      }
      out.push(<ellipse key="np" cx={0} cy={-r * 0.95} rx={r * 0.5} ry={r * 0.14} fill="#f4f8fb" />);
      out.push(<ellipse key="sp" cx={0} cy={r * 0.95} rx={r * 0.55} ry={r * 0.16} fill="#f4f8fb" />);
      for (let i = 0; i < 7; i++) {
        const [x, y] = inDisk(s, r * 0.85);
        out.push(
          <ellipse
            key={`cl${i}`}
            cx={x}
            cy={y}
            rx={6 + rand(s) * 10}
            ry={1.6 + rand(s) * 2}
            fill="#ffffff"
            opacity={0.55}
            transform={`rotate(${(rand(s) - 0.5) * 30} ${x} ${y})`}
          />,
        );
      }
      break;
    case 'asteroid': {
      out.push(...craters(s, r, base, 14));
      out.push(<circle key="spot" cx={r * 0.15} cy={-r * 0.1} r={2.2} fill="#f6f6f0" />);
      const pts: Pt[] = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const rr = r * (0.88 + rand(s) * 0.12);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      return { surface: out, clip: smoothPath(pts) };
    }
    case 'gas': {
      const cols = [base, acc, shade(base, -0.15), shade(acc, 0.1), mix(base, '#8a4b2a', 0.3), acc];
      for (let i = 0; i < 13; i++) {
        const y = -r + (i / 13) * 2 * r;
        out.push(<path key={`g${i}`} d={wavyBand(s, y, y + (2 * r) / 13 + 1, r, 3)} fill={cols[i % cols.length]} opacity={0.9} />);
      }
      out.push(<ellipse key="grs" cx={r * 0.3} cy={r * 0.36} rx={8} ry={4.2} fill="#c0583a" stroke={shade('#c0583a', 0.25)} strokeWidth={1} />);
      break;
    }
    case 'ringed': {
      for (let i = 0; i < 11; i++) {
        const y = -r + (i / 11) * 2 * r;
        out.push(<path key={`g${i}`} d={wavyBand(s, y, y + (2 * r) / 11 + 1, r, 1.5)} fill={i % 2 ? acc : shade(base, -0.08)} opacity={0.85} />);
      }
      return { surface: out, rings: { rx: r * 1.5, ry: r * 0.36, tilt: -16, color: mix(acc, '#c9b07a', 0.4) } };
    }
    case 'ice':
      for (let i = 0; i < 6; i++) {
        const y = -r + (i / 6) * 2 * r;
        out.push(<path key={`i${i}`} d={wavyBand(s, y, y + r * 0.25, r, 2)} fill={i % 2 ? acc : base} opacity={0.35} />);
      }
      return { surface: out, rings: { rx: r * 1.45, ry: r * 0.18, tilt: -78, color: '#cfe9ef' } };
    case 'deep':
      for (let i = 0; i < 6; i++) {
        const y = -r + (i / 6) * 2 * r;
        out.push(<path key={`d${i}`} d={wavyBand(s, y, y + r * 0.22, r, 3)} fill={i % 2 ? acc : shade(base, -0.2)} opacity={0.35} />);
      }
      out.push(<ellipse key="ds" cx={-r * 0.25} cy={r * 0.15} rx={7} ry={4} fill={shade(base, -0.45)} />);
      for (let i = 0; i < 4; i++) {
        const [x, y] = inDisk(s, r * 0.7);
        out.push(<ellipse key={`st${i}`} cx={x} cy={y} rx={7} ry={1} fill="#e8f0ff" opacity={0.7} />);
      }
      break;
    case 'dwarf':
      for (let i = 0; i < 5; i++) {
        const [x, y] = inDisk(s, r * 0.7);
        out.push(<path key={`dr${i}`} d={blob(s, x, y, r * (0.2 + rand(s) * 0.2))} fill={mix(base, '#7a3d2a', 0.4)} opacity={0.6} />);
      }
      out.push(
        <path
          key="heart"
          d={`M ${r * 0.1} ${r * 0.45} C ${-r * 0.5} ${r * 0.05}, ${-r * 0.25} ${-r * 0.4}, ${r * 0.1} ${-r * 0.1} C ${r * 0.45} ${-r * 0.4}, ${r * 0.6} ${r * 0.05}, ${r * 0.1} ${r * 0.45} Z`}
          fill="#f3ebde"
          opacity={0.9}
        />,
      );
      out.push(...craters(s, r, base, 5));
      break;
  }
  return { surface: out };
}

export interface PlanetArtProps {
  planetId: string;
  size?: number | string;
  className?: string;
  ring?: string; // outline colour (e.g. owner)
  dim?: boolean;
}

function PlanetArtImpl({ planetId, size = 80, className, ring, dim }: PlanetArtProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const r = 40;
  const p = PLANET_BY_ID[planetId];
  const art = useMemo(() => buildArt(planetId, r), [planetId]);
  const clip = art.clip ?? `M ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 Z`;
  const rings = art.rings;
  const ringEls = (half: 'back' | 'front') =>
    rings && (
      <g transform={`rotate(${rings.tilt})`} clipPath={`url(#${half}${uid})`}>
        {[0, 1, 2, 3].map((i) => (
          <ellipse
            key={i}
            cx={0}
            cy={0}
            rx={rings.rx - i * 4}
            ry={rings.ry - i * 1}
            fill="none"
            stroke={shade(rings.color, i % 2 ? -0.15 : 0.1)}
            strokeWidth={i === 1 ? 4 : 2.5}
            opacity={0.85}
          />
        ))}
      </g>
    );
  return (
    <svg viewBox="-62 -62 124 124" width={size} height={size} className={className} aria-label={p.name} role="img" style={dim ? { opacity: 0.55 } : undefined}>
      <defs>
        <clipPath id={`pc${uid}`}>
          <path d={clip} />
        </clipPath>
        <clipPath id={`back${uid}`}>
          <rect x={-80} y={-80} width={160} height={80} />
        </clipPath>
        <clipPath id={`front${uid}`}>
          <rect x={-80} y={0} width={160} height={80} />
        </clipPath>
        <radialGradient id={`lit${uid}`} cx="32%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.3} />
          <stop offset="45%" stopColor="#fff" stopOpacity={0} />
          <stop offset="85%" stopColor="#000" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.75} />
        </radialGradient>
        <radialGradient id={`atm${uid}`}>
          <stop offset="80%" stopColor={p.accent} stopOpacity={0.35} />
          <stop offset="100%" stopColor={p.accent} stopOpacity={0} />
        </radialGradient>
      </defs>
      {p.type !== 'asteroid' && <circle r={r + 7} fill={`url(#atm${uid})`} />}
      {ringEls('back')}
      <g clipPath={`url(#pc${uid})`}>
        <rect x={-r - 5} y={-r - 5} width={2 * r + 10} height={2 * r + 10} fill={p.base} />
        {art.surface}
        {p.type !== 'star' && <rect x={-r - 5} y={-r - 5} width={2 * r + 10} height={2 * r + 10} fill={`url(#lit${uid})`} />}
      </g>
      {ringEls('front')}
      {ring && <path d={clip} fill="none" stroke={ring} strokeWidth={3} transform="scale(1.12)" opacity={0.9} />}
    </svg>
  );
}

export const PlanetArt = memo(PlanetArtImpl);
