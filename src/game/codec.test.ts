import { describe, expect, it } from 'vitest';
import { deflateString, inflateString, packBytes, unpackBytes } from './codec';
import { seeded, int } from './rng';

describe('save codec', () => {
  it('packs every length of bytes and gets exactly the same bytes back', () => {
    const rng = seeded(4);
    for (let n = 0; n < 400; n++) {
      const bytes = Uint8Array.from({ length: n }, () => int(rng, 0, 255));
      expect(unpackBytes(packBytes(bytes))).toEqual(bytes);
    }
  });

  it('only uses characters browser storage keeps intact (no surrogates, no control codes)', () => {
    const bytes = Uint8Array.from({ length: 5000 }, (_, i) => (i * 167) % 256);
    for (const ch of packBytes(bytes)) {
      const c = ch.charCodeAt(0);
      expect(c >= 0x20 && c <= 0x801f).toBe(true);
    }
  });

  it('round-trips text, including names outside ASCII', () => {
    const text = JSON.stringify({ name: 'Ysolde Ærendil-Kravos · Þór 🪐', n: [1, 2, 3], big: 'x'.repeat(100000) });
    expect(inflateString(deflateString(text))).toBe(text);
  });

  it('rejects truncated data instead of returning garbage', () => {
    const packed = deflateString('hello '.repeat(1000));
    expect(() => inflateString(packed.slice(0, packed.length >> 1))).toThrow();
  });
});
