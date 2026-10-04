// Tiny Voronoi: each region is the disc clipped by the half-planes that keep
// it closer to its own site than to any other. Good for a dozen sites.

export type Pt = [number, number];

function clip(poly: Pt[], a: Pt, b: Pt): Pt[] {
  // Keep points p with (p - m)·(b - a) <= 0 where m is the midpoint of a-b.
  const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const n: Pt = [b[0] - a[0], b[1] - a[1]];
  const side = (p: Pt) => (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1];
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if (sp <= 0 !== sq <= 0) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

export function voronoiInDisc(sites: Pt[], cx: number, cy: number, r: number, segments = 64): Pt[][] {
  const disc: Pt[] = Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
  return sites.map((s, i) => {
    let poly = disc;
    sites.forEach((o, j) => {
      if (i !== j && poly.length) poly = clip(poly, s, o);
    });
    return poly;
  });
}

export function centroid(poly: Pt[]): Pt {
  let x = 0;
  let y = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const f = x0 * y1 - x1 * y0;
    a += f;
    x += (x0 + x1) * f;
    y += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-6) return poly[0] ?? [0, 0];
  return [x / (3 * a), y / (3 * a)];
}

export function polyPath(poly: Pt[]): string {
  return poly.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ' Z';
}
