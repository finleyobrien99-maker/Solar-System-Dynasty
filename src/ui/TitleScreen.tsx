import { useState } from 'react';
import { listSaves, readSave } from '../game/save';
import type { GameState } from '../game/types';
import { inApp } from '../native';
import { Icon } from '../svg/Icons';
import { PlanetArt } from '../svg/PlanetArt';
import { CodexModal } from './modals/CodexModal';
import { SavesPanel } from './modals/SavesModal';

function TitleArt() {
  const worlds = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const sizes = [26, 34, 36, 30, 70, 66, 46, 44];
  return (
    <svg viewBox="0 0 600 160" className="title-art" aria-hidden>
      <defs>
        <radialGradient id="tsun">
          <stop offset="0%" stopColor="#fff6d5" />
          <stop offset="35%" stopColor="#ffd166" />
          <stop offset="70%" stopColor="#ff9f1c" stopOpacity={0.5} />
          <stop offset="100%" stopColor="#ff6b00" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={-20} cy={80} r={110} fill="url(#tsun)" />
      <path d="M 0 80 Q 300 60 600 80" stroke="#ffffff22" fill="none" />
      {worlds.map((w, i) => {
        const x = 80 + i * 66;
        const sz = sizes[i];
        return (
          <g key={w} transform={`translate(${x - sz / 2} ${80 - sz / 2 + Math.sin(i) * 6})`}>
            <PlanetArt planetId={w} size={sz} />
          </g>
        );
      })}
    </svg>
  );
}

export function TitleScreen({ onNew, onLoad }: { onNew: () => void; onLoad: (s: GameState) => void }) {
  const [panel, setPanel] = useState<null | 'saves' | 'codex'>(null);
  const [err, setErr] = useState<string | null>(null);
  const auto = listSaves().find((x) => x.slot === 'auto');
  return (
    <div className="title-screen">
      <TitleArt />
      <h1>SOLAR DYNASTY</h1>
      <div className="tag">Rule a house among the ten worlds of Sol. Marry, scheme, wage war and forge a bloodline so perfect it outlives the stars.</div>
      <div className="title-menu">
        {auto && !auto.summary.gameOver && (
          <button
            className="btn primary block"
            onClick={() => {
              try {
                const res = readSave('auto');
                if (res) onLoad(res.state);
                else setErr('The autosave could not be read.');
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            <Icon name="next" size={16} /> Continue: {auto.summary.ruler} of House {auto.summary.house} ({auto.summary.year}){auto.summary.vip ? ' · VIP' : ''}
          </button>
        )}
        <button className={`btn block ${auto && !auto.summary.gameOver ? '' : 'primary'}`} onClick={onNew}>
          <Icon name="plus" size={16} /> New dynasty
        </button>
        <button className="btn block" onClick={() => setPanel('saves')}>
          <Icon name="save" size={16} /> Load game
        </button>
        <button className="btn block ghost" onClick={() => setPanel('codex')}>
          <Icon name="codex" size={16} /> How to play
        </button>
        {err && <div className="bad">{err}</div>}
      </div>
      <div className="dim" style={{ fontSize: '0.75rem' }}>
        {inApp
          ? 'Saves are kept on this phone. Export them from the menu to back them up.'
          : 'Saves live in this browser. Export them from the menu to keep them safe.'}
      </div>
      {panel === 'saves' && <SavesPanel onLoad={onLoad} onClose={() => setPanel(null)} />}
      {panel === 'codex' && <CodexModal onClose={() => setPanel(null)} />}
    </div>
  );
}
