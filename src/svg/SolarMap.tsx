// The whole solar system: a ruled Sun, worlds and independent moons, who rules
// each one, and where you hold land.

import { memo, useMemo } from 'react';
import { clanRegions, planetSovereign } from '../game/core';
import { PLANETS, PLANET_BY_ID, type PlanetDef } from '../game/planets';
import { hashString, rand, seeded } from '../game/rng';
import type { GameState } from '../game/types';
import { PlanetArt } from './PlanetArt';

const ORBIT_R = [0, 92, 132, 172, 214, 254, 306, 358, 406, 452, 496];
const FLAT = 0.52;

function planetSize(p: PlanetDef): number {
  switch (p.type) {
    case 'star':
      return 76;
    case 'moon':
      return 26;
    case 'gas':
      return 58;
    case 'ringed':
      return 62;
    case 'ice':
    case 'deep':
      return 44;
    case 'asteroid':
      return 24;
    case 'dwarf':
      return 22;
    default:
      return 32;
  }
}

export function planetPos(p: PlanetDef, year: number): [number, number] {
  if (p.type === 'star') return [0, 0];
  if (p.parentId) {
    const [x, y] = planetPos(PLANET_BY_ID[p.parentId], year);
    return [x + 44, y - 54];
  }
  // Golden-angle spacing keeps worlds spread out; inner worlds move faster.
  const base = (p.orbit * 137.5 + (hashString(p.id) % 20)) * (Math.PI / 180);
  const a = base + (year * (9 / p.orbit) * Math.PI) / 180;
  const r = ORBIT_R[p.orbit];
  return [Math.cos(a) * r, Math.sin(a) * r * FLAT];
}

interface Props {
  s: GameState;
  selected?: string;
  onSelect: (planetId: string) => void;
}

function SolarMapImpl({ s, selected, onSelect }: Props) {
  const belt = useMemo(() => {
    const r = seeded('belt');
    return Array.from({ length: 160 }, () => {
      const a = rand(r) * Math.PI * 2;
      const d = ORBIT_R[5] + (rand(r) - 0.5) * 30;
      return [Math.cos(a) * d, Math.sin(a) * d * FLAT, 0.6 + rand(r) * 1.4] as const;
    });
  }, []);
  const kuiper = useMemo(() => {
    const r = seeded('kuiper');
    return Array.from({ length: 120 }, () => {
      const a = rand(r) * Math.PI * 2;
      const d = 505 + rand(r) * 25;
      return [Math.cos(a) * d, Math.sin(a) * d * FLAT, 0.5 + rand(r)] as const;
    });
  }, []);
  const stars = useMemo(() => {
    const r = seeded('stars');
    return Array.from({ length: 140 }, () => [(rand(r) - 0.5) * 1100, (rand(r) - 0.5) * 640, rand(r) * 1.2 + 0.2] as const);
  }, []);

  const myPlanets = new Set(clanRegions(s, s.playerClanId).map((r) => r.planetId));
  const warPlanets = new Set(s.wars.flatMap((w) => clanRegions(s, w.enemy).map((r) => r.planetId)));
  const ordered = PLANETS.map((p) => ({ p, pos: planetPos(p, s.year) })).sort((a, b) => a.pos[1] - b.pos[1]);
  const home = PLANETS.find((p) => p.id === s.clans[s.playerClanId]?.planetId);
  const homePos = home ? planetPos(home, s.year) : [0, 0];

  return (
    <svg viewBox="-550 -300 1100 600" className="solar-map" role="group" aria-label="Map of the solar system">
      <defs>
        <radialGradient id="sunGlow">
          <stop offset="0%" stopColor="#fff6d5" />
          <stop offset="25%" stopColor="#ffd166" />
          <stop offset="55%" stopColor="#ff9f1c" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#ff6b00" stopOpacity={0} />
        </radialGradient>
      </defs>
      {stars.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={0.5} />
      ))}
      {PLANETS.filter((p) => p.orbit > 0 && !p.parentId).map((p) => (
        <ellipse
          key={p.id}
          cx={0}
          cy={0}
          rx={ORBIT_R[p.orbit]}
          ry={ORBIT_R[p.orbit] * FLAT}
          fill="none"
          stroke={myPlanets.has(p.id) ? '#ffd16655' : '#ffffff1c'}
          strokeWidth={myPlanets.has(p.id) ? 1.6 : 1}
        />
      ))}
      {belt.map(([x, y, r], i) => (
        <circle key={`b${i}`} cx={x} cy={y} r={r} fill="#a59f92" opacity={0.55} />
      ))}
      {kuiper.map(([x, y, r], i) => (
        <circle key={`k${i}`} cx={x} cy={y} r={r} fill="#9db3c9" opacity={0.35} />
      ))}
      <circle r={70} fill="url(#sunGlow)" />
      {PLANETS.filter((p) => p.parentId).map((p) => {
        const a = planetPos(PLANET_BY_ID[p.parentId!], s.year);
        const b = planetPos(p, s.year);
        return <line key={p.id} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#ffffff44" strokeDasharray="2 4" />;
      })}
      {s.routes.map((r) => {
        const from = PLANETS.find((p) => p.id === s.regions[r.from]?.planetId);
        const to = PLANETS.find((p) => p.id === r.planetId);
        if (!from || !to) return null;
        const a = planetPos(from, s.year);
        const b = planetPos(to, s.year);
        return (
          <line
            key={`trade${r.id}`}
            x1={a[0]}
            y1={a[1]}
            x2={b[0]}
            y2={b[1]}
            stroke="#ffd166"
            strokeWidth={1.6}
            strokeDasharray="2 6"
            strokeLinecap="round"
            opacity={0.75}
          />
        );
      })}
      {ordered
        .filter(({ p }) => warPlanets.has(p.id))
        .map(({ p, pos }) => (
          <line
            key={`war${p.id}`}
            x1={homePos[0]}
            y1={homePos[1]}
            x2={pos[0]}
            y2={pos[1]}
            stroke="#ff4d4d"
            strokeWidth={2}
            strokeDasharray="8 6"
            opacity={0.8}
          />
        ))}
      {ordered.map(({ p, pos }) => {
        const size = planetSize(p);
        const sov = planetSovereign(s, p.id);
        const sovClan = sov ? s.clans[sov] : undefined;
        const mine = myPlanets.has(p.id);
        const isSel = selected === p.id;
        return (
          <g
            key={p.id}
            transform={`translate(${pos[0]} ${pos[1]})`}
            className="solar-planet"
            onClick={() => onSelect(p.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(p.id);
              }
            }}
            aria-label={`${p.name}, ruled by House ${sovClan?.name ?? 'nobody'}`}
            aria-pressed={isSel}
          >
            {isSel && <circle r={size * 0.72} fill="none" stroke="#ffd166" strokeWidth={2.5} strokeDasharray="5 4" />}
            <circle r={size * 0.62} fill="transparent" />
            <g transform={`translate(${-size / 2} ${-size / 2})`}>
              <PlanetArt planetId={p.id} size={size} ring={sovClan?.color} />
            </g>
            <text y={size * 0.62 + 14} textAnchor="middle" className="map-label">
              {p.name}
            </text>
            <text y={size * 0.62 + 27} textAnchor="middle" className="map-sublabel">
              {sovClan ? `House ${sovClan.name}${sovClan.isPlayer ? ' (you)' : ''}` : ''}
            </text>
            {mine && (
              <polygon
                points="0,-6 1.8,-1.8 6,-1.5 2.8,1.3 3.7,5.5 0,3.3 -3.7,5.5 -2.8,1.3 -6,-1.5 -1.8,-1.8"
                transform={`translate(${size * 0.45} ${-size * 0.45}) scale(1.4)`}
                fill="#ffd166"
                stroke="#7a5b00"
                strokeWidth={0.6}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

export const SolarMap = memo(SolarMapImpl);
