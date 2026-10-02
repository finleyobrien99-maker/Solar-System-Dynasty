// Procedural character portraits. Everything is derived from a character's
// genes (looks), traits, age and rank, so the same person always looks the
// same and children visibly take after their parents.

import { memo, useId } from 'react';
import { PLANET_BY_ID } from '../game/planets';
import type { Character } from '../game/types';
import { eyeColor, hairColor, mix, shade, skinColor } from './colors';

export interface PortraitProps {
  c: Character;
  year: number;
  rank?: number;
  clanColor?: string;
  trim?: string;
  size?: number | string;
  className?: string;
  title?: string;
}

function has(c: Character, t: string): boolean {
  return c.traits.includes(t);
}

function eduFocus(c: Character): string | undefined {
  const e = c.traits.find((t) => t.startsWith('edu_'));
  return e?.split('_')[1];
}

function PortraitImpl({ c, year, rank = 0, clanColor = '#4a5677', trim = '#d4af37', size = 96, className, title }: PortraitProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const dead = c.died !== undefined;
  const age = (c.died ?? year) - c.born;
  const L = c.looks;
  const planet = PLANET_BY_ID[c.planetId];
  const skin = skinColor(L.skin, c.planetId, c.traits);
  const skinDark = shade(skin, -0.18);
  const skinDeep = shade(skin, -0.35);
  const hair = hairColor(L.hair, c.planetId, age);
  const hairDark = shade(hair, -0.25);
  const psionic = c.traits.find((t) => t.startsWith('psi_'));
  const iris = psionic ? '#c47dff' : eyeColor(L.eyes, c.planetId);
  const male = c.gender === 'M';
  const baby = age < 3;
  const child = age < 13;
  const teen = age >= 13 && age < 17;
  const old = age >= 55;

  // Head geometry.
  const faceW = [15.5, 16.5, 14.8, 17.2][L.face] ?? 16;
  const rx = baby ? 17 : child ? 16.5 : teen ? faceW - 0.5 : faceW;
  const ry = baby ? 16 : child ? 17.5 : 19.5 + (L.face === 2 ? 1 : 0);
  const cx = 50;
  const cy = baby ? 58 : child ? 50 : 44;
  const jaw = [7, 8.5, 6, 10][L.face] ?? 8;
  const headPath = `M ${cx - rx} ${cy} C ${cx - rx} ${cy - ry * 1.25}, ${cx + rx} ${cy - ry * 1.25}, ${cx + rx} ${cy} C ${cx + rx} ${cy + ry * 0.68}, ${cx + jaw} ${cy + ry}, ${cx} ${cy + ry} C ${cx - jaw} ${cy + ry}, ${cx - rx} ${cy + ry * 0.68}, ${cx - rx} ${cy} Z`;

  // Body.
  let sw = male ? 30 : 27;
  if (has(c, 'strong')) sw += 3;
  if (has(c, 'herculean')) sw += 6;
  if (has(c, 'feeble')) sw -= 3;
  if (has(c, 'giant')) sw += 4;
  if (has(c, 'dwarfish')) sw -= 2;
  if (child) sw = baby ? 20 : 22;
  const bodyTop = baby ? 80 : child ? 76 : 71;
  const bodyPath = `M ${50 - sw} 101 L ${50 - sw} ${bodyTop + 16} Q ${50 - sw} ${bodyTop + 3} ${50 - 13} ${bodyTop} L ${50 + 13} ${bodyTop} Q ${50 + sw} ${bodyTop + 3} ${50 + sw} ${bodyTop + 16} L ${50 + sw} 101 Z`;
  const cloth = clanColor;
  const clothDark = shade(cloth, -0.35);
  const focus = eduFocus(c);

  const eyeY = cy - ry * 0.04;
  const eyeDX = child ? 7 : 6.6;
  const eyeRX = child ? 3.6 : 3.2;
  const eyeRY = child ? 2.7 : 1.9;
  const mouthY = cy + ry * 0.52;
  const noseY = eyeY + 2;

  const expression = has(c, 'kind') || has(c, 'gregarious') ? 'smile' : has(c, 'wrathful') || has(c, 'cruel') || has(c, 'depressed') ? 'frown' : has(c, 'arrogant') || has(c, 'deceitful') ? 'smirk' : 'neutral';
  const browAngle = has(c, 'wrathful') || has(c, 'cruel') ? 1.4 : has(c, 'kind') || has(c, 'trusting') ? -0.8 : 0;

  const style = L.hairStyle;
  const longHair = !baby && (style === 2 || style === 5 || (!male && style === 6));
  const bald = male && old && (style === 0 || style === 7 || L.face % 2 === 0) && age > 58;
  const beardType = male && age >= 18 ? L.beard : 0;

  const bg1 = shade(planet?.base ?? '#334', -0.45);
  const bg2 = shade(planet?.base ?? '#334', -0.75);

  // ── Hair shapes
  const hs = longHair ? ry * 0.1 : -ry * 0.12;
  const capPath = (() => {
    const top = cy - ry * 1.38;
    if (style === 4)
      return `M ${cx - 4} ${cy - ry * 0.55} C ${cx - 5} ${top - 6}, ${cx + 5} ${top - 6}, ${cx + 4} ${cy - ry * 0.55} Z`;
    if (style === 7)
      return `M ${cx - rx + 1} ${cy - ry * 0.35} C ${cx - rx} ${top + 1}, ${cx + rx} ${top + 1}, ${cx + rx - 1} ${cy - ry * 0.35} C ${cx + rx * 0.5} ${cy - ry * 0.7}, ${cx - rx * 0.5} ${cy - ry * 0.7}, ${cx - rx + 1} ${cy - ry * 0.35} Z`;
    const part = style === 1 ? 4 : style === 6 ? 0 : -1;
    return `M ${cx - rx - 1.6} ${cy + hs} C ${cx - rx - 2.5} ${top}, ${cx + rx + 2.5} ${top}, ${cx + rx + 1.6} ${cy + hs} L ${cx + rx - 1.2} ${cy - ry * 0.22} C ${cx + rx * 0.45 + part} ${cy - ry * 0.62}, ${cx - rx * 0.45 + part} ${cy - ry * (style === 6 ? 0.45 : 0.66)}, ${cx - rx + 1.2} ${cy - ry * 0.22} Z`;
  })();
  const backHair = longHair
    ? style === 5
      ? null
      : `M ${cx - rx - 2.5} ${cy - ry * 0.2} C ${cx - rx - 7} ${cy + ry * 0.9}, ${cx - rx - 3} ${cy + ry * 1.55}, ${cx - rx + 3} ${cy + ry * 1.6} L ${cx + rx - 3} ${cy + ry * 1.6} C ${cx + rx + 3} ${cy + ry * 1.55}, ${cx + rx + 7} ${cy + ry * 0.9}, ${cx + rx + 2.5} ${cy - ry * 0.2} Z`
    : null;

  // ── Crown by rank
  const crown = (() => {
    if (baby || rank <= 0 || c.prisonerOf) return null;
    const by = cy - ry * 0.72;
    const w = rx + 1.5;
    const gold = rank >= 3 ? '#f2c94c' : '#d9d9e3';
    const goldDark = shade(gold, -0.35);
    const band = `M ${cx - w} ${by} Q ${cx} ${by + 3} ${cx + w} ${by} L ${cx + w} ${by - 3} Q ${cx} ${by} ${cx - w} ${by - 3} Z`;
    const pts: string[] = [];
    if (rank === 2) {
      for (const dx of [-0.6, 0, 0.6]) {
        const x = cx + dx * w;
        pts.push(`M ${x - 2.4} ${by - 2.6} L ${x} ${by - 7} L ${x + 2.4} ${by - 2.6} Z`);
      }
    }
    if (rank === 3) {
      for (const dx of [-0.8, -0.4, 0, 0.4, 0.8]) {
        const x = cx + dx * w;
        const h = dx === 0 ? 11 : Math.abs(dx) < 0.5 ? 9 : 7;
        pts.push(`M ${x - 2.2} ${by - 2.6} L ${x} ${by - h} L ${x + 2.2} ${by - 2.6} Z`);
      }
    }
    return (
      <g>
        {rank === 4 && (
          <g opacity={0.95}>
            {Array.from({ length: 11 }, (_, i) => {
              const a = Math.PI + (i / 10) * Math.PI;
              const x1 = cx + Math.cos(a) * (w - 1);
              const y1 = by - 2 + Math.sin(a) * 4;
              const x2 = cx + Math.cos(a) * (w + 9);
              const y2 = by - 4 + Math.sin(a) * 16;
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffd166" strokeWidth={1.6} strokeLinecap="round" />;
            })}
            <circle cx={cx} cy={by - 6} r={4} fill="#ffd166" stroke="#e09f3e" strokeWidth={0.8} />
          </g>
        )}
        {pts.map((d, i) => (
          <path key={i} d={d} fill={gold} stroke={goldDark} strokeWidth={0.5} />
        ))}
        <path d={band} fill={gold} stroke={goldDark} strokeWidth={0.6} />
        <circle cx={cx} cy={by - 1.2} r={rank >= 2 ? 1.5 : 1} fill={rank >= 3 ? '#e63946' : '#4cc9f0'} />
        {rank === 3 && (
          <>
            <circle cx={cx - w * 0.5} cy={by - 1} r={1} fill="#4cc9f0" />
            <circle cx={cx + w * 0.5} cy={by - 1} r={1} fill="#4cc9f0" />
          </>
        )}
      </g>
    );
  })();

  // ── Eyes
  const eye = (side: -1 | 1) => {
    const x = cx + side * eyeDX;
    const cyber = side === 1 && (has(c, 'optic_implant') || has(c, 'full_conversion'));
    if (baby) {
      return <path key={side} d={`M ${x - 2.5} ${eyeY} Q ${x} ${eyeY + 1.6} ${x + 2.5} ${eyeY}`} stroke={skinDeep} strokeWidth={0.9} fill="none" strokeLinecap="round" />;
    }
    if (cyber) {
      return (
        <g key={side}>
          <circle cx={x} cy={eyeY} r={eyeRX + 0.8} fill="#5c6670" stroke="#2b3138" strokeWidth={0.6} />
          <circle cx={x} cy={eyeY} r={1.9} fill={has(c, 'full_conversion') ? '#4cf2ff' : '#ff3b3b'} filter={`url(#glow${uid})`} />
        </g>
      );
    }
    const pupil = has(c, 'lunatic') ? 0.45 : 0.75;
    return (
      <g key={side}>
        <ellipse cx={x} cy={eyeY} rx={eyeRX} ry={eyeRY} fill="#f8f4ef" />
        <circle cx={x} cy={eyeY} r={child ? 2 : 1.55} fill={iris} filter={psionic ? `url(#glow${uid})` : undefined} />
        <circle cx={x} cy={eyeY} r={pupil} fill="#111" />
        <circle cx={x + 0.55} cy={eyeY - 0.55} r={0.45} fill="#fff" />
        <path d={`M ${x - eyeRX - 0.3} ${eyeY + 0.2} Q ${x} ${eyeY - eyeRY * 1.9} ${x + eyeRX + 0.3} ${eyeY + 0.2}`} stroke={shade(skin, -0.55)} strokeWidth={male ? 0.7 : 1.05} fill="none" />
        {(old || has(c, 'ill') || has(c, 'stim_addict')) && (
          <path d={`M ${x - 2.4} ${eyeY + 2.6} Q ${x} ${eyeY + 3.6} ${x + 2.4} ${eyeY + 2.6}`} stroke={skinDeep} strokeWidth={0.5} fill="none" opacity={0.7} />
        )}
      </g>
    );
  };

  const brow = (side: -1 | 1) => {
    const x = cx + side * eyeDX;
    const y = eyeY - (child ? 4.6 : 4.1) - (L.brow === 2 ? 0.6 : 0);
    const inner = x - side * 3.4;
    const outer = x + side * 3.4;
    const lift = has(c, 'lunatic') && side === 1 ? -1.6 : 0;
    return (
      <path
        key={side}
        d={`M ${inner} ${y + browAngle + lift} Q ${x} ${y - 1.4 + lift} ${outer} ${y + 0.4 + lift}`}
        stroke={baby ? 'transparent' : hairDark}
        strokeWidth={(male ? 1.35 : 0.85) + L.brow * 0.25}
        strokeLinecap="round"
        fill="none"
      />
    );
  };

  const noseScale = has(c, 'hideous') ? 1.35 : has(c, 'beautiful') || has(c, 'radiant') ? 0.85 : 1;
  const nose = (() => {
    if (baby) return <circle cx={cx} cy={noseY + 4} r={0.8} fill={skinDark} />;
    const k = noseScale * (child ? 0.8 : 1);
    switch (L.nose) {
      case 1:
        return <path d={`M ${cx - 1.6 * k} ${noseY + 6.6 * k} Q ${cx} ${noseY + 7.8 * k} ${cx + 1.6 * k} ${noseY + 6.6 * k}`} stroke={skinDeep} strokeWidth={0.8} fill="none" strokeLinecap="round" />;
      case 2:
        return <path d={`M ${cx - 0.3} ${noseY} L ${cx - 1.4 * k} ${noseY + 8 * k} Q ${cx} ${noseY + 9 * k} ${cx + 1.6 * k} ${noseY + 8 * k}`} stroke={skinDeep} strokeWidth={0.8} fill="none" strokeLinecap="round" />;
      case 3:
        return <path d={`M ${cx - 2.6 * k} ${noseY + 7 * k} Q ${cx - 3 * k} ${noseY + 8.8 * k} ${cx} ${noseY + 8.6 * k} Q ${cx + 3 * k} ${noseY + 8.8 * k} ${cx + 2.6 * k} ${noseY + 7 * k}`} stroke={skinDeep} strokeWidth={0.85} fill="none" strokeLinecap="round" />;
      default:
        return <path d={`M ${cx - 0.4} ${noseY + 1} Q ${cx - 2.2 * k} ${noseY + 7.6 * k} ${cx - 0.6} ${noseY + 8.2 * k} Q ${cx + 0.9} ${noseY + 8.8 * k} ${cx + 2} ${noseY + 7.8 * k}`} stroke={skinDeep} strokeWidth={0.8} fill="none" strokeLinecap="round" />;
    }
  })();

  const mouth = (() => {
    const w = (child ? 3.2 : 3.8) + (L.mouth === 1 ? 0.6 : L.mouth === 3 ? -0.4 : 0);
    const lip = mix(skin, '#c2454b', male ? 0.18 : 0.42);
    const curve = expression === 'smile' ? 2.4 : expression === 'frown' ? -1.8 : 0.5;
    if (expression === 'smirk') {
      return <path d={`M ${cx - w} ${mouthY + 0.4} Q ${cx} ${mouthY + 1} ${cx + w} ${mouthY - 1.2}`} stroke={shade(lip, -0.3)} strokeWidth={1} fill="none" strokeLinecap="round" />;
    }
    return (
      <g>
        {!male && !child && <path d={`M ${cx - w} ${mouthY} Q ${cx} ${mouthY - 1.6} ${cx + w} ${mouthY} Q ${cx} ${mouthY + 2.4 + curve * 0.3} ${cx - w} ${mouthY} Z`} fill={lip} opacity={0.85} />}
        <path d={`M ${cx - w} ${mouthY} Q ${cx} ${mouthY + curve} ${cx + w} ${mouthY}`} stroke={shade(lip, -0.35)} strokeWidth={0.95} fill="none" strokeLinecap="round" />
      </g>
    );
  })();

  const beard = (() => {
    if (!beardType) return null;
    const col = hair;
    if (beardType === 1) {
      return <path d={`M ${cx - rx + 1} ${cy + 3} C ${cx - rx + 1} ${cy + ry * 0.75}, ${cx - jaw} ${cy + ry}, ${cx} ${cy + ry} C ${cx + jaw} ${cy + ry}, ${cx + rx - 1} ${cy + ry * 0.75}, ${cx + rx - 1} ${cy + 3} C ${cx + rx - 4} ${cy + ry * 0.55}, ${cx - rx + 4} ${cy + ry * 0.55}, ${cx - rx + 1} ${cy + 3} Z`} fill={col} opacity={0.32} />;
    }
    if (beardType === 2) {
      return (
        <g fill={col}>
          <path d={`M ${cx - 4.5} ${mouthY - 1.6} Q ${cx} ${mouthY - 3.4} ${cx + 4.5} ${mouthY - 1.6} Q ${cx} ${mouthY - 1.8} ${cx - 4.5} ${mouthY - 1.6} Z`} />
          <path d={`M ${cx - 3} ${mouthY + 2.2} Q ${cx} ${mouthY + 1.6} ${cx + 3} ${mouthY + 2.2} L ${cx + 1.8} ${cy + ry + 2.5} Q ${cx} ${cy + ry + 3.5} ${cx - 1.8} ${cy + ry + 2.5} Z`} />
        </g>
      );
    }
    return (
      <path
        d={`M ${cx - rx + 0.5} ${cy + 1} C ${cx - rx} ${cy + ry * 0.95}, ${cx - jaw - 2} ${cy + ry + 6}, ${cx} ${cy + ry + 6} C ${cx + jaw + 2} ${cy + ry + 6}, ${cx + rx} ${cy + ry * 0.95}, ${cx + rx - 0.5} ${cy + 1} C ${cx + rx - 3} ${cy + ry * 0.45}, ${cx + 6} ${mouthY - 3.5}, ${cx} ${mouthY - 2.6} C ${cx - 6} ${mouthY - 3.5}, ${cx - rx + 3} ${cy + ry * 0.45}, ${cx - rx + 0.5} ${cy + 1} Z`}
        fill={col}
      />
    );
  })();

  const clothes = (() => {
    if (baby) {
      return <path d={`M 20 101 Q 18 72 50 70 Q 82 72 80 101 Z`} fill={shade(cloth, 0.55)} stroke={shade(cloth, 0.2)} strokeWidth={1} />;
    }
    return (
      <g>
        <path d={bodyPath} fill={cloth} />
        {/* collar */}
        {focus === 'cmd' ? (
          <>
            <path d={`M 50 ${bodyTop + 1} L ${50 - 9} ${bodyTop} L ${50 - 7} ${bodyTop + 9} Z M 50 ${bodyTop + 1} L ${50 + 9} ${bodyTop} L ${50 + 7} ${bodyTop + 9} Z`} fill={trim} />
            <rect x={50 - sw + 2} y={bodyTop + 4} width={10} height={3} rx={1} fill={trim} />
            <rect x={50 + sw - 12} y={bodyTop + 4} width={10} height={3} rx={1} fill={trim} />
          </>
        ) : focus === 'sci' ? (
          <path d={`M ${50 - 14} ${bodyTop} Q 50 ${bodyTop + 22} ${50 + 14} ${bodyTop} L ${50 + 11} ${bodyTop + 2} Q 50 ${bodyTop + 16} ${50 - 11} ${bodyTop + 2} Z`} fill={trim} opacity={0.9} />
        ) : focus === 'int' ? (
          <path d={`M ${50 - 13} ${bodyTop - 4} L ${50 - 5} ${bodyTop + 14} L 50 ${bodyTop + 4} L ${50 + 5} ${bodyTop + 14} L ${50 + 13} ${bodyTop - 4} L ${50 + 15} ${bodyTop + 2} L 50 ${bodyTop + 22} L ${50 - 15} ${bodyTop + 2} Z`} fill={clothDark} />
        ) : focus === 'dip' ? (
          <path d={`M ${50 - sw + 4} ${bodyTop + 6} L ${50 - sw + 9} ${bodyTop + 3} L ${50 + sw - 3} 101 L ${50 + sw - 10} 101 Z`} fill={trim} opacity={0.9} />
        ) : focus === 'eco' ? (
          <>
            <path d={`M ${50 - 10} ${bodyTop + 1} Q 50 ${bodyTop + 14} ${50 + 10} ${bodyTop + 1}`} stroke={trim} strokeWidth={1} fill="none" />
            <circle cx={50} cy={bodyTop + 13} r={2.6} fill={trim} />
          </>
        ) : (
          <path d={`M ${50 - 8} ${bodyTop} L 50 ${bodyTop + 9} L ${50 + 8} ${bodyTop}`} stroke={trim} strokeWidth={1.4} fill="none" />
        )}
        {has(c, 'bionic_arm') && <circle cx={50 + sw - 4} cy={bodyTop + 10} r={3.4} fill="#8a96a3" stroke="#3b444d" strokeWidth={0.6} />}
        {rank >= 3 && <path d={`M ${50 - sw} ${bodyTop + 14} Q ${50 - sw + 3} ${bodyTop + 4} ${50 - 13} ${bodyTop} L ${50 - 13} ${bodyTop + 4} Q ${50 - sw + 6} ${bodyTop + 8} ${50 - sw + 2} 101 L ${50 - sw} 101 Z`} fill="#7a1022" opacity={0.85} />}
      </g>
    );
  })();

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title ?? c.name}
      style={dead ? { filter: 'grayscale(1)', opacity: 0.75 } : undefined}
    >
      <defs>
        <radialGradient id={`bg${uid}`} cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor={bg1} />
          <stop offset="100%" stopColor={bg2} />
        </radialGradient>
        <radialGradient id={`aura${uid}`}>
          <stop offset="0%" stopColor="#b26bff" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#b26bff" stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`face${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={shade(skin, 0.06)} />
          <stop offset="100%" stopColor={skinDark} />
        </linearGradient>
        <filter id={`glow${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.9" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id={`frame${uid}`}>
          <rect x="0" y="0" width="100" height="100" rx="12" />
        </clipPath>
      </defs>
      <g clipPath={`url(#frame${uid})`}>
        <rect width="100" height="100" fill={`url(#bg${uid})`} />
        {[...Array(7)].map((_, i) => (
          <circle key={i} cx={(i * 37 + c.born * 13) % 100} cy={(i * 23 + c.born * 7) % 60} r={0.5 + (i % 3) * 0.25} fill="#fff" opacity={0.35} />
        ))}
        {psionic && <circle cx={cx} cy={cy} r={rx + (psionic === 'psi_ascendant' ? 22 : 14)} fill={`url(#aura${uid})`} />}
        {has(c, 'blessed') && <ellipse cx={cx} cy={cy - ry - 3} rx={rx * 0.8} ry={3} fill="none" stroke="#ffe08a" strokeWidth={1.4} opacity={0.85} />}
        {backHair && !bald && <path d={backHair} fill={hairDark} />}
        {style === 5 && !baby && !bald && (
          <>
            <rect x={cx - rx - 3} y={cy - 2} width={4.5} height={ry * 1.7} rx={2.2} fill={hairDark} />
            <rect x={cx + rx - 1.5} y={cy - 2} width={4.5} height={ry * 1.7} rx={2.2} fill={hairDark} />
          </>
        )}
        {clothes}
        {!baby && <path d={`M ${cx - 5.5} ${cy + ry * 0.6} L ${cx - 5.5} ${bodyTop + 3} Q ${cx} ${bodyTop + 7} ${cx + 5.5} ${bodyTop + 3} L ${cx + 5.5} ${cy + ry * 0.6} Z`} fill={skinDark} />}
        <ellipse cx={cx - rx + 0.3} cy={eyeY + 2.5} rx={2.3} ry={3.6} fill={skinDark} />
        <ellipse cx={cx + rx - 0.3} cy={eyeY + 2.5} rx={2.3} ry={3.6} fill={skinDark} />
        <path d={headPath} fill={`url(#face${uid})`} />
        {(child || !male) && <>
          <ellipse cx={cx - eyeDX - 1} cy={mouthY - 3} rx={3} ry={1.8} fill="#e0727a" opacity={0.16} />
          <ellipse cx={cx + eyeDX + 1} cy={mouthY - 3} rx={3} ry={1.8} fill="#e0727a" opacity={0.16} />
        </>}
        {has(c, 'full_conversion') && <path d={`M ${cx} ${cy - ry * 0.9} L ${cx + rx} ${cy - ry * 0.3} L ${cx + rx} ${cy + ry * 0.5} L ${cx + 2} ${cy + ry * 0.95} Z`} fill="#7d8894" opacity={0.85} />}
        {old && !baby && (
          <g stroke={skinDeep} strokeWidth={0.45} fill="none" opacity={0.55}>
            <path d={`M ${cx - 6} ${cy - ry * 0.5} Q ${cx} ${cy - ry * 0.56} ${cx + 6} ${cy - ry * 0.5}`} />
            {age > 64 && <path d={`M ${cx - 5} ${cy - ry * 0.42} Q ${cx} ${cy - ry * 0.47} ${cx + 5} ${cy - ry * 0.42}`} />}
            <path d={`M ${cx - 5.2} ${noseY + 7} Q ${cx - 6.5} ${mouthY} ${cx - 5} ${mouthY + 2}`} />
            <path d={`M ${cx + 5.2} ${noseY + 7} Q ${cx + 6.5} ${mouthY} ${cx + 5} ${mouthY + 2}`} />
          </g>
        )}
        {beard}
        {eye(-1)}
        {eye(1)}
        {brow(-1)}
        {brow(1)}
        {nose}
        {mouth}
        {has(c, 'bioluminescent') && (
          <g fill="#6ff7ff" filter={`url(#glow${uid})`} opacity={0.85}>
            {[-1, 1].map((sd) => (
              <g key={sd}>
                <circle cx={cx + sd * (eyeDX + 2.5)} cy={eyeY + 5} r={0.7} />
                <circle cx={cx + sd * (eyeDX + 3.8)} cy={eyeY + 3.2} r={0.55} />
                <circle cx={cx + sd * (eyeDX + 1.2)} cy={eyeY + 6.4} r={0.5} />
              </g>
            ))}
            <circle cx={cx} cy={cy - ry * 0.55} r={0.8} />
          </g>
        )}
        {has(c, 'neural_lace') && (
          <g stroke="#4cf2ff" strokeWidth={0.5} fill="none" opacity={0.9}>
            <path d={`M ${cx - rx + 2} ${eyeY - 4} l 3 -2 l 0 -3 M ${cx - rx + 2} ${eyeY - 1} l 4 0 l 1 -2`} />
            <circle cx={cx - rx + 5} cy={eyeY - 9} r={0.7} fill="#4cf2ff" />
          </g>
        )}
        {has(c, 'scarred') && <path d={`M ${cx - eyeDX - 3} ${eyeY - 5} L ${cx - eyeDX + 2} ${eyeY + 6}`} stroke="#9e4b4b" strokeWidth={1} strokeLinecap="round" opacity={0.85} />}
        {!baby && !bald && <path d={capPath} fill={hair} />}
        {bald && (
          <>
            <path d={`M ${cx - rx - 1} ${cy - 2} Q ${cx - rx} ${cy - ry * 0.55} ${cx - rx + 4} ${cy - ry * 0.6} L ${cx - rx + 2} ${cy - 1} Z`} fill={hair} />
            <path d={`M ${cx + rx + 1} ${cy - 2} Q ${cx + rx} ${cy - ry * 0.55} ${cx + rx - 4} ${cy - ry * 0.6} L ${cx + rx - 2} ${cy - 1} Z`} fill={hair} />
          </>
        )}
        {style === 3 && !baby && !bald && <circle cx={cx} cy={cy - ry * 1.1} r={5.5} fill={hair} />}
        {baby && <path d={`M ${cx - 2} ${cy - ry + 1} q 2 -4 4 0`} stroke={hair} strokeWidth={1.2} fill="none" />}
        {has(c, 'wounded') && (
          <g>
            <path d={`M ${cx - rx} ${cy - ry * 0.45} Q ${cx} ${cy - ry * 0.7} ${cx + rx} ${cy - ry * 0.45} L ${cx + rx} ${cy - ry * 0.3} Q ${cx} ${cy - ry * 0.55} ${cx - rx} ${cy - ry * 0.3} Z`} fill="#eee" />
            <circle cx={cx + 5} cy={cy - ry * 0.5} r={1.2} fill="#c0392b" />
          </g>
        )}
        {crown}
        {c.prisonerOf && (
          <g stroke="#9aa3ad" strokeWidth={2.2}>
            {[16, 34, 50, 66, 84].map((x) => (
              <line key={x} x1={x} y1={0} x2={x} y2={100} />
            ))}
          </g>
        )}
      </g>
      <rect x="0.75" y="0.75" width="98.5" height="98.5" rx="12" fill="none" stroke={dead ? '#666' : shade(clanColor, 0.25)} strokeWidth={1.5} />
    </svg>
  );
}

export const Portrait = memo(PortraitImpl);
