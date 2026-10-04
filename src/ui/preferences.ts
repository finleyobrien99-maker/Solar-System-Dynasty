import { useEffect, useSyncExternalStore } from 'react';
export const PREFS_KEY = 'solar-dynasty:prefs';
export interface Preferences {
  textSize: 'normal' | 'large' | 'larger';
  reducedMotion: boolean;
}
const DEFAULTS: Preferences = { textSize: 'normal', reducedMotion: false };
export function readPreferences(): Preferences {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
    const value = raw as Partial<Preferences>;
    return { textSize: value.textSize === 'large' || value.textSize === 'larger' ? value.textSize : 'normal', reducedMotion: value.reducedMotion === true };
  } catch {
    return { ...DEFAULTS };
  }
}
let current = readPreferences();
const listeners = new Set<() => void>();
function changed() {
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === PREFS_KEY || event.key === null) {
      current = readPreferences();
      changed();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
export function setPreferences(patch: Partial<Preferences>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(current));
  } catch {
    /* Works for this session if storage is blocked. */
  }
  changed();
}
export function usePreferences() {
  return useSyncExternalStore(subscribe, () => current);
}
export function useApplyPreferences() {
  const prefs = usePreferences();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.textSize = prefs.textSize;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyMotion = () => {
      root.dataset.reducedMotion = String(prefs.reducedMotion || media.matches);
    };
    applyMotion();
    media.addEventListener('change', applyMotion);
    return () => media.removeEventListener('change', applyMotion);
  }, [prefs]);
}
export function reducedMotion(): boolean {
  return document.documentElement.dataset.reducedMotion === 'true';
}
