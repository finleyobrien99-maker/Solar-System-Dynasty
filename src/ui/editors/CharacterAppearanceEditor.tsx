import { useState } from 'react';
import { normalisePortrait, setPortrait } from '../../game/identity';
import type { Character, PortraitStyle } from '../../game/types';
import { Portrait } from '../../svg/Portrait';
import { Btn, charRank } from '../components';
import { useGame } from '../store';
import { AppearanceControls, previewPortrait } from './IdentityControls';

export function CharacterAppearanceEditor({ c }: { c: Character }) {
  const { s, act, toast } = useGame();
  const [draft, setDraft] = useState<PortraitStyle>({ ...c.portrait });
  const clan = s.clans[c.clanId];
  return (
    <details className="card identity-editor">
      <summary className="gold">Character appearance</summary>
      <div className="stack">
        <div className="identity-preview" role="img" aria-label="Character appearance preview">
          <Portrait
            c={{ ...c, portrait: previewPortrait(draft) }}
            year={s.year}
            rank={charRank(s, c)}
            clanColor={clan?.color}
            trim={clan?.sigil.c2}
            size={160}
          />
        </div>
        <p className="muted">Style this portrait freely. It changes no stats, traits or inherited looks.</p>
        <AppearanceControls c={c} year={s.year} value={draft} onChange={setDraft} />
        <div className="btn-row">
          <Btn
            kind="primary"
            disabled={!normalisePortrait(draft)}
            onClick={() => {
              if (act((d) => setPortrait(d, c.id, draft))) toast('Appearance saved.');
            }}
          >
            Save appearance
          </Btn>
          <Btn onClick={() => setDraft({ ...c.portrait })}>Discard changes</Btn>
          <Btn kind="ghost" onClick={() => setDraft({})}>
            Use inherited looks
          </Btn>
        </div>
        <small className="dim">Preview changes are saved only when you choose Save appearance.</small>
      </div>
    </details>
  );
}
