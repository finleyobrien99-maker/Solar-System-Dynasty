// Game state container. Every action clones the state, mutates the clone,
// then swaps it in, so React always sees a fresh object and saves happen
// automatically after every change.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { writeSave } from '../game/save';
import type { GameState } from '../game/types';

export type Tab = 'life' | 'family' | 'bloodline' | 'realm' | 'system' | 'actions' | 'treasury';
export type Panel = null | 'saves' | 'codex' | 'tree' | 'suitors' | 'menu' | 'vip';

export interface UiState {
  tab: Tab;
  charId?: string;
  clanId?: string;
  panel: Panel;
  planetId?: string;
  regionId?: string;
}

interface Toast {
  id: number;
  text: string;
  bad?: boolean;
}

interface Ctx {
  s: GameState;
  act: <T>(fn: (d: GameState) => T) => T;
  ui: UiState;
  setUi: (patch: Partial<UiState>) => void;
  openChar: (id: string | undefined) => void;
  openClan: (id: string | undefined) => void;
  toast: (text: string, bad?: boolean) => void;
  replace: (next: GameState) => void;
  quit: () => void;
}

const GameCtx = createContext<Ctx | null>(null);

export function useGame(): Ctx {
  const c = useContext(GameCtx);
  if (!c) throw new Error('useGame outside provider');
  return c;
}

export function GameProvider({ initial, onQuit, children }: { initial: GameState; onQuit: () => void; children: ReactNode }) {
  const [s, setS] = useState(initial);
  const [ui, setUiState] = useState<UiState>({ tab: 'life', panel: null, planetId: initial.clans[initial.playerClanId]?.planetId });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);
  // act() and replace() are the only ways state changes, and both update this before setS.
  const latest = useRef(s);

  const toast = useCallback((text: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, bad }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  // Autosave shortly after any change, and immediately when the tab hides.
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const res = writeSave('auto', latest.current);
      if (!res.ok) toast(`Autosave failed: ${res.error}`, true);
    }, 250);
    return () => window.clearTimeout(saveTimer.current);
  }, [s, toast]);

  useEffect(() => {
    const flush = () => writeSave('auto', latest.current);
    const onVis = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Runs synchronously and exactly once, so callers can use the result.
  const act = useCallback(<T,>(fn: (d: GameState) => T): T => {
    const d = structuredClone(latest.current);
    const result = fn(d);
    latest.current = d;
    setS(d);
    return result;
  }, []);

  const replace = useCallback((next: GameState) => {
    latest.current = next;
    setS(next);
    setUiState({ tab: 'life', panel: null, planetId: next.clans[next.playerClanId]?.planetId });
  }, []);

  const setUi = useCallback((patch: Partial<UiState>) => setUiState((u) => ({ ...u, ...patch })), []);
  const openChar = useCallback((id: string | undefined) => setUiState((u) => ({ ...u, charId: id, clanId: undefined })), []);
  const openClan = useCallback((id: string | undefined) => setUiState((u) => ({ ...u, clanId: id, charId: undefined })), []);

  const value = useMemo(() => ({ s, act, ui, setUi, openChar, openClan, toast, replace, quit: onQuit }), [s, act, ui, setUi, openChar, openClan, toast, replace, onQuit]);

  return (
    <GameCtx.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.bad ? 'bad' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </GameCtx.Provider>
  );
}
