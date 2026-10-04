import { useCallback, useState } from 'react';
import type { GameState } from './game/types';
import { GameErrorBoundary } from './ui/ErrorBoundary';
import { GameScreen } from './ui/GameScreen';
import { NewGame } from './ui/NewGame';
import { GameProvider } from './ui/store';
import { useApplyPreferences } from './ui/preferences';
import { TitleScreen } from './ui/TitleScreen';

type Screen = { kind: 'title' } | { kind: 'new' } | { kind: 'game'; state: GameState; key: number };

export default function App() {
  useApplyPreferences();
  const [screen, setScreen] = useState<Screen>({ kind: 'title' });
  const quit = useCallback(() => setScreen({ kind: 'title' }), []);
  const play = useCallback((state: GameState) => setScreen({ kind: 'game', state, key: Date.now() }), []);

  if (screen.kind === 'new') return <NewGame onStart={play} onBack={quit} />;
  if (screen.kind === 'game')
    return (
      <GameProvider key={screen.key} initial={screen.state} onQuit={quit}>
        <GameErrorBoundary>
          <GameScreen />
        </GameErrorBoundary>
      </GameProvider>
    );
  return <TitleScreen onNew={() => setScreen({ kind: 'new' })} onLoad={play} />;
}
