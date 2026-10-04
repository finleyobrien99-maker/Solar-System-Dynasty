// A single world split into regions, each painted in its holder's colours.

import { memo, useMemo } from 'react';
import { planetRegions } from '../game/core';
import type { GameState } from '../game/types';
import { shade } from './colors';
import { PlanetArt } from './PlanetArt';
import { centroid, polyPath, voronoiInDisc, type Pt } from './voronoi';

interface Props {
  s: GameState;
  planetId: string;
  selected?: string;
  onSelect: (regionId: string) => void;
}

const SIZE = 400;
const R = 176;

function PlanetMapImpl({ s, planetId, selected, onSelect }: Props) {
  const regions = planetRegions(s, planetId);
  const cells = useMemo(() => {
    const sites: Pt[] = regions.map((r) => [r.site[0] * SIZE, r.site[1] * SIZE]);
    return voronoiInDisc(sites, SIZE / 2, SIZE / 2, R);
    // Sites never move, so regions' ids are a stable key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planetId, regions.length]);
  const warTargets = new Set(s.wars.map((w) => w.target));
  const artSize = (R * 124) / 40;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="planet-map" role="group" aria-label="Regions of this world">
      <defs>
        <clipPath id={`disc-${planetId}`}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} />
        </clipPath>
        <pattern id="claimHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#ffd166" strokeWidth="2" opacity="0.5" />
        </pattern>
      </defs>
      <g transform={`translate(${SIZE / 2 - artSize / 2} ${SIZE / 2 - artSize / 2})`}>
        <PlanetArt planetId={planetId} size={artSize} />
      </g>
      <g clipPath={`url(#disc-${planetId})`}>
        {regions.map((r, i) => {
          const clan = s.clans[r.owner];
          const mine = r.owner === s.playerClanId;
          const poly = cells[i];
          if (!poly || poly.length < 3) return null;
          return (
            <g
              key={r.id}
              className="region"
              onClick={() => onSelect(r.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(r.id);
                }
              }}
              aria-label={`${r.name}, held by House ${clan?.name}`}
            >
              <path
                d={polyPath(poly)}
                fill={clan?.color ?? '#555'}
                fillOpacity={selected === r.id ? 0.7 : 0.48}
                stroke={shade(clan?.color ?? '#555', -0.55)}
                strokeWidth={1.5}
              />
              {s.claims.includes(r.id) && <path d={polyPath(poly)} fill="url(#claimHatch)" />}
              {mine && <path d={polyPath(poly)} fill="none" stroke="#ffd166" strokeWidth={3} strokeDasharray="6 4" />}
              {warTargets.has(r.id) && <path d={polyPath(poly)} fill="none" stroke="#ff4d4d" strokeWidth={3} />}
            </g>
          );
        })}
      </g>
      <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#ffffff44" strokeWidth={2} />
      {regions.map((r, i) => {
        const poly = cells[i];
        if (!poly || poly.length < 3) return null;
        const [x, y] = centroid(poly);
        return (
          <g key={`l${r.id}`} pointerEvents="none">
            {r.capital && (
              <polygon
                points={`${x - 8},${y - 12} ${x - 9},${y - 22} ${x - 4},${y - 17} ${x},${y - 24} ${x + 4},${y - 17} ${x + 9},${y - 22} ${x + 8},${y - 12}`}
                fill="#ffd166"
                stroke="#5b4300"
                strokeWidth={1}
              />
            )}
            <text x={x} y={y + 2} textAnchor="middle" className="region-label">
              {r.name}
            </text>
            <text x={x} y={y + 15} textAnchor="middle" className="region-sublabel">
              {s.clans[r.owner]?.name} · dev {r.dev}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export const PlanetMap = memo(PlanetMapImpl);
