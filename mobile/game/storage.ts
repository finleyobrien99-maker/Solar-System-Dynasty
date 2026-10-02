// The phone's own copy of every save slot. The game keeps its saves in the
// WebView's localStorage, but iOS may wipe web storage for apps it considers
// idle, so every write is mirrored here and handed back on launch.

import { Directory, File, Paths } from 'expo-file-system';

const dir = new Directory(Paths.document, 'saves');

// Keys look like "solar-dynasty:auto". ':' is risky in file URIs, '~' is not,
// and the game never uses '~' in a key.
const fileName = (key: string) => `${key.replace(/:/g, '~')}.txt`;
const keyOf = (name: string) => name.replace(/\.(txt|tmp)$/, '').replace(/~/g, ':');

export function loadAll(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    if (!dir.exists) return out;
    const files = dir.list().filter((f): f is File => f instanceof File);
    // A .tmp only matters if the rename after a write never happened.
    for (const f of files.filter((x) => x.name.endsWith('.tmp'))) out[keyOf(f.name)] = f.textSync();
    for (const f of files.filter((x) => x.name.endsWith('.txt'))) out[keyOf(f.name)] = f.textSync();
  } catch (e) {
    console.warn('Could not read saves', e);
  }
  return out;
}

export function store(key: string, value: string | null): void {
  try {
    dir.create({ idempotent: true });
    const final = new File(dir, fileName(key));
    if (value === null) {
      if (final.exists) final.delete();
      return;
    }
    // Write beside the old save, then swap, so a crash mid-write never
    // leaves a half-written file as the only copy.
    const tmp = new File(dir, fileName(key).replace(/\.txt$/, '.tmp'));
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.write(value);
    if (final.exists) final.delete();
    tmp.rename(final.name);
  } catch (e) {
    console.warn('Could not write save', key, e);
  }
}
