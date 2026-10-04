// Save compression. Deflate (fflate) is about ten times faster than
// lz-string, which matters when a sprawling dynasty autosaves after every
// click. Browser storage holds strings, so the bytes are packed 15 bits to a
// UTF-16 character, as lz-string's UTF16 mode does: every character lands in
// U+0020..U+801F, clear of the surrogate range some browsers mangle. The first
// two characters hold the byte length.

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

const OFFSET = 32;
const MASK = 0x7fff;

export function packBytes(bytes: Uint8Array): string {
  const n = bytes.length;
  const codes = new Uint16Array(2 + Math.ceil((n * 8) / 15));
  codes[0] = ((n >>> 15) & MASK) + OFFSET;
  codes[1] = (n & MASK) + OFFSET;
  let acc = 0;
  let bits = 0;
  let j = 2;
  for (let i = 0; i < n; i++) {
    acc = (acc << 8) | bytes[i];
    bits += 8;
    if (bits >= 15) {
      bits -= 15;
      codes[j++] = ((acc >>> bits) & MASK) + OFFSET;
      acc &= (1 << bits) - 1;
    }
  }
  if (bits > 0) codes[j++] = ((acc << (15 - bits)) & MASK) + OFFSET;
  let out = '';
  for (let k = 0; k < j; k += 0x2000) out += String.fromCharCode(...codes.subarray(k, Math.min(j, k + 0x2000)));
  return out;
}

export function unpackBytes(s: string): Uint8Array {
  if (s.length < 2) throw new Error('Truncated save data.');
  const n = ((s.charCodeAt(0) - OFFSET) << 15) | (s.charCodeAt(1) - OFFSET);
  const out = new Uint8Array(n);
  let acc = 0;
  let bits = 0;
  let i = 0;
  for (let k = 2; k < s.length && i < n; k++) {
    acc = (acc << 15) | ((s.charCodeAt(k) - OFFSET) & MASK);
    bits += 15;
    while (bits >= 8 && i < n) {
      bits -= 8;
      out[i++] = (acc >>> bits) & 0xff;
    }
    acc &= (1 << bits) - 1;
  }
  if (i < n) throw new Error('Truncated save data.');
  return out;
}

export function deflateString(text: string): string {
  return packBytes(deflateSync(strToU8(text), { level: 6 }));
}

export function inflateString(data: string): string {
  return strFromU8(inflateSync(unpackBytes(data)));
}
