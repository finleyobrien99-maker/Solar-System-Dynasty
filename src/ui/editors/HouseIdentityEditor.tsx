import { useState } from 'react';
import { hexColour, setHouseIdentity } from '../../game/identity';
import type { Clan } from '../../game/types';
import { Sigil } from '../../svg/Sigil';
import { Btn } from '../components';
import { useGame } from '../store';
import { previewSigil, SigilControls } from './IdentityControls';

export function HouseIdentityEditor({ clan }: { clan: Clan }) {
  const { act, toast } = useGame();
  const [name, setName] = useState(clan.name);
  const [spec, setSpec] = useState({ ...clan.sigil });
  const clean = previewSigil(spec);
  return (
    <details className="card identity-editor">
      <summary className="gold">House identity & flag</summary>
      <div className="stack">
        <div className="identity-preview">
          <div role="img" aria-label="House shield preview">
            <Sigil spec={clean} size={100} />
          </div>
          <div role="img" aria-label="House flag preview">
            <Sigil spec={clean} size={160} flag />
          </div>
        </div>
        <label className="stack">
          House name
          <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        </label>
        <SigilControls value={spec} onChange={setSpec} />
        <div className="btn-row">
          <Btn
            kind="primary"
            disabled={!name.trim() || ![spec.c1, spec.c2, spec.c3].every(hexColour)}
            onClick={() => {
              if (act((d) => setHouseIdentity(d, clan.id, name, spec))) toast('House design saved.');
            }}
          >
            Save house design
          </Btn>
          <Btn
            onClick={() => {
              setName(clan.name);
              setSpec({ ...clan.sigil });
            }}
          >
            Discard changes
          </Btn>
        </div>
        <small className="dim">Preview changes are saved only when you choose Save house design. Titles and house ties stay attached to the same house.</small>
      </div>
    </details>
  );
}
