// Catches crashes while drawing the screen, so a bug never strands a run.
// The player can try again, export the game to a file, or step back to the
// save from before the last move. The fallback uses plain buttons, not Btn,
// in case the shared components are what broke.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { readBackup, readSave, writeSave } from '../game/save';
import type { GameState } from '../game/types';
import { downloadSave } from './modals/SavesModal';
import { useGame } from './store';

interface Props {
  children: ReactNode;
  /** The game in memory, if one is open. Otherwise export uses the autosave. */
  current?: GameState;
  /** Load a state into the open game. Without it, restoring reloads the page. */
  onRestore?: (s: GameState) => void;
  /** Close whatever was on screen (panels, selections) before redrawing. */
  onReset?: () => void;
  onQuit?: () => void;
}

interface State {
  error: Error | null;
  stack?: string;
  note?: string;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)), note: undefined };
  }

  componentDidCatch(_error: unknown, info: ErrorInfo) {
    this.setState({ stack: info.componentStack ?? undefined });
  }

  private retry = () => {
    this.props.onReset?.();
    this.setState({ error: null, stack: undefined, note: undefined });
  };

  private export = () => {
    try {
      const s = this.props.current ?? readSave('auto')?.state;
      if (s) downloadSave(s);
      else this.setState({ note: 'There is no save to export yet.' });
    } catch (e) {
      this.setState({ note: message(e) });
    }
  };

  private stepBack = () => {
    try {
      const s = readBackup('auto');
      if (!s) {
        this.setState({ note: 'There is no earlier save to go back to.' });
      } else if (this.props.onRestore) {
        this.props.onRestore(s);
        this.retry();
      } else {
        const res = writeSave('auto', s);
        if (res.ok) window.location.reload();
        else this.setState({ note: `Could not restore the backup: ${res.error}` });
      }
    } catch (e) {
      this.setState({ note: message(e) });
    }
  };

  render() {
    const { error, stack, note } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <div className="card">
          <h2>Well, that's torn it</h2>
          <p className="muted">A bug knocked the screen over. Your dynasty is fine: the game saves after every move.</p>
          {note && <div className="card flat bad">{note}</div>}
          <div className="crash-actions">
            <button className="btn primary block" onClick={this.retry}>
              Try again
            </button>
            <span className="dim">Closes any open windows and redraws the screen.</span>
            <button className="btn block" onClick={this.export}>
              Export save
            </button>
            <span className="dim">Downloads the game as a file, just in case.</span>
            <button className="btn block" onClick={this.stepBack}>
              Go back one save
            </button>
            <span className="dim">Loads the autosave from before your last move.</span>
            {this.props.onQuit && (
              <button className="btn ghost block" onClick={this.props.onQuit}>
                Back to title
              </button>
            )}
          </div>
          <details>
            <summary className="dim">Technical details</summary>
            <pre>{`${error.name}: ${error.message}${stack ?? ''}`}</pre>
          </details>
        </div>
      </div>
    );
  }
}

/** The boundary for an open game: it can export the game in memory and step back a save. */
export function GameErrorBoundary({ children }: { children: ReactNode }) {
  const { s, replace, setUi, quit } = useGame();
  return (
    <ErrorBoundary current={s} onRestore={replace} onReset={() => setUi({ panel: null, charId: undefined, clanId: undefined, regionId: undefined })} onQuit={quit}>
      {children}
    </ErrorBoundary>
  );
}
